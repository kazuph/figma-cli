import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService, type FigmaAuthOptions } from "./services/figma.js";
import type { SimplifiedDesign, SimplifiedNode } from "./services/simplify-node-response.js";
import yaml from "js-yaml";
import { Logger } from "./utils/logger.js";

// Store for Figma data results (always stored as JSON for MCP resources)
const figmaDataStore = new Map<string, { data: string; originalFormat: "yaml" | "json" }>();

const serverInfo = {
  name: "Figma MCP Server",
  version: process.env.NPM_PACKAGE_VERSION ?? "unknown",
};

type CreateServerOptions = {
  isHTTP?: boolean;
  outputFormat?: "yaml" | "json";
};

function createServer(
  authOptions: FigmaAuthOptions,
  { isHTTP = false, outputFormat = "yaml" }: CreateServerOptions = {},
) {
  const server = new McpServer(serverInfo);
  // const figmaService = new FigmaService(figmaApiKey);
  const figmaService = new FigmaService(authOptions);
  registerTools(server, figmaService, outputFormat);
  registerResources(server);

  Logger.isHTTP = isHTTP;

  return server;
}

function registerTools(
  server: McpServer,
  figmaService: FigmaService,
  outputFormat: "yaml" | "json",
): void {
  // Tool to get file information
  server.tool(
    "get_figma_data",
    "Get layout information from a Figma file - AI-optimized clean YAML output. ⚠️ WARNING: Using depth parameter results in incomplete layout data. For complete design implementation, avoid depth restrictions.",
    {
      fileKey: z
        .string()
        .describe(
          "The key of the Figma file to fetch, often found in a provided URL like figma.com/(file|design)/<fileKey>/...",
        ),
      nodeId: z
        .string()
        .optional()
        .describe(
          "The ID of the node to fetch, often found as URL parameter node-id=<nodeId>, always use if provided",
        ),
      depth: z
        .number()
        .optional()
        .describe(
          "OPTIONAL. Do NOT use unless explicitly requested by the user. Controls how many levels deep to traverse the node tree (Figma API parameter)",
        ),
    },
    async ({ fileKey, nodeId, depth }) => {
      try {
        Logger.log(
          `Fetching ${
            depth ? `${depth} layers deep` : "all layers"
          } of ${nodeId ? `node ${nodeId} from file` : `full file`} ${fileKey}`,
        );

        let file: SimplifiedDesign;
        if (nodeId) {
          file = await figmaService.getNode(fileKey, nodeId, depth);
        } else {
          file = await figmaService.getFile(fileKey, depth);
        }

        Logger.log(`Successfully fetched file: ${file.name}`);
        const { nodes, components, componentSets, ...fileInfo } = file;

        const finalNodes = nodes;

        const result: any = {};

        // Add depth warnings if depth limitation is applied
        if (depth) {
          result.warning = "⚠️ Layout with limited depth is incomplete. For complete design implementation, remove depth restrictions to fetch all layout data.";
          
          const depthInfo: any = {
            current_api_depth: depth,
            recommended_api_depth: "unlimited (remove depth parameter)"
          };
          result.depth_info = depthInfo;
        }

        result.file = fileInfo;
        result.nodes = finalNodes;
        if (Object.keys(components).length > 0) {
          result.components = components;
        }
        if (Object.keys(componentSets).length > 0) {
          result.componentSets = componentSets;
        }

        Logger.log(`Generating result from file`);
        
        // Always store as minified JSON for MCP resources (better token efficiency)
        const jsonResult = JSON.stringify(result);
        
        // Store result with unique key
        const resultKey = `${fileKey}${nodeId ? `-${nodeId}` : ''}${depth ? `-depth${depth}` : ''}`;
        figmaDataStore.set(resultKey, {
          data: jsonResult,
          originalFormat: outputFormat
        });
        
        Logger.log("Stored result as JSON resource, returning resource URI only");
        return {
          content: [
            { 
              type: "text", 
              text: `✅ Figma data fetched successfully!\n\n📦 Resource URI: figma://${resultKey}\n📏 Size: ${(jsonResult.length / 1024).toFixed(1)} KB\n📄 Original format requested: ${outputFormat.toUpperCase()}\n📄 Resource format: JSON\n\nUse @figma:figma://${resultKey} to reference this data in Claude Code.` 
            }
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        Logger.error(`Error fetching file ${fileKey}:`, message);
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching file: ${message}` }],
        };
      }
    },
  );

  // TODO: Clean up all image download related code, particularly getImages in Figma service
  // Tool to download images
  server.tool(
    "download_figma_images",
    "Download SVG and PNG images used in a Figma file based on the IDs of image or icon nodes",
    {
      fileKey: z.string().describe("The key of the Figma file containing the node"),
      nodes: z
        .object({
          nodeId: z
            .string()
            .describe("The ID of the Figma image node to fetch, formatted as 1234:5678"),
          imageRef: z
            .string()
            .optional()
            .describe(
              "If a node has an imageRef fill, you must include this variable. Leave blank when downloading Vector SVG images.",
            ),
          fileName: z.string().describe("The local name for saving the fetched file"),
        })
        .array()
        .describe("The nodes to fetch as images"),
      pngScale: z
        .number()
        .positive()
        .optional()
        .default(2)
        .describe(
          "Export scale for PNG images. Optional, defaults to 2 if not specified. Affects PNG images only.",
        ),
      localPath: z
        .string()
        .describe(
          "The absolute path to the directory where images are stored in the project. If the directory does not exist, it will be created. The format of this path should respect the directory format of the operating system you are running on. Don't use any special character escaping in the path name either.",
        ),
      svgOptions: z
        .object({
          outlineText: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to outline text in SVG exports. Default is true."),
          includeId: z
            .boolean()
            .optional()
            .default(false)
            .describe("Whether to include IDs in SVG exports. Default is false."),
          simplifyStroke: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to simplify strokes in SVG exports. Default is true."),
        })
        .optional()
        .default({})
        .describe("Options for SVG export"),
    },
    async ({ fileKey, nodes, localPath, svgOptions, pngScale }) => {
      try {
        const imageFills = nodes.filter(({ imageRef }) => !!imageRef) as {
          nodeId: string;
          imageRef: string;
          fileName: string;
        }[];
        const fillDownloads = figmaService.getImageFills(fileKey, imageFills, localPath);
        const renderRequests = nodes
          .filter(({ imageRef }) => !imageRef)
          .map(({ nodeId, fileName }) => {
            // Determine file type from extension or default to svg
            let fileType: "svg" | "png" = "svg";
            let finalFileName = fileName;
            
            if (fileName.endsWith(".svg")) {
              fileType = "svg";
            } else if (fileName.endsWith(".png")) {
              fileType = "png";
            } else {
              // If no extension, default to svg and add extension
              fileType = "svg";
              finalFileName = fileName + ".svg";
            }
            
            return {
              nodeId,
              fileName: finalFileName,
              fileType,
            };
          });

        const renderDownloads = figmaService.getImages(
          fileKey,
          renderRequests,
          localPath,
          pngScale,
          svgOptions,
        );

        const downloads = await Promise.all([fillDownloads, renderDownloads]).then(([f, r]) => [
          ...f,
          ...r,
        ]);

        // If any download fails, return false
        const saveSuccess = !downloads.find((success) => !success);
        return {
          content: [
            {
              type: "text",
              text: saveSuccess
                ? `Success, ${downloads.length} images downloaded: ${downloads.join(", ")}`
                : "Failed",
            },
          ],
        };
      } catch (error) {
        Logger.error(`Error downloading images from file ${fileKey}:`, error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error downloading images: ${error}` }],
        };
      }
    },
  );
}

function registerResources(server: McpServer): void {
  // Create a resource template for Figma data
  const template = new ResourceTemplate(
    "figma://{key}",
    {
      list: async () => {
        // List all stored resources
        const resources = Array.from(figmaDataStore.keys()).map(key => {
          const stored = figmaDataStore.get(key)!;
          return {
            uri: `figma://${key}`,
            name: `Figma: ${key}`,
            description: `Fetched Figma data (${(stored.data.length / 1024).toFixed(1)} KB) - Originally ${stored.originalFormat.toUpperCase()}`,
            mimeType: "application/json"
          };
        });
        return { resources };
      }
    }
  );
  
  // Register the resource template
  server.resource(
    "figma-data",
    template,
    {
      description: "Access fetched Figma design data",
      mimeType: "text/plain"
    },
    async (uri, params) => {
      // Extract the key from params
      const key = params.key as string;
      const stored = figmaDataStore.get(key);
      
      if (!stored) {
        throw new Error(`Resource not found: figma://${key}`);
      }
      
      // Always return as JSON for MCP resources
      return {
        contents: [{
          uri: `figma://${key}`,
          mimeType: "application/json",
          text: stored.data
        }]
      };
    }
  );
}

export { createServer };

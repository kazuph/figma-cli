import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService, type FigmaAuthOptions } from "./services/figma.js";
import type { SimplifiedDesign, SimplifiedNode } from "./services/simplify-node-response.js";
import yaml from "js-yaml";
import { Logger } from "./utils/logger.js";

// Store for Figma data results (always stored as JSON for MCP resources)
interface StoredFigmaData {
  data: string;
  originalFormat: "yaml" | "json";
  metadata: {
    fileKey: string;
    nodeId?: string;
    depth?: number;
    fileName?: string;
    timestamp: number;
  };
}
const figmaDataStore = new Map<string, StoredFigmaData>();

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
    "Get layout information from a Figma file - AI-optimized clean YAML output. ⚠️ WARNING: Using depth parameter results in incomplete layout data. For complete design implementation, avoid depth restrictions. 🖥️ Claude Desktop users: Add 'direct: true' to receive data directly instead of resource URIs.",
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
      direct: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Set to true for Claude Desktop to receive data directly. Leave false for Claude Code to use @figma resource references.",
        ),
    },
    async ({ fileKey, nodeId, depth, direct }) => {
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
        
        // Format result based on output format preference
        let formattedResult: string;
        if (outputFormat === "yaml") {
          formattedResult = yaml.dump(result, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            sortKeys: false,
            quotingType: '"',
            forceQuotes: false,
            condenseFlow: true,
          });
        } else {
          formattedResult = JSON.stringify(result, null, 2);
        }
        
        // Always store as minified JSON for MCP resources (better token efficiency)
        const jsonResult = JSON.stringify(result);
        
        // Store result with unique key
        const resultKey = `${fileKey}${nodeId ? `-${nodeId}` : ''}${depth ? `-depth${depth}` : ''}`;
        
        // Check if we're updating existing data or adding new
        const isUpdate = figmaDataStore.has(resultKey);
        
        figmaDataStore.set(resultKey, {
          data: jsonResult,
          originalFormat: outputFormat,
          metadata: {
            fileKey,
            nodeId,
            depth,
            fileName: result.file?.name,
            timestamp: Date.now()
          }
        });
        
        if (isUpdate) {
          Logger.log(`Updated existing resource: figma://${resultKey}`);
        } else {
          Logger.log(`Created new resource: figma://${resultKey}`);
        }
        
        // For direct mode (Claude Desktop): Return data directly since resources aren't accessible via @ mention
        // For resource mode (Claude Code): Store as resource and return URI for better token efficiency
        if (direct) {
          Logger.log("Direct mode - returning data directly in response");
          
          // Add a header comment to indicate this is Figma data
          const header = outputFormat === "yaml" 
            ? `# Figma Design: ${result.file?.name || fileKey}\n# Nodes: ${Object.keys(result.nodes || {}).length}\n# Size: ${(jsonResult.length / 1024).toFixed(1)} KB\n\n`
            : `/* Figma Design: ${result.file?.name || fileKey}\n * Nodes: ${Object.keys(result.nodes || {}).length}\n * Size: ${(jsonResult.length / 1024).toFixed(1)} KB\n */\n\n`;
          
          return {
            content: [
              { 
                type: "text", 
                text: header + formattedResult
              }
            ],
          };
        } else {
          Logger.log("Resource mode - storing as resource and returning URI");
          return {
            content: [
              { 
                type: "text", 
                text: `✅ Figma data fetched successfully!\n\n📦 Resource stored: figma://${resultKey}\n📏 Size: ${(jsonResult.length / 1024).toFixed(1)} KB\n📄 Format: ${outputFormat.toUpperCase()}\n\nIn Claude Code: Use @figma to reference this resource\nIn Claude Desktop: Data returned directly in response above` 
              }
            ],
          };
        }
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
  // Register resource template for figma resources with correct API
  const template = new ResourceTemplate("figma://{key}", {
    list: async () => {
      const resources = Array.from(figmaDataStore.entries()).map(([key, stored]) => {
        // Parse data for description
        let description = "Figma Design";
        try {
          const data = JSON.parse(stored.data);
          const nodeCount = data.nodes ? Object.keys(data.nodes).length : 0;
          const componentCount = data.components ? Object.keys(data.components).length : 0;
          
          const parts = [
            `${nodeCount} nodes`,
            componentCount > 0 ? `${componentCount} components` : null,
            stored.metadata.depth ? `depth ${stored.metadata.depth}` : "full depth",
            `${(stored.data.length / 1024).toFixed(1)} KB`
          ].filter(Boolean);
          
          description = `${stored.metadata.fileName || 'Figma Design'} - ${parts.join(" • ")}`;
        } catch (error) {
          Logger.log(`Failed to parse metadata for figma://${key}: ${error}`);
        }
        
        return {
          uri: `figma://${key}`,
          name: stored.metadata.fileName || `Figma-${key}`,
          description,
          mimeType: "application/json"
        };
      });
      
      return { resources };
    },
    complete: {
      key: async (partial: string) => {
        // Return available keys that match the partial input
        return Array.from(figmaDataStore.keys()).filter(key => key.startsWith(partial));
      }
    }
  });
  
  // Register the template with read callback
  server.resource("figma", template, async (uri: URL) => {
    // Extract key from URI (figma://key-format)
    const uriString = uri.toString();
    const match = uriString.match(/^figma:\/\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid Figma resource URI: ${uriString}`);
    }
    
    const key = match[1];
    const stored = figmaDataStore.get(key);
    
    if (!stored) {
      throw new Error(`Resource not found: ${uri}`);
    }
    
    // Parse data to get metadata for description
    let description = "Figma Design";
    try {
      const data = JSON.parse(stored.data);
      const nodeCount = data.nodes ? Object.keys(data.nodes).length : 0;
      const componentCount = data.components ? Object.keys(data.components).length : 0;
      
      const parts = [
        `${nodeCount} nodes`,
        componentCount > 0 ? `${componentCount} components` : null,
        stored.metadata.depth ? `depth ${stored.metadata.depth}` : "full depth",
        `${(stored.data.length / 1024).toFixed(1)} KB`
      ].filter(Boolean);
      
      description = `${stored.metadata.fileName || 'Figma Design'} - ${parts.join(" • ")}`;
    } catch (error) {
      Logger.log(`Failed to parse metadata for ${uriString}: ${error}`);
    }
    
    return {
      contents: [{
        uri: uriString,
        mimeType: "application/json",
        text: stored.data
      }]
    };
  });
  
  Logger.log("Figma resource template registered successfully");
}

export { createServer };

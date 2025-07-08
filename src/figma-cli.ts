#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { config } from "dotenv";
import { resolve } from "path";
import { FigmaService, type FigmaAuthOptions } from "./services/figma.js";
import { type SimplifiedNode } from "./services/simplify-node-response.js";
import yaml from "js-yaml";
import { Logger } from "./utils/logger.js";
import { authCommand, type AuthOptions } from "./commands/auth.js";
import { loadCredentials } from "./utils/credentials.js";

/**
 * Limit node tree to specified depth layers
 * @param nodes - Array of nodes to limit
 * @param maxLayers - Maximum number of layers (1 = top level only, 2 = top + first children, etc.)
 * @param currentLayer - Current layer depth (used for recursion)
 * @returns Filtered nodes
 */
function limitNodeDepth(nodes: SimplifiedNode[], maxLayers: number, currentLayer: number = 1): SimplifiedNode[] {
  if (currentLayer > maxLayers) {
    return [];
  }

  return nodes.map(node => {
    const limitedNode: SimplifiedNode = { ...node };
    
    // If we're at the max layer, remove children
    if (currentLayer === maxLayers) {
      delete limitedNode.children;
    } else if (node.children && node.children.length > 0) {
      // Recursively limit children depth
      limitedNode.children = limitNodeDepth(node.children, maxLayers, currentLayer + 1);
    }
    
    return limitedNode;
  });
}

// Load .env file
config({ path: resolve(process.cwd(), ".env") });

async function getDefaultApiKey() {
  try {
    const savedCredentials = await loadCredentials();
    return process.env.FIGMA_API_KEY || savedCredentials?.apiKey;
  } catch {
    return process.env.FIGMA_API_KEY;
  }
}

// CLI configuration
const cli = yargs(hideBin(process.argv))
  .scriptName("figma")
  .version("1.0.0")
  .option("figma-api-key", {
    type: "string",
    description: "Figma API key",
  })
  .option("figma-oauth-token", {
    type: "string",
    description: "Figma OAuth token",
    default: process.env.FIGMA_OAUTH_TOKEN,
  })
  .option("use-oauth", {
    type: "boolean",
    description: "Use OAuth instead of API key",
    default: process.env.USE_OAUTH === "true",
  })
  .option("format", {
    type: "string",
    choices: ["json", "yaml"] as const,
    description: "Output format",
    default: "yaml",
  })
  .option("verbose", {
    type: "boolean",
    description: "Enable verbose logging",
    default: false,
  })
  .epilog(`
🎨 FIGMA CLI - AI-OPTIMIZED DESIGN DATA EXTRACTION

COMMON USAGE PATTERNS:

1. GET DESIGN DATA (AI-optimized clean YAML):
   figma get-data <fileKey> <nodeId>                    # Get node structure
   figma get-data <fileKey> <nodeId> --depth-layers 1  # Screen names only
   figma get-data <fileKey> <nodeId> --depth-layers 2  # + First level children

2. DOWNLOAD IMAGES:
   figma download-images <fileKey> ~/Downloads --nodes '[{"nodeId":"123:456","fileName":"button.svg"}]'

3. MCP SERVER (for Claude Desktop integration):
   figma mcp                                            # Start MCP server

PIPELINE PROCESSING WITH YQ:
   # Get screen name
   figma get-data <fileKey> <nodeId> | yq '.nodes[0].name'
   
   # Get all text content  
   figma get-data <fileKey> <nodeId> | yq '.. | select(has("text")) | .text' | head -10
   
   # List all colors used
   figma get-data <fileKey> <nodeId> | yq '.. | select(has("fills")) | .fills[]' | sort | uniq
   
   # Find buttons by name pattern
   figma get-data <fileKey> <nodeId> | yq '.. | select(.name? | test("(?i)button")) | .name'

AUTHENTICATION:
   figma auth                                           # Setup API key
   figma auth --show                                    # Show current credentials

KEY FEATURES:
   • Clean, self-contained YAML (no global variables)
   • Silent by default (perfect for Unix pipelines)
   • Inline expanded values (no reference resolution needed) 
   • Hierarchical depth control for step-by-step exploration
   • MCP server integration for Claude Desktop

Examples use placeholder values. Replace <fileKey> and <nodeId> with actual values from Figma URLs.
`)
  .help();

// Auth command
cli.command(
  "auth",
  "Setup Figma authentication",
  (yargs) => {
    return yargs
      .option("remove", {
        type: "boolean",
        description: "Remove saved credentials",
        default: false,
      })
      .option("show", {
        type: "boolean",
        description: "Show current credentials",
        default: false,
      });
  },
  async (argv) => {
    try {
      const options: AuthOptions = {
        remove: argv.remove,
        show: argv.show,
      };
      await authCommand(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  }
);

// Get data command
cli.command(
  "get-data <fileKey> [nodeId]",
  "Get layout information from a Figma file - AI-optimized clean YAML output",
  (yargs) => {
    return yargs
      .positional("fileKey", {
        type: "string",
        description: "The key of the Figma file to fetch (from URL: figma.com/file/<fileKey>/...)",
        demandOption: true,
      })
      .positional("nodeId", {
        type: "string",
        description: "The ID of the node to fetch (from URL: ?node-id=<nodeId>, optional)",
      })
      .option("depth", {
        alias: "D",
        type: "number",
        description: "How many levels deep to traverse the node tree (Figma API parameter)",
      })
      .option("depth-layers", {
        type: "number",
        description: "Limit output to N layers deep (1=top level only, 2=top+first children, etc.)",
      });
  },
  async (argv) => {
    try {
      let apiKey = argv["figma-api-key"];
      if (!apiKey) {
        apiKey = await getDefaultApiKey();
      }
      
      if (!apiKey) {
        console.error("Error: Figma API key is required. Run 'figma auth' to set up authentication or use --figma-api-key option.");
        process.exit(1);
      }

      const authOptions: FigmaAuthOptions = {
        figmaApiKey: apiKey,
        figmaOAuthToken: argv["figma-oauth-token"] || "",
        useOAuth: argv["use-oauth"],
      };

      // Configure logging based on verbose option
      Logger.isHTTP = false;
      if (!argv.verbose) {
        // Disable all logging when not in verbose mode
        Logger.log = () => {};
        Logger.error = () => {};
      }

      const figmaService = new FigmaService(authOptions);
      
      if (argv.verbose) {
        console.error(
          `🔍 Fetching ${
            argv.depth ? `${argv.depth} layers deep` : "all layers"
          } of ${argv.nodeId ? `node ${argv.nodeId} from file` : `full file`} ${argv.fileKey}`
        );
      }

      let file;
      if (argv.nodeId) {
        file = await figmaService.getNode(argv.fileKey, argv.nodeId, argv.depth);
      } else {
        file = await figmaService.getFile(argv.fileKey, argv.depth);
      }

      if (argv.verbose) {
        console.error(`✅ Successfully fetched file: ${file.name}`);
      }
      
      // Create clean structure with file info at top and inline expanded nodes
      const { nodes, components, componentSets, ...fileInfo } = file;
      
      // Apply depth layers limitation if specified
      const finalNodes = argv["depth-layers"] 
        ? limitNodeDepth(nodes, argv["depth-layers"])
        : nodes;

      const result = {
        file: fileInfo,
        nodes: finalNodes,
        ...(Object.keys(components).length > 0 && { components }),
        ...(Object.keys(componentSets).length > 0 && { componentSets }),
      };

      const output = argv.format === "json" 
        ? JSON.stringify(result, null, 2) 
        : yaml.dump(result);

      console.log(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  }
);

// MCP Server command
cli.command(
  "mcp",
  "Start MCP server for integration with Claude Desktop",
  (yargs) => {
    return yargs
      .option("stdio", {
        type: "boolean",
        description: "Run in stdio mode for MCP integration",
        default: true,
      })
      .option("port", {
        type: "number",
        description: "Port for HTTP server mode (alternative to stdio)",
      });
  },
  async (argv) => {
    try {
      // Import MCP modules dynamically to avoid loading if not needed
      const { createServer } = await import("./mcp.js");
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const { startHttpServer } = await import("./server.js");
      const { getServerConfig } = await import("./config.js");

      let apiKey = argv["figma-api-key"];
      if (!apiKey) {
        apiKey = await getDefaultApiKey();
      }
      
      if (!apiKey) {
        console.error("Error: Figma API key is required. Run 'figma auth' to set up authentication or use --figma-api-key option.");
        process.exit(1);
      }

      const authOptions: FigmaAuthOptions = {
        figmaApiKey: apiKey,
        figmaOAuthToken: argv["figma-oauth-token"] || "",
        useOAuth: argv["use-oauth"],
      };

      const isStdioMode = argv.stdio && !argv.port;
      const config = await getServerConfig(isStdioMode);
      
      const server = createServer(authOptions, { 
        isHTTP: !isStdioMode, 
        outputFormat: argv.format === "json" ? "json" : "yaml" 
      });

      if (isStdioMode) {
        if (argv.verbose) {
          console.error("🚀 Starting Figma MCP Server in stdio mode...");
        }
        const transport = new StdioServerTransport();
        await server.connect(transport);
      } else {
        const port = argv.port || config.port;
        console.error(`🚀 Starting Figma MCP Server in HTTP mode on port ${port}...`);
        await startHttpServer(port, server);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`Error starting MCP server: ${message}`);
      process.exit(1);
    }
  }
);

// Download images command
cli.command(
  "download-images <fileKey> <localPath>",
  "Download SVG and PNG images from a Figma file (format determined by fileName extension: .svg/.png, defaults to .svg)",
  (yargs) => {
    return yargs
      .positional("fileKey", {
        type: "string",
        description: "The key of the Figma file containing the nodes",
        demandOption: true,
      })
      .positional("localPath", {
        type: "string",
        description: "Local directory path to save images",
        demandOption: true,
      })
      .option("nodes", {
        type: "string",
        description: "JSON string of nodes to download (array of {nodeId, fileName, imageRef?})",
        demandOption: true,
      })
      .option("png-scale", {
        type: "number",
        description: "Export scale for PNG images",
        default: 2,
      })
      .option("svg-outline-text", {
        type: "boolean",
        description: "Whether to outline text in SVG exports",
        default: true,
      })
      .option("svg-include-id", {
        type: "boolean",
        description: "Whether to include IDs in SVG exports",
        default: false,
      })
      .option("svg-simplify-stroke", {
        type: "boolean",
        description: "Whether to simplify strokes in SVG exports",
        default: true,
      });
  },
  async (argv) => {
    try {
      let apiKey = argv["figma-api-key"];
      if (!apiKey) {
        apiKey = await getDefaultApiKey();
      }
      
      if (!apiKey) {
        console.error("Error: Figma API key is required. Run 'figma auth' to set up authentication or use --figma-api-key option.");
        process.exit(1);
      }

      const authOptions: FigmaAuthOptions = {
        figmaApiKey: apiKey,
        figmaOAuthToken: argv["figma-oauth-token"] || "",
        useOAuth: argv["use-oauth"],
      };

      if (argv.verbose) {
        Logger.isHTTP = false; // Enable logging for CLI
      }

      const figmaService = new FigmaService(authOptions);
      
      // Parse nodes JSON
      let nodes;
      try {
        nodes = JSON.parse(argv.nodes);
      } catch (error) {
        throw new Error("Invalid JSON format for nodes parameter");
      }

      if (!Array.isArray(nodes)) {
        throw new Error("Nodes parameter must be an array");
      }

      const svgOptions = {
        outlineText: argv["svg-outline-text"],
        includeId: argv["svg-include-id"],
        simplifyStroke: argv["svg-simplify-stroke"],
      };

      const imageFills = nodes.filter(({ imageRef }: any) => !!imageRef);
      const fillDownloads = figmaService.getImageFills(
        argv.fileKey,
        imageFills,
        argv.localPath
      );

      const renderRequests = nodes
        .filter(({ imageRef }: any) => !imageRef)
        .map(({ nodeId, fileName }: any) => {
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
        argv.fileKey,
        renderRequests,
        argv.localPath,
        argv["png-scale"],
        svgOptions
      );

      const downloads = await Promise.all([fillDownloads, renderDownloads]).then(
        ([f, r]) => [...f, ...r]
      );

      const saveSuccess = !downloads.find((success) => !success);
      if (saveSuccess) {
        console.log(`Success! ${downloads.length} images downloaded`);
      } else {
        console.error("Some downloads failed");
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  }
);

// Help command
cli.command(
  "*",
  "Show help",
  {},
  () => {
    cli.showHelp();
  }
);

cli.parse();
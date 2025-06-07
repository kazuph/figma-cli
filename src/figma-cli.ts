#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { config } from "dotenv";
import { resolve } from "path";
import { FigmaService, type FigmaAuthOptions } from "./services/figma.js";
import yaml from "js-yaml";
import { Logger } from "./utils/logger.js";

// Load .env file
config({ path: resolve(process.cwd(), ".env") });

// CLI configuration
const cli = yargs(hideBin(process.argv))
  .scriptName("figma")
  .version("1.0.0")
  .option("figma-api-key", {
    type: "string",
    description: "Figma API key",
    default: process.env.FIGMA_API_KEY,
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
  .demandOption(["figma-api-key"], "Figma API key is required")
  .help();

// Get data command
cli.command(
  "get-data <fileKey> [nodeId]",
  "Get layout information from a Figma file",
  (yargs) => {
    return yargs
      .positional("fileKey", {
        type: "string",
        description: "The key of the Figma file to fetch",
        demandOption: true,
      })
      .positional("nodeId", {
        type: "string",
        description: "The ID of the node to fetch (optional)",
      })
      .option("depth", {
        type: "number",
        description: "How many levels deep to traverse the node tree",
      });
  },
  async (argv) => {
    try {
      const authOptions: FigmaAuthOptions = {
        figmaApiKey: argv["figma-api-key"]!,
        figmaOAuthToken: argv["figma-oauth-token"] || "",
        useOAuth: argv["use-oauth"],
      };

      if (argv.verbose) {
        Logger.isHTTP = false; // Enable logging for CLI
      }

      const figmaService = new FigmaService(authOptions);
      
      Logger.log(
        `Fetching ${
          argv.depth ? `${argv.depth} layers deep` : "all layers"
        } of ${argv.nodeId ? `node ${argv.nodeId} from file` : `full file`} ${argv.fileKey}`
      );

      let file;
      if (argv.nodeId) {
        file = await figmaService.getNode(argv.fileKey, argv.nodeId, argv.depth);
      } else {
        file = await figmaService.getFile(argv.fileKey, argv.depth);
      }

      Logger.log(`Successfully fetched file: ${file.name}`);
      const { nodes, globalVars, ...metadata } = file;

      const result = {
        metadata,
        nodes,
        globalVars,
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

// Download images command
cli.command(
  "download-images <fileKey> <localPath>",
  "Download SVG and PNG images from a Figma file",
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
      const authOptions: FigmaAuthOptions = {
        figmaApiKey: argv["figma-api-key"]!,
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
        .map(({ nodeId, fileName }: any) => ({
          nodeId,
          fileName,
          fileType: fileName.endsWith(".svg") ? ("svg" as const) : ("png" as const),
        }));

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
#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { resolve } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getServerConfig } from "./config.js";
import { startHttpServer } from "./server.js";
import { createServer } from "./mcp.js";
import { authCommand } from "./commands/auth.js";
import { getFigmaDataCommand } from "./commands/get-figma-data.js";
import { downloadImagesCommand } from "./commands/download-images.js";

// Load .env from the current working directory
config({ path: resolve(process.cwd(), ".env") });

export async function startServer(): Promise<void> {
  // Check if we're running in stdio mode (e.g., via CLI)
  const isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");

  const config = await getServerConfig(isStdioMode);

  const server = createServer(config.auth, { 
    isHTTP: !isStdioMode, 
    outputFormat: config.outputFormat 
  });

  if (isStdioMode) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    console.log(`Initializing Figma MCP Server in HTTP mode on port ${config.port}...`);
    await startHttpServer(config.port, server);
  }
}

async function main(): Promise<void> {
  const argv = yargs(hideBin(process.argv))
    .command('auth', 'Manage Figma authentication', (yargs) => {
      return yargs
        .option('remove', {
          type: 'boolean',
          description: 'Remove saved credentials'
        })
        .option('show', {
          type: 'boolean',
          description: 'Show current credentials'
        });
    })
    .command('server', 'Start MCP server', (yargs) => {
      return yargs
        .option('stdio', {
          type: 'boolean',
          description: 'Run in stdio mode for MCP'
        })
        .option('port', {
          type: 'number',
          description: 'Port for HTTP server mode'
        });
    })
    .command('get-data <fileKey> [nodeId]', 'Get Figma file or node data - AI-optimized clean YAML output', (yargs) => {
      return yargs
        .positional('fileKey', {
          type: 'string',
          describe: 'Figma file key (from URL: figma.com/file/<file-key>/...)'
        })
        .positional('nodeId', {
          type: 'string',
          describe: 'Node ID to fetch (format: 1234:5678, not 1234-5678. From URL: ?node-id=<node-id>)'
        })
        .option('depth', {
          alias: 'D',
          type: 'number',
          description: 'How many levels deep to traverse'
        })
        .option('depth-layers', {
          type: 'number',
          description: 'Limit output to N layers deep (1=top level only, 2=top+first children, etc.)'
        })
        .epilog(`
AI-OPTIMIZED USAGE EXAMPLES:

Basic usage:
  figma get-data RgZYvH2cuX4JvrD9ZQbCIP 9637:4948

Hierarchical exploration (recommended for AI):
  figma get-data <fileKey> <nodeId> --depth-layers 1    # Screen names only
  figma get-data <fileKey> <nodeId> --depth-layers 2    # + First level children

Pipeline processing with yq:
  figma get-data <fileKey> <nodeId> | yq '.nodes[0].name'                    # Get screen name
  figma get-data <fileKey> <nodeId> | yq '.nodes[0].fills'                   # Get colors
  figma get-data <fileKey> <nodeId> | yq '.nodes[0].layout.dimensions'       # Get dimensions

Complex one-liners:
  figma get-data <fileKey> <nodeId> --depth-layers 2 | yq '.nodes[0].children[] | select(.type=="TEXT") | .text' | head -5
  figma get-data <fileKey> <nodeId> | yq '.nodes[0].children[] | select(.fills) | {name, fills}' | head -10
  figma get-data <fileKey> <nodeId> --json | jq '[.nodes[0].children[]? | {name, type, fills}] | unique_by(.name)'

Output formats:
  figma get-data <fileKey> <nodeId> --json | jq '.nodes[0]'    # JSON output
  figma get-data <fileKey> <nodeId> --verbose                  # With debug logs

FEATURES:
  • Clean, self-contained YAML (no global variables)
  • Silent by default (perfect for pipelines)  
  • Inline expanded values (no reference resolution needed)
  • Hierarchical depth control for step-by-step exploration
        `)
        .option('verbose', {
          type: 'boolean',
          description: 'Output verbose information'
        })
        .option('json', {
          type: 'boolean',
          description: 'Output in JSON format instead of YAML'
        })
        .option('figma-api-key', {
          type: 'string',
          description: 'Figma API key (overrides saved credentials)'
        })
        .option('figma-oauth-token', {
          type: 'string',
          description: 'Figma OAuth token (overrides saved credentials)'
        });
    })
    .command('download-images <fileKey> <localPath>', 'Download images from Figma', (yargs) => {
      return yargs
        .positional('fileKey', {
          type: 'string',
          describe: 'Figma file key'
        })
        .positional('localPath', {
          type: 'string',
          describe: 'Local directory to save images'
        })
        .option('node-id', {
          type: 'string',
          description: 'Node ID to download (format: 1234:5678, not 1234-5678)'
        })
        .option('file-name', {
          type: 'string',
          description: 'Output filename'
        })
        .option('image-ref', {
          type: 'string',
          description: 'Image reference for fill images'
        })
        .option('png-scale', {
          type: 'number',
          default: 2,
          description: 'PNG export scale'
        })
        .option('figma-api-key', {
          type: 'string',
          description: 'Figma API key (overrides saved credentials)'
        })
        .option('figma-oauth-token', {
          type: 'string',
          description: 'Figma OAuth token (overrides saved credentials)'
        });
    })
    .demandCommand(1, 'You need to specify a command')
    .help()
    .version(process.env.NPM_PACKAGE_VERSION ?? "unknown")
    .parseSync();

  const command = argv._[0] as string;

  // Handle auth command
  if (command === 'auth') {
    await authCommand({
      remove: argv.remove as boolean,
      show: argv.show as boolean
    });
    return;
  }

  // Handle server command
  if (command === 'server') {
    await startServer();
    return;
  }

  // Handle get-data command
  if (command === 'get-data') {
    await getFigmaDataCommand({
      fileKey: argv.fileKey as string,
      nodeId: argv.nodeId as string,
      depth: argv.depth as number,
      depthLayers: argv['depth-layers'] as number,
      json: argv.json as boolean,
      verbose: argv.verbose as boolean,
      figmaApiKey: argv['figma-api-key'] as string,
      figmaOauthToken: argv['figma-oauth-token'] as string,
    });
    return;
  }

  // Handle download-images command
  if (command === 'download-images') {
    const nodes = [];
    if (argv['node-id']) {
      const node: any = {
        nodeId: argv['node-id'] as string,
        fileName: argv['file-name'] as string,
      };
      if (argv['image-ref']) {
        node.imageRef = argv['image-ref'] as string;
      }
      nodes.push(node);
    }
    
    await downloadImagesCommand({
      fileKey: argv.fileKey as string,
      nodes: nodes,
      localPath: argv.localPath as string,
      pngScale: argv['png-scale'] as number,
      figmaApiKey: argv['figma-api-key'] as string,
      figmaOauthToken: argv['figma-oauth-token'] as string,
    });
    return;
  }

  // Should not reach here due to demandCommand
  console.error('Unknown command');
  process.exit(1);
}

// If we're being executed directly (not imported), run main
if (process.argv[1]) {
  main().catch((error) => {
    console.error("Failed to start:", error);
    process.exit(1);
  });
}

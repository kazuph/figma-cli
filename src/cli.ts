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
    .command('get-data <fileKey> [nodeId]', 'Get Figma file or node data', (yargs) => {
      return yargs
        .positional('fileKey', {
          type: 'string',
          describe: 'Figma file key (from URL: figma.com/file/<file-key>/...)'
        })
        .positional('nodeId', {
          type: 'string',
          describe: 'Node ID to fetch (from URL: ?node-id=<node-id>)'
        })
        .option('depth', {
          type: 'number',
          description: 'How many levels deep to traverse'
        })
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
          description: 'Node ID to download'
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
      json: argv.json as boolean,
      figmaApiKey: argv['figma-api-key'] as string,
      figmaOauthToken: argv['figma-oauth-token'] as string,
    });
    return;
  }

  // Handle download-images command
  if (command === 'download-images') {
    const nodes = [];
    if (argv['node-id']) {
      nodes.push({
        nodeId: argv['node-id'] as string,
        imageRef: argv['image-ref'] as string,
        fileName: argv['file-name'] as string,
      });
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

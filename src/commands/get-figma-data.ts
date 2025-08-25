import { FigmaService } from '../services/figma.js';
import { loadCredentials } from '../utils/credentials.js';
import type { SimplifiedNode } from '../services/simplify-node-response.js';
import { Logger } from '../utils/logger.js';
import yaml from 'js-yaml';

export interface GetFigmaDataOptions {
  fileKey: string;
  nodeId?: string;
  depth?: number;
  json?: boolean;
  verbose?: boolean;
  figmaApiKey?: string;
  figmaOauthToken?: string;
}


export async function getFigmaDataCommand(options: GetFigmaDataOptions): Promise<void> {
  try {
    // Get authentication
    let auth = {
      figmaApiKey: options.figmaApiKey || '',
      figmaOAuthToken: options.figmaOauthToken || '',
      useOAuth: !!options.figmaOauthToken
    };

    // Load from credentials if not provided
    if (!auth.figmaApiKey && !auth.figmaOAuthToken) {
      const credentials = await loadCredentials();
      if (credentials?.apiKey) {
        auth.figmaApiKey = credentials.apiKey;
      } else if (credentials?.oauthToken) {
        auth.figmaOAuthToken = credentials.oauthToken;
        auth.useOAuth = true;
      }
    }

    // Check if we have authentication
    if (!auth.figmaApiKey && !auth.figmaOAuthToken) {
      console.error('❌ No authentication found.');
      console.error('Run: fgm auth');
      console.error('Or provide: --figma-api-key <token>');
      process.exit(1);
    }

    // Configure logging based on verbose option
    Logger.isHTTP = false;
    if (!options.verbose) {
      // Disable all logging when not in verbose mode
      Logger.log = () => {};
      Logger.error = () => {};
    }

    const figmaService = new FigmaService(auth);

    if (options.verbose) {
      console.error(`🔍 Fetching ${options.nodeId ? `node ${options.nodeId}` : 'file'} from ${options.fileKey}...`);
    }

    let file;
    if (options.nodeId) {
      file = await figmaService.getNode(options.fileKey, options.nodeId, options.depth);
    } else {
      file = await figmaService.getFile(options.fileKey, options.depth);
    }

    if (options.verbose) {
      console.error(`✅ Successfully fetched: ${file.name}`);
    }

    // Create clean structure with file info at top and inline expanded nodes
    const { nodes, components, componentSets, ...fileInfo } = file;
    
    const finalNodes = nodes;
    
    const result = {
      file: fileInfo,
      nodes: finalNodes,
      ...(Object.keys(components).length > 0 && { components }),
      ...(Object.keys(componentSets).length > 0 && { componentSets }),
    };

    // Output the result - always YAML for clean CLI output
    const output = yaml.dump(result);
    console.log(output);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${message}`);
    process.exit(1);
  }
}
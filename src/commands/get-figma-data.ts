import { FigmaService } from '../services/figma.js';
import { loadCredentials } from '../utils/credentials.js';
import yaml from 'js-yaml';

export interface GetFigmaDataOptions {
  fileKey: string;
  nodeId?: string;
  depth?: number;
  json?: boolean;
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

    const figmaService = new FigmaService(auth);

    console.error(`🔍 Fetching ${options.nodeId ? `node ${options.nodeId}` : 'file'} from ${options.fileKey}...`);

    let file;
    if (options.nodeId) {
      file = await figmaService.getNode(options.fileKey, options.nodeId, options.depth);
    } else {
      file = await figmaService.getFile(options.fileKey, options.depth);
    }

    console.error(`✅ Successfully fetched: ${file.name}`);

    const { nodes, globalVars, ...metadata } = file;
    const result = {
      metadata,
      nodes,
      globalVars,
    };

    // Output the result
    const output = options.json 
      ? JSON.stringify(result, null, 2) 
      : yaml.dump(result);
    
    console.log(output);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${message}`);
    process.exit(1);
  }
}
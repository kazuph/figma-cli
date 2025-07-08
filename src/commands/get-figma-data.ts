import { FigmaService } from '../services/figma.js';
import { loadCredentials } from '../utils/credentials.js';
import { SimplifiedNode } from '../services/simplify-node-response.js';
import { Logger } from '../utils/logger.js';
import yaml from 'js-yaml';

export interface GetFigmaDataOptions {
  fileKey: string;
  nodeId?: string;
  depth?: number;
  depthLayers?: number;
  json?: boolean;
  verbose?: boolean;
  figmaApiKey?: string;
  figmaOauthToken?: string;
}

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
    
    // Apply depth layers limitation if specified
    const finalNodes = options.depthLayers 
      ? limitNodeDepth(nodes, options.depthLayers)
      : nodes;
    
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
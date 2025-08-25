import { FigmaService } from '../services/figma.js';
import { loadCredentials } from '../utils/credentials.js';

export interface DownloadImagesOptions {
  fileKey: string;
  nodes: {
    nodeId: string;
    imageRef?: string;
    fileName: string;
  }[];
  localPath: string;
  pngScale?: number;
  svgOptions?: {
    outlineText?: boolean;
    includeId?: boolean;
    simplifyStroke?: boolean;
  };
  // New image processing options
  imageProcessing?: {
    enabled?: boolean;
    mode?: "FILL" | "FIT" | "CROP" | "TILE";
    width?: number;
    height?: number;
    quality?: number;
    preserveAspectRatio?: boolean;
    background?: string | { r: number; g: number; b: number; alpha?: number };
  };
  figmaApiKey?: string;
  figmaOauthToken?: string;
}

export async function downloadImagesCommand(options: DownloadImagesOptions): Promise<void> {
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

    console.error(`📥 Downloading ${options.nodes.length} images from ${options.fileKey}...`);

    const imageFills = options.nodes.filter(({ imageRef }) => !!imageRef) as {
      nodeId: string;
      imageRef: string;
      fileName: string;
    }[];

    // Extract image processing options
    const imageProcessingOptions = options.imageProcessing?.enabled ? {
      mode: options.imageProcessing.mode,
      width: options.imageProcessing.width,
      height: options.imageProcessing.height,
      quality: options.imageProcessing.quality,
      preserveAspectRatio: options.imageProcessing.preserveAspectRatio,
      background: options.imageProcessing.background,
    } : undefined;

    const fillDownloads = figmaService.getImageFills(options.fileKey, imageFills, options.localPath, imageProcessingOptions);
    
    const renderRequests = options.nodes
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

    const svgOptions = {
      outlineText: options.svgOptions?.outlineText ?? false,
      includeId: options.svgOptions?.includeId ?? false,
      simplifyStroke: options.svgOptions?.simplifyStroke ?? false,
    };

    const renderDownloads = figmaService.getImages(
      options.fileKey,
      renderRequests,
      options.localPath,
      options.pngScale || 2,
      svgOptions,
      imageProcessingOptions,
    );

    const downloads = await Promise.all([fillDownloads, renderDownloads]).then(([f, r]) => [
      ...f,
      ...r,
    ]);

    // Check if any download failed
    const saveSuccess = !downloads.find((success) => !success);
    
    if (saveSuccess) {
      console.error(`✅ Successfully downloaded ${downloads.length} images`);
      console.log(`Downloaded: ${downloads.join(", ")}`);
    } else {
      console.error('❌ Some downloads failed');
      process.exit(1);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${message}`);
    process.exit(1);
  }
}
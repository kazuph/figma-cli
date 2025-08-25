import sharp from 'sharp';
import path from 'path';

/**
 * Image processing modes supported by Figma and this CLI
 */
export type ImageProcessingMode = 'FILL' | 'FIT' | 'CROP' | 'TILE';

/**
 * Options for image processing
 */
export interface ImageProcessingOptions {
  /**
   * The processing mode to apply to the image
   */
  mode: ImageProcessingMode;
  /**
   * Target width for the processed image
   */
  width?: number;
  /**
   * Target height for the processed image
   */
  height?: number;
  /**
   * Background color for padding (used in FIT mode)
   */
  background?: string | { r: number; g: number; b: number; alpha?: number };
  /**
   * Quality for JPEG output (1-100)
   */
  quality?: number;
  /**
   * Whether to preserve aspect ratio
   */
  preserveAspectRatio?: boolean;
  /**
   * Position for cropping (used in CROP mode)
   */
  position?: 'top' | 'right top' | 'right' | 'right bottom' | 'bottom' | 'left bottom' | 'left' | 'left top' | 'centre' | 'center';
}

/**
 * Information about the processed image
 */
export interface ProcessedImageInfo {
  /**
   * The file path where the processed image was saved
   */
  filePath: string;
  /**
   * The original image dimensions
   */
  originalDimensions: {
    width: number;
    height: number;
  };
  /**
   * The processed image dimensions
   */
  processedDimensions: {
    width: number;
    height: number;
  };
  /**
   * The processing mode that was applied
   */
  mode: ImageProcessingMode;
}

/**
 * Process an image with the specified mode and options
 * @param inputBuffer - The input image buffer
 * @param options - Processing options
 * @returns The processed image buffer
 */
export async function processImageBuffer(
  inputBuffer: Buffer,
  options: ImageProcessingOptions
): Promise<Buffer> {
  let image = sharp(inputBuffer);
  
  // Get original image metadata
  const metadata = await image.metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  const targetWidth = options.width;
  const targetHeight = options.height;

  switch (options.mode) {
    case 'FILL':
      // Stretch the image to fill the target dimensions, ignoring aspect ratio
      if (targetWidth && targetHeight) {
        image = image.resize(targetWidth, targetHeight, {
          fit: 'fill',
          withoutEnlargement: false
        });
      }
      break;

    case 'FIT':
      // Scale the image to fit within the target dimensions, preserving aspect ratio
      // Add padding if necessary
      if (targetWidth || targetHeight) {
        const resizeOptions: sharp.ResizeOptions = {
          fit: 'inside',
          withoutEnlargement: false
        };
        
        if (options.background) {
          resizeOptions.background = options.background;
        }

        image = image.resize(targetWidth, targetHeight, resizeOptions);
      }
      break;

    case 'CROP':
      // Scale and crop the image to fill the target dimensions, preserving aspect ratio
      if (targetWidth && targetHeight) {
        const resizeOptions: sharp.ResizeOptions = {
          fit: 'cover',
          withoutEnlargement: false
        };

        if (options.position) {
          resizeOptions.position = options.position as any;
        }

        image = image.resize(targetWidth, targetHeight, resizeOptions);
      }
      break;

    case 'TILE':
      // For tiling, we create a pattern by repeating the image
      // This is more complex and may require custom implementation
      if (targetWidth && targetHeight) {
        // First, ensure the input image is small enough to tile
        const tileWidth = Math.min(originalWidth, targetWidth);
        const tileHeight = Math.min(originalHeight, targetHeight);
        
        // Resize the source image if needed
        const tileImage = await image.clone().resize(tileWidth, tileHeight, { fit: 'fill' }).toBuffer();
        
        // Calculate how many tiles we need
        const tilesX = Math.ceil(targetWidth / tileWidth);
        const tilesY = Math.ceil(targetHeight / tileHeight);
        
        // Create a new image with the target dimensions
        const canvas = sharp({
          create: {
            width: targetWidth,
            height: targetHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 0 }
          }
        });

        // Prepare composite operations for tiling
        const composite: sharp.OverlayOptions[] = [];
        
        for (let y = 0; y < tilesY; y++) {
          for (let x = 0; x < tilesX; x++) {
            composite.push({
              input: tileImage,
              left: x * tileWidth,
              top: y * tileHeight
            });
          }
        }

        image = canvas.composite(composite);
      }
      break;

    default:
      throw new Error(`Unsupported image processing mode: ${options.mode}`);
  }

  // Apply quality settings if specified and output format supports it
  if (options.quality && (metadata.format === 'jpeg' || metadata.format === 'webp')) {
    if (metadata.format === 'jpeg') {
      image = image.jpeg({ quality: options.quality });
    } else if (metadata.format === 'webp') {
      image = image.webp({ quality: options.quality });
    }
  }

  return image.toBuffer();
}

/**
 * Process an image file and save it to a new location
 * @param inputPath - Path to the input image file
 * @param outputPath - Path where the processed image will be saved
 * @param options - Processing options
 * @returns Information about the processed image
 */
export async function processImageFile(
  inputPath: string,
  outputPath: string,
  options: ImageProcessingOptions
): Promise<ProcessedImageInfo> {
  // Read the input image
  const inputImage = sharp(inputPath);
  const originalMetadata = await inputImage.metadata();
  
  const originalDimensions = {
    width: originalMetadata.width || 0,
    height: originalMetadata.height || 0
  };

  // Process the image
  const inputBuffer = await inputImage.toBuffer();
  const processedBuffer = await processImageBuffer(inputBuffer, options);
  
  // Get processed image metadata
  const processedMetadata = await sharp(processedBuffer).metadata();
  const processedDimensions = {
    width: processedMetadata.width || 0,
    height: processedMetadata.height || 0
  };

  // Save the processed image
  await sharp(processedBuffer).toFile(outputPath);

  return {
    filePath: outputPath,
    originalDimensions,
    processedDimensions,
    mode: options.mode
  };
}

/**
 * Get optimal processing mode based on Figma scale mode
 * @param figmaScaleMode - The scale mode from Figma API
 * @returns The corresponding image processing mode
 */
export function getProcessingModeFromFigmaScaleMode(figmaScaleMode?: string): ImageProcessingMode {
  switch (figmaScaleMode?.toLowerCase()) {
    case 'fill':
      return 'FILL';
    case 'fit':
      return 'FIT';
    case 'crop':
      return 'CROP';
    case 'tile':
      return 'TILE';
    default:
      // Default to FIT if no scale mode is specified
      return 'FIT';
  }
}

/**
 * Validate image processing options
 * @param options - The options to validate
 * @throws Error if options are invalid
 */
export function validateImageProcessingOptions(options: ImageProcessingOptions): void {
  const validModes: ImageProcessingMode[] = ['FILL', 'FIT', 'CROP', 'TILE'];
  
  if (!validModes.includes(options.mode)) {
    throw new Error(`Invalid image processing mode: ${options.mode}. Valid modes are: ${validModes.join(', ')}`);
  }

  if (options.quality && (options.quality < 1 || options.quality > 100)) {
    throw new Error('Quality must be between 1 and 100');
  }

  if (options.width && options.width <= 0) {
    throw new Error('Width must be greater than 0');
  }

  if (options.height && options.height <= 0) {
    throw new Error('Height must be greater than 0');
  }
}

/**
 * Create processing options from Figma paint data
 * @param paint - Figma paint object containing scale mode and other properties
 * @param targetWidth - Optional target width
 * @param targetHeight - Optional target height
 * @returns Image processing options
 */
export function createProcessingOptionsFromPaint(
  paint: { scaleMode?: string; [key: string]: any },
  targetWidth?: number,
  targetHeight?: number
): ImageProcessingOptions {
  const mode = getProcessingModeFromFigmaScaleMode(paint.scaleMode);
  
  return {
    mode,
    width: targetWidth,
    height: targetHeight,
    preserveAspectRatio: mode !== 'FILL',
    background: { r: 255, g: 255, b: 255, alpha: 0 }, // Transparent background by default
    quality: 85 // Default quality
  };
}
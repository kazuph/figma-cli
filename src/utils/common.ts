import fs from "fs";
import path from "path";

import type { Paint, RGBA, Vector } from "@figma/rest-api-spec";
import type {
  CSSHexColor,
  CSSRGBAColor,
  SimplifiedFill,
} from "~/services/simplify-node-response.js";
import { processImageBuffer, type ImageProcessingMode } from "~/utils/image-processing.js";

export type StyleId = `${string}_${string}` & { __brand: "StyleId" };

export interface ColorValue {
  hex: CSSHexColor;
  opacity: number;
}

/**
 * Download Figma image and save it locally, with optional processing
 * @param fileName - The filename to save as
 * @param localPath - The local path to save to
 * @param imageUrl - Image URL (images[nodeId])
 * @param processingOptions - Optional image processing options
 * @returns A Promise that resolves to the full file path where the image was saved
 * @throws Error if download fails
 */
export async function downloadFigmaImage(
  fileName: string,
  localPath: string,
  imageUrl: string,
  processingOptions?: {
    mode?: "FILL" | "FIT" | "CROP" | "TILE";
    width?: number;
    height?: number;
    quality?: number;
    preserveAspectRatio?: boolean;
    background?: string | { r: number; g: number; b: number; alpha?: number };
  }
): Promise<string> {
  try {
    // Ensure local path exists
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    // Build the complete file path
    const fullPath = path.join(localPath, fileName);

    // Use fetch to download the image
    const response = await fetch(imageUrl, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    // Get the image as a buffer
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Apply image processing if options are provided
    let finalBuffer = imageBuffer;
    if (processingOptions && processingOptions.mode && (processingOptions.width || processingOptions.height)) {
      try {
        const imageProcessingOptions = {
          mode: processingOptions.mode as ImageProcessingMode,
          width: processingOptions.width,
          height: processingOptions.height,
          quality: processingOptions.quality,
          preserveAspectRatio: processingOptions.preserveAspectRatio,
          background: processingOptions.background,
        };
        
        finalBuffer = await processImageBuffer(imageBuffer, imageProcessingOptions);
      } catch (processError) {
        // If processing fails, fall back to original image and log warning
        console.warn(`Image processing failed for ${fileName}: ${processError instanceof Error ? processError.message : String(processError)}. Using original image.`);
        finalBuffer = imageBuffer;
      }
    }

    // Write the final buffer to file
    await fs.promises.writeFile(fullPath, finalBuffer);
    
    return fullPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error downloading image: ${errorMessage}`);
  }
}

/**
 * Remove keys with empty arrays or empty objects from an object.
 * @param input - The input object or value.
 * @returns The processed object or the original value.
 */
export function removeEmptyKeys<T>(input: T): T {
  // If not an object type or null, return directly
  if (typeof input !== "object" || input === null) {
    return input;
  }

  // Handle array type
  if (Array.isArray(input)) {
    return input.map((item) => removeEmptyKeys(item)) as T;
  }

  // Handle object type
  const result = {} as T;
  for (const key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = input[key];

      // Recursively process nested objects
      const cleanedValue = removeEmptyKeys(value);

      // Skip empty arrays and empty objects
      if (
        cleanedValue !== undefined &&
        !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
        !(
          typeof cleanedValue === "object" &&
          cleanedValue !== null &&
          Object.keys(cleanedValue).length === 0
        )
      ) {
        result[key] = cleanedValue;
      }
    }
  }

  return result;
}

/**
 * Convert hex color value and opacity to rgba format
 * @param hex - Hexadecimal color value (e.g., "#FF0000" or "#F00")
 * @param opacity - Opacity value (0-1)
 * @returns Color string in rgba format
 */
export function hexToRgba(hex: string, opacity: number = 1): string {
  // Remove possible # prefix
  hex = hex.replace("#", "");

  // Handle shorthand hex values (e.g., #FFF)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  // Convert hex to RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Ensure opacity is in the 0-1 range
  const validOpacity = Math.min(Math.max(opacity, 0), 1);

  return `rgba(${r}, ${g}, ${b}, ${validOpacity})`;
}

/**
 * Convert color from RGBA to { hex, opacity }
 *
 * @param color - The color to convert, including alpha channel
 * @param opacity - The opacity of the color, if not included in alpha channel
 * @returns The converted color
 **/
export function convertColor(color: RGBA, opacity = 1): ColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  // Alpha channel defaults to 1. If opacity and alpha are both and < 1, their effects are multiplicative
  const a = Math.round(opacity * color.a * 100) / 100;

  const hex = ("#" +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()) as CSSHexColor;

  return { hex, opacity: a };
}

/**
 * Convert color from Figma RGBA to rgba(#, #, #, #) CSS format
 *
 * @param color - The color to convert, including alpha channel
 * @param opacity - The opacity of the color, if not included in alpha channel
 * @returns The converted color
 **/
export function formatRGBAColor(color: RGBA, opacity = 1): CSSRGBAColor {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  // Alpha channel defaults to 1. If opacity and alpha are both and < 1, their effects are multiplicative
  const a = Math.round(opacity * color.a * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Generate a 6-character random variable ID
 * @param prefix - ID prefix
 * @returns A 6-character random ID string with prefix
 */
export function generateVarId(prefix: string = "var"): StyleId {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return `${prefix}_${result}` as StyleId;
}

/**
 * Generate a CSS shorthand for values that come with top, right, bottom, and left
 *
 * input: { top: 10, right: 10, bottom: 10, left: 10 }
 * output: "10px"
 *
 * input: { top: 10, right: 20, bottom: 10, left: 20 }
 * output: "10px 20px"
 *
 * input: { top: 10, right: 20, bottom: 30, left: 40 }
 * output: "10px 20px 30px 40px"
 *
 * @param values - The values to generate the shorthand for
 * @returns The generated shorthand
 */
export function generateCSSShorthand(
  values: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  },
  {
    ignoreZero = true,
    suffix = "px",
  }: {
    /**
     * If true and all values are 0, return undefined. Defaults to true.
     */
    ignoreZero?: boolean;
    /**
     * The suffix to add to the shorthand. Defaults to "px".
     */
    suffix?: string;
  } = {},
) {
  const { top, right, bottom, left } = values;
  if (ignoreZero && top === 0 && right === 0 && bottom === 0 && left === 0) {
    return undefined;
  }
  if (top === right && right === bottom && bottom === left) {
    return `${top}${suffix}`;
  }
  if (right === left) {
    if (top === bottom) {
      return `${top}${suffix} ${right}${suffix}`;
    }
    return `${top}${suffix} ${right}${suffix} ${bottom}${suffix}`;
  }
  return `${top}${suffix} ${right}${suffix} ${bottom}${suffix} ${left}${suffix}`;
}

/**
 * Convert a Figma paint (solid, image, gradient) to a SimplifiedFill
 * @param raw - The Figma paint to convert
 * @param processingOptions - Optional image processing options for IMAGE types
 * @returns The converted SimplifiedFill
 */
export function parsePaint(
  raw: Paint,
  processingOptions?: {
    width?: number;
    height?: number;
    quality?: number;
    preserveAspectRatio?: boolean;
    background?: string | { r: number; g: number; b: number; alpha?: number };
  }
): SimplifiedFill {
  if (raw.type === "IMAGE") {
    // Normalize scale mode to uppercase for consistency
    const normalizedScaleMode = raw.scaleMode?.toUpperCase() as "FILL" | "FIT" | "CROP" | "TILE" | "STRETCH" | undefined;
    
    const imageFill: any = {
      type: "IMAGE",
      imageRef: raw.imageRef,
      scaleMode: normalizedScaleMode || "FIT", // Default to FIT if not specified
      imageProcessingOptions: processingOptions,
    };

    // Add optional IMAGE properties for pattern/repeating support
    if (raw.imageTransform) {
      imageFill.imageTransform = raw.imageTransform;
    }
    
    if (raw.scalingFactor !== undefined) {
      imageFill.scalingFactor = raw.scalingFactor;
    }
    
    if (raw.rotation !== undefined) {
      imageFill.rotation = raw.rotation;
    }
    
    if (raw.filters) {
      imageFill.filters = raw.filters;
    }
    
    if ((raw as any).gifRef) {
      imageFill.gifRef = (raw as any).gifRef;
    }

    return imageFill;
  } else if (raw.type === "SOLID") {
    // treat as SOLID
    const { hex, opacity } = convertColor(raw.color!, raw.opacity);
    if (opacity === 1) {
      return hex;
    } else {
      return formatRGBAColor(raw.color!, opacity);
    }
  } else if (
    ["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"].includes(
      raw.type,
    )
  ) {
    // Convert to CSS gradient string instead of returning raw data
    if (!raw.gradientHandlePositions || !raw.gradientStops) {
      // Fallback for invalid gradient data
      return "linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(255,255,255,1) 100%)";
    }

    const gradientStops = raw.gradientStops.map(stop => ({
      position: stop.position,
      color: stop.color
    }));

    return convertGradientToCSS(
      raw.type as "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND",
      raw.gradientHandlePositions,
      gradientStops
    );
  } else if (raw.type === "PATTERN") {
    return {
      type: "PATTERN",
      sourceNodeId: raw.sourceNodeId,
      tileType: raw.tileType,
      scalingFactor: raw.scalingFactor,
      spacing: raw.spacing,
      horizontalAlignment: raw.horizontalAlignment,
      verticalAlignment: raw.verticalAlignment,
    };
  } else {
    throw new Error(`Unknown paint type: ${raw.type}`);
  }
}

/**
 * Check if an element is visible
 * @param element - The item to check
 * @returns True if the item is visible, false otherwise
 */
export function isVisible(element: { visible?: boolean }): boolean {
  return element.visible ?? true;
}

/**
 * Rounds a number to two decimal places, suitable for pixel value processing.
 * @param num The number to be rounded.
 * @returns The rounded number with two decimal places.
 * @throws TypeError If the input is not a valid number
 */
export function pixelRound(num: number): number {
  if (isNaN(num)) {
    throw new TypeError(`Input must be a valid number`);
  }
  return Number(Number(num).toFixed(2));
}

/**
 * Interface for gradient stops with color information
 */
interface GradientStop {
  position: number;
  color: RGBA;
}

/**
 * Calculate the distance between two points
 * @param p1 - First point
 * @param p2 - Second point
 * @returns Distance between points
 */
function calculateDistance(p1: Vector, p2: Vector): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Calculate the angle between two points in degrees
 * @param p1 - First point (start)
 * @param p2 - Second point (end)
 * @returns Angle in degrees
 */
function calculateAngle(p1: Vector, p2: Vector): number {
  const radians = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const degrees = radians * (180 / Math.PI);
  // CSS linear-gradient angle is measured from top (0deg), clockwise
  // atan2 gives angle from right (0deg), counter-clockwise
  // We need to convert: CSS angle = 90 - atan2 angle
  return (90 - degrees + 360) % 360;
}

/**
 * Clamp a value between min and max
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Convert gradient handle positions to CSS percentages
 * Handles cases where gradient handles extend beyond container bounds
 * @param handles - Array of gradient handle positions
 * @returns Converted handle positions as percentages
 */
function convertGradientHandlePositions(handles: Vector[]): Vector[] {
  if (!handles || handles.length < 2) {
    return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  }

  return handles.map(handle => ({
    x: clamp(handle.x, 0, 1),
    y: clamp(handle.y, 0, 1)
  }));
}

/**
 * Generate CSS gradient stops from Figma gradient stops
 * @param stops - Array of gradient stops
 * @returns CSS gradient stops string
 */
function generateGradientStops(stops: GradientStop[]): string {
  if (!stops || stops.length === 0) {
    return "rgba(0,0,0,1) 0%, rgba(255,255,255,1) 100%";
  }

  return stops
    .map(stop => {
      const color = formatRGBAColor(stop.color);
      const position = Math.round(stop.position * 100);
      return `${color} ${position}%`;
    })
    .join(", ");
}

/**
 * Convert Figma linear gradient to CSS linear-gradient
 * @param handlePositions - Gradient handle positions
 * @param gradientStops - Gradient stops
 * @returns CSS linear-gradient string
 */
function convertLinearGradient(handlePositions: Vector[], gradientStops: GradientStop[]): string {
  const convertedHandles = convertGradientHandlePositions(handlePositions);
  const startHandle = convertedHandles[0];
  const endHandle = convertedHandles[1];
  
  // Calculate angle for linear gradient
  const angle = calculateAngle(startHandle, endHandle);
  const stops = generateGradientStops(gradientStops);
  
  return `linear-gradient(${Math.round(angle)}deg, ${stops})`;
}

/**
 * Convert Figma radial gradient to CSS radial-gradient
 * @param handlePositions - Gradient handle positions  
 * @param gradientStops - Gradient stops
 * @returns CSS radial-gradient string
 */
function convertRadialGradient(handlePositions: Vector[], gradientStops: GradientStop[]): string {
  const convertedHandles = convertGradientHandlePositions(handlePositions);
  const centerHandle = convertedHandles[0];
  const edgeHandle = convertedHandles[1];
  
  // Calculate radius as percentage of container
  const radius = calculateDistance(centerHandle, edgeHandle);
  const radiusPercent = Math.round(radius * 100);
  
  // Center position as percentages
  const centerX = Math.round(centerHandle.x * 100);
  const centerY = Math.round(centerHandle.y * 100);
  
  const stops = generateGradientStops(gradientStops);
  
  return `radial-gradient(circle ${radiusPercent}% at ${centerX}% ${centerY}%, ${stops})`;
}

/**
 * Convert Figma angular gradient to CSS conic-gradient
 * @param handlePositions - Gradient handle positions
 * @param gradientStops - Gradient stops  
 * @returns CSS conic-gradient string
 */
function convertAngularGradient(handlePositions: Vector[], gradientStops: GradientStop[]): string {
  const convertedHandles = convertGradientHandlePositions(handlePositions);
  const centerHandle = convertedHandles[0];
  const directionHandle = convertedHandles[1];
  
  // Calculate starting angle
  const angle = calculateAngle(centerHandle, directionHandle);
  
  // Center position as percentages
  const centerX = Math.round(centerHandle.x * 100);
  const centerY = Math.round(centerHandle.y * 100);
  
  const stops = generateGradientStops(gradientStops);
  
  return `conic-gradient(from ${Math.round(angle)}deg at ${centerX}% ${centerY}%, ${stops})`;
}

/**
 * Convert Figma diamond gradient to CSS radial-gradient with ellipse shape
 * @param handlePositions - Gradient handle positions
 * @param gradientStops - Gradient stops
 * @returns CSS radial-gradient string with ellipse shape
 */
function convertDiamondGradient(handlePositions: Vector[], gradientStops: GradientStop[]): string {
  const convertedHandles = convertGradientHandlePositions(handlePositions);
  const centerHandle = convertedHandles[0];
  const edgeHandle = convertedHandles[1];
  
  // Calculate ellipse dimensions
  const deltaX = Math.abs(edgeHandle.x - centerHandle.x);
  const deltaY = Math.abs(edgeHandle.y - centerHandle.y);
  const radiusX = Math.round(deltaX * 100);
  const radiusY = Math.round(deltaY * 100);
  
  // Center position as percentages
  const centerX = Math.round(centerHandle.x * 100);
  const centerY = Math.round(centerHandle.y * 100);
  
  const stops = generateGradientStops(gradientStops);
  
  return `radial-gradient(ellipse ${radiusX}% ${radiusY}% at ${centerX}% ${centerY}%, ${stops})`;
}

/**
 * Convert Figma gradient to CSS gradient string
 * @param type - Gradient type from Figma
 * @param handlePositions - Gradient handle positions
 * @param gradientStops - Gradient stops
 * @returns CSS gradient string
 */
export function convertGradientToCSS(
  type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND",
  handlePositions: Vector[],
  gradientStops: GradientStop[]
): string {
  try {
    switch (type) {
      case "GRADIENT_LINEAR":
        return convertLinearGradient(handlePositions, gradientStops);
      case "GRADIENT_RADIAL":
        return convertRadialGradient(handlePositions, gradientStops);
      case "GRADIENT_ANGULAR":
        return convertAngularGradient(handlePositions, gradientStops);
      case "GRADIENT_DIAMOND":
        return convertDiamondGradient(handlePositions, gradientStops);
      default:
        // Fallback to linear gradient
        return convertLinearGradient(handlePositions, gradientStops);
    }
  } catch (error) {
    // Fallback to a simple linear gradient on any error
    console.warn(`Error converting gradient: ${error}. Using fallback.`);
    const fallbackStops = gradientStops.length > 0 
      ? generateGradientStops(gradientStops)
      : "rgba(0,0,0,1) 0%, rgba(255,255,255,1) 100%";
    return `linear-gradient(0deg, ${fallbackStops})`;
  }
}

import { type SimplifiedLayout, buildSimplifiedLayout } from "~/transformers/layout.js";
import type {
  GetFileNodesResponse,
  Node as FigmaDocumentNode,
  Paint,
  Vector,
  GetFileResponse,
  ComponentPropertyType,
  Component,
  ComponentSet,
} from "@figma/rest-api-spec";
import type {
  SimplifiedComponentDefinition,
  SimplifiedComponentSetDefinition,
} from "~/utils/sanitization.js";
import { sanitizeComponents, sanitizeComponentSets } from "~/utils/sanitization.js";
import { hasValue, isRectangleCornerRadii, isTruthy } from "~/utils/identity.js";
import {
  removeEmptyKeys,
  generateVarId,
  type StyleId,
  parsePaint,
  isVisible,
} from "~/utils/common.js";
import { buildSimplifiedStrokes, type SimplifiedStroke } from "~/transformers/style.js";
import { buildSimplifiedEffects, type SimplifiedEffects } from "~/transformers/effects.js";
/**
 * TODO ITEMS
 *
 * - Improve layout handling—translate from Figma vocabulary to CSS
 * - Pull image fills/vectors out to top level for better AI visibility
 *   ? Implement vector parents again for proper downloads
 * ? Look up existing styles in new MCP endpoint—Figma supports individual lookups without enterprise /v1/styles/:key
 * ? Parse out and save .cursor/rules/design-tokens file on command
 **/

// -------------------- SIMPLIFIED STRUCTURES --------------------

export type TextStyle = Partial<{
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: string;
  letterSpacing: string;
  textCase: string;
  textAlignHorizontal: string;
  textAlignVertical: string;
}>;
export type StrokeWeights = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
// Removed GlobalVars - now using inline expansion for better CLI/AI processing

export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: SimplifiedNode[];
  components: Record<string, SimplifiedComponentDefinition>;
  componentSets: Record<string, SimplifiedComponentSetDefinition>;
}

export interface ComponentProperties {
  name: string;
  value: string;
  type: ComponentPropertyType;
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, etc.
  // geometry
  boundingBox?: BoundingBox;
  // text
  text?: string;
  textStyle?: TextStyle;
  // appearance
  fills?: SimplifiedFill[];
  styles?: string;
  strokes?: SimplifiedStroke;
  effects?: SimplifiedEffects;
  opacity?: number;
  borderRadius?: string;
  // layout & alignment
  layout?: SimplifiedLayout;
  // backgroundColor?: ColorValue; // Deprecated by Figma API
  // for rect-specific strokes, etc.
  componentId?: string;
  componentProperties?: ComponentProperties[];
  // children
  children?: SimplifiedNode[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CSSRGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;
export type CSSHexColor = `#${string}`;
export type SimplifiedFill =
  | {
      type?: Paint["type"];
      hex?: string;
      rgba?: string;
      opacity?: number;
      imageRef?: string;
      scaleMode?: string;
      gradientHandlePositions?: Vector[];
      gradientStops?: {
        position: number;
        color: ColorValue | string;
      }[];
    }
  | CSSRGBAColor
  | CSSHexColor;

export interface ColorValue {
  hex: string;
  opacity: number;
}

// ---------------------- PARSING ----------------------
export function parseFigmaResponse(data: GetFileResponse | GetFileNodesResponse): SimplifiedDesign {
  const aggregatedComponents: Record<string, Component> = {};
  const aggregatedComponentSets: Record<string, ComponentSet> = {};
  let nodesToParse: Array<FigmaDocumentNode>;

  if ("nodes" in data) {
    // GetFileNodesResponse
    const nodeResponses = Object.values(data.nodes); // Compute once
    nodeResponses.forEach((nodeResponse) => {
      if (nodeResponse.components) {
        Object.assign(aggregatedComponents, nodeResponse.components);
      }
      if (nodeResponse.componentSets) {
        Object.assign(aggregatedComponentSets, nodeResponse.componentSets);
      }
    });
    nodesToParse = nodeResponses.map((n) => n.document);
  } else {
    // GetFileResponse
    Object.assign(aggregatedComponents, data.components);
    Object.assign(aggregatedComponentSets, data.componentSets);
    nodesToParse = data.document.children;
  }

  const sanitizedComponents = sanitizeComponents(aggregatedComponents);
  const sanitizedComponentSets = sanitizeComponentSets(aggregatedComponentSets);

  const { name, lastModified, thumbnailUrl } = data;

  const simplifiedNodes: SimplifiedNode[] = nodesToParse
    .filter(isVisible)
    .map((n) => parseNode(n))
    .filter((child) => child !== null && child !== undefined);

  const simplifiedDesign: SimplifiedDesign = {
    name,
    lastModified,
    thumbnailUrl: thumbnailUrl || "",
    nodes: simplifiedNodes,
    components: sanitizedComponents,
    componentSets: sanitizedComponentSets,
  };

  return removeEmptyKeys(simplifiedDesign);
}

// Helper function to find node by ID
const findNodeById = (id: string, nodes: SimplifiedNode[]): SimplifiedNode | undefined => {
  for (const node of nodes) {
    if (node?.id === id) {
      return node;
    }

    if (node?.children && node.children.length > 0) {
      const foundInChildren = findNodeById(id, node.children);
      if (foundInChildren) {
        return foundInChildren;
      }
    }
  }

  return undefined;
};

// Removed findOrCreateVar function - now using inline expansion for better CLI/AI processing

function parseNode(
  n: FigmaDocumentNode,
  parent?: FigmaDocumentNode,
): SimplifiedNode | null {
  const { id, name, type } = n;

  const simplified: SimplifiedNode = {
    id,
    name,
    type,
  };

  if (type === "INSTANCE") {
    if (hasValue("componentId", n)) {
      simplified.componentId = n.componentId;
    }

    // Add specific properties for instances of components
    if (hasValue("componentProperties", n)) {
      simplified.componentProperties = Object.entries(n.componentProperties ?? {}).map(
        ([name, { value, type }]) => ({
          name,
          value: value.toString(),
          type,
        }),
      );
    }
  }

  // text
  if (hasValue("style", n) && Object.keys(n.style).length) {
    const style = n.style;
    const textStyle: TextStyle = {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSize: style.fontSize,
      lineHeight:
        style.lineHeightPx && style.fontSize
          ? `${style.lineHeightPx / style.fontSize}em`
          : undefined,
      letterSpacing:
        style.letterSpacing && style.letterSpacing !== 0 && style.fontSize
          ? `${(style.letterSpacing / style.fontSize) * 100}%`
          : undefined,
      textCase: style.textCase,
      textAlignHorizontal: style.textAlignHorizontal,
      textAlignVertical: style.textAlignVertical,
    };
    simplified.textStyle = textStyle;
  }

  // fills & strokes
  if (hasValue("fills", n) && Array.isArray(n.fills) && n.fills.length) {
    const fills = n.fills.map(parsePaint);
    simplified.fills = fills;
  }

  const strokes = buildSimplifiedStrokes(n);
  if (strokes.colors.length) {
    simplified.strokes = strokes;
  }

  const effects = buildSimplifiedEffects(n);
  if (Object.keys(effects).length) {
    simplified.effects = effects;
  }

  // Process layout
  const layout = buildSimplifiedLayout(n, parent);
  if (Object.keys(layout).length > 1) {
    simplified.layout = layout;
  }

  // Keep other simple properties directly
  if (hasValue("characters", n, isTruthy)) {
    simplified.text = n.characters;
  }

  // border/corner

  // opacity
  if (hasValue("opacity", n) && typeof n.opacity === "number" && n.opacity !== 1) {
    simplified.opacity = n.opacity;
  }

  if (hasValue("cornerRadius", n) && typeof n.cornerRadius === "number") {
    simplified.borderRadius = `${n.cornerRadius}px`;
  }
  if (hasValue("rectangleCornerRadii", n, isRectangleCornerRadii)) {
    simplified.borderRadius = `${n.rectangleCornerRadii[0]}px ${n.rectangleCornerRadii[1]}px ${n.rectangleCornerRadii[2]}px ${n.rectangleCornerRadii[3]}px`;
  }

  // Recursively process child nodes.
  // Include children at the very end so all relevant configuration data for the element is output first and kept together for the AI.
  if (hasValue("children", n) && n.children.length > 0) {
    const children = n.children
      .filter(isVisible)
      .map((child) => parseNode(child, n))
      .filter((child) => child !== null && child !== undefined);
    if (children.length) {
      simplified.children = children;
    }
  }

  // Convert VECTOR to IMAGE
  if (type === "VECTOR") {
    simplified.type = "IMAGE-SVG";
  }

  return simplified;
}

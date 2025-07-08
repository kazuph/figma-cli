# @kazuph/figma

AI-optimized Figma CLI with clean YAML output and hierarchical depth control

[\![npm version](https://badge.fury.io/js/@kazuph%2Ffigma.svg)](https://www.npmjs.com/package/@kazuph/figma)
[\![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

**AI-Optimized Output**
- Clean, self-contained YAML (no global variables)
- Silent by default (perfect for Unix pipelines)
- Inline expanded values (no reference resolution needed)

**Hierarchical Depth Control**
- Step-by-step design exploration with `--depth-layers`
- Perfect for understanding complex nested designs

**Pipeline-Friendly**
- Works seamlessly with `yq`, `jq`, and other CLI tools
- Zero log pollution in stdout

**Image Downloads**
- SVG and PNG export support
- Automatic file extension handling

**MCP Server Integration**
- Claude Desktop integration support
- Stdio and HTTP server modes

## Quick Start

### Try without installation (npx)
```bash
# Quick try with npx
npx @kazuph/figma get-data <fileKey> <nodeId> --depth-layers 1

# Setup auth first
npx @kazuph/figma auth

# Then explore your designs
npx @kazuph/figma get-data <fileKey> <nodeId> | yq '.nodes[0].name'
```

### Installation
```bash
npm install -g @kazuph/figma
```

### Authentication
```bash
# Interactive setup
figma auth

# Show current credentials
figma auth --show
```

Get your Figma API key from [Figma Developer Settings](https://help.figma.com/hc/en-us/articles/8085703771159-Manage-personal-access-tokens).

## Usage Examples

### Data Extraction
```bash
# Basic usage
figma get-data <fileKey> <nodeId>

# Hierarchical exploration (recommended for AI)
figma get-data <fileKey> <nodeId> --depth-layers 1    # Screen names only
figma get-data <fileKey> <nodeId> --depth-layers 2    # + First level children

# JSON output
figma get-data <fileKey> <nodeId> --format json
```

### Pipeline Processing with yq
```bash
# Get screen name
figma get-data <fileKey> <nodeId> | yq '.nodes[0].name'

# Get all text content  
figma get-data <fileKey> <nodeId> | yq '.. | select(has("text")) | .text' | head -10

# List all colors used
figma get-data <fileKey> <nodeId> | yq '.. | select(has("fills")) | .fills[]' | sort | uniq

# Find buttons by name pattern
figma get-data <fileKey> <nodeId> | yq '.. | select(.name? | test("(?i)button")) | .name'

# Count total elements
figma get-data <fileKey> <nodeId> | yq '[.. | select(has("name"))] | length'

# List all component types used
figma get-data <fileKey> <nodeId> | yq '[.. | select(has("type")) | .type] | unique'
```

### Image Downloads
```bash
# Download as SVG (default when no extension)
figma download-images <fileKey> ~/Downloads --nodes '[{"nodeId":"123:456","fileName":"button"}]'
# saves as button.svg

# Download as PNG (specify .png extension)
figma download-images <fileKey> ~/Downloads --nodes '[{"nodeId":"123:456","fileName":"button.png"}]'
# saves as button.png

# Download multiple images
figma download-images <fileKey> ~/Downloads --nodes '[
  {"nodeId":"123:456","fileName":"icon"},
  {"nodeId":"123:457","fileName":"photo.png"},
  {"nodeId":"123:458","fileName":"logo.svg"}
]'
```

### MCP Server (Claude Desktop Integration)
```bash
# Start MCP server
figma mcp

# HTTP mode (alternative)
figma mcp --port 3000
```

#### Claude Desktop Configuration
Add to your Claude Desktop MCP configuration:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@kazuph/figma", "mcp"]
    }
  }
}
```

## Command Reference

### figma get-data
Get layout information from a Figma file with AI-optimized clean YAML output.

```bash
figma get-data <fileKey> [nodeId] [options]
```

Available options:
- `--depth-layers <number>` - Limit output to N layers deep (1=top level only, 2=top+first children, etc.)
- `-D, --depth <number>` - How many levels deep to traverse the node tree (Figma API parameter)
- `--format <yaml|json>` - Output format (default: yaml)
- `--verbose` - Enable verbose logging

### figma download-images
Download SVG and PNG images from a Figma file. Format determined by fileName extension (.svg/.png), defaults to .svg.

```bash
figma download-images <fileKey> <localPath> [options]
```

Available options:
- `--nodes <json>` - JSON string of nodes to download (array of {nodeId, fileName, imageRef?})
- `--png-scale <number>` - Export scale for PNG images (default: 2)
- `--svg-outline-text` - Whether to outline text in SVG exports (default: true)
- `--svg-include-id` - Whether to include IDs in SVG exports (default: false)
- `--svg-simplify-stroke` - Whether to simplify strokes in SVG exports (default: true)

### figma auth
Setup Figma authentication.

```bash
figma auth [options]
```

Available options:
- `--show` - Show current credentials
- `--remove` - Remove saved credentials

### figma mcp
Start MCP server for integration with Claude Desktop.

```bash
figma mcp [options]
```

Available options:
- `--stdio` - Run in stdio mode for MCP integration (default: true)
- `--port <number>` - Port for HTTP server mode (alternative to stdio)

## Output Structure

The CLI outputs clean, hierarchical YAML/JSON:

```yaml
file:
  name: "Your Design File"
  lastModified: "2025-01-01T00:00:00Z"
nodes:
  - id: "123:456"
    name: "Button"
    type: "INSTANCE"
    fills: ["#FF0000"]
    layout:
      dimensions:
        width: 100
        height: 40
    children: [...]
components: {...}
componentSets: {...}
```

## Why This CLI?

Unlike other Figma tools, this CLI is specifically designed for modern AI workflows:

- **AI workflows** - Clean, predictable output structure
- **Pipeline processing** - Silent operation, no log pollution
- **Incremental exploration** - Hierarchical depth control for large designs
- **Developer productivity** - Direct integration with `yq`, `jq`, and shell scripts

## License

MIT
EOF < /dev/null
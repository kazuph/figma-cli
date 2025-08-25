import { createServer } from "../mcp.js";
import { config } from "dotenv";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import yaml from "js-yaml";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

config();

describe("Figma MCP Server Tests", () => {
  let figmaApiKey: string;
  let figmaFileKey: string;

  beforeAll(() => {
    figmaApiKey = process.env.FIGMA_API_KEY || "";
    if (!figmaApiKey) {
      throw new Error("FIGMA_API_KEY is not set in environment variables");
    }

    figmaFileKey = process.env.FIGMA_FILE_KEY || "";
    if (!figmaFileKey) {
      throw new Error("FIGMA_FILE_KEY is not set in environment variables");
    }
  });

  // Helper function to create server/client pair with specific client name
  const createServerClientPair = async (clientName?: string) => {
    const server = createServer({
      figmaApiKey,
      figmaOAuthToken: "",
      useOAuth: false,
    });

    const client = new Client(
      {
        name: clientName || "figma-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    return { server, client };
  };

  describe("Get Figma Data", () => {
    it("should be able to get Figma file data", async () => {
      const { server, client } = await createServerClientPair();

      try {
        const args: any = {
          fileKey: figmaFileKey,
        };

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "get_figma_data",
              arguments: args,
            },
          },
          CallToolResultSchema,
        );

        const content = result.content[0].text as string;
        const parsed = yaml.load(content);

        expect(parsed).toBeDefined();
      } finally {
        await client.close();
      }
    }, 60000);
  });

  describe("Client Detection via clientInfo", () => {
    it("should return data directly for Claude Desktop client", async () => {
      const { server, client } = await createServerClientPair("claude-ai");

      try {
        const args: any = {
          fileKey: figmaFileKey,
        };

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "get_figma_data",
              arguments: args,
            },
          },
          CallToolResultSchema,
        );

        const content = result.content[0].text as string;
        
        // Claude Desktop should return YAML data directly with header comment
        expect(content).toContain("# Figma Design:");
        expect(content).toContain("file:");
        expect(content).toContain("nodes:");
        
        // Should be parseable as YAML
        const parsed = yaml.load(content);
        expect(parsed).toBeDefined();
        expect((parsed as any).file).toBeDefined();
        expect((parsed as any).nodes).toBeDefined();
      } finally {
        await client.close();
      }
    }, 60000);

    it("should return resource URI for non-Claude clients", async () => {
      const { server, client } = await createServerClientPair("test-client");

      try {
        const args: any = {
          fileKey: figmaFileKey,
        };

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "get_figma_data",
              arguments: args,
            },
          },
          CallToolResultSchema,
        );

        const content = result.content[0].text as string;
        
        // Non-Claude clients should return resource reference instead of raw data
        expect(content).toContain("✅ Figma data fetched successfully!");
        expect(content).toContain("📦 Resource stored: figma://");
        expect(content).toContain("In Claude Code: Use @figma to reference this resource");
        
        // Should NOT contain raw YAML data
        expect(content).not.toContain("file:");
        expect(content).not.toContain("nodes:");
      } finally {
        await client.close();
      }
    }, 60000);

    it("should return resource URI for default test client", async () => {
      const { server, client } = await createServerClientPair();

      try {
        const args: any = {
          fileKey: figmaFileKey,
        };

        const result = await client.request(
          {
            method: "tools/call",
            params: {
              name: "get_figma_data",
              arguments: args,
            },
          },
          CallToolResultSchema,
        );

        const content = result.content[0].text as string;
        
        // Default test client should be treated as non-Claude (returning resource reference)
        expect(content).toContain("✅ Figma data fetched successfully!");
        expect(content).toContain("📦 Resource stored: figma://");
        expect(content).toContain("In Claude Code: Use @figma to reference this resource");
      } finally {
        await client.close();
      }
    }, 60000);

    it("should be able to access stored resources", async () => {
      const { server, client } = await createServerClientPair();

      try {
        // First, create a resource by calling the tool
        const toolResult = await client.request(
          {
            method: "tools/call",
            params: {
              name: "get_figma_data",
              arguments: { fileKey: figmaFileKey },
            },
          },
          CallToolResultSchema,
        );

        const toolContent = toolResult.content[0].text as string;
        const resourceUriMatch = toolContent.match(/figma:\/\/([^\s]+)/);
        
        expect(resourceUriMatch).toBeTruthy();
        
        if (resourceUriMatch) {
          const resourceUri = resourceUriMatch[0];
          
          // Then, try to read the resource
          const resourceResult = await client.request(
            {
              method: "resources/read",
              params: {
                uri: resourceUri,
              },
            }
          );

          expect(resourceResult.contents).toBeDefined();
          expect(resourceResult.contents.length).toBeGreaterThan(0);
          expect(resourceResult.contents[0].text).toBeDefined();
          
          // Verify the resource contains valid Figma data
          const resourceData = JSON.parse(resourceResult.contents[0].text);
          expect(resourceData.file).toBeDefined();
          expect(resourceData.nodes).toBeDefined();
        }
      } finally {
        await client.close();
      }
    }, 60000);
  });
});

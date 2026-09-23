import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

// A tool has a name, a description (Claude reads this to decide when to use it),
// an input schema, and a handler that returns content.
server.registerTool(
  "greet",
  {
    description: "Greet someone by name.",
    inputSchema: { name: z.string().describe("The person's name") },
  },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}! This greeting came from your own MCP server.` }],
  }),
);

// TODO: register more tools here.

// stdio: the client (Claude Code) starts this program and talks to it over stdin/stdout.
await server.connect(new StdioServerTransport());

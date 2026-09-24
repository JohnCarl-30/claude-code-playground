// Reference solution for the MCP challenges.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });
const text = (t) => ({ content: [{ type: "text", text: t }] });

server.registerTool("word_count", { description: "Count the words in a text.", inputSchema: { text: z.string() } }, async ({ text: t }) =>
  text(String(t.split(/\s+/).filter(Boolean).length)),
);
server.registerTool("reverse_text", { description: "Reverse a text.", inputSchema: { text: z.string() } }, async ({ text: t }) =>
  text([...t].reverse().join("")),
);
server.registerTool(
  "convert_temperature",
  { description: "Convert between Celsius (C) and Fahrenheit (F).", inputSchema: { value: z.number(), unit: z.string() } },
  async ({ value, unit }) => {
    if (unit === "C") return text(String((value * 9) / 5 + 32));
    if (unit === "F") return text(String(((value - 32) * 5) / 9));
    return { isError: true, content: [{ type: "text", text: `Unknown unit ${unit}; use C or F.` }] };
  },
);
server.registerResource(
  "style-guide",
  "docs://style-guide",
  { title: "Style guide", description: "How we write code here.", mimeType: "text/markdown" },
  async (uri) => ({ contents: [{ uri: uri.href, text: "# Style guide\n\n- Prefer small functions.\n- Name things clearly." }] }),
);
server.registerPrompt(
  "review_code",
  { description: "Review a piece of code against the style guide.", argsSchema: { code: z.string() } },
  ({ code }) => ({ messages: [{ role: "user", content: { type: "text", text: `Review this code against docs://style-guide:\n\n${code}` } }] }),
);
await server.connect(new StdioServerTransport());

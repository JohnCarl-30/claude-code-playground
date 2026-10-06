// The same idea as server.js, served over HTTP instead of stdio: a remote MCP
// server that many clients can reach at one URL (here http://127.0.0.1:4101/mcp).
// Start it from Run & test, then connect it in the playground or open the inspector.
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 4101);
// Only answer requests addressed to this computer. A web page can make your browser call
// localhost under another hostname (DNS rebinding); checking Host stops that.
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

// Each server offers three kinds of things, each controlled by someone different.
function buildServer() {
  const server = new McpServer({ name: "my-http-server", version: "1.0.0" });

  // A tool: the model decides when to call it.
  server.registerTool(
    "greet",
    {
      description: "Greet someone by name. Use when the user asks to say hello to a person.",
      inputSchema: { name: z.string().describe("The person's name") },
    },
    async ({ name }) =>
      name.trim()
        ? { content: [{ type: "text", text: `Hello, ${name}! This came over HTTP from your own MCP server.` }] }
        : { isError: true, content: [{ type: "text", text: "Give a name to greet." }] },
  );

  // A resource: read-only context the app (not the model) chooses to include.
  server.registerResource(
    "house-rules",
    "docs://house-rules",
    { title: "House rules", description: "How this team writes replies.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, text: "# House rules\n\n- Answer in two sentences or fewer.\n- Link to the docs page you used." }] }),
  );

  // A prompt: a template the user picks, for example from a slash-command menu.
  server.registerPrompt(
    "summarize",
    { description: "Summarize a text using the house rules.", argsSchema: { text: z.string().describe("The text to summarize") } },
    ({ text }) => ({ messages: [{ role: "user", content: { type: "text", text: `Following docs://house-rules, summarize:\n\n${text}` } }] }),
  );

  return server;
}

createServer(async (req, res) => {
  if (!ALLOWED_HOSTS.has(req.headers.host ?? "")) {
    res.writeHead(403).end("This server only answers requests to 127.0.0.1 or localhost.");
    return;
  }
  if (new URL(req.url ?? "/", "http://localhost").pathname !== "/mcp") {
    res.writeHead(404).end("The MCP endpoint is /mcp.");
    return;
  }
  // Stateless: a fresh server and transport for every request, so nothing is kept between requests.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
  // Over HTTP, stdout isn't the MCP channel (unlike server.js), so logging there is fine.
}).listen(PORT, "127.0.0.1", () => console.log(`MCP server listening on http://127.0.0.1:${PORT}/mcp`));

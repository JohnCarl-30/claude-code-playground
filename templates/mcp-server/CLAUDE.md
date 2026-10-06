# Project instructions for Claude

- This is an MCP server in `server.js` using `@modelcontextprotocol/sdk` and `zod`. Both are already available; do not run npm install.
- Register tools with `server.registerTool(name, { description, inputSchema }, handler)`. `inputSchema` is an object of zod fields, not `z.object(...)`.
- Handlers return `{ content: [{ type: "text", text }] }`. Return `{ isError: true, content: [...] }` for bad input.
- Never write to stdout with console.log in `server.js`: stdout is the MCP channel. Use console.error for logs.
- `server-http.js` is the same kind of server over HTTP (`http://127.0.0.1:4101/mcp`), with a resource and a prompt too. Over HTTP, stdout is free. Keep its Host check.
- Do not start either server yourself. The user checks syntax from the Run & test panel; only if you have the Bash tool, run `node --check server.js`.
- Write clear tool descriptions: the model uses them to decide when to call a tool.

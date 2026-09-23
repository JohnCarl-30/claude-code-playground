# Project instructions for Claude

- This is an MCP server in `server.js` using `@modelcontextprotocol/sdk` and `zod`. Both are already available; do not run npm install.
- Register tools with `server.registerTool(name, { description, inputSchema }, handler)`. `inputSchema` is an object of zod fields, not `z.object(...)`.
- Handlers return `{ content: [{ type: "text", text }] }`. Return `{ isError: true, content: [...] }` for bad input.
- Never write to stdout with console.log: stdout is the MCP channel. Use console.error for logs.
- Do not start the server yourself. The user checks syntax from the Run & test panel; only if you have the Bash tool, run `node --check server.js`.
- Write clear tool descriptions: the model uses them to decide when to call a tool.

# My MCP server

An MCP server built with the official TypeScript SDK (`@modelcontextprotocol/sdk`), in two versions:

- **`server.js` runs over stdio.** The client starts `node server.js` and talks to it through stdin/stdout, so it's a local program, one per client. It has one tool: `greet`.
- **`server-http.js` runs over HTTP** (Streamable HTTP) at `http://127.0.0.1:4101/mcp`, so many clients can reach the same server at one URL, the way remote servers work. Besides a tool, it has a **resource** (`docs://house-rules`, read-only context the app chooses to include) and a **prompt** (`summarize`, a template the user picks). It only answers requests addressed to this computer.

Ideas to build with Claude:

- `word_count`: count the words in some text
- `convert_temperature`: Celsius ↔ Fahrenheit
- `todo_add` / `todo_list`: a small in-memory todo list

Then open **Run & test**. **Connect to the playground** plugs in the stdio server so Claude can use your tools. Or start the HTTP server and connect that. Use **Inspect** in the MCP tab to call your tools yourself and see every message.

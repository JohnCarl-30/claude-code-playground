# My MCP server

An MCP server built with the official TypeScript SDK (`@modelcontextprotocol/sdk`).
It runs over **stdio**: the client starts `node server.js` and talks to it through stdin/stdout.

Right now it has one tool: `greet`.

Ideas to build with Claude:

- `word_count`: count the words in some text
- `convert_temperature`: Celsius ↔ Fahrenheit
- `todo_add` / `todo_list`: a small in-memory todo list

Then open **Run & test → Connect to the playground** and ask Claude to use your tools.

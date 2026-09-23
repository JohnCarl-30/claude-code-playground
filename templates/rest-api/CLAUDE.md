# Project instructions for Claude

- This is a JSON REST API in `server.js` using only Node's built-in `node:http`. Do not add dependencies or run npm install.
- Every response is JSON, including errors (`{ "error": "..." }`) with a fitting status code.
- The port comes from `process.env.PORT` (default 4100).
- Do not start the server yourself; the user starts it from the playground's Run & test panel. The user checks syntax from the Run & test panel; only if you have the Bash tool, run `node --check server.js`.
- After changing routes, list each route with an example request in your final answer.

# Project instructions for Claude

- `agent.mjs` is a script using `@anthropic-ai/claude-agent-sdk` (already available; do not run npm install).
- Keep `model: "claude-haiku-4-5"`, `maxTurns` and `maxBudgetUsd` so test runs stay cheap.
- Keep deleting `ANTHROPIC_API_KEY` from env: the script must use the Claude Code login.
- Custom tools: `createSdkMcpServer({ name, tools: [tool(name, description, zodShape, handler)] })`, passed as `options.mcpServers`, with the tool names (`mcp__<server>__<tool>`) in `options.allowedTools`.
- Do not run the script yourself (it would start a nested agent). The user checks syntax from the Run & test panel; only if you have the Bash tool, run `node --check agent.mjs`.

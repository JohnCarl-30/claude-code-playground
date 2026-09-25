# My agent

A script that runs the Claude Agent SDK's `query()` and prints what the agent does.
It uses your Claude Code login (no API key).

Ideas to build with Claude:

- Give it read-only tools (`Read`, `Glob`, `Grep`) and ask about the files in this folder
- Add a custom tool with `createSdkMcpServer` + `tool()`, e.g. `get_time`
- Add a `canUseTool` callback that logs and approves each tool call
- Add a `PreToolUse` hook that blocks writes to `README.md`
- Fill in `guards.mjs`: a hook that blocks dangerous commands, a `canUseTool` that keeps edits inside `src/`, and a read-only reviewer subagent

Run it from the playground's **Run & test** panel. Each run uses a little of your Claude plan.

---
description: Give the agent a new custom tool
argument-hint: <tool_name> <what it should do>
---

In agent.mjs, add a custom tool: $ARGUMENTS

Use createSdkMcpServer and tool() from @anthropic-ai/claude-agent-sdk, add it to options.mcpServers,
allow it in options.allowedTools (mcp__<server>__<tool>), and change the prompt so the agent uses it.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { blockDangerousCommands, canUseTool, reviewer } from "./guards.mjs";

const env = { ...process.env };
if (env.PLAYGROUND_AUTH !== "api-key") delete env.ANTHROPIC_API_KEY;

for await (const message of query({
  prompt: "Look through src/, fix anything obviously wrong, then ask the reviewer subagent to check your work.",
  options: {
    env,
    model: "claude-haiku-4-5",
    tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash", "Agent"],
    settingSources: [],
    maxTurns: 10,
    maxBudgetUsd: 0.25,
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [blockDangerousCommands] }] },
    canUseTool,
    agents: { reviewer },
  },
})) {
  if (message.type === "result") console.log(`Done (${message.subtype}), ~$${message.total_cost_usd.toFixed(4)}`);
}

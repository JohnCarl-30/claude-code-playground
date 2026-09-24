import { query } from "@anthropic-ai/claude-agent-sdk";

// Uses your Claude Code login. A key in your shell is only used if you opted in
// with PLAYGROUND_AUTH=api-key (see the playground's README).
const env = { ...process.env };
if (env.PLAYGROUND_AUTH !== "api-key") delete env.ANTHROPIC_API_KEY;

const prompt = "In one sentence, what is the Claude Agent SDK?";

for await (const message of query({
  prompt,
  options: {
    env,
    model: "claude-haiku-4-5",
    tools: [], // no built-in tools yet
    settingSources: [],
    maxTurns: 3,
    maxBudgetUsd: 0.25,
  },
})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") console.log("Claude:", block.text);
      if (block.type === "tool_use") console.log(`→ tool ${block.name}`, JSON.stringify(block.input));
    }
  }
  if (message.type === "result") {
    console.log(`\nDone (${message.subtype}) in ${message.num_turns} turn(s), ~$${message.total_cost_usd.toFixed(4)}`);
  }
}

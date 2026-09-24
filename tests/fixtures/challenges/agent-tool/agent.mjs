import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";

const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;

const clock = createSdkMcpServer({
  name: "clock",
  tools: [tool("get_time", "Get the current date and time.", {}, async () => ({ content: [{ type: "text", text: new Date().toString() }] }))],
});

for await (const message of query({
  prompt: "What time is it?",
  options: { env, model: "claude-haiku-4-5", tools: [], mcpServers: { clock }, allowedTools: ["mcp__clock__get_time"], settingSources: [], maxTurns: 3, maxBudgetUsd: 0.25 },
})) {
  if (message.type === "result") console.log(message.subtype);
}

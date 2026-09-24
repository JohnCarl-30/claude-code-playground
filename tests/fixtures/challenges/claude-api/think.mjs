import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-sonnet-5";

export async function solve(problem, depth) {
  const deep = depth === "deep";
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: deep ? 8000 : 1000,
    output_config: { effort: deep ? "high" : "low" },
    ...(deep ? { thinking: { type: "adaptive", display: "summarized" } } : {}),
    messages: [{ role: "user", content: problem }],
  });
  const of = (type, key) => response.content.filter((b) => b.type === type).map((b) => b[key]).join("");
  return { answer: of("text", "text"), thoughts: of("thinking", "thinking") };
}

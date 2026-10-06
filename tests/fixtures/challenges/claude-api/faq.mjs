import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const FAQ = `Tiny Shop FAQ (reference copy)`;

export async function answerFaq(question) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: [
      { type: "text", text: "Answer customer questions using only this FAQ." },
      { type: "text", text: FAQ, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: question }],
  });
  const u = response.usage;
  const usage = {
    input: u.input_tokens,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens,
  };
  usage.totalInput = usage.input + usage.cacheWrite + usage.cacheRead;
  const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { answer, usage };
}

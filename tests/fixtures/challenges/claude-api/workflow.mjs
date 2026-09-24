import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const textOf = (response) => response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();

export async function summarizeThenTranslate(text, language) {
  const first = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{ role: "user", content: `Summarize this in one sentence:\n\n${text}` }],
  });
  const summary = textOf(first);
  if (first.stop_reason !== "end_turn" || !summary) return null;

  const second = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{ role: "user", content: `Translate into ${language}. Reply with the translation only.\n\n${summary}` }],
  });
  return textOf(second);
}

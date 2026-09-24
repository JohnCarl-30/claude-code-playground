import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5";

export async function askWithinBudget(document, question, maxInputTokens) {
  const request = {
    model: MODEL,
    system: "Answer using only the document.",
    messages: [{ role: "user", content: `<document>\n${document}\n</document>\n\n${question}` }],
  };
  const { input_tokens: inputTokens } = await client.messages.countTokens(request);
  if (inputTokens > maxInputTokens) return { skipped: true, inputTokens };
  const response = await client.messages.create({ ...request, max_tokens: 500 });
  const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { skipped: false, inputTokens, answer };
}

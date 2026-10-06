import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const PRICES = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
};

export function costOf(usage, model, { batch = false } = {}) {
  const price = PRICES[model];
  if (!price) throw new Error(`No price for ${model}`);
  const perToken = (n, dollarsPerMTok) => ((n ?? 0) * dollarsPerMTok) / 1_000_000;
  const total =
    perToken(usage.input_tokens, price.input) +
    perToken(usage.cache_creation_input_tokens, price.input * 1.25) +
    perToken(usage.cache_read_input_tokens, price.input * 0.1) +
    perToken(usage.output_tokens, price.output);
  return batch ? total / 2 : total;
}

export async function askWithCost(question) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    messages: [{ role: "user", content: question }],
  });
  const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { answer, costUsd: costOf(response.usage, response.model) };
}

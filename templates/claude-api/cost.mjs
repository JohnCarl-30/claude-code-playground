import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// US dollars per million tokens (MTok), from https://platform.claude.com/docs/en/about-claude/pricing
// (checked 2026-09-25; prices change, so check the page).
export const PRICES = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
};
// Relative to the input price: writing to the 5-minute cache costs 1.25x, reading from it 0.1x.
// The Message Batches API charges 50% of all these prices.

/**
 * What a response cost, in dollars.
 * usage is the response's usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }.
 */
export function costOf(usage, model, { batch = false } = {}) {
  // TODO: price every kind of token. Some usage fields can be missing: count them as 0.
  throw new Error("costOf isn't written yet");
}

/** Ask a question and report what that answer cost: { answer, costUsd }. */
export async function askWithCost(question) {
  // TODO: use the response's own model and usage.
  throw new Error("askWithCost isn't written yet");
}

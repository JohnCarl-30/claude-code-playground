import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5";

/**
 * Answer a question about a document, but never send more than maxInputTokens of input.
 * Count the tokens first:
 *   over the limit  → don't send; return { skipped: true, inputTokens }
 *   within the limit → send it; return { skipped: false, inputTokens, answer }
 */
export async function askWithinBudget(document, question, maxInputTokens) {
  // TODO:
  // - Build the request once, then count it with client.messages.countTokens(...)
  //   using the same model, system and messages you'd send.
  // - Put the long document first and the question after it.
  throw new Error("askWithinBudget isn't written yet");
}

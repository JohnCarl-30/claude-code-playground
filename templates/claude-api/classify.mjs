import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5";

export const LABELS = ["billing", "shipping", "account", "other"];

/**
 * Label a support ticket with exactly one of LABELS.
 * Claude's reply is text, so don't trust it blindly: return a label from LABELS, always.
 */
export async function classifyTicket(ticket) {
  // TODO:
  // - Instructions in the system prompt, with 3–5 examples, each in <example> tags.
  // - The ticket in the user turn, inside <ticket> tags.
  // - Ask for the label only, and keep max_tokens small.
  // - Clean up the reply (spaces, capitals) and fall back to "other" for anything unexpected.
  throw new Error("classifyTicket isn't written yet");
}

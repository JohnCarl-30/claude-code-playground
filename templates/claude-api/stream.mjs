import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

/**
 * Stream an answer: call onText(chunk) for every piece of text as it arrives,
 * then return the whole text.
 */
export async function streamAnswer(question, onText) {
  // TODO: use client.messages.stream(...) (or create with stream: true)
  // and hand each text delta to onText.
  throw new Error("streamAnswer isn't written yet");
}

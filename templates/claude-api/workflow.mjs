import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

/**
 * A fixed two-step workflow (your code decides the steps, not Claude):
 *   1. summarize the text in one sentence
 *   2. translate that summary into `language`
 * Returns the translated summary, or null if step 1 didn't produce a usable summary.
 */
export async function summarizeThenTranslate(text, language) {
  // TODO:
  // - Step 1: one call that summarizes `text`.
  // - Gate: only continue if step 1 finished normally (stop_reason "end_turn") with some text.
  // - Step 2: a second call whose prompt contains the summary from step 1 (not the original text).
  throw new Error("summarizeThenTranslate isn't written yet");
}

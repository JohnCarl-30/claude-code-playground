import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

/**
 * Ask a question without ever throwing.
 * Success: { ok: true, text }.
 * Failure: { ok: false, retryable, status, message }. retryable says whether trying again later could work.
 */
export async function safeAsk(question) {
  // TODO:
  // - Catch errors from the SDK and tell them apart by type (Anthropic.BadRequestError,
  //   Anthropic.RateLimitError, Anthropic.APIError, ...), not by matching message text.
  // - Rate limits (429), overload (529) and server errors (5xx) are worth retrying.
  //   A bad request (400) or a bad key (401) will fail the same way every time.
  // - The SDK already retries some errors for you. Decide whether to keep that.
  throw new Error("safeAsk isn't written yet");
}

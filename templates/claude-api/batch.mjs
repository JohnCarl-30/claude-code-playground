import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// How long to wait between status checks. Real batches can take up to 24 hours;
// the playground sets POLL_MS low so practice runs finish quickly.
const POLL_MS = Number(process.env.POLL_MS ?? 60_000);

/**
 * Classify many product reviews overnight, at lower cost, with the Message Batches API.
 * reviews: [{ id, text }]. Returns the batch id.
 */
export async function submitReviews(reviews) {
  // TODO: create one batch with one request per review. Use the review id as custom_id.
  throw new Error("submitReviews isn't written yet");
}

/**
 * Wait for the batch to finish, then read its results.
 * Returns { succeeded: { [custom_id]: text }, failed: [custom_id, ...] }.
 */
export async function collectResults(batchId) {
  // TODO: poll until processing_status is "ended", then go through the results.
  // Results can come back in any order, so match them by custom_id.
  throw new Error("collectResults isn't written yet");
}

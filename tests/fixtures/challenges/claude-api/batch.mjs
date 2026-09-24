import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const POLL_MS = Number(process.env.POLL_MS ?? 60_000);

export async function submitReviews(reviews) {
  const batch = await client.messages.batches.create({
    requests: reviews.map((r) => ({
      custom_id: r.id,
      params: {
        model: "claude-haiku-4-5",
        max_tokens: 50,
        messages: [{ role: "user", content: `Is this review positive or negative? One word.\n\n${r.text}` }],
      },
    })),
  });
  return batch.id;
}

export async function collectResults(batchId) {
  while ((await client.messages.batches.retrieve(batchId)).processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const succeeded = {};
  const failed = [];
  for await (const item of await client.messages.batches.results(batchId)) {
    if (item.result.type === "succeeded") {
      succeeded[item.custom_id] = item.result.message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    } else {
      failed.push(item.custom_id);
    }
  }
  return { succeeded, failed };
}

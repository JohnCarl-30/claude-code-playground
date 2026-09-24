import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ maxRetries: 2 });

export async function safeAsk(question) {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: question }],
    });
    return { ok: true, text: response.content.filter((b) => b.type === "text").map((b) => b.text).join("") };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const retryable = err instanceof Anthropic.RateLimitError || (err.status ?? 0) >= 500 || err instanceof Anthropic.APIConnectionError;
      return { ok: false, retryable, status: err.status, message: err.message };
    }
    return { ok: false, retryable: false, message: String(err) };
  }
}

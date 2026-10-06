import Anthropic from "@anthropic-ai/sdk";

// new Anthropic() reads ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL) from the environment.
// Never put a key in your code.
const client = new Anthropic();

/** One question in, one answer out. */
export async function ask(question) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: "You are a concise assistant. Answer in at most two sentences.",
    messages: [{ role: "user", content: question }],
  });

  // content is a list of blocks. Keep the text ones.
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  console.error(`stop_reason: ${response.stop_reason} · tokens in/out: ${response.usage.input_tokens}/${response.usage.output_tokens}`);
  return text;
}

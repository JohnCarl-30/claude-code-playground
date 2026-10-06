import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function streamAnswer(question, onText) {
  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    messages: [{ role: "user", content: question }],
  });
  stream.on("text", (delta) => onText(delta));
  const message = await stream.finalMessage();
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

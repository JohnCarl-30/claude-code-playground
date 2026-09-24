import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const schema = {
  type: "object",
  properties: { name: { type: "string" }, email: { type: "string" }, company: { type: "string" } },
  required: ["name", "email", "company"],
  additionalProperties: false,
};

export async function extractContact(text) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 500,
    messages: [{ role: "user", content: `Extract the contact details from this message:\n\n${text}` }],
    output_config: { format: { type: "json_schema", schema } },
  });
  if (response.stop_reason !== "end_turn") return null; // cut off (max_tokens) or refused
  const raw = response.content.find((b) => b.type === "text")?.text ?? "";
  try {
    const data = JSON.parse(raw);
    return typeof data?.name === "string" && typeof data?.email === "string" ? data : null;
  } catch {
    return null;
  }
}

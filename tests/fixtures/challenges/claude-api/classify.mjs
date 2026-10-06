import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-haiku-4-5";

export const LABELS = ["billing", "shipping", "account", "other"];

const SYSTEM = `You label customer support tickets for Tiny Shop. Reply with exactly one label: ${LABELS.join(", ")}. No other words.

<example>
<ticket>I was charged twice for my last order.</ticket>
billing
</example>
<example>
<ticket>My parcel says delivered but it's not here.</ticket>
shipping
</example>
<example>
<ticket>I can't reset my password.</ticket>
account
</example>
<example>
<ticket>Do you sell gift wrap?</ticket>
other
</example>`;

export async function classifyTicket(ticket) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 10,
    system: SYSTEM,
    messages: [{ role: "user", content: `<ticket>${ticket}</ticket>` }],
  });
  const label = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim().toLowerCase();
  return LABELS.includes(label) ? label : "other";
}

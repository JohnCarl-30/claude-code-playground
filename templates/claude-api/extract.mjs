import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

/**
 * Pull contact details out of free text.
 * Returns { name, email, company } — or null when the answer can't be trusted.
 */
export async function extractContact(text) {
  // TODO:
  // 1. Ask for JSON that matches a schema, using structured outputs
  //    (output_config.format with type "json_schema").
  // 2. Before parsing, check stop_reason: a reply cut off by max_tokens, or a refusal,
  //    may not match your schema.
  // 3. Parse defensively: bad or incomplete JSON returns null instead of crashing.
  throw new Error("extractContact isn't written yet");
}

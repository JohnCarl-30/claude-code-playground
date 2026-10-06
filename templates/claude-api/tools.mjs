import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// The tool's real implementation. Claude never runs code: it asks for a tool,
// your program runs it and sends the result back.
export function getWeather(city) {
  const weather = { Singapore: "31°C and humid", Tokyo: "18°C and clear", London: "12°C with rain" };
  return weather[city] ?? null; // null: we don't know that city
}

/**
 * Answer a question, letting Claude call a `get_weather` tool (input: { city }).
 * Returns Claude's final text answer.
 */
export async function runWithTools(question) {
  // TODO:
  // 1. Describe the get_weather tool (name, description, input_schema).
  // 2. Call client.messages.create with the tools and the question.
  // 3. While stop_reason is "tool_use": run each requested tool, then send back
  //    the assistant's turn plus a user turn with one tool_result per tool_use.
  // 4. Return the final text.
  throw new Error("runWithTools isn't written yet");
}

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export function getWeather(city) {
  const weather = { Singapore: "31°C and humid", Tokyo: "18°C and clear", London: "12°C with rain" };
  return weather[city] ?? null;
}

const tools = [
  {
    name: "get_weather",
    description: "Get the current weather for a city. Use it whenever the user asks about weather.",
    input_schema: {
      type: "object",
      properties: { city: { type: "string", description: "City name, e.g. Tokyo" } },
      required: ["city"],
    },
  },
];

export async function runWithTools(question) {
  const messages = [{ role: "user", content: question }];
  for (let turn = 0; turn < 10; turn++) {
    const response = await client.messages.create({ model: "claude-haiku-4-5", max_tokens: 1000, tools, messages });
    if (response.stop_reason !== "tool_use") {
      return response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    }
    messages.push({ role: "assistant", content: response.content });
    const results = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const weather = block.name === "get_weather" ? getWeather(block.input.city) : null;
      results.push(
        weather
          ? { type: "tool_result", tool_use_id: block.id, content: weather }
          : { type: "tool_result", tool_use_id: block.id, content: `No weather data for ${block.input.city}.`, is_error: true },
      );
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Too many tool turns");
}

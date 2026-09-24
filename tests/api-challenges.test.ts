import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTempPlaygroundRoot } from "./helpers";

// The Claude API checkers must be fair both ways: common mistakes fail with a
// useful message, and other correct ways of writing the code still pass.

jest.setTimeout(60_000);

const temp = createTempPlaygroundRoot();
let ws: typeof import("@/lib/workspace");
let checks: typeof import("@/lib/challenge-checks");
beforeAll(async () => {
  ws = await import("@/lib/workspace");
  checks = await import("@/lib/challenge-checks");
  await ws.switchWorkspace("claude-api");
});
afterAll(() => temp.cleanup());

const SOLUTIONS = path.join(process.cwd(), "tests/fixtures/challenges/claude-api");

/** Start from the reference solution, change one file, and check. */
async function checkWith(id: string, file: string, change: (code: string) => string) {
  await ws.resetWorkspace();
  cpSync(SOLUTIONS, ws.WORKSPACE_DIR, { recursive: true });
  const target = path.join(ws.WORKSPACE_DIR, file);
  writeFileSync(target, change(readFileSync(target, "utf8")));
  const result = await checks.runChallengeChecks(id);
  if ("error" in result) throw new Error(result.error);
  return Object.fromEntries(result.results.map((r) => [r.id, r]));
}

function replaced(code: string, from: string | RegExp, to: string) {
  const next = code.replace(from, to);
  if (next === code) throw new Error(`Test setup: ${from} not found`);
  return next;
}

describe("tool loop", () => {
  it("fails is_error when a failed lookup is sent as a normal result", async () => {
    const r = await checkWith("api-tool-loop", "tools.mjs", (c) => replaced(c, ", is_error: true }", " }"));
    expect(r.error).toMatchObject({ pass: false, detail: expect.stringMatching(/is_error: true/) });
    expect(r.final.pass).toBe(true);
  });

  it("explains the API's 400 when the assistant turn isn't sent back", async () => {
    const r = await checkWith("api-tool-loop", "tools.mjs", (c) => replaced(c, 'messages.push({ role: "assistant", content: response.content });', ""));
    expect(r.loop).toMatchObject({ pass: false, detail: expect.stringMatching(/assistant turn/) });
    expect(r.final).toMatchObject({ pass: false, detail: expect.stringMatching(/tool_result/) });
  });

  it("passes with the SDK's tool runner instead of a hand-written loop", async () => {
    const r = await checkWith(
      "api-tool-loop",
      "tools.mjs",
      () => `import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
const client = new Anthropic();
export function getWeather(city) {
  return { Tokyo: "18°C and clear" }[city] ?? null;
}
const weather = betaTool({
  name: "get_weather",
  description: "Get the weather for a city.",
  inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  run: async ({ city }) => {
    const w = getWeather(city);
    if (!w) throw new Error("No weather data for " + city);
    return w;
  },
});
export async function runWithTools(question) {
  const final = await client.beta.messages.toolRunner({ model: "claude-haiku-4-5", max_tokens: 500, tools: [weather], messages: [{ role: "user", content: question }] });
  return final.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}
`,
    );
    expect(Object.values(r).filter((x) => !x.pass)).toEqual([]);
  });
});

describe("structured output", () => {
  it("passes with messages.parse and a Zod schema", async () => {
    const r = await checkWith(
      "api-structured",
      "extract.mjs",
      () => `import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
const client = new Anthropic();
const Contact = z.object({ name: z.string(), email: z.string(), company: z.string() });
export async function extractContact(text) {
  try {
    const response = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      messages: [{ role: "user", content: text }],
      output_config: { format: zodOutputFormat(Contact) },
    });
    return response.stop_reason === "end_turn" ? response.parsed_output : null;
  } catch {
    return null;
  }
}
`,
    );
    expect(Object.values(r).filter((x) => !x.pass)).toEqual([]);
  });

  it("fails when the reply is parsed without checking stop_reason or catching bad JSON", async () => {
    const r = await checkWith("api-structured", "extract.mjs", (c) =>
      replaced(replaced(c, 'if (response.stop_reason !== "end_turn") return null; // cut off (max_tokens) or refused\n', ""), /try \{\n([\s\S]*?)\} catch \{\n\s*return null;\n\s*\}/, "$1"),
    );
    expect(r.parsed.pass).toBe(true);
    expect(r.truncated).toMatchObject({ pass: false, detail: expect.stringMatching(/threw/) });
  });

  it("fails without additionalProperties: false", async () => {
    const r = await checkWith("api-structured", "extract.mjs", (c) => replaced(c, "additionalProperties: false,", ""));
    expect(r.schema).toMatchObject({ pass: false, detail: expect.stringMatching(/additionalProperties/) });
  });
});

describe("prompt caching", () => {
  it("fails when a timestamp in the system prompt breaks the cache", async () => {
    const r = await checkWith("api-caching", "faq.mjs", (c) =>
      replaced(c, '"Answer customer questions using only this FAQ."', "`Answer customer questions using only this FAQ. Now: ${Date.now()}${Math.random()}`"),
    );
    expect(r.stable).toMatchObject({ pass: false, detail: expect.stringMatching(/changed between two questions/) });
  });

  it("fails when input_tokens alone is treated as the prompt size", async () => {
    const r = await checkWith("api-caching", "faq.mjs", (c) => replaced(c, "usage.input + usage.cacheWrite + usage.cacheRead", "usage.input"));
    expect(r.total).toMatchObject({ pass: false, detail: expect.stringMatching(/uncached part/) });
  });

  it("passes with top-level automatic caching", async () => {
    const r = await checkWith("api-caching", "faq.mjs", (c) =>
      replaced(replaced(c, ', cache_control: { type: "ephemeral" } }', " }"), "max_tokens: 300,", 'max_tokens: 300,\n    cache_control: { type: "ephemeral" },'),
    );
    expect(Object.values(r).filter((x) => !x.pass)).toEqual([]);
  });
});

describe("batches", () => {
  it("fails when results are read without waiting for the batch to end", async () => {
    const r = await checkWith("api-batch", "batch.mjs", (c) => replaced(c, /while \([\s\S]*?\n  \}\n/, ""));
    expect(r.poll.pass).toBe(false);
    expect(r.create.pass).toBe(true);
  });
});

describe("errors", () => {
  it("fails when retries are turned off", async () => {
    const r = await checkWith("api-errors", "errors.mjs", (c) => replaced(c, "maxRetries: 2", "maxRetries: 0"));
    expect(r.overloaded).toMatchObject({ pass: false, detail: expect.stringMatching(/retry/) });
    expect(r.ratelimit.pass).toBe(false);
    expect(r.badrequest.pass).toBe(true);
  });

  it("fails when the key is written into the code", async () => {
    const r = await checkWith("api-errors", "errors.mjs", (c) => replaced(c, "new Anthropic({ maxRetries: 2 })", 'new Anthropic({ apiKey: "sk-ant-api03-abcdefghijklmnop", maxRetries: 2 })'));
    expect(r.nokey).toMatchObject({ pass: false, detail: expect.stringMatching(/API key/) });
  });

  it("fails when errors are thrown instead of returned", async () => {
    const r = await checkWith("api-errors", "errors.mjs", (c) => replaced(c, "if (err instanceof Anthropic.APIError) {", "if (err instanceof Anthropic.APIError) { throw err;"));
    expect(r.badrequest).toMatchObject({ pass: false, detail: expect.stringMatching(/should return, not throw/) });
  });
});

describe("streaming", () => {
  it("fails without a stream, even though the final text is right", async () => {
    const r = await checkWith("api-streaming", "stream.mjs", (c) =>
      replaced(
        replaced(c, "client.messages.stream({", "await client.messages.create({"),
        /  stream\.on[\s\S]*?finalMessage\(\);/,
        "  const message = stream;",
      ),
    );
    expect(r.streams.pass).toBe(false);
    expect(r.chunks.pass).toBe(false);
    expect(r.final.pass).toBe(true);
  });
});

describe("workflow", () => {
  it("fails the gate when step 2 runs after a cut-off summary", async () => {
    const r = await checkWith("api-workflow", "workflow.mjs", (c) => replaced(c, 'first.stop_reason !== "end_turn" || ', ""));
    expect(r.gate).toMatchObject({ pass: false });
    expect(r.chained.pass).toBe(true);
  });

  it("fails when step 2 gets the original text", async () => {
    const r = await checkWith("api-workflow", "workflow.mjs", (c) => replaced(c, "Reply with the translation only.\\n\\n${summary}", "Reply with the translation only.\\n\\n${summary}\\n\\n${text}"));
    expect(r.chained).toMatchObject({ pass: false, detail: expect.stringMatching(/original text/) });
  });
});

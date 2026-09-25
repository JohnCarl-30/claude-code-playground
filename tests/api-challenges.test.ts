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

describe("choosing a model", () => {
  it("fails when simple tasks go to an expensive model", async () => {
    const r = await checkWith("api-model-routing", "route.mjs", (c) => replaced(c, 'fast: "claude-haiku-4-5"', 'fast: "claude-opus-5"'));
    expect(r.simple).toMatchObject({ pass: false, detail: expect.stringMatching(/tag-ticket → claude-opus-5/) });
    expect(r.complex.pass).toBe(true);
  });

  it("fails a model ID the API doesn't know, with the API's 404", async () => {
    const r = await checkWith("api-model-routing", "route.mjs", (c) => replaced(c, 'capable: "claude-sonnet-5"', 'capable: "gpt-5"'));
    expect(r.valid).toMatchObject({ pass: false, detail: expect.stringMatching(/gpt-5/) });
  });

  it("fails when an unknown task silently gets a default model", async () => {
    const r = await checkWith("api-model-routing", "route.mjs", (c) => replaced(c, "if (!tier) throw new Error(`Unknown task: ${taskId}`);", 'if (!tier) return MODELS.fast;'));
    expect(r.unknown).toMatchObject({ pass: false, detail: expect.stringMatching(/Throw for tasks you don't know/) });
  });
});

describe("effort and thinking", () => {
  it("fails on Haiku 4.5, which doesn't support effort, and shows the API's reason", async () => {
    const r = await checkWith("api-thinking", "think.mjs", (c) => replaced(c, 'const MODEL = "claude-sonnet-5";', 'const MODEL = "claude-haiku-4-5";'));
    expect(r.model).toMatchObject({ pass: false, detail: expect.stringMatching(/doesn't support effort/) });
    expect(r.answer).toMatchObject({ pass: false, detail: expect.stringMatching(/effort parameter/) });
  });

  it("fails the old budget_tokens setting, which current models reject", async () => {
    const r = await checkWith("api-thinking", "think.mjs", (c) =>
      replaced(c, 'thinking: { type: "adaptive", display: "summarized" }', 'thinking: { type: "enabled", budget_tokens: 4000, display: "summarized" }'),
    );
    expect(r.deep.pass).toBe(false);
    expect(r.answer).toMatchObject({ pass: false, detail: expect.stringMatching(/"enabled" isn't supported on claude-sonnet-5/) });
  });

  it("passes on Opus 5 at max effort", async () => {
    const r = await checkWith("api-thinking", "think.mjs", (c) =>
      replaced(replaced(c, 'const MODEL = "claude-sonnet-5";', 'const MODEL = "claude-opus-5";'), 'effort: deep ? "high" : "low"', 'effort: deep ? "max" : "low"'),
    );
    expect(Object.values(r).filter((x) => !x.pass)).toEqual([]);
  });

  it("fails when thinking text is mixed into the answer", async () => {
    const r = await checkWith("api-thinking", "think.mjs", (c) =>
      replaced(c, 'return { answer: of("text", "text"), thoughts: of("thinking", "thinking") };', 'return { answer: of("thinking", "thinking") + of("text", "text"), thoughts: "" };'),
    );
    expect(r.answer.pass).toBe(false);
  });
});

describe("token budgets", () => {
  it("fails when what's counted isn't what's sent", async () => {
    const r = await checkWith("api-token-budget", "budget.mjs", (c) =>
      replaced(c, "await client.messages.countTokens(request)", "await client.messages.countTokens({ model: MODEL, messages: request.messages })"),
    );
    expect(r.counts).toMatchObject({ pass: false, detail: expect.stringMatching(/same model, system and messages/) });
  });

  it("fails when the question comes before the document", async () => {
    const r = await checkWith("api-token-budget", "budget.mjs", (c) =>
      replaced(c, "`<document>\\n${document}\\n</document>\\n\\n${question}`", "`${question}\\n\\n<document>\\n${document}\\n</document>`"),
    );
    expect(r.order.pass).toBe(false);
    expect(r.sends.pass).toBe(true);
  });

  it("fails when the limit is ignored", async () => {
    const r = await checkWith("api-token-budget", "budget.mjs", (c) => replaced(c, "if (inputTokens > maxInputTokens) return { skipped: true, inputTokens };", ""));
    expect(r.skips).toMatchObject({ pass: false, detail: expect.stringMatching(/still sent/) });
  });
});

describe("cost", () => {
  it("fails when cache tokens are priced like normal input", async () => {
    const r = await checkWith("api-cost", "cost.mjs", (c) => replaced(replaced(c, "price.input * 1.25", "price.input"), "price.input * 0.1", "price.input"));
    expect(r.cache).toMatchObject({ pass: false, detail: expect.stringMatching(/1\.25× and reads at 0\.1×/) });
    expect(r.basic.pass).toBe(true);
  });

  it("fails when batches aren't discounted, or an unknown model costs $0", async () => {
    const r = await checkWith("api-cost", "cost.mjs", (c) =>
      replaced(replaced(c, "return batch ? total / 2 : total;", "return total;"), "if (!price) throw new Error(`No price for ${model}`);", "if (!price) return 0;"),
    );
    expect(r.batch.pass).toBe(false);
    expect(r.unknown).toMatchObject({ pass: false, detail: expect.stringMatching(/can't look like \$0/) });
  });

  it("uses your own PRICES table, so updated prices still pass", async () => {
    const r = await checkWith("api-cost", "cost.mjs", (c) => replaced(c, '"claude-haiku-4-5": { input: 1, output: 5 }', '"claude-haiku-4-5": { input: 1.5, output: 7.5 }'));
    expect(Object.values(r).filter((x) => !x.pass)).toEqual([]);
  });
});

it("explains a file missing from an older workspace", async () => {
  await ws.resetWorkspace();
  const { rmSync } = await import("node:fs");
  rmSync(path.join(ws.WORKSPACE_DIR, "cost.mjs"));
  const result = await checks.runChallengeChecks("api-cost");
  if ("error" in result) throw new Error(result.error);
  expect(result.results.find((x) => x.id === "live")).toMatchObject({ pass: false, detail: expect.stringMatching(/cost\.mjs is missing.*Add them/) });
});

describe("untrusted email, gated refunds", () => {
  it("fails when the email is pasted into the system prompt", async () => {
    const r = await checkWith("api-injection-gate", "triage.mjs", (c) =>
      replaced(
        replaced(c, "system: SYSTEM,", "system: SYSTEM + email,"),
        "`Here is the customer's email:\\n<email>\\n${email}\\n</email>`",
        '"Please handle the email."',
      ),
    );
    expect(r.delimited).toMatchObject({ pass: false, detail: expect.stringMatching(/system prompt/) });
  });

  it("fails when refunds run without asking, which is what an injection needs", async () => {
    const r = await checkWith("api-injection-gate", "triage.mjs", (c) => replaced(c, "if (await approve(call.name, call.input)) {", "if (true) {"));
    expect(r.gated).toMatchObject({ pass: false, detail: expect.stringMatching(/without calling approve/) });
    expect(r.approved.pass).toBe(true);
  });

  it("fails when a declined refund looks like a success to Claude", async () => {
    const r = await checkWith("api-injection-gate", "triage.mjs", (c) =>
      replaced(c, 'content: "A person declined this refund.", is_error: true', 'content: "Refund processed."'),
    );
    expect(r.gated).toMatchObject({ pass: false, detail: expect.stringMatching(/is_error: true/) });
  });

  it("fails when read-only lookups wait for a person too", async () => {
    const r = await checkWith("api-injection-gate", "triage.mjs", (c) =>
      replaced(c, 'if (call.name === "lookup_order") {', 'if (call.name === "lookup_order" && (await approve(call.name, call.input))) {'),
    );
    expect(r.readonly).toMatchObject({ pass: false, detail: expect.stringMatching(/only reads/) });
  });
});

describe("images, PDFs and the Files API", () => {
  it("fails a PNG sent with the wrong media type", async () => {
    const r = await checkWith("api-documents", "docs.mjs", (c) => replaced(c, 'media_type: "image/png"', 'media_type: "image/jpeg"'));
    expect(r.image.pass).toBe(false);
    expect(r.pdf.pass).toBe(true);
  });

  it("fails when the uploaded file is sent again instead of referenced", async () => {
    const r = await checkWith("api-documents", "docs.mjs", (c) =>
      replaced(
        c,
        '{ type: "document", source: { type: "file", file_id: fileId } },',
        '{ type: "document", source: { type: "base64", media_type: "application/pdf", data: fs.readFileSync("samples/policy.pdf").toString("base64") } },',
      ),
    );
    expect(r.byid).toMatchObject({ pass: false, detail: expect.stringMatching(/file_id/) });
    expect(r.upload.pass).toBe(true);
  });
});

describe("a few-shot classifier", () => {
  it("fails with too few examples", async () => {
    const r = await checkWith("api-few-shot", "classify.mjs", (c) => replaced(c, /<example>\n<ticket>I can't reset[\s\S]*?<\/example>\n<example>\n<ticket>Do you sell[\s\S]*?<\/example>/, ""));
    expect(r.examples).toMatchObject({ pass: false, detail: expect.stringMatching(/found 2/) });
  });

  it("fails when the reply is passed through unchecked", async () => {
    const r = await checkWith("api-few-shot", "classify.mjs", (c) => replaced(c, 'return LABELS.includes(label) ? label : "other";', "return label;"));
    expect(r.validated.pass).toBe(false);
    expect(r.normalized.pass).toBe(true);
  });

  it("fails without trimming and lowercasing, and with a large max_tokens", async () => {
    const r = await checkWith("api-few-shot", "classify.mjs", (c) =>
      replaced(replaced(c, '.join("").trim().toLowerCase();', '.join("");'), "max_tokens: 10,", "max_tokens: 1000,"),
    );
    expect(r.normalized.pass).toBe(false);
    expect(r.short).toMatchObject({ pass: false, detail: expect.stringMatching(/it's 1000/) });
  });
});

describe("keeping the context small", () => {
  it("fails when old tool results are deleted instead of cleared", async () => {
    const r = await checkWith("api-context-trim", "history.mjs", (c) =>
      replaced(
        c,
        'content: m.content.map((b) => (b.type === "tool_result" && clear.has(b.tool_use_id) ? { ...b, content: "[cleared to save context]" } : b)),',
        'content: m.content.filter((b) => !(b.type === "tool_result" && clear.has(b.tool_use_id))),',
      ),
    );
    expect(r.valid).toMatchObject({ pass: false, detail: expect.stringMatching(/tool_result/) });
  });

  it("fails when the input array is changed in place", async () => {
    const r = await checkWith("api-context-trim", "history.mjs", () => `export function clearOldToolResults(messages, keep = 3) {
  const results = messages.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result") : []));
  for (const b of results.slice(0, results.length - keep)) b.content = "[cleared]";
  return messages;
}
`);
    expect(r.pure).toMatchObject({ pass: false, detail: expect.stringMatching(/changed the messages array/) });
    expect(r.cleared.pass).toBe(true);
  });

  it("fails when every tool result is cleared", async () => {
    const r = await checkWith("api-context-trim", "history.mjs", (c) => replaced(c, "ids.length - keep", "ids.length"));
    expect(r.kept.pass).toBe(false);
  });
});

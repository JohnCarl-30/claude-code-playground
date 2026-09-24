import { execFile } from "node:child_process";
import { cpSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { mockApiEnv, practiceResponder, sampleFromSchema, startMockApi, toolPairingError, type MockApi } from "@/lib/practice-api";
import { createTempPlaygroundRoot } from "./helpers";

// The practice API, driven by the real @anthropic-ai/sdk: every shape it sends
// back has to be one the SDK accepts, or practice code would break for the wrong reasons.

jest.setTimeout(60_000);

let api: MockApi;
let client: Anthropic;
beforeAll(async () => {
  api = await startMockApi(practiceResponder());
  client = new Anthropic({ apiKey: "test-key", baseURL: api.url, maxRetries: 0 });
});
afterAll(() => api.close());

const text = (m: Anthropic.Message) => m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
const base = { model: "claude-haiku-4-5", max_tokens: 200 } as const;

describe("practice API with the real SDK", () => {
  it("answers a plain message with a canned reply that echoes the question", async () => {
    const msg = await client.messages.create({ ...base, messages: [{ role: "user", content: "What is MCP?" }] });
    expect(msg.stop_reason).toBe("end_turn");
    expect(text(msg)).toMatch(/practice API.*What is MCP\?/);
    expect(msg.usage.input_tokens).toBeGreaterThan(0);
  });

  it("asks for the first tool with an input that fits its schema, then answers from the tool_result", async () => {
    const tools: Anthropic.Tool[] = [
      { name: "get_weather", description: "Weather", input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    ];
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: "Weather in Tokyo?" }];
    const first = await client.messages.create({ ...base, tools, messages });
    expect(first.stop_reason).toBe("tool_use");
    const use = first.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")!;
    expect(use).toMatchObject({ name: "get_weather", input: { city: "example" } });

    messages.push({ role: "assistant", content: first.content });
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: "18°C" }] });
    const second = await client.messages.create({ ...base, tools, messages });
    expect(second.stop_reason).toBe("end_turn");
    expect(text(second)).toContain("18°C");
  });

  it("rejects a tool_use without its tool_result, like the real API", async () => {
    const request = client.messages.create({
      ...base,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "x", input: {} }] },
        { role: "user", content: "and?" },
      ],
    });
    await expect(request).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    await expect(request).rejects.toThrow(/toolu_1/);
  });

  it("rejects a request without max_tokens", async () => {
    const request = client.messages.create({ model: "claude-haiku-4-5", messages: [{ role: "user", content: "hi" }] } as never);
    await expect(request).rejects.toThrow(/max_tokens/);
  });

  it("returns JSON matching a structured-output schema", async () => {
    const msg = await client.messages.create({
      ...base,
      messages: [{ role: "user", content: "Extract" }],
      output_config: {
        format: {
          type: "json_schema",
          schema: { type: "object", properties: { name: { type: "string" }, age: { type: "integer" } }, required: ["name", "age"], additionalProperties: false },
        },
      },
    });
    expect(JSON.parse(text(msg))).toEqual({ name: "example", age: 1 });
  });

  it("reports a cache write, then a cache read, for a repeated cached prefix", async () => {
    const request = (q: string) =>
      client.messages.create({
        ...base,
        system: [{ type: "text", text: "A long FAQ… ".repeat(50), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: q }],
      });
    const a = await request("one");
    const b = await request("two");
    expect(a.usage.cache_creation_input_tokens).toBeGreaterThan(0);
    expect(a.usage.cache_read_input_tokens).toBe(0);
    expect(b.usage.cache_read_input_tokens).toBe(a.usage.cache_creation_input_tokens);
    expect(b.usage.cache_creation_input_tokens).toBe(0);
  });

  it("streams text deltas the SDK can assemble", async () => {
    const stream = client.messages.stream({ ...base, messages: [{ role: "user", content: "Stream please" }] });
    const deltas: string[] = [];
    stream.on("text", (t) => deltas.push(t));
    const final = await stream.finalMessage();
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe(text(final));
  });

  it("streams tool_use blocks with their input", async () => {
    const stream = client.messages.stream({
      ...base,
      tools: [{ name: "lookup", description: "Look up", input_schema: { type: "object", properties: { q: { type: "string" } } } }],
      messages: [{ role: "user", content: "Look it up" }],
    });
    const final = await stream.finalMessage();
    expect(final.content.find((b) => b.type === "tool_use")).toMatchObject({ name: "lookup", input: { q: "example" } });
  });

  it("runs a message batch: in progress, then ended, then results by custom_id", async () => {
    const batch = await client.messages.batches.create({
      requests: [
        { custom_id: "a", params: { ...base, messages: [{ role: "user", content: "first" }] } },
        { custom_id: "b", params: { ...base, messages: [{ role: "user", content: "second" }] } },
      ],
    });
    expect(batch.processing_status).toBe("in_progress");
    expect((await client.messages.batches.retrieve(batch.id)).processing_status).toBe("in_progress");
    expect((await client.messages.batches.retrieve(batch.id)).processing_status).toBe("ended");
    const results: Record<string, string> = {};
    for await (const item of await client.messages.batches.results(batch.id)) {
      if (item.result.type === "succeeded") results[item.custom_id] = text(item.result.message);
    }
    expect(Object.keys(results).sort()).toEqual(["a", "b"]);
    expect(results.b).toContain("second");
  });

  it("knows which models support which settings, like the real API", async () => {
    const ask = (extra: Record<string, unknown>) => client.messages.create({ ...base, max_tokens: 8000, messages: [{ role: "user", content: "hi" }], ...extra } as never);
    await expect(ask({ model: "claude-3-haiku" })).rejects.toBeInstanceOf(Anthropic.NotFoundError);
    await expect(ask({ output_config: { effort: "low" } })).rejects.toThrow(/claude-haiku-4-5 doesn't support the effort parameter/);
    await expect(ask({ thinking: { type: "adaptive" } })).rejects.toThrow(/adaptive\\?" isn't supported on claude-haiku-4-5/);
    await expect(ask({ model: "claude-sonnet-5", thinking: { type: "enabled", budget_tokens: 2000 } })).rejects.toThrow(/enabled\\?" isn't supported on claude-sonnet-5/);
    await expect(ask({ thinking: { type: "enabled", budget_tokens: 9000 } })).rejects.toThrow(/less than max_tokens/);
    await expect(ask({ model: "claude-sonnet-5", output_config: { effort: "extreme" } })).rejects.toThrow(/must be one of/);
    // Allowed: extended thinking on Haiku 4.5; effort and adaptive thinking on Sonnet 5.
    await expect(ask({ thinking: { type: "enabled", budget_tokens: 2000 } })).resolves.toMatchObject({ content: [{ type: "thinking" }, { type: "text" }] });
    const deep = await ask({ model: "claude-sonnet-5", output_config: { effort: "high" }, thinking: { type: "adaptive", display: "summarized" } });
    expect(deep.content[0]).toMatchObject({ type: "thinking", thinking: expect.stringContaining("summary") });
  });

  it("streams thinking blocks", async () => {
    const stream = client.messages.stream({
      ...base,
      model: "claude-sonnet-5",
      thinking: { type: "adaptive", display: "summarized" },
      messages: [{ role: "user", content: "Think it over" }],
    });
    const final = await stream.finalMessage();
    expect(final.content[0]).toMatchObject({ type: "thinking", thinking: expect.stringContaining("summary"), signature: "practice-signature" });
    expect(final.content[1]).toMatchObject({ type: "text" });
  });

  it("counts tokens, and checks the model there too", async () => {
    const counted = await client.messages.countTokens({ model: "claude-haiku-4-5", messages: [{ role: "user", content: "Count me" }] });
    expect(counted.input_tokens).toBeGreaterThan(0);
    await expect(client.messages.countTokens({ model: "haiku", messages: [{ role: "user", content: "x" }] })).rejects.toBeInstanceOf(Anthropic.NotFoundError);
  });

  it("answers unknown endpoints with a 404 not_found_error", async () => {
    await expect(client.models.retrieve("claude-haiku-4-5")).rejects.toBeInstanceOf(Anthropic.NotFoundError);
  });
});

describe("helpers", () => {
  it("builds sample values from schemas", () => {
    expect(
      sampleFromSchema({
        type: "object",
        properties: { e: { type: "string", format: "email" }, n: { type: "number" }, t: { type: "array", items: { enum: ["x", "y"] } } },
      }),
    ).toEqual({ e: "someone@example.com", n: 1, t: ["x"] });
  });

  it("allows a trailing assistant tool_use but not an unanswered one", () => {
    const use = { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "x", input: {} }] };
    expect(toolPairingError([{ role: "user", content: "hi" }, use])).toBeNull();
    expect(toolPairingError([{ role: "user", content: "hi" }, use, { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] }])).toBeNull();
    expect(toolPairingError([{ role: "user", content: "hi" }, use, { role: "user", content: "no result" }])).toMatch(/t1/);
    // A tool_result must answer a tool_use in the message right before it.
    expect(toolPairingError([{ role: "user", content: "hi" }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t9", content: "ok" }] }])).toMatch(
      /unexpected `tool_use_id`.*t9/,
    );
  });
});

describe("the claude-api starter's run.mjs", () => {
  const temp = createTempPlaygroundRoot();
  afterAll(() => temp.cleanup());

  it.each(["ask", "tools", "extract", "faq", "batch", "errors", "stream", "workflow", "route", "think", "budget", "cost"])(
    "runs %s.mjs (reference solution) against the practice API",
    async (name) => {
      const dir = path.join(temp.root, "claude-api");
      cpSync(path.join(process.cwd(), "templates/claude-api"), dir, { recursive: true });
      cpSync(path.join(process.cwd(), "tests/fixtures/challenges/claude-api"), dir, { recursive: true });
      const practice = await startMockApi(practiceResponder());
      try {
        const { stdout } = await promisify(execFile)(process.execPath, ["run.mjs", name], {
          cwd: dir,
          env: { NODE_ENV: "test", PATH: process.env.PATH, ...mockApiEnv(practice.url), POLL_MS: "10" },
          timeout: 20_000,
        });
        expect(stdout).toContain(`${name}.mjs returned:`);
        expect(practice.requests.length).toBeGreaterThan(0);
      } finally {
        await practice.close();
      }
    },
  );

  it("says what's missing in an untouched starter file", async () => {
    const dir = path.join(temp.root, "fresh");
    cpSync(path.join(process.cwd(), "templates/claude-api"), dir, { recursive: true });
    const practice = await startMockApi(practiceResponder());
    try {
      await expect(
        promisify(execFile)(process.execPath, ["run.mjs", "tools"], { cwd: dir, env: { NODE_ENV: "test", PATH: process.env.PATH, ...mockApiEnv(practice.url) }, timeout: 20_000 }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("runWithTools isn't written yet") });
    } finally {
      await practice.close();
    }
  });
});

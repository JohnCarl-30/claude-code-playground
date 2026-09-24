import "server-only";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { childEnv, crashSummary, fail, isObj, ok, readText, type Outcome, type Results } from "./check-utils";
import {
  apiError,
  invalidMessagesRequest,
  message,
  mockApiEnv,
  modelProblem,
  rejectRequest,
  sseFor,
  startMockApi,
  textBlock,
  thinkingBlock,
  toolUseBlock,
  isModelId,
  type MockApi,
  type MockReply,
  type RecordedRequest,
} from "./practice-api";
import { WORKSPACE_DIR } from "./workspace";

// Checks for the Claude API challenges. Your code runs for real, against a mock
// Claude API that plays a scripted scenario and records every request, so each
// check can look at exactly what your program sent and what it did with the reply.

type Json = Record<string, unknown>;
type Scenario = (req: RecordedRequest, call: number) => MockReply;
type CallResult = { value?: unknown; thrown?: string; chunks?: string[]; crash?: string; missing?: string };

// Imports one workspace file, calls exported functions one after another, and prints the outcomes on a marked line.
const HARNESS = `
import path from "node:path";
import { pathToFileURL } from "node:url";
const { file, calls } = JSON.parse(process.env.PLAYGROUND_CALL);
let mod;
try { mod = await import(pathToFileURL(path.resolve(file)).href); }
catch (e) { process.stderr.write(String(e?.stack ?? e)); process.exit(1); }
const results = [];
for (const call of calls) {
  if (call.read) { results.push(call.name in mod ? { value: mod[call.name] } : { missing: file + " doesn't export " + call.name + "." }); continue; }
  if (typeof mod[call.name] !== "function") { results.push({ missing: file + " doesn't export a function called " + call.name + "." }); continue; }
  const chunks = [];
  const args = call.args.map((a, i) => (i === call.collectAt ? (t) => chunks.push(String(t)) : a));
  try { const value = await mod[call.name](...args); results.push({ value: value === undefined ? null : value, chunks }); }
  catch (e) { results.push({ thrown: String(e?.message ?? e), chunks }); }
}
process.stdout.write("\\n@@PLAYGROUND_RESULT@@" + JSON.stringify(results) + "\\n", () => process.exit(0));
`;

/** Call an exported function, or with `read`, just read an exported value. */
type Call = { name: string; args: unknown[]; collectAt?: number; read?: boolean };

/** Run several exported functions from one workspace file, in order, with the SDK pointed at `api`. */
async function callExports(file: string, calls: Call[], api: MockApi, opts: { env?: Record<string, string> } = {}): Promise<CallResult[]> {
  if ((await readText(file)) === null) {
    // Workspaces created before a challenge existed don't have its file.
    const missing = `${file} is missing. Create it (Claude can), or Reset the workspace to get the latest starter files (Reset discards your changes).`;
    return calls.map(() => ({ missing }));
  }
  const results = await new Promise<CallResult[] | CallResult>((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", HARNESS], {
      cwd: WORKSPACE_DIR,
      env: childEnv({
        ...mockApiEnv(api.url),
        ...opts.env,
        PLAYGROUND_CALL: JSON.stringify({ file, calls: calls.map((c) => ({ ...c, collectAt: c.collectAt ?? -1 })) }),
      }),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      const marked = stdout.split("\n").find((l) => l.startsWith("@@PLAYGROUND_RESULT@@"));
      if (marked) return resolve(JSON.parse(marked.slice("@@PLAYGROUND_RESULT@@".length)) as CallResult[]);
      if (signal) return resolve({ crash: `${file} didn't finish within 20 seconds. Is it waiting forever?` });
      resolve({ crash: `${file} crashed${code === null ? "" : ` (exit code ${code})`}: ${crashSummary(stderr)}` });
    });
  });
  return Array.isArray(results) ? results : calls.map(() => results);
}

/** Run `name(...args)` from a workspace file, with the SDK pointed at `api`. */
async function callExport(file: string, name: string, args: unknown[], api: MockApi, opts: { collectAt?: number; env?: Record<string, string> } = {}) {
  const [result] = await callExports(file, [{ name, args, collectAt: opts.collectAt }], api, { env: opts.env });
  return result;
}

/** Start a mock API playing `scenario`, run `fn`, then stop it. Requests that the real API would reject get its 400. */
async function withScenario<T>(scenario: Scenario, fn: (api: MockApi) => Promise<T>) {
  let calls = 0;
  const api = await startMockApi((req) => {
    if (req.method === "POST" && req.path === "/v1/messages") {
      const rejected = rejectRequest(req.body);
      if (rejected) return rejected;
    }
    if (req.method === "POST" && req.path === "/v1/messages/count_tokens") {
      const rejected = rejectRequest(req.body, { counting: true });
      if (rejected) return rejected;
    }
    return scenario(req, calls++);
  });
  try {
    return await fn(api);
  } finally {
    await api.close();
  }
}

const body = (r: RecordedRequest) => r.body ?? {};
const messageRequests = (api: MockApi) => api.requests.filter((r) => r.method === "POST" && r.path === "/v1/messages");

/** The SDK's API errors read "400 {json body}"; show them as "400 invalid_request_error: message". */
function readableError(message: string) {
  const m = /^(\d{3}) (\{[\s\S]*\})$/.exec(message);
  if (!m) return message;
  try {
    const body = JSON.parse(m[2]) as { error?: { type?: string; message?: string } };
    if (body.error?.message) return `${m[1]} ${body.error.type}: ${body.error.message}`;
  } catch {}
  return message;
}

/** Why a call didn't produce a value, if it didn't. */
function problem(r: CallResult): string | null {
  if (r.missing) return r.missing;
  if (r.crash) return r.crash;
  if (r.thrown !== undefined) return `It threw: ${readableError(r.thrown)}`;
  return null;
}

const show = (v: unknown) => {
  const s = JSON.stringify(v);
  return s === undefined ? String(v) : s.length > 160 ? s.slice(0, 157) + "…" : s;
};

/** The text of a message's content, whether a string or a list of blocks. */
const contentText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((b) => (isObj(b) ? (typeof b.text === "string" ? b.text : typeof b.content !== "undefined" ? contentText(b.content) : "") : "")).join("\n")
      : "";

const blocksOf = (m: unknown): Json[] => (isObj(m) && Array.isArray(m.content) ? (m.content as Json[]) : []);

// ---------- Tool use ----------

async function checkToolLoop(): Promise<Results> {
  const R: Results = {};
  const FINAL = "FINAL: It's 18°C and clear in Tokyo.";
  const single = await withScenario(
    (_req, call) =>
      call === 0
        ? { json: message([textBlock("Let me check."), toolUseBlock("toolu_check_A1", "get_weather", { city: "Tokyo" })], "tool_use") }
        : { json: message([textBlock(FINAL)], "end_turn") },
    async (api) => ({ result: await callExport("tools.mjs", "runWithTools", ["What's the weather in Tokyo?"], api), requests: messageRequests(api) }),
  );
  const why = problem(single.result);
  const [first, second] = single.requests;

  const tool = Array.isArray(first?.body?.tools) ? (first.body.tools as Json[]).find((t) => t.name === "get_weather") : undefined;
  const schema = isObj(tool?.input_schema) ? tool.input_schema : null;
  const city = schema && isObj(schema.properties) && isObj(schema.properties.city) ? schema.properties.city : null;
  R.defined = !first
    ? fail(why ?? "runWithTools didn't call the API.")
    : !tool
      ? fail(`The request's tools don't include get_weather (tools: ${show(first.body?.tools ?? null)}).`)
      : !String(tool.description ?? "").trim()
        ? fail("Give get_weather a description: Claude reads it to decide when to call the tool.")
        : schema?.type !== "object" || city?.type !== "string"
          ? fail(`input_schema should be { type: "object", properties: { city: { type: "string" } } }; got ${show(tool.input_schema)}`)
          : ok();

  const msgs = (second?.body?.messages as Json[] | undefined) ?? [];
  const assistantIdx = msgs.findIndex((m) => m.role === "assistant" && blocksOf(m).some((b) => b.type === "tool_use" && b.id === "toolu_check_A1"));
  const result = blocksOf(msgs[assistantIdx + 1]).find((b) => b.type === "tool_result" && b.tool_use_id === "toolu_check_A1");
  R.loop = !second
    ? fail(why ?? "After Claude asked for get_weather, no second request was sent with the tool's result.")
    : assistantIdx === -1
      ? fail("The second request must include Claude's assistant turn (with its tool_use block) before your tool_result.")
      : !result
        ? fail("The message after the assistant turn needs a tool_result with tool_use_id \"toolu_check_A1\".")
        : !contentText(result.content).includes("18°C")
          ? fail(`The tool_result should carry getWeather's output ("18°C and clear"); got ${show(result.content)}`)
          : ok();

  R.final = why
    ? fail(why)
    : single.requests.length > 2
      ? fail(`It kept calling the API after stop_reason "end_turn" (${single.requests.length} requests).`)
      : single.result.value === FINAL
        ? ok()
        : fail(`Expected the final text ${show(FINAL)}; got ${show(single.result.value)}`);

  const parallel = await withScenario(
    (_req, call) =>
      call === 0
        ? {
            json: message(
              [toolUseBlock("toolu_check_B1", "get_weather", { city: "Tokyo" }), toolUseBlock("toolu_check_B2", "get_weather", { city: "Atlantis" })],
              "tool_use",
            ),
          }
        : { json: message([textBlock("Compared.")], "end_turn") },
    async (api) => ({ result: await callExport("tools.mjs", "runWithTools", ["Compare Tokyo and Atlantis."], api), requests: messageRequests(api) }),
  );
  const answer = (parallel.requests[1]?.body?.messages as Json[] | undefined)?.at(-1);
  const results = blocksOf(answer).filter((b) => b.type === "tool_result");
  const ids = results.map((b) => b.tool_use_id);
  const whyP = problem(parallel.result);
  R.parallel =
    answer?.role === "user" && ids.includes("toolu_check_B1") && ids.includes("toolu_check_B2")
      ? ok()
      : fail(whyP ?? `Claude asked for two tools at once; send both tool_results in one user message. Got: ${show(answer ?? null)}`);
  const atlantis = results.find((b) => b.tool_use_id === "toolu_check_B2");
  R.error = whyP
    ? fail(whyP)
    : atlantis?.is_error === true
      ? ok()
      : fail(`getWeather("Atlantis") returns null: send that tool_result with is_error: true and a short message. Got: ${show(atlantis ?? null)}`);
  return R;
}

// ---------- Structured output ----------

async function checkExtract(): Promise<Results> {
  const R: Results = {};
  const ADA = { name: "Ada Lovelace", email: "ada@example.com", company: "Analytical Engines" };
  const input = "Hi, I'm Ada Lovelace from Analytical Engines. Write to ada@example.com.";
  const scenario = (reply: Json) =>
    withScenario(
      () => ({ json: reply }),
      async (api) => ({ result: await callExport("extract.mjs", "extractContact", [input], api), requests: messageRequests(api) }),
    );

  const normal = await scenario(message([textBlock(JSON.stringify(ADA))], "end_turn"));
  const format = normal.requests[0]?.body?.output_config;
  const fmt = isObj(format) && isObj(format.format) ? format.format : null;
  const schema = fmt && isObj(fmt.schema) ? fmt.schema : null;
  const props = schema && isObj(schema.properties) ? Object.keys(schema.properties) : [];
  const whyN = problem(normal.result);
  R.schema = !normal.requests[0]
    ? fail(whyN ?? "extractContact didn't call the API.")
    : fmt?.type !== "json_schema"
      ? fail(`Set output_config: { format: { type: "json_schema", schema } } on the request; got output_config ${show(format ?? null)}`)
      : !["name", "email", "company"].every((k) => props.includes(k))
        ? fail(`The schema's properties should include name, email and company; got ${props.join(", ") || "none"}.`)
        : schema?.additionalProperties !== false
          ? fail("Structured outputs need additionalProperties: false on every object in the schema.")
          : ok();
  const got = normal.result.value;
  R.parsed = whyN
    ? fail(whyN)
    : isObj(got) && got.name === ADA.name && got.email === ADA.email && got.company === ADA.company
      ? ok()
      : fail(`Expected ${show(ADA)}; got ${show(got)}`);

  const cut = await scenario(message([textBlock('{"name": "Ada Lovel')], "max_tokens"));
  const whyT = problem(cut.result);
  R.truncated = whyT
    ? fail(`${whyT} (return null instead of crashing)`)
    : cut.result.value === null
      ? ok()
      : fail(`Expected null for a reply cut off by max_tokens; got ${show(cut.result.value)}`);

  const refused = await scenario(message([], "refusal"));
  const whyR = problem(refused.result);
  R.refusal = whyR
    ? fail(`${whyR} (return null instead of crashing)`)
    : refused.result.value === null
      ? ok()
      : fail(`Expected null when stop_reason is "refusal"; got ${show(refused.result.value)}`);
  return R;
}

// ---------- Prompt caching ----------

async function checkCaching(): Promise<Results> {
  const R: Results = {};
  const usages = [
    { input_tokens: 21, output_tokens: 30, cache_creation_input_tokens: 1800, cache_read_input_tokens: 0 },
    { input_tokens: 19, output_tokens: 25, cache_creation_input_tokens: 0, cache_read_input_tokens: 1800 },
  ];
  const QUESTIONS = ["Is shipping free?", "Can I combine codes?"];
  const run = await withScenario(
    (_req, call) => ({ json: message([textBlock(`Answer ${call + 1}`)], "end_turn", usages[Math.min(call, 1)]) }),
    async (api) => {
      const first = await callExport("faq.mjs", "answerFaq", [QUESTIONS[0]], api);
      const second = await callExport("faq.mjs", "answerFaq", [QUESTIONS[1]], api);
      return { first, second, requests: messageRequests(api) };
    },
  );
  const why = problem(run.first) ?? problem(run.second);
  const [a, b] = run.requests;
  const cached = (body: Json | null | undefined) =>
    !!body && (isObj(body.cache_control) || (Array.isArray(body.system) && (body.system as Json[]).some((s) => isObj(s.cache_control))));
  R.marked = !a
    ? fail(why ?? "answerFaq didn't call the API.")
    : !body(a).system
      ? fail("Put the FAQ in the system prompt.")
      : cached(a.body)
        ? ok()
        : fail('Mark the FAQ for caching: system: [{ type: "text", text: FAQ, cache_control: { type: "ephemeral" } }] (or a top-level cache_control).');

  const sysA = JSON.stringify(a?.body?.system ?? null);
  const sysB = JSON.stringify(b?.body?.system ?? null);
  R.stable = !b
    ? fail(why ?? "Only one request arrived for two questions.")
    : sysA !== sysB
      ? fail("The system prompt changed between two questions, so the cache would never be read. Keep dates, ids and the question out of it.")
      : QUESTIONS.some((q) => sysA.includes(q))
        ? fail("The question is inside the cached system prompt. Send it in messages instead.")
        : ok();

  const u1 = isObj(run.first.value) && isObj(run.first.value.usage) ? run.first.value.usage : null;
  const u2 = isObj(run.second.value) && isObj(run.second.value.usage) ? run.second.value.usage : null;
  R.usage = why
    ? fail(why)
    : u1?.cacheWrite === 1800 && u2?.cacheRead === 1800 && u2?.cacheWrite === 0 && u2?.input === 19 && u2?.output === 25
      ? ok()
      : fail(
          `From usage, return input (input_tokens), cacheWrite (cache_creation_input_tokens), cacheRead (cache_read_input_tokens) and output. Got ${show(u1)} then ${show(u2)}`,
        );
  R.total = why
    ? fail(why)
    : u1?.totalInput === 21 + 1800 && u2?.totalInput === 19 + 1800
      ? ok()
      : fail(`input_tokens is only the uncached part: totalInput = input + cacheWrite + cacheRead (expected 1821, then 1819). Got ${show(u1?.totalInput)}, ${show(u2?.totalInput)}`);
  return R;
}

// ---------- Message Batches ----------

async function checkBatch(): Promise<Results> {
  const R: Results = {};
  const BATCH = "msgbatch_check_1";
  const REVIEWS = [
    { id: "r-1", text: "Great mugs, fast delivery." },
    { id: "r-2", text: "The tea was stale." },
    { id: "r-3", text: "Arrived broken." },
  ];
  let statusChecks = 0;
  let resultsFetched = false;
  const batchObject = (url: string, ended: boolean) => ({
    id: BATCH,
    type: "message_batch",
    processing_status: ended ? "ended" : "in_progress",
    request_counts: { processing: ended ? 0 : 3, succeeded: ended ? 2 : 0, errored: ended ? 1 : 0, canceled: 0, expired: 0 },
    created_at: new Date().toISOString(),
    ended_at: ended ? new Date().toISOString() : null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    cancel_initiated_at: null,
    archived_at: null,
    results_url: ended ? `${url}/v1/messages/batches/${BATCH}/results` : null,
  });

  const api = await startMockApi((req, { url }) => {
    if (req.method === "POST" && req.path === "/v1/messages/batches") {
      const requests = Array.isArray(req.body?.requests) ? (req.body.requests as Json[]) : [];
      if (!requests.length) return apiError(400, "invalid_request_error", "requests: must contain at least one request");
      for (const r of requests) {
        const invalid = invalidMessagesRequest(isObj(r.params) ? r.params : null);
        if (invalid) return apiError(400, "invalid_request_error", `requests.${String(r.custom_id)}.params: ${invalid}`);
        const problem = modelProblem(r.params as Json);
        if (problem) return problem;
      }
      return { json: batchObject(url, false) };
    }
    if (req.method === "GET" && req.path === `/v1/messages/batches/${BATCH}`) {
      statusChecks++;
      return { json: batchObject(url, statusChecks > 2) };
    }
    if (req.method === "GET" && req.path === `/v1/messages/batches/${BATCH}/results`) {
      if (statusChecks <= 2) return apiError(400, "invalid_request_error", "This batch hasn't ended yet.");
      resultsFetched = true;
      // Out of order on purpose: match by custom_id, never by position.
      return {
        jsonl: [
          { custom_id: "r-3", result: { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: "Practice error." } } } },
          { custom_id: "r-2", result: { type: "succeeded", message: message([textBlock("negative")], "end_turn") } },
          { custom_id: "r-1", result: { type: "succeeded", message: message([textBlock("positive")], "end_turn") } },
        ],
      };
    }
    return apiError(404, "not_found_error", `Not part of this check: ${req.method} ${req.path}`);
  });
  let run;
  try {
    const submitted = await callExport("batch.mjs", "submitReviews", [REVIEWS], api, { env: { POLL_MS: "20" } });
    const collected = await callExport("batch.mjs", "collectResults", [BATCH], api, { env: { POLL_MS: "20" } });
    run = { submitted, collected, requests: api.requests };
  } finally {
    await api.close();
  }

  const create = run.requests.find((r) => r.method === "POST" && r.path === "/v1/messages/batches");
  const items = Array.isArray(create?.body?.requests) ? (create.body.requests as Json[]) : [];
  const whyS = problem(run.submitted);
  R.create = !create
    ? fail(whyS ?? "submitReviews didn't create a batch (POST /v1/messages/batches).")
    : items.length === 3 && REVIEWS.every((rv) => items.some((it) => it.custom_id === rv.id))
      ? ok()
      : fail(`Expected 3 requests with custom_id r-1, r-2, r-3; got ${show(items.map((it) => it.custom_id))}`);
  const paramsOk = items.length > 0 && items.every((it) => {
    const p = isObj(it.params) ? it.params : null;
    const review = REVIEWS.find((rv) => rv.id === it.custom_id);
    return !!p && typeof p.model === "string" && typeof p.max_tokens === "number" && !!review && JSON.stringify(p.messages ?? "").includes(review.text);
  });
  R.params = paramsOk
    ? ok()
    : fail(whyS ?? `Each request's params needs model, max_tokens and messages containing that review's text. First one: ${show(items[0]?.params ?? null)}`);
  R.returns = whyS ? fail(whyS) : run.submitted.value === BATCH ? ok() : fail(`Return the batch's id (${BATCH}); got ${show(run.submitted.value)}`);

  const whyC = problem(run.collected);
  R.poll =
    resultsFetched && statusChecks >= 3
      ? ok()
      : fail(whyC ?? `Keep checking the status (it said "in_progress" twice) until processing_status is "ended", then read the results.`);
  const value = run.collected.value;
  const succeeded = isObj(value) && isObj(value.succeeded) ? value.succeeded : null;
  const failed = isObj(value) && Array.isArray(value.failed) ? value.failed : null;
  R.results = whyC
    ? fail(whyC)
    : succeeded?.["r-1"] === "positive" && succeeded?.["r-2"] === "negative" && failed?.length === 1 && failed[0] === "r-3"
      ? ok()
      : fail(`Expected { succeeded: { "r-1": "positive", "r-2": "negative" }, failed: ["r-3"] }; got ${show(value)}`);
  return R;
}

// ---------- Errors and retries ----------

async function hardCodedKey(): Promise<string | null> {
  const files = (await readdir(WORKSPACE_DIR).catch(() => [] as string[])).filter((f) => /\.(m?js|ts)$/.test(f));
  for (const f of files) {
    const code = (await readText(f)) ?? "";
    if (/sk-ant-[\w-]{8,}/.test(code)) return `${f} contains something that looks like an API key.`;
    if (/apiKey\s*:\s*["'`]/.test(code)) return `${f} passes apiKey as a string literal. Let the SDK read ANTHROPIC_API_KEY instead.`;
  }
  return null;
}

async function checkErrors(): Promise<Results> {
  const R: Results = {};
  const attempt = (scenario: Scenario) =>
    withScenario(scenario, async (api) => ({ result: await callExport("errors.mjs", "safeAsk", ["Say hello."], api), requests: messageRequests(api) }));
  const value = (r: CallResult) => (isObj(r.value) ? r.value : null);

  const good = await attempt(() => ({ json: message([textBlock("Hello!")], "end_turn") }));
  const g = value(good.result);
  R.success = problem(good.result)
    ? fail(problem(good.result)!)
    : g?.ok === true && g.text === "Hello!"
      ? ok()
      : fail(`Expected { ok: true, text: "Hello!" }; got ${show(good.result.value)}`);

  const bad = await attempt(() => apiError(400, "invalid_request_error", "max_tokens: must be greater than 0"));
  const b = value(bad.result);
  R.badrequest = problem(bad.result)
    ? fail(`${problem(bad.result)} (safeAsk should return, not throw)`)
    : b?.ok !== false || b.retryable !== false
      ? fail(`Expected { ok: false, retryable: false } for a 400; got ${show(bad.result.value)}`)
      : bad.requests.length !== 1
        ? fail(`A 400 fails the same way every time, but it was sent ${bad.requests.length} times.`)
        : ok();

  const busy = await attempt(() => apiError(529, "overloaded_error", "Overloaded"));
  const o = value(busy.result);
  R.overloaded = problem(busy.result)
    ? fail(`${problem(busy.result)} (safeAsk should return, not throw)`)
    : o?.ok !== false || o.retryable !== true
      ? fail(`Expected { ok: false, retryable: true } for a 529 overloaded_error; got ${show(busy.result.value)}`)
      : busy.requests.length < 2
        ? fail("A 529 is temporary: retry it (the SDK does this by default unless maxRetries is 0).")
        : ok();

  const limited = await attempt((_req, call) =>
    call === 0 ? apiError(429, "rate_limit_error", "Rate limited") : { json: message([textBlock("Hello after waiting.")], "end_turn") },
  );
  const l = value(limited.result);
  R.ratelimit = problem(limited.result)
    ? fail(problem(limited.result)!)
    : l?.ok === true
      ? ok()
      : fail(`The 429 cleared up on the next try, so the call should succeed after a retry; got ${show(limited.result.value)}`);

  const key = await hardCodedKey();
  R.nokey = key ? fail(key) : ok();
  return R;
}

// ---------- Streaming ----------

async function checkStream(): Promise<Results> {
  const TEXT = "Streaming sends text as it is generated, so people see progress sooner.";
  const run = await withScenario(
    (req) => {
      const msg = message([textBlock(TEXT)], "end_turn");
      return req.body?.stream === true ? { sse: sseFor(msg, 5) } : { json: msg };
    },
    async (api) => ({ result: await callExport("stream.mjs", "streamAnswer", ["Explain streaming.", null], api, { collectAt: 1 }), requests: messageRequests(api) }),
  );
  const why = problem(run.result);
  const chunks = run.result.chunks ?? [];
  return {
    streams: !run.requests[0]
      ? fail(why ?? "streamAnswer didn't call the API.")
      : run.requests[0].body?.stream === true
        ? ok()
        : fail("Ask for a stream: client.messages.stream(...) or create({ ..., stream: true })."),
    chunks: chunks.length >= 3 && chunks.join("") === TEXT
      ? ok()
      : fail(why ?? `onText should get each text delta in order (5 were sent); it got ${chunks.length}: ${show(chunks)}`),
    final: why ? fail(why) : run.result.value === TEXT ? ok() : fail(`Return the whole text; got ${show(run.result.value)}`),
  };
}

// ---------- A workflow ----------

async function checkWorkflow(): Promise<Results> {
  const ORIGINAL = "ZX-ORIGINAL report: the Message Batches API processes large jobs asynchronously at half the price.";
  const SUMMARY = "SUMMARY-7F3: batches are cheaper for big jobs that can wait.";
  const TRANSLATION = "TRADUCTION-9Q: les lots coûtent moins cher.";
  const main = await withScenario(
    (_req, call) => ({ json: message([textBlock(call === 0 ? SUMMARY : TRANSLATION)], "end_turn") }),
    async (api) => ({ result: await callExport("workflow.mjs", "summarizeThenTranslate", [ORIGINAL, "French"], api), requests: messageRequests(api) }),
  );
  const why = problem(main.result);
  const second = JSON.stringify(main.requests[1]?.body?.messages ?? "");

  const gated = await withScenario(
    () => ({ json: message([textBlock("SUMMARY-CUT: batches are")], "max_tokens") }),
    async (api) => ({ result: await callExport("workflow.mjs", "summarizeThenTranslate", [ORIGINAL, "French"], api), requests: messageRequests(api) }),
  );
  const whyG = problem(gated.result);

  const steps: Outcome =
    main.requests.length === 2 ? ok() : fail(why ?? `Expected exactly two requests (summarize, then translate); got ${main.requests.length}.`);
  return {
    steps,
    chained: !main.requests[1]
      ? fail(why ?? "There was no second request.")
      : !second.includes("SUMMARY-7F3")
        ? fail("The second request should contain the summary from step 1.")
        : second.includes("ZX-ORIGINAL")
          ? fail("The second request still sends the original text. Pass only step 1's output forward.")
          : ok(),
    result: why ? fail(why) : main.result.value === TRANSLATION ? ok() : fail(`Return step 2's text; got ${show(main.result.value)}`),
    gate: whyG
      ? fail(`${whyG} (return null instead)`)
      : gated.result.value !== null
        ? fail(`When step 1 stops with "max_tokens", return null; got ${show(gated.result.value)}`)
        : gated.requests.length !== 1
          ? fail("A cut-off summary shouldn't be translated: don't make the second call.")
          : ok(),
  };
}

// ---------- Choosing a model ----------

async function checkRouting(): Promise<Results> {
  const R: Results = {};
  const TASK_IDS = ["tag-ticket", "extract-order", "plan-migration", "review-design"];
  const run = await withScenario(
    () => ({ json: message([textBlock("done")], "end_turn") }),
    async (api) => ({
      picks: await callExports(
        "route.mjs",
        [...TASK_IDS.map((id) => ({ name: "chooseModel", args: [id] })), { name: "chooseModel", args: ["write-a-poem"] }],
        api,
      ),
      runs: await callExports("route.mjs", [
        { name: "runTask", args: ["tag-ticket", "RUN-INPUT-1: I was charged twice."] },
        { name: "runTask", args: ["plan-migration", "RUN-INPUT-2: move users to a new table."] },
      ], api),
      requests: messageRequests(api),
    }),
  );
  const picks = Object.fromEntries(TASK_IDS.map((id, i) => [id, run.picks[i]]));
  const model = (id: string) => (typeof picks[id].value === "string" ? (picks[id].value as string) : null);
  const firstProblem = TASK_IDS.map((id) => problem(picks[id])).find(Boolean);

  const simple = ["tag-ticket", "extract-order"];
  const complex = ["plan-migration", "review-design"];
  R.simple = firstProblem
    ? fail(firstProblem)
    : simple.every((id) => /haiku/.test(model(id) ?? ""))
      ? ok()
      : fail(`Simple, high-volume tasks fit Haiku. Got: ${simple.map((id) => `${id} → ${model(id)}`).join(", ")}`);
  R.complex = firstProblem
    ? fail(firstProblem)
    : complex.every((id) => /^claude-(sonnet|opus|fable)-/.test(model(id) ?? ""))
      ? ok()
      : fail(`Tasks that need reasoning fit Sonnet, Opus or Fable. Got: ${complex.map((id) => `${id} → ${model(id)}`).join(", ")}`);
  const unknownIds = TASK_IDS.map(model).filter((m): m is string => !!m && !isModelId(m));
  const rejected = run.runs.map(problem).find((p) => p && /not_found_error/.test(p));
  R.valid = firstProblem
    ? fail(firstProblem)
    : unknownIds.length
      ? fail(`The API doesn't know these model IDs: ${unknownIds.join(", ")}. See the models overview for current IDs.`)
      : rejected
        ? fail(rejected)
        : ok();

  const [a, b] = run.requests;
  const sentFor = (req: RecordedRequest | undefined, input: string) => !!req && JSON.stringify(req.body?.messages ?? "").includes(input);
  const whyRun = run.runs.map(problem).find(Boolean);
  R.used =
    a && b && a.body?.model === model("tag-ticket") && b.body?.model === model("plan-migration") && sentFor(a, "RUN-INPUT-1") && sentFor(b, "RUN-INPUT-2")
      ? ok()
      : fail(
          whyRun ??
            `runTask should send chooseModel's pick and the input. Sent: ${run.requests.map((r) => r.body?.model).join(", ") || "nothing"} (picked ${model("tag-ticket")}, ${model("plan-migration")})`,
        );
  const unknown = run.picks[TASK_IDS.length];
  R.unknown =
    unknown.thrown !== undefined
      ? ok()
      : fail(unknown.missing ?? unknown.crash ?? `chooseModel("write-a-poem") returned ${show(unknown.value)}. Throw for tasks you don't know instead of guessing.`);
  return R;
}

// ---------- Effort and thinking ----------

async function checkThinking(): Promise<Results> {
  const THOUGHTS = "THOUGHTS-8K: weighed both options before answering.";
  const run = await withScenario(
    (req) => {
      const deep = isObj(req.body?.thinking) && req.body.thinking.display === "summarized";
      return { json: message(deep ? [thinkingBlock(THOUGHTS), textBlock("ANSWER-DEEP")] : [textBlock("ANSWER-QUICK")], "end_turn") };
    },
    async (api) => ({
      results: await callExports("think.mjs", [
        { name: "solve", args: ["What is 17 × 3?", "quick"] },
        { name: "solve", args: ["Plan a zero-downtime migration.", "deep"] },
      ], api),
      requests: messageRequests(api),
    }),
  );
  const [quick, deep] = run.results;
  const [q, d] = run.requests;
  const why = problem(quick) ?? problem(deep);
  const effortOf = (r?: RecordedRequest) => (isObj(r?.body?.output_config) ? r.body.output_config.effort : undefined);
  const thinkingOf = (r?: RecordedRequest) => (isObj(r?.body?.thinking) ? r.body.thinking : null);
  const haiku = run.requests.find((r) => /haiku/.test(String(r.body?.model)));
  return {
    model: haiku
      ? fail(`${String(haiku.body?.model)} doesn't support effort or adaptive thinking. Use a model that does, like claude-sonnet-5 or claude-opus-5.`)
      : run.requests.length
        ? ok()
        : fail(why ?? "solve didn't call the API."),
    quick: effortOf(q) === "low" ? ok() : fail(why ?? `"quick" should send output_config: { effort: "low" }; sent ${show(q?.body?.output_config ?? null)}`),
    deep:
      ["high", "xhigh", "max"].includes(String(effortOf(d))) && thinkingOf(d)?.type === "adaptive" && thinkingOf(d)?.display === "summarized"
        ? ok()
        : fail(
            why ??
              `"deep" should send a higher effort (high, xhigh or max) and thinking: { type: "adaptive", display: "summarized" }; sent effort ${show(effortOf(d) ?? null)}, thinking ${show(thinkingOf(d))}`,
          ),
    answer: why
      ? fail(why)
      : isObj(deep.value) && deep.value.answer === "ANSWER-DEEP" && deep.value.thoughts === THOUGHTS && isObj(quick.value) && quick.value.answer === "ANSWER-QUICK" && quick.value.thoughts === ""
        ? ok()
        : fail(`Expected { answer: "ANSWER-DEEP", thoughts: "${THOUGHTS}" } for deep and thoughts "" for quick; got ${show(deep.value)} and ${show(quick.value)}`),
  };
}

// ---------- Token budgets ----------

async function checkBudget(): Promise<Results> {
  const DOC = "DOC-7Q: Tiny Shop's returns policy. Unused items can be returned within 30 days. ".repeat(20);
  const QUESTION = "Q-3Z: How long do I have to return a mug?";
  const scenario = (tokens: number) =>
    withScenario(
      (req) => (req.path === "/v1/messages/count_tokens" ? { json: { input_tokens: tokens } } : { json: message([textBlock("ANSWER-30")], "end_turn") }),
      async (api) => ({
        result: await callExport("budget.mjs", "askWithinBudget", [DOC, QUESTION, 5000], api),
        counts: api.requests.filter((r) => r.path === "/v1/messages/count_tokens"),
        sends: messageRequests(api),
      }),
    );
  const within = await scenario(1200);
  const over = await scenario(9000);
  const why = problem(within.result);
  const pick = (b: Json | null | undefined) => JSON.stringify({ model: b?.model, system: b?.system ?? null, messages: b?.messages, tools: b?.tools ?? null });
  const [counted] = within.counts;
  const [sent] = within.sends;
  const text = JSON.stringify(sent?.body?.messages ?? counted?.body?.messages ?? "");
  const whyOver = problem(over.result);
  return {
    counts: !counted
      ? fail(why ?? "Count the tokens first with client.messages.countTokens(...).")
      : sent && pick(counted.body) !== pick(sent.body)
        ? fail("What you count must be what you send: the same model, system and messages.")
        : ok(),
    skips: whyOver
      ? fail(whyOver)
      : over.sends.length
        ? fail(`Counted 9000 tokens against a limit of 5000, but the request was still sent.`)
        : isObj(over.result.value) && over.result.value.skipped === true && over.result.value.inputTokens === 9000
          ? ok()
          : fail(`Expected { skipped: true, inputTokens: 9000 }; got ${show(over.result.value)}`),
    sends: why
      ? fail(why)
      : isObj(within.result.value) && within.result.value.skipped === false && within.result.value.inputTokens === 1200 && within.result.value.answer === "ANSWER-30"
        ? ok()
        : fail(`Expected { skipped: false, inputTokens: 1200, answer: "ANSWER-30" }; got ${show(within.result.value)}`),
    order:
      text.includes("DOC-7Q") && text.includes("Q-3Z") && text.indexOf("DOC-7Q") < text.indexOf("Q-3Z")
        ? ok()
        : fail(why ?? "Put the long document first and the question after it: queries at the end give better answers with long inputs."),
  };
}

// ---------- Cost ----------

async function checkCost(): Promise<Results> {
  const HAIKU = "claude-haiku-4-5";
  const cached = { input_tokens: 100, cache_creation_input_tokens: 4000, cache_read_input_tokens: 20000, output_tokens: 300 };
  const live = { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const run = await withScenario(
    (req) => ({ json: message([textBlock("ANSWER-COST")], "end_turn", live, String(req.body?.model)) }),
    async (api) => ({
      results: await callExports("cost.mjs", [
        { name: "PRICES", args: [], read: true },
        { name: "costOf", args: [{ input_tokens: 1_000_000, output_tokens: 0 }, HAIKU] },
        { name: "costOf", args: [{ input_tokens: 2000, output_tokens: 1000 }, "claude-sonnet-5"] },
        { name: "costOf", args: [cached, HAIKU] },
        { name: "costOf", args: [cached, HAIKU, { batch: true }] },
        { name: "costOf", args: [{ input_tokens: 10, output_tokens: 10 }, "claude-imaginary-9"] },
        { name: "askWithCost", args: ["What is prompt caching?"] },
      ], api),
      requests: messageRequests(api),
    }),
  );
  const [prices, million, sonnet, withCache, batched, unknown, asked] = run.results;
  const table = isObj(prices.value) ? prices.value : null;
  const price = (model: string) => {
    const p = table && isObj(table[model]) ? table[model] : null;
    return p && typeof p.input === "number" && typeof p.output === "number" ? { input: p.input, output: p.output } : null;
  };
  const expected = (u: Record<string, number>, model: string, batch = false) => {
    const p = price(model);
    if (!p) return null;
    const total = ((u.input_tokens ?? 0) * p.input + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 + (u.cache_read_input_tokens ?? 0) * p.input * 0.1 + (u.output_tokens ?? 0) * p.output) / 1e6;
    return batch ? total / 2 : total;
  };
  const near = (got: unknown, want: number | null) => typeof got === "number" && want !== null && Math.abs(got - want) <= 1e-9 + Math.abs(want) * 1e-6;
  const check = (r: CallResult, want: number | null, what: string): Outcome =>
    problem(r) ? fail(problem(r)!) : want === null ? fail(`PRICES needs input and output prices for the model used here.`) : near(r.value, want) ? ok() : fail(`${what}: expected $${want}, got ${show(r.value)}`);

  const noTable = problem(prices) ?? (table ? null : "Export PRICES from cost.mjs.");
  const basic = check(million, expected({ input_tokens: 1_000_000 }, HAIKU), "1M Haiku input tokens");
  const sonnetOk = check(sonnet, expected({ input_tokens: 2000, output_tokens: 1000 }, "claude-sonnet-5"), "2,000 input + 1,000 output tokens on Sonnet 5");
  const sentModel = String(run.requests[0]?.body?.model ?? HAIKU);
  const askedValue = isObj(asked.value) ? asked.value : null;
  return {
    basic: noTable ? fail(noTable) : !basic.pass ? basic : sonnetOk,
    cache: noTable ? fail(noTable) : check(withCache, expected(cached, HAIKU), "cache writes at 1.25× and reads at 0.1× the input price"),
    batch: noTable ? fail(noTable) : check(batched, expected(cached, HAIKU, true), "the same usage through the Batches API (50% off)"),
    unknown:
      unknown.thrown !== undefined
        ? ok()
        : fail(unknown.missing ?? unknown.crash ?? `costOf for a model missing from PRICES returned ${show(unknown.value)}. Throw instead, so a missing price can't look like $0.`),
    live: problem(asked)
      ? fail(problem(asked)!)
      : askedValue?.answer === "ANSWER-COST" && near(askedValue.costUsd, expected(live, sentModel))
        ? ok()
        : fail(`Expected { answer: "ANSWER-COST", costUsd: ${expected(live, sentModel)} } for that response's usage; got ${show(asked.value)}`),
  };
}

export const API_CHECKERS: Record<string, () => Promise<Results>> = {
  "api-model-routing": checkRouting,
  "api-thinking": checkThinking,
  "api-token-budget": checkBudget,
  "api-cost": checkCost,
  "api-tool-loop": checkToolLoop,
  "api-structured": checkExtract,
  "api-caching": checkCaching,
  "api-batch": checkBatch,
  "api-errors": checkErrors,
  "api-streaming": checkStream,
  "api-workflow": checkWorkflow,
};

import "server-only";
import http from "node:http";
import type { AddressInfo } from "node:net";

// A stand-in for the Claude API that runs on your computer. Programs written
// with @anthropic-ai/sdk talk to it when ANTHROPIC_BASE_URL points here, so you
// can run and check Claude API code without an API key. Its replies are canned
// (it is not Claude), but the shapes are the real ones: messages, tool_use,
// streaming events, usage with cache fields, errors and message batches.

type Json = Record<string, unknown>;

export type RecordedRequest = { method: string; path: string; headers: Record<string, string>; body: Json | null };

export type MockReply =
  | { status?: number; json: unknown; headers?: Record<string, string> }
  | { sse: string; headers?: Record<string, string> }
  | { jsonl: unknown[] };

export type Responder = (req: RecordedRequest, ctx: { url: string }) => MockReply | Promise<MockReply>;

export type MockApi = {
  url: string;
  requests: RecordedRequest[];
  /** Called after each request is answered, with a short summary of the reply. */
  onRequest: Set<(req: RecordedRequest, summary: string) => void>;
  close: () => Promise<void>;
};

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

// ---------- building replies ----------

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

let messageCount = 0;

export function message(content: Json[], stop_reason: string, usage: Partial<Usage> = {}, model = "claude-haiku-4-5"): Json {
  return {
    id: `msg_practice_${++messageCount}`,
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 25, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...usage },
  };
}

export const textBlock = (text: string): Json => ({ type: "text", text });
export const toolUseBlock = (id: string, name: string, input: Json): Json => ({ type: "tool_use", id, name, input });

/** An error body exactly like the API's: { type: "error", error: { type, message } }. */
export function apiError(status: number, type: string, msg: string): MockReply {
  return {
    status,
    json: { type: "error", error: { type, message: msg }, request_id: "req_practice" },
    // Keeps the SDK's automatic retries fast in practice (it honors retry-after-ms).
    headers: { "retry-after-ms": "5" },
  };
}

/** The server-sent events the API streams for a message, text split into a few deltas. */
export function sseFor(msg: Json, chunks = 4) {
  const events: [string, Json][] = [];
  const content = (msg.content as Json[]) ?? [];
  const usage = msg.usage as Usage;
  events.push(["message_start", { type: "message_start", message: { ...msg, content: [], stop_reason: null, usage: { ...usage, output_tokens: 1 } } }]);
  content.forEach((block, index) => {
    if (block.type === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      const text = String(block.text);
      const size = Math.max(1, Math.ceil(text.length / chunks));
      for (let i = 0; i < text.length; i += size) {
        events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: text.slice(i, i + size) } }]);
      }
    } else if (block.type === "thinking") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } }]);
      if (block.thinking) events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "signature_delta", signature: block.signature } }]);
    } else if (block.type === "tool_use") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { ...block, input: {} } }]);
      events.push([
        "content_block_delta",
        { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } },
      ]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push([
    "message_delta",
    { type: "message_delta", delta: { stop_reason: msg.stop_reason, stop_sequence: null }, usage: { output_tokens: usage.output_tokens } },
  ]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

// ---------- the server ----------

/** Just enough multipart parsing for a Files API upload: the file part's name, type and size. */
function parseUpload(bytes: Buffer): Json {
  const text = bytes.toString("latin1");
  const head = /Content-Disposition:[^\r\n]*name="file"[^\r\n]*filename="([^"]*)"[^\r\n]*\r\n(?:Content-Type: ([^\r\n]+)\r\n)?\r\n/i.exec(text);
  if (!head) return { upload: true, error: "no file part" };
  const start = head.index + head[0].length;
  const end = text.indexOf("\r\n--", start);
  return { upload: true, filename: head[1], mime_type: head[2] ?? "application/octet-stream", size_bytes: (end === -1 ? text.length : end) - start };
}

function describe(req: RecordedRequest, reply: MockReply) {
  if ("sse" in reply) return "streamed a reply";
  if ("jsonl" in reply) return `sent ${reply.jsonl.length} batch results`;
  const json = reply.json as Json;
  if (json?.type === "error") return `${reply.status} ${(json.error as Json).type}`;
  if (json?.type === "message") {
    const tools = ((json.content as Json[]) ?? []).filter((b) => b.type === "tool_use").map((b) => b.name);
    return tools.length ? `stop_reason: tool_use (${tools.join(", ")})` : `stop_reason: ${String(json.stop_reason)}`;
  }
  if (json?.type === "message_batch") return `batch ${String(json.processing_status)}`;
  if (json?.type === "file") return `uploaded ${String(json.filename)} as ${String(json.id)}`;
  return `${reply.status ?? 200}`;
}

/** Start a mock Claude API on a free localhost port. `unref` lets the process exit while it's still listening. */
export async function startMockApi(respond: Responder, { unref = false } = {}): Promise<MockApi> {
  const requests: RecordedRequest[] = [];
  const onRequest = new Set<(req: RecordedRequest, summary: string) => void>();
  let url = "";

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    const raw = bytes.toString("utf8");
    let body: Json | null = null;
    if (String(req.headers["content-type"]).startsWith("multipart/form-data")) {
      body = parseUpload(bytes);
    } else {
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        body = isObj(parsed) ? parsed : null;
      } catch {}
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
    const recorded: RecordedRequest = { method: req.method ?? "GET", path: (req.url ?? "/").split("?")[0], headers, body };
    requests.push(recorded);
    if (requests.length > 500) requests.splice(0, requests.length - 500); // the shared practice server runs for hours

    let reply: MockReply;
    try {
      reply = raw && !body ? apiError(400, "invalid_request_error", "The request body is not valid JSON.") : await respond(recorded, { url });
    } catch (err) {
      reply = apiError(500, "api_error", err instanceof Error ? err.message : String(err));
    }
    const extra = { "request-id": "req_practice", ...("headers" in reply ? reply.headers : {}) };
    if ("sse" in reply) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", ...extra });
      res.end(reply.sse);
    } else if ("jsonl" in reply) {
      res.writeHead(200, { "Content-Type": "application/binary", ...extra });
      res.end(reply.jsonl.map((line) => JSON.stringify(line)).join("\n") + "\n");
    } else {
      res.writeHead(reply.status ?? 200, { "Content-Type": "application/json", ...extra });
      res.end(JSON.stringify(reply.json));
    }
    const summary = describe(recorded, reply);
    onRequest.forEach((listener) => listener(recorded, summary));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  if (unref) server.unref();
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    onRequest,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

// ---------- the practice responder: plausible canned answers ----------

const approxTokens = (v: unknown) => Math.max(1, Math.ceil(JSON.stringify(v ?? "").length / 4));

/** A made-up value that fits a JSON schema, for tool inputs and structured outputs. */
export function sampleFromSchema(schema: unknown, depth = 0): unknown {
  if (!isObj(schema) || depth > 6) return null;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if ("const" in schema) return schema.const;
  const variants = (schema.anyOf ?? schema.oneOf) as unknown[] | undefined;
  if (Array.isArray(variants) && variants.length) return sampleFromSchema(variants[0], depth + 1);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "object": {
      const props = isObj(schema.properties) ? schema.properties : {};
      return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, sampleFromSchema(v, depth + 1)]));
    }
    case "array":
      return [sampleFromSchema(schema.items, depth + 1)];
    case "string":
      return schema.format === "email" ? "someone@example.com" : schema.format === "date" ? "2026-01-01" : "example";
    case "integer":
    case "number":
      return 1;
    case "boolean":
      return true;
    case "null":
      return null;
    default:
      return isObj(schema.properties) ? sampleFromSchema({ ...schema, type: "object" }, depth) : null;
  }
}

/** The file IDs a request references in document or image blocks. */
export function fileIds(body: Json): string[] {
  const ids: string[] = [];
  for (const m of Array.isArray(body.messages) ? (body.messages as Json[]) : []) {
    for (const b of Array.isArray(m.content) ? (m.content as Json[]) : []) {
      if (isObj(b.source) && b.source.type === "file") ids.push(String(b.source.file_id));
    }
  }
  return ids;
}

/** "an image (image/png, 1 KB) and a PDF" — what media the last user turn carried. */
function mediaSummary(messages: Json[]) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const parts = (Array.isArray(last?.content) ? (last.content as Json[]) : []).flatMap((b) => {
    const src = isObj(b.source) ? b.source : null;
    if (!src || (b.type !== "image" && b.type !== "document")) return [];
    const kind = b.type === "image" ? "an image" : "a document";
    if (src.type === "base64") return [`${kind} (${String(src.media_type)}, ${Math.max(1, Math.round((String(src.data).length * 3) / 4 / 1024))} KB)`];
    if (src.type === "file") return [`${kind} by file_id ${String(src.file_id)}`];
    return [`${kind} (${String(src.type)} source)`];
  });
  return parts.join(" and ");
}

function lastUserText(messages: Json[]) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return ((last.content as Json[]) ?? [])
    .filter((b) => b.type === "text")
    .map((b) => String(b.text))
    .join(" ");
}

const hasCacheControl = (body: Json) => "cache_control" in body || JSON.stringify([body.system, body.tools, body.messages]).includes('"cache_control"');

// Which models accept which thinking and effort settings, from the per-model tables in
// https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting and /effort.
const MODEL_ID = /^claude-(fable|mythos|opus|sonnet|haiku)-[a-z0-9.-]+$/;
const EFFORT_MODELS = /^claude-(fable-5|mythos-(5|preview)|opus-(5|4-[5-8])|sonnet-(5|4-6))/;
const ADAPTIVE_MODELS = /^claude-(fable|mythos|opus-(5|4-[6-8])|sonnet-(5|4-6))/;
const BUDGET_REJECTED = /^claude-(fable|mythos-5|opus-(5|4-[78])|sonnet-5)/;
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

/** Looks like a Claude model ID the API would recognize (the practice API answers anything else with a 404). */
export const isModelId = (id: string) => MODEL_ID.test(id);

/** What the API says about the model and its thinking/effort settings, if it would reject them. */
export function modelProblem(body: Json): MockReply | null {
  const model = String(body.model);
  if (!MODEL_ID.test(model)) return apiError(404, "not_found_error", `model: ${model}`);
  const effort = isObj(body.output_config) ? body.output_config.effort : undefined;
  if (effort !== undefined) {
    if (!EFFORT_LEVELS.includes(String(effort))) return apiError(400, "invalid_request_error", `output_config.effort: must be one of ${EFFORT_LEVELS.join(", ")}`);
    if (!EFFORT_MODELS.test(model)) return apiError(400, "invalid_request_error", `output_config.effort: ${model} doesn't support the effort parameter`);
  }
  const thinking = isObj(body.thinking) ? body.thinking : null;
  if (thinking?.type === "adaptive" && !ADAPTIVE_MODELS.test(model)) {
    return apiError(400, "invalid_request_error", `thinking.type: "adaptive" isn't supported on ${model}. It supports extended thinking: { type: "enabled", budget_tokens }.`);
  }
  if (thinking?.type === "enabled") {
    if (BUDGET_REJECTED.test(model)) {
      return apiError(400, "invalid_request_error", `thinking.type: "enabled" isn't supported on ${model}. Use { type: "adaptive" } and set depth with output_config.effort.`);
    }
    const budget = Number(thinking.budget_tokens);
    if (!Number.isFinite(budget) || budget < 1024) return apiError(400, "invalid_request_error", "thinking.budget_tokens: must be at least 1024");
    if (typeof body.max_tokens === "number" && budget >= body.max_tokens) {
      return apiError(400, "invalid_request_error", "thinking.budget_tokens: must be less than max_tokens");
    }
  }
  return null;
}

/** The API's answer to a request it would reject (bad shape, unknown model, unsupported settings), or null. */
export function rejectRequest(body: Json | null, { counting = false } = {}): MockReply | null {
  const invalid = counting
    ? !body || typeof body.model !== "string" || !Array.isArray(body.messages)
      ? "Send a JSON body with model and messages."
      : toolPairingError(body.messages as Json[])
    : invalidMessagesRequest(body);
  if (invalid) return apiError(400, "invalid_request_error", invalid);
  return modelProblem(body!);
}

/** Checks every Messages API request body the way the real API would reject it. */
export function invalidMessagesRequest(body: Json | null): string | null {
  if (!body) return "Send a JSON body with model, max_tokens and messages.";
  if (typeof body.model !== "string" || !body.model) return "model: Field required";
  if (typeof body.max_tokens !== "number") return "max_tokens: Field required";
  if (!Array.isArray(body.messages)) return "messages: Field required";
  const first = body.messages[0] as Json | undefined;
  if (first && first.role !== "user" && first.role !== "system") return "messages: the first message must use the \"user\" role";
  return toolPairingError(body.messages as Json[]) ?? mediaError(body.messages as Json[]);
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** Image and document blocks need a source the API understands. */
function mediaError(messages: Json[]): string | null {
  for (const [i, m] of messages.entries()) {
    for (const block of Array.isArray(m?.content) ? (m.content as Json[]) : []) {
      if (block.type !== "image" && block.type !== "document") continue;
      const src = isObj(block.source) ? block.source : null;
      const where = `messages.${i}.content.${block.type}.source`;
      if (!src) return `${where}: Field required`;
      if (src.type === "base64") {
        if (typeof src.data !== "string" || !src.data) return `${where}.data: Field required`;
        if (block.type === "image" && !IMAGE_TYPES.includes(String(src.media_type))) {
          return `${where}.media_type: Input should be ${IMAGE_TYPES.map((t) => `'${t}'`).join(", ")}`;
        }
        if (block.type === "document" && src.media_type !== "application/pdf") return `${where}.media_type: Input should be 'application/pdf'`;
      } else if (src.type === "file") {
        if (typeof src.file_id !== "string" || !src.file_id) return `${where}.file_id: Field required`;
      } else if (!["url", "text", "content"].includes(String(src.type))) {
        return `${where}.type: unknown source type ${String(src.type)}`;
      }
    }
  }
  return null;
}

/** Every tool_use must be answered by a tool_result with the same id in the very next message, as the real API requires. */
export function toolPairingError(messages: Json[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    // And every tool_result must answer a tool_use from the message just before it.
    if (m?.role === "user" && Array.isArray(m.content)) {
      const resultIds = (m.content as Json[]).filter((b) => b.type === "tool_result").map((b) => String(b.tool_use_id));
      const prev = messages[i - 1];
      const asked = new Set(
        prev?.role === "assistant" && Array.isArray(prev.content)
          ? (prev.content as Json[]).filter((b) => b.type === "tool_use").map((b) => String(b.id))
          : [],
      );
      const unexpected = resultIds.filter((id) => !asked.has(id));
      if (unexpected.length) {
        return `messages.${i}.content: unexpected \`tool_use_id\` found in \`tool_result\` blocks: ${unexpected.join(", ")}. Each \`tool_result\` block must have a corresponding \`tool_use\` block in the previous message.`;
      }
    }
    if (m?.role !== "assistant" || !Array.isArray(m.content)) continue;
    const ids = (m.content as Json[]).filter((b) => b.type === "tool_use").map((b) => String(b.id));
    if (!ids.length) continue;
    const next = messages[i + 1];
    if (!next) continue; // a trailing assistant turn is allowed
    const answered = new Set(
      next.role === "user" && Array.isArray(next.content)
        ? (next.content as Json[]).filter((b) => b.type === "tool_result").map((b) => String(b.tool_use_id))
        : [],
    );
    const missing = ids.filter((id) => !answered.has(id));
    if (missing.length) {
      return `messages.${i + 1}: tool_use ids were found without tool_result blocks immediately after: ${missing.join(", ")}. Each tool_use block must have a corresponding tool_result block in the next message.`;
    }
  }
  return null;
}

export const thinkingBlock = (thinking: string): Json => ({ type: "thinking", thinking, signature: "practice-signature" });

/** A thinking block when the request asks to see thinking (summarized display, or extended thinking). */
function thinkingFor(body: Json): Json[] {
  const thinking = isObj(body.thinking) ? body.thinking : null;
  if (!thinking || thinking.type === "disabled") return [];
  const visible = thinking.display === "summarized" || (thinking.type === "enabled" && thinking.display !== "omitted");
  return [thinkingBlock(visible ? "(practice API) A summary of Claude's reasoning would appear here." : "")];
}

/** Answers like a very predictable Claude. One per practice server, so caching looks real across runs. */
export function practiceResponder(): Responder {
  const cachedPrefixes = new Set<string>();
  const batches = new Map<string, { requests: Json[]; polls: number; created: string }>();
  const files = new Map<string, Json>();

  function reply(body: Json): Json {
    const messages = body.messages as Json[];
    const last = messages.at(-1);
    const toolResults = Array.isArray(last?.content) ? (last.content as Json[]).filter((b) => b.type === "tool_result") : [];
    const tools = Array.isArray(body.tools) ? (body.tools as Json[]).filter((t) => typeof t.name === "string" && isObj(t.input_schema)) : [];
    const toolChoice = isObj(body.tool_choice) ? body.tool_choice.type : "auto";
    const format = isObj(body.output_config) && isObj(body.output_config.format) ? body.output_config.format : null;

    const prefix = JSON.stringify([body.system ?? null, body.tools ?? null]);
    const prefixTokens = approxTokens(prefix);
    let cacheWrite = 0;
    let cacheRead = 0;
    if (hasCacheControl(body)) {
      if (cachedPrefixes.has(prefix)) cacheRead = prefixTokens;
      else {
        cachedPrefixes.add(prefix);
        cacheWrite = prefixTokens;
      }
    }
    const usage = {
      input_tokens: Math.max(1, approxTokens(messages) + (cacheWrite || cacheRead ? 0 : prefixTokens)),
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
    };
    const model = String(body.model);

    if (toolResults.length) {
      const summary = toolResults.map((r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content))).join("; ");
      const text = `(practice API) Here's what your tools returned: ${summary.slice(0, 200)}. A real Claude would now write its answer from these results.`;
      return message([textBlock(text)], "end_turn", { ...usage, output_tokens: approxTokens(text) }, model);
    }
    if (tools.length && toolChoice !== "none") {
      const tool = toolChoice === "tool" ? (tools.find((t) => t.name === (body.tool_choice as Json).name) ?? tools[0]) : tools[0];
      const block = toolUseBlock(`toolu_practice_${Date.now().toString(36)}`, String(tool.name), sampleFromSchema(tool.input_schema) as Json);
      return message(
        [textBlock(`(practice API) I'll call ${String(tool.name)}.`), block],
        "tool_use",
        { ...usage, output_tokens: 30 },
        model,
      );
    }
    if (format?.type === "json_schema") {
      const text = JSON.stringify(sampleFromSchema(format.schema));
      return message([textBlock(text)], "end_turn", { ...usage, output_tokens: approxTokens(text) }, model);
    }
    const asked = lastUserText(messages).replace(/\s+/g, " ").trim();
    const media = mediaSummary(messages);
    const text = `(practice API) This is a canned reply, not Claude.${media ? ` I received ${media}.` : ""} You asked: "${asked.length > 120 ? asked.slice(0, 117) + "…" : asked}"`;
    return message([...thinkingFor(body), textBlock(text)], "end_turn", { ...usage, output_tokens: approxTokens(text) }, model);
  }

  function batchObject(id: string, url: string) {
    const b = batches.get(id)!;
    const ended = b.polls > 0;
    const n = b.requests.length;
    return {
      id,
      type: "message_batch",
      processing_status: ended ? "ended" : "in_progress",
      request_counts: { processing: ended ? 0 : n, succeeded: ended ? n : 0, errored: 0, canceled: 0, expired: 0 },
      created_at: b.created,
      ended_at: ended ? new Date().toISOString() : null,
      expires_at: new Date(Date.parse(b.created) + 24 * 3600_000).toISOString(),
      cancel_initiated_at: null,
      archived_at: null,
      results_url: ended ? `${url}/v1/messages/batches/${id}/results` : null,
    };
  }

  return (req, { url }) => {
    const { method, path, body } = req;
    if (method === "POST" && path === "/v1/files") {
      if (!body?.upload || body.error) return apiError(400, "invalid_request_error", "file: Field required");
      const id = `file_practice_${files.size + 1}`;
      const meta = {
        id,
        type: "file",
        filename: body.filename,
        mime_type: body.mime_type,
        size_bytes: body.size_bytes,
        created_at: new Date().toISOString(),
        downloadable: false,
      };
      files.set(id, meta);
      return { json: meta };
    }
    const fileMatch = path.match(/^\/v1\/files\/([\w-]+)$/);
    if (method === "GET" && fileMatch) {
      return files.has(fileMatch[1]) ? { json: files.get(fileMatch[1]) } : apiError(404, "not_found_error", `File not found: ${fileMatch[1]}`);
    }
    if (method === "POST" && path === "/v1/messages") {
      const rejected = rejectRequest(body);
      if (rejected) return rejected;
      const missing = fileIds(body!).find((id) => !files.has(id));
      if (missing) return apiError(404, "not_found_error", `File not found: ${missing}`);
      const msg = reply(body!);
      return body!.stream === true ? { sse: sseFor(msg) } : { json: msg };
    }
    if (method === "POST" && path === "/v1/messages/count_tokens") {
      const rejected = rejectRequest(body, { counting: true });
      if (rejected) return rejected;
      return { json: { input_tokens: approxTokens([body!.system, body!.tools, body!.messages]) } };
    }
    if (method === "POST" && path === "/v1/messages/batches") {
      const requests = Array.isArray(body?.requests) ? (body.requests as Json[]) : [];
      if (!requests.length) return apiError(400, "invalid_request_error", "requests: must contain at least one request");
      for (const r of requests) {
        if (typeof r.custom_id !== "string") return apiError(400, "invalid_request_error", "requests: every request needs a custom_id");
        const invalid = invalidMessagesRequest(isObj(r.params) ? r.params : null);
        if (invalid) return apiError(400, "invalid_request_error", `requests.${r.custom_id}.params: ${invalid}`);
        const problem = modelProblem(r.params as Json);
        if (problem) return problem;
      }
      const id = `msgbatch_practice_${batches.size + 1}`;
      batches.set(id, { requests, polls: -1, created: new Date().toISOString() });
      return { json: batchObject(id, url) };
    }
    const batchMatch = path.match(/^\/v1\/messages\/batches\/([\w-]+)(\/results)?$/);
    if (method === "GET" && batchMatch && batches.has(batchMatch[1])) {
      const [, id, results] = batchMatch;
      const b = batches.get(id)!;
      if (!results) {
        b.polls++; // the first check says "in_progress", the next says "ended", so polling code gets exercised
        return { json: batchObject(id, url) };
      }
      return {
        jsonl: b.requests.map((r) => ({
          custom_id: r.custom_id,
          result: { type: "succeeded", message: reply(r.params as Json) },
        })),
      };
    }
    return apiError(404, "not_found_error", `The practice API doesn't have ${method} ${path}.`);
  };
}

// ---------- one practice server for the Run & test panel ----------

const g = globalThis as unknown as { __practiceApi?: Promise<MockApi> };

/** The practice API that workspace programs run against. Started on first use; stops with the playground. */
export function ensurePracticeApi(): Promise<MockApi> {
  g.__practiceApi ??= startMockApi(practiceResponder(), { unref: true }).catch((err) => {
    g.__practiceApi = undefined;
    throw err;
  });
  return g.__practiceApi;
}

/** Environment that points @anthropic-ai/sdk at a mock API instead of api.anthropic.com. */
export function mockApiEnv(url: string): Record<string, string> {
  return { ANTHROPIC_BASE_URL: url, ANTHROPIC_API_KEY: "practice-key-not-a-real-key" };
}

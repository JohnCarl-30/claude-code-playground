"use client";

import { useEffect, useRef, useState } from "react";
import { unapproved, useApprovedCommands } from "@/lib/mcp-approvals";
import type { CustomMcpServer, InspectAction } from "@/lib/run-types";
import { ApproveCommands } from "./ApproveCommands";

// The MCP inspector: the playground acts as the MCP client (no Claude involved,
// so it's free). List what a server offers, call a tool, read a resource or get
// a prompt, and see every message exactly as it went over the wire.

type Wire = { direction: "sent" | "received"; message: Record<string, unknown> };
type Reply = { ok: boolean; result?: unknown; error?: string; messages: Wire[]; log: string; connected?: boolean; kind?: InspectAction["kind"] };

type JsonSchema = { type?: string | string[]; description?: string; enum?: unknown[]; properties?: Record<string, JsonSchema>; required?: string[] };
type Tool = { name: string; title?: string; description?: string; inputSchema?: JsonSchema };
type Resource = { uri: string; name?: string; title?: string; description?: string; mimeType?: string };
type Template = { uriTemplate: string; name?: string; description?: string };
type Prompt = { name: string; title?: string; description?: string; arguments?: { name: string; description?: string; required?: boolean }[] };
type Listing = {
  server?: { name?: string; version?: string };
  instructions?: string;
  tools: Tool[];
  resources: Resource[];
  resourceTemplates: Template[];
  prompts: Prompt[];
};

async function send(server: CustomMcpServer, action: InspectAction): Promise<Reply> {
  try {
    const res = await fetch("/api/mcp-inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server, action }) });
    const data = (await res.json()) as Reply & { error?: string };
    return res.ok ? data : { ok: false, error: data.error ?? `HTTP ${res.status}`, messages: [], log: "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), messages: [], log: "" };
  }
}

const typeOf = (s: JsonSchema) => (Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type) ?? "string";

/** Turn the form's text fields into the arguments object, following the tool's input schema. */
export function argumentsFor(schema: JsonSchema | undefined, values: Record<string, string>): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
    const raw = values[name] ?? "";
    const required = schema?.required?.includes(name);
    const type = typeOf(prop);
    if (type === "boolean") {
      if (raw) out[name] = raw === "true";
      else if (required) out[name] = false;
      continue;
    }
    if (raw.trim() === "") {
      if (required) return `"${name}" is required.`;
      continue;
    }
    if (type === "number" || type === "integer") {
      const n = Number(raw);
      if (!Number.isFinite(n) || (type === "integer" && !Number.isInteger(n))) return `"${name}" must be ${type === "integer" ? "a whole number" : "a number"}.`;
      out[name] = n;
    } else if (type === "string") {
      out[name] = raw;
    } else {
      try {
        out[name] = JSON.parse(raw);
      } catch {
        return `"${name}" must be valid JSON (${type}).`;
      }
    }
  }
  return out;
}

/** A one-line label for a JSON-RPC message. */
function summary(w: Wire) {
  const m = w.message;
  if (typeof m.method === "string") return `${m.method}${m.id !== undefined ? ` #${m.id}` : ""}`;
  if (m.error) return `error for #${m.id}`;
  return `result for #${m.id}`;
}

function Messages({ reply }: { reply: Reply }) {
  return (
    <section aria-label="Protocol messages" className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Messages · {reply.messages.length}
        {reply.connected ? " (new connection: the handshake comes first)" : ""}
      </p>
      <ol className="space-y-1">
        {reply.messages.map((w, i) => (
          <li key={i}>
            <details className="rounded-md border border-line bg-surface">
              <summary className="cursor-pointer px-2 py-1 font-mono text-[12px]">
                <span className={w.direction === "sent" ? "text-accent" : "text-ok"}>{w.direction === "sent" ? "→ sent" : "← received"}</span>{" "}
                {summary(w)}
              </summary>
              <pre className="max-h-64 overflow-auto border-t border-line p-2 font-mono text-[11px]">{JSON.stringify(w.message, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
      {reply.log.trim() && (
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-ink">Server log (stderr)</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[11px]">{reply.log.trim()}</pre>
        </details>
      )}
    </section>
  );
}

/** What came back, in readable form. */
function Outcome({ reply }: { reply: Reply }) {
  if (!reply.ok) return <p className="rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">{reply.error}</p>;
  const r = (reply.result ?? {}) as {
    isError?: boolean;
    content?: { type: string; text?: string; mimeType?: string; resource?: { uri?: string; text?: string } }[];
    contents?: { uri: string; text?: string; blob?: string; mimeType?: string }[];
    messages?: { role: string; content: { type: string; text?: string } }[];
  };
  const blocks = r.content ?? [];
  const texts = [
    ...blocks.map((b) => (b.type === "text" ? (b.text ?? "") : b.type === "resource" ? `[resource ${b.resource?.uri}]\n${b.resource?.text ?? ""}` : `[${b.type}${b.mimeType ? ` ${b.mimeType}` : ""}]`)),
    ...(r.contents ?? []).map((c) => (c.text !== undefined ? c.text : `[binary ${c.mimeType ?? ""}, ${c.blob?.length ?? 0} base64 characters]`)),
    ...(r.messages ?? []).map((m) => `${m.role}: ${m.content.type === "text" ? m.content.text : `[${m.content.type}]`}`),
  ];
  return (
    <div className={`rounded-md px-2 py-1.5 ${r.isError ? "bg-danger-soft text-danger" : "bg-surface-2"}`}>
      {r.isError && <p className="mb-1 text-xs font-medium">The tool reported an error (isError: true). Claude would see this and could try again.</p>}
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px]">{texts.join("\n\n") || "(empty)"}</pre>
    </div>
  );
}

type Tab = "tools" | "resources" | "prompts";

export function McpInspector({ server, onClose }: { server: CustomMcpServer; onClose: () => void }) {
  const approved = useApprovedCommands();
  const needsApproval = unapproved([server], approved);
  const [listing, setListing] = useState<Listing | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("tools");
  const [picked, setPicked] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [uri, setUri] = useState("");
  const started = useRef(false);

  async function act(action: InspectAction) {
    setBusy(true);
    const r = { ...(await send(server, action)), kind: action.kind };
    setReply(r);
    setBusy(false);
    return r;
  }
  async function list() {
    const r = await act({ kind: "list" });
    if (r.ok) setListing(r.result as Listing);
  }

  // Connect once approved (stdio) or right away (HTTP); hang up when the inspector closes.
  const waiting = needsApproval.length > 0;
  const serverKey = JSON.stringify(server);
  const latest = useRef(server);
  useEffect(() => {
    latest.current = server;
  });
  useEffect(() => {
    if (waiting || started.current) return;
    started.current = true;
    void send(latest.current, { kind: "list" }).then((r) => {
      setReply({ ...r, kind: "list" });
      if (r.ok) setListing(r.result as Listing);
    });
  }, [waiting]);
  useEffect(() => () => void send(JSON.parse(serverKey) as CustomMcpServer, { kind: "disconnect" }), [serverKey]);

  const tool = listing?.tools.find((t) => t.name === picked);
  const prompt = listing?.prompts.find((p) => p.name === picked);
  const args = tool ? argumentsFor(tool.inputSchema, values) : null;

  const counts: Record<Tab, number> = { tools: listing?.tools.length ?? 0, resources: (listing?.resources.length ?? 0) + (listing?.resourceTemplates.length ?? 0), prompts: listing?.prompts.length ?? 0 };
  const choose = (name: string) => {
    setPicked(name);
    setValues({});
  };

  return (
    <section aria-label={`Inspect ${server.name}`} className="space-y-3 rounded-lg border border-accent/40 bg-surface p-3">
      <div className="flex items-center gap-2">
        <p className="font-medium">
          Inspector · <span className="font-mono">{server.name}</span>
          {listing?.server?.name && (
            <span className="text-xs font-normal text-muted">
              {" "}
              ({listing.server.name} {listing.server.version})
            </span>
          )}
        </p>
        <button type="button" onClick={onClose} className="ml-auto h-8 rounded-md px-2 text-muted hover:bg-surface-2 hover:text-ink">
          Close
        </button>
      </div>
      <p className="text-xs text-muted">
        The playground is the MCP client here, so nothing goes to Claude and it costs nothing. The connection stays open while this is open
        {server.type === "stdio" ? " (the server keeps running, so it keeps its state)" : ""}.
      </p>

      {needsApproval.length > 0 ? (
        <ApproveCommands servers={needsApproval} before="the inspector starts it" onApprove={() => {}} onCancel={onClose} />
      ) : !listing ? (
        busy || !reply ? (
          <p className="text-sm text-muted">Connecting…</p>
        ) : (
          <div className="space-y-2">
            <Outcome reply={reply} />
            <button type="button" onClick={list} className="h-8 rounded-lg border border-line px-3 font-medium hover:bg-surface-2">
              Try again
            </button>
            <Messages reply={reply} />
          </div>
        )
      ) : (
        <>
          {listing.instructions && <p className="rounded-md bg-surface-2 px-2 py-1.5 text-xs">Server instructions: {listing.instructions}</p>}
          <div role="tablist" className="flex flex-wrap gap-1.5">
            {(["tools", "resources", "prompts"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  choose("");
                }}
                className={`h-8 rounded-full border px-3 text-[13px] ${tab === t ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"}`}
              >
                {t[0].toUpperCase() + t.slice(1)} · {counts[t]}
              </button>
            ))}
            <button type="button" onClick={list} disabled={busy} className="ml-auto h-8 rounded-lg px-2 text-xs text-muted hover:bg-surface-2 hover:text-ink">
              ↻ Refresh
            </button>
          </div>

          {tab === "tools" &&
            (listing.tools.length === 0 ? (
              <p className="text-xs text-muted">This server offers no tools.</p>
            ) : (
              <div className="space-y-2">
                <select aria-label="Tool" value={picked} onChange={(e) => choose(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface px-2 font-mono text-[13px]">
                  <option value="">Choose a tool…</option>
                  {listing.tools.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {tool && (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (typeof args !== "string" && args) void act({ kind: "call", name: tool.name, arguments: args });
                    }}
                  >
                    {tool.description && <p className="text-xs text-muted">{tool.description}</p>}
                    {Object.entries(tool.inputSchema?.properties ?? {}).map(([name, prop]) => {
                      const type = typeOf(prop);
                      const req = tool.inputSchema?.required?.includes(name);
                      const label = (
                        <span className="text-xs">
                          <span className="font-mono">{name}</span>
                          <span className="text-muted">
                            {" "}
                            {type}
                            {req ? " · required" : ""}
                            {prop.description ? ` · ${prop.description}` : ""}
                          </span>
                        </span>
                      );
                      const set = (v: string) => setValues((x) => ({ ...x, [name]: v }));
                      return (
                        <label key={name} className="block space-y-1">
                          {label}
                          {prop.enum ? (
                            <select value={values[name] ?? ""} onChange={(e) => set(e.target.value)} className="h-8 w-full rounded-md border border-line bg-surface px-2 font-mono text-[13px]">
                              <option value="">—</option>
                              {prop.enum.map((v) => (
                                <option key={String(v)} value={String(v)}>
                                  {String(v)}
                                </option>
                              ))}
                            </select>
                          ) : type === "boolean" ? (
                            <select value={values[name] ?? ""} onChange={(e) => set(e.target.value)} className="h-8 w-full rounded-md border border-line bg-surface px-2 font-mono text-[13px]">
                              <option value="">—</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : type === "object" || type === "array" ? (
                            <textarea
                              value={values[name] ?? ""}
                              onChange={(e) => set(e.target.value)}
                              placeholder={type === "array" ? "[ ]" : "{ }"}
                              rows={3}
                              className="w-full rounded-md border border-line bg-surface p-2 font-mono text-[12px]"
                            />
                          ) : (
                            <input
                              value={values[name] ?? ""}
                              onChange={(e) => set(e.target.value)}
                              inputMode={type === "number" || type === "integer" ? "decimal" : undefined}
                              className="h-8 w-full rounded-md border border-line bg-surface px-2 font-mono text-[13px]"
                            />
                          )}
                        </label>
                      );
                    })}
                    <p className="text-xs text-muted">
                      Sends: <code className="break-all font-mono">{typeof args === "string" ? args : JSON.stringify(args)}</code>
                    </p>
                    <button type="submit" disabled={busy || typeof args === "string"} className="h-8 rounded-lg bg-accent px-3 font-medium text-white hover:opacity-90 disabled:opacity-50">
                      {busy ? "Calling…" : "Call tool"}
                    </button>
                  </form>
                )}
              </div>
            ))}

          {tab === "resources" && (
            <div className="space-y-2">
              {listing.resources.length === 0 && listing.resourceTemplates.length === 0 && <p className="text-xs text-muted">This server offers no resources.</p>}
              <ul className="space-y-1">
                {listing.resources.map((r) => (
                  <li key={r.uri} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="font-mono">{r.uri}</span>
                      <span className="text-muted">
                        {r.title || r.name ? ` · ${r.title ?? r.name}` : ""}
                        {r.mimeType ? ` · ${r.mimeType}` : ""}
                      </span>
                    </span>
                    <button type="button" onClick={() => void act({ kind: "read", uri: r.uri })} disabled={busy} className="h-7 rounded-md border border-line px-2 hover:bg-surface-2">
                      Read
                    </button>
                  </li>
                ))}
              </ul>
              {listing.resourceTemplates.length > 0 && (
                <form
                  className="space-y-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (uri.trim()) void act({ kind: "read", uri: uri.trim() });
                  }}
                >
                  <p className="text-xs text-muted">Templates: {listing.resourceTemplates.map((t) => t.uriTemplate).join(", ")}. Fill one in to read it:</p>
                  <div className="flex gap-2">
                    <input value={uri} onChange={(e) => setUri(e.target.value)} aria-label="Resource URI" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 font-mono text-[13px]" />
                    <button type="submit" disabled={busy} className="h-8 rounded-md border border-line px-2 text-xs hover:bg-surface-2">
                      Read
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {tab === "prompts" &&
            (listing.prompts.length === 0 ? (
              <p className="text-xs text-muted">This server offers no prompts.</p>
            ) : (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (prompt) void act({ kind: "prompt", name: prompt.name, arguments: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")) });
                }}
              >
                <select aria-label="Prompt" value={picked} onChange={(e) => choose(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface px-2 font-mono text-[13px]">
                  <option value="">Choose a prompt…</option>
                  {listing.prompts.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {prompt && (
                  <>
                    {prompt.description && <p className="text-xs text-muted">{prompt.description}</p>}
                    {(prompt.arguments ?? []).map((a) => (
                      <label key={a.name} className="block space-y-1">
                        <span className="text-xs">
                          <span className="font-mono">{a.name}</span>
                          <span className="text-muted">
                            {a.required ? " · required" : ""}
                            {a.description ? ` · ${a.description}` : ""}
                          </span>
                        </span>
                        <input
                          value={values[a.name] ?? ""}
                          onChange={(e) => setValues((x) => ({ ...x, [a.name]: e.target.value }))}
                          className="h-8 w-full rounded-md border border-line bg-surface px-2 font-mono text-[13px]"
                        />
                      </label>
                    ))}
                    <button type="submit" disabled={busy} className="h-8 rounded-lg bg-accent px-3 font-medium text-white hover:opacity-90 disabled:opacity-50">
                      {busy ? "Getting…" : "Get prompt"}
                    </button>
                  </>
                )}
              </form>
            ))}

          {reply && (
            <div className="space-y-2 border-t border-line pt-3">
              {reply.kind !== "list" && <Outcome reply={reply} />}
              <Messages reply={reply} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

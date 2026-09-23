"use client";

import { useEffect, useRef, useState } from "react";
import type { TemplateInfo } from "@/lib/templates";

type ProcessStatus = { script: string | null; running: boolean; exitCode: number | null; logs: string[] };
type ApiResponse = { status?: number; statusText?: string; contentType?: string; body?: string; ms?: number; error?: string };

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function pretty(body: string, contentType: string) {
  if (!contentType.includes("json")) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** Run the starter's scripts, see output, send requests to the API, or plug in the MCP server. */
export function RunPanel({
  template,
  mcpConnected,
  onConnectMcp,
  onTryMcp,
}: {
  template: TemplateInfo;
  mcpConnected: boolean;
  onConnectMcp: () => void;
  onTryMcp: () => void;
}) {
  const [proc, setProc] = useState<ProcessStatus | null>(null);
  const [error, setError] = useState("");
  const logRef = useRef<HTMLPreElement>(null);

  // Poll while something is running.
  useEffect(() => {
    let stopped = false;
    async function poll() {
      const status = (await fetch("/api/process").then((r) => r.json()).catch(() => null)) as ProcessStatus | null;
      if (stopped || !status) return;
      setProc(status);
      if (status.running) setTimeout(poll, 1000);
    }
    poll();
    return () => {
      stopped = true;
    };
  }, [proc?.running, proc?.script]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [proc?.logs.length]);

  async function act(body: { action: "start"; script: string } | { action: "stop" }) {
    setError("");
    const res = await fetch("/api/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json()) as ProcessStatus & { error?: string };
    if (data.error) setError(data.error);
    else setProc(data);
  }

  const ownScript = proc && template.scripts.some((s) => s.id === proc.script);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {template.scripts.map((s) => {
          const isRunning = proc?.running && proc.script === s.id;
          return (
            <button
              key={s.id}
              onClick={() => act(isRunning ? { action: "stop" } : { action: "start", script: s.id })}
              className={`rounded-md px-3 py-1.5 font-medium ${
                isRunning ? "bg-danger text-white hover:opacity-90" : "border border-line hover:bg-surface-2"
              }`}
            >
              {isRunning ? (s.longRunning ? "■ Stop server" : "■ Stop") : `▶ ${s.label}`}
            </button>
          );
        })}
        {proc?.running && ownScript && (
          <span className="flex items-center gap-1.5 text-xs text-ok">
            <span className="size-2 animate-pulse rounded-full bg-ok" /> running
          </span>
        )}
        <code className="ml-auto hidden font-mono text-xs text-muted sm:inline">
          {template.scripts.map((s) => s.command.join(" ")).join("  ·  ")}
        </code>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      {ownScript && proc.logs.length > 0 && (
        <pre
          ref={logRef}
          aria-label="Program output"
          className="max-h-60 overflow-auto rounded-md bg-code-bg p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-code-text"
        >
          {proc.logs.join("\n")}
        </pre>
      )}

      {template.apiPort && <RequestTester port={template.apiPort} />}

      {template.mcpServer && (
        <div className="rounded-md border border-line bg-surface-2 p-3">
          <p className="font-medium">Use your MCP server in the playground</p>
          <p className="mt-0.5 text-muted">
            Adds <code className="font-mono">my-server</code> (<code className="font-mono">node server.js</code>, stdio) to the MCP servers
            tab, so Claude can call the tools you built. It restarts fresh on every run, so your latest code is used.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {mcpConnected ? (
              <>
                <span className="rounded-md bg-ok-soft px-3 py-1.5 font-medium text-ok">✓ Connected</span>
                <button onClick={onTryMcp} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">
                  Ask Claude to try my tools
                </button>
              </>
            ) : (
              <button onClick={onConnectMcp} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90">
                Connect to the playground
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RequestTester({ port }: { port: number }) {
  const [method, setMethod] = useState<(typeof METHODS)[number]>("GET");
  const [path, setPath] = useState("/health");
  const [body, setBody] = useState('{\n  "title": "Study for the certification"\n}');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const hasBody = method !== "GET" && method !== "DELETE";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/process/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, path, body: hasBody ? body : "" }),
      });
      setResponse((await res.json()) as ApiResponse);
    } catch (err) {
      setResponse({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  }

  const ok = response?.status !== undefined && response.status < 400;

  return (
    <form onSubmit={send} className="rounded-md border border-line p-3">
      <p className="mb-2 font-medium">
        Send a request <span className="font-normal text-muted">to http://localhost:{port}</span>
      </p>
      <div className="flex gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
          aria-label="HTTP method"
          className="rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[13px]"
        >
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          aria-label="Path"
          placeholder="/todos"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[13px]"
        />
        <button type="submit" disabled={sending} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50">
          {sending ? "…" : "Send"}
        </button>
      </div>
      {hasBody && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="JSON body"
          rows={4}
          className="mt-2 w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-[12px]"
        />
      )}
      {response && (
        <div className="mt-2">
          {response.error ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{response.error}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-mono font-medium ${ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="text-muted">{response.ms} ms</span>
              </p>
              <pre className="mt-1 max-h-60 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[12px] whitespace-pre-wrap">
                {pretty(response.body ?? "", response.contentType ?? "") || "(empty body)"}
              </pre>
            </>
          )}
        </div>
      )}
    </form>
  );
}

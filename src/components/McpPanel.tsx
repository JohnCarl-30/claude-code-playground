"use client";

import { useState } from "react";
import { MCP_PRESETS, type CustomMcpServer, type RunConfig } from "@/lib/run-types";

type TestResult = { name: string; status: string; error?: string; tools: { name: string; description?: string }[] };

const input = "h-9 w-full rounded-lg border border-line bg-surface px-2 font-mono text-[13px]";
const label = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted";

/** Split a command line on spaces, keeping "quoted parts" together. */
function splitCommand(line: string) {
  return (line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((part) => part.replace(/^["']|["']$/g, ""));
}

function describe(s: CustomMcpServer) {
  return s.type === "stdio" ? [s.command, ...s.args].join(" ") : s.url;
}

export function McpPanel({
  config,
  onChange,
  onServersChange,
  disabled,
}: {
  config: RunConfig;
  onChange: (next: RunConfig) => void;
  /** Called with the new list whenever you add or remove a server (so it can be remembered). */
  onServersChange: (servers: CustomMcpServer[]) => void;
  disabled?: boolean;
}) {
  const [type, setType] = useState<"stdio" | "http">("stdio");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [formError, setFormError] = useState("");
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [testError, setTestError] = useState("");

  const servers = config.mcpServers;
  const setServers = (next: CustomMcpServer[]) => {
    onChange({ ...config, mcpServers: next });
    onServersChange(next);
    setResults(null);
  };

  function add(server: CustomMcpServer) {
    setServers([...servers.filter((s) => s.name !== server.name), server]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(clean)) return setFormError("Name: lowercase letters, numbers, - or _.");
    if (clean === "demo") return setFormError('"demo" is reserved for the built-in server.');
    if (type === "stdio") {
      const [command, ...args] = splitCommand(target.trim());
      if (!command) return setFormError("Enter the command that starts the server, e.g. npx -y some-mcp-server");
      add({ name: clean, type: "stdio", command, args });
    } else {
      try {
        const url = new URL(target.trim());
        if (!/^https?:$/.test(url.protocol)) throw new Error();
        add({ name: clean, type: "http", url: url.toString() });
      } catch {
        return setFormError("Enter a full URL, e.g. https://example.com/mcp");
      }
    }
    setName("");
    setTarget("");
    setFormError("");
  }

  async function test() {
    setTesting(true);
    setTestError("");
    setResults(null);
    try {
      const res = await fetch("/api/mcp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servers }),
      });
      const data = (await res.json()) as { results?: TestResult[]; error?: string };
      if (data.error) setTestError(data.error);
      else setResults(data.results ?? []);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-6 text-sm disabled:opacity-60">
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--accent)]"
          checked={config.demoMcp}
          onChange={(e) => onChange({ ...config, demoMcp: e.target.checked })}
        />
        <span>
          <span className="block font-medium">Built-in demo server</span>
          <span className="block text-xs text-muted">roll_dice, get_weather (fake), save_note, list_notes. Runs inside this app.</span>
        </span>
      </label>

      <div>
        <span className={label}>Your servers</span>
        {servers.length === 0 ? (
          <p className="text-muted">None yet. Quick-add one below, or add your own.</p>
        ) : (
          <ul className="space-y-1.5">
            {servers.map((s) => {
              const result = results?.find((r) => r.name === s.name);
              return (
                <li key={s.name} className="rounded-lg border border-line bg-surface px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{s.name}</span>
                    <span className="rounded bg-surface-2 px-1.5 text-[11px] uppercase text-muted">{s.type}</span>
                    {result && (
                      <span
                        className={`rounded px-1.5 text-[11px] font-medium ${
                          result.status === "connected" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
                        }`}
                      >
                        {result.status}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setServers(servers.filter((x) => x.name !== s.name))}
                      className="ml-auto h-8 rounded-md px-2 text-muted hover:bg-surface-2 hover:text-danger"
                      aria-label={`Remove ${s.name}`}
                    >
                      Remove
                    </button>
                  </div>
                  <p className="mt-0.5 break-all font-mono text-xs text-muted">{describe(s)}</p>
                  {result?.error && <p className="mt-1 text-xs text-danger">{result.error}</p>}
                  {result && result.tools.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-muted hover:text-ink">{result.tools.length} tools</summary>
                      <ul className="mt-1 space-y-0.5">
                        {result.tools.map((t) => (
                          <li key={t.name}>
                            <span className="font-mono">{t.name}</span>
                            {t.description && <span className="text-muted"> · {t.description.split("\n")[0].slice(0, 120)}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {servers.length > 0 && (
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="h-9 rounded-lg border border-line px-3 font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              {testing ? "Connecting…" : "Test connection"}
            </button>
            <span className="text-xs text-muted">Connects and lists tools without using Claude.</span>
          </div>
        )}
        {testError && <p className="mt-2 text-xs text-danger">{testError}</p>}
      </div>

      <div>
        <span className={label}>Quick add</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {MCP_PRESETS.map((p) => {
            const added = servers.some((s) => s.name === p.server.name);
            return (
              <button
                key={p.server.name}
                type="button"
                onClick={() => add(p.server)}
                disabled={added}
                className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2 disabled:cursor-default disabled:opacity-60"
              >
                <span className="flex items-center justify-between font-medium">
                  {p.title}
                  <span className="text-xs text-muted">{added ? "added" : `+ ${p.server.type}`}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">{p.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={submit}>
        <span className={label}>Add your own</span>
        <div className="flex flex-wrap gap-2">
          {(["stdio", "http"] as const).map((t) => (
            <label
              key={t}
              className={`flex h-8 cursor-pointer items-center rounded-full border px-3 text-[13px] ${
                type === t ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted"
              }`}
            >
              <input type="radio" name="mcp-type" className="sr-only" checked={type === t} onChange={() => setType(t)} />
              {t === "stdio" ? "Local program (stdio)" : "Remote URL (HTTP)"}
            </label>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" aria-label="Server name" className={input} />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={type === "stdio" ? "npx -y @modelcontextprotocol/server-sequential-thinking" : "https://example.com/mcp"}
            aria-label={type === "stdio" ? "Command" : "URL"}
            className={input}
          />
          <button type="submit" className="h-9 rounded-lg bg-accent px-4 font-medium text-white hover:opacity-90">
            Add
          </button>
        </div>
        {formError && <p className="mt-1 text-xs text-danger">{formError}</p>}
        <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          A stdio server is a program that runs on your computer, so only add servers you trust. Tools from servers you add ask for
          your Allow before each call (or choose Always allow).
        </p>
      </form>
    </fieldset>
  );
}

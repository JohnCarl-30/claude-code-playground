"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, type CustomMcpServer, type RunConfig, type RunEvent } from "@/lib/run-types";
import { loadSavedMcpServers, mergeServers, saveMcpServers } from "@/lib/saved-mcp";
import { WORKSPACE_MCP_SERVER, findTemplate, type TemplateId } from "@/lib/templates";
import { markTried } from "@/lib/tried";
import { CodePreview } from "./CodePreview";
import { McpPanel } from "./McpPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SetupBanner } from "./SetupStatus";
import { Timeline, type Choice } from "./Timeline";
import { WorkspacePanel, type WorkspaceSnapshot } from "./WorkspacePanel";

type Status = "idle" | "running" | "done";
type Tab = "settings" | "mcp" | "code";

export function Runner({
  preset,
  exampleId,
  template,
  showRawByDefault = false,
}: {
  preset: Partial<RunConfig>;
  /** The starter this example needs; offers to switch when the workspace has another one. */
  template?: TemplateId;
  /** When set, a successful run marks this example as tried. */
  exampleId?: string;
  showRawByDefault?: boolean;
}) {
  const initial: RunConfig = { ...DEFAULT_CONFIG, ...preset };
  const [config, setConfig] = useState<RunConfig>(initial);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [showRaw, setShowRaw] = useState(showRawByDefault);
  const [tab, setTab] = useState<Tab | null>(null);
  const [answered, setAnswered] = useState<Record<string, Choice>>({});
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  async function loadWorkspace(init?: RequestInit) {
    const res = await fetch("/api/workspace", init).catch(() => null);
    const data = (await res?.json().catch(() => null)) as (WorkspaceSnapshot & { error?: string }) | null;
    if (data && !data.error) setWorkspace(data);
  }

  async function changeWorkspace(init: RequestInit) {
    setWorkspaceBusy(true);
    try {
      await loadWorkspace(init);
      setEvents([]);
    } finally {
      setWorkspaceBusy(false);
    }
  }

  const switchTemplate = (id: TemplateId) =>
    changeWorkspace({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: id }) });

  useEffect(() => {
    loadWorkspace();
  }, []);

  // MCP servers you added earlier come along to every example.
  useEffect(() => {
    const saved = loadSavedMcpServers();
    if (saved.length) setConfig((c) => ({ ...c, mcpServers: mergeServers(saved, c.mcpServers) }));
  }, []);

  const running = status === "running";

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    setEvents([]);
    setAnswered({});
    setStatus("running");
    setTab(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        setEvents([{ kind: "error", message: error }]);
        return;
      }

      // The route streams one JSON event per line.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        const parsed = lines.filter(Boolean).map((l) => JSON.parse(l) as RunEvent);
        if (parsed.length) setEvents((prev) => [...prev, ...parsed]);
        const succeeded = parsed.some((e) => e.kind === "sdk" && e.message.type === "result" && e.message.subtype === "success");
        if (exampleId && succeeded) markTried(exampleId);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setEvents((prev) => [...prev, { kind: "error", message: err instanceof Error ? err.message : String(err) }]);
      } else {
        setEvents((prev) => [...prev, { kind: "error", message: "Stopped." }]);
      }
    } finally {
      setStatus("done");
      loadWorkspace();
    }
  }

  async function decide(id: string, choice: Choice) {
    setAnswered((prev) => ({ ...prev, [id]: choice }));
    await fetch("/api/permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, allow: choice !== "deny", always: choice === "always" }),
    }).catch(() => {});
  }

  /** Remember the servers you added yourself (not ones an example brought along). */
  function rememberServers(servers: CustomMcpServer[]) {
    const alreadySaved = new Set(loadSavedMcpServers().map((s) => s.name));
    const fromExample = new Set((preset.mcpServers ?? []).map((s) => s.name));
    saveMcpServers(servers.filter((s) => !fromExample.has(s.name) || alreadySaved.has(s.name)));
  }

  const mcpConnected = config.mcpServers.some((s) => s.name === WORKSPACE_MCP_SERVER.name);
  function connectWorkspaceMcp() {
    setConfig((c) => ({ ...c, mcpServers: mergeServers(c.mcpServers, [WORKSPACE_MCP_SERVER]) }));
  }
  function tryWorkspaceMcp() {
    setConfig((c) => ({
      ...c,
      prompt: "List the tools you have from my-server, then try each one with a sensible example and show me the results.",
    }));
    promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    promptRef.current?.focus();
  }

  const needed = template ? findTemplate(template) : undefined;
  const mismatch = needed && workspace && workspace.template !== needed.id;

  const mcpCount = config.mcpServers.length + (config.demoMcp ? 1 : 0);
  const tabs: { id: Tab; label: string }[] = [
    { id: "settings", label: "⚙ Settings" },
    { id: "mcp", label: `⌁ MCP servers${mcpCount ? ` (${mcpCount})` : ""}` },
    { id: "code", label: "</> Code" },
  ];

  return (
    <div className="space-y-4">
      <SetupBanner />
      {mismatch && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info/30 bg-info-soft p-3 text-sm">
          <p className="mr-auto">
            This example uses the <strong>{needed.title}</strong> starter, but your workspace has{" "}
            <strong>{findTemplate(workspace.template)?.title}</strong>.
          </p>
          <button
            onClick={() => switchTemplate(needed.id)}
            disabled={workspaceBusy || running}
            className="rounded-md bg-info px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {workspaceBusy ? "Switching…" : `Switch to ${needed.title}`}
          </button>
          <span className="w-full text-xs text-muted">Switching replaces the files in your workspace.</span>
        </div>
      )}
      <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <label htmlFor="prompt" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
          Prompt
        </label>
        <textarea
          ref={promptRef}
          id="prompt"
          value={config.prompt}
          onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !running && config.prompt.trim()) run();
          }}
          rows={3}
          disabled={running}
          placeholder="Ask Claude to do something in the sample project…"
          className="field-sizing-content max-h-80 min-h-24 w-full resize-y rounded-md border border-line bg-bg px-3 py-2 leading-relaxed disabled:opacity-60"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {running ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!config.prompt.trim()}
              title="Ctrl/⌘ + Enter"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              ▶ Run {status === "done" ? "again" : ""}
            </button>
          )}
          <div role="tablist" aria-label="Run options" className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab((cur) => (cur === t.id ? null : t.id))}
                className={`rounded-md border px-3 py-2 text-sm ${
                  tab === t.id ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setConfig({ ...initial, mcpServers: mergeServers(loadSavedMcpServers(), initial.mcpServers) })}
            disabled={running}
            className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            Reset settings
          </button>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="accent-[var(--accent)]" />
            Show raw messages
          </label>
        </div>
        {tab && (
          <div role="tabpanel" className="mt-4 border-t border-line pt-4">
            {tab === "settings" && <SettingsPanel config={config} onChange={setConfig} disabled={running} />}
            {tab === "mcp" && <McpPanel config={config} onChange={setConfig} onServersChange={rememberServers} disabled={running} />}
            {tab === "code" && <CodePreview config={config} />}
          </div>
        )}
      </section>

      {(events.length > 0 || running) && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted">
            What happened
            {running && <span className="inline-block size-2 animate-pulse rounded-full bg-accent" aria-label="running" />}
          </h3>
          <Timeline events={events} showRaw={showRaw} running={running} answered={answered} onDecide={decide} />
          {running && events.length <= 1 && (
            <p className="mt-2 text-sm text-muted">Starting Claude Code… the first run can take a few seconds.</p>
          )}
        </section>
      )}

      <WorkspacePanel
        workspace={workspace}
        busy={workspaceBusy || running}
        onSwitch={switchTemplate}
        onReset={() => changeWorkspace({ method: "DELETE" })}
        mcpConnected={mcpConnected}
        onConnectMcp={connectWorkspaceMcp}
        onTryMcp={tryWorkspaceMcp}
      />
    </div>
  );
}

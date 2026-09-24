"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, type CustomMcpServer, type RunConfig, type RunEvent } from "@/lib/run-types";
import { loadSavedMcpServers, mergeServers, saveMcpServers, useSavedMcpServers } from "@/lib/saved-mcp";
import { WORKSPACE_MCP_SERVER, findTemplate, type TemplateId } from "@/lib/templates";
import { markTried } from "@/lib/tried";
import { CodePreview } from "./CodePreview";
import { McpPanel } from "./McpPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SetupBanner } from "./SetupStatus";
import { Timeline, type Choice } from "./Timeline";
import { WorkspacePanel, type WorkspaceSnapshot } from "./WorkspacePanel";

type Status = "idle" | "running" | "done";
/** One prompt you sent and everything that happened in response. */
type Turn = { prompt: string; events: RunEvent[] };
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
  const [turns, setTurns] = useState<Turn[]>([]);
  // Set after the first run: follow-ups resume this Claude Code session.
  const [sessionId, setSessionId] = useState<string | null>(null);
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

  /** Append events to the turn that's running. */
  function addEvents(events: RunEvent[]) {
    setTurns((ts) => (ts.length ? [...ts.slice(0, -1), { ...ts[ts.length - 1], events: [...ts[ts.length - 1].events, ...events] }] : ts));
  }

  function newConversation(prompt = initial.prompt) {
    setTurns([]);
    setSessionId(null);
    setConfig((c) => ({ ...c, prompt }));
  }

  async function changeWorkspace(init: RequestInit) {
    setWorkspaceBusy(true);
    try {
      await loadWorkspace(init);
      // The conversation was about the old files, so start a fresh one.
      newConversation();
    } finally {
      setWorkspaceBusy(false);
    }
  }

  const switchTemplate = (id: TemplateId) =>
    changeWorkspace({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: id }) });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace")
      .then((r) => r.json())
      .then((data: WorkspaceSnapshot & { error?: string }) => {
        if (!cancelled && !data.error) setWorkspace(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // MCP servers you added earlier come along to every example.
  const savedServers = useSavedMcpServers();
  const effective: RunConfig = { ...config, mcpServers: mergeServers(savedServers, config.mcpServers) };

  const running = status === "running";

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    setTurns((ts) => [...ts, { prompt: config.prompt, events: [] }]);
    setStatus("running");
    setTab(null);
    let succeeded = false;

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...effective, resumeSessionId: sessionId ?? undefined }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        addEvents([{ kind: "error", message: error }]);
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
        if (parsed.length) addEvents(parsed);
        for (const e of parsed) {
          if (e.kind !== "sdk") continue;
          if (typeof e.message.session_id === "string") setSessionId(e.message.session_id);
          if (e.message.type === "result" && e.message.subtype === "success") succeeded = true;
        }
      }
    } catch (err) {
      addEvents([{ kind: "error", message: controller.signal.aborted ? "Stopped." : err instanceof Error ? err.message : String(err) }]);
    } finally {
      setStatus("done");
      loadWorkspace();
      if (succeeded) {
        if (exampleId) markTried(exampleId);
        setConfig((c) => ({ ...c, prompt: "" })); // ready for a follow-up
      }
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

  const mcpConnected = effective.mcpServers.some((s) => s.name === WORKSPACE_MCP_SERVER.name);
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

  const mcpCount = effective.mcpServers.length + (config.demoMcp ? 1 : 0);
  const tabs: { id: Tab; label: string; hint: string }[] = [
    { id: "settings", label: "Settings", hint: `${config.permissionMode} · ${config.tools.length} tools` },
    { id: "mcp", label: "MCP", hint: mcpCount ? `${mcpCount} server${mcpCount === 1 ? "" : "s"}` : "none" },
    { id: "code", label: "Code", hint: "SDK call" },
  ];
  const TAB_TITLE: Record<Tab, string> = { settings: "Run settings", mcp: "MCP servers", code: "The same run in code" };

  return (
    <div className="space-y-6">
      <SetupBanner />
      {mismatch && (
        <div className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info-soft p-4 text-sm sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-1">
            <p>
              This example uses the <strong>{needed.title}</strong> starter, but your workspace has{" "}
              <strong>{findTemplate(workspace.template)?.title}</strong>.
            </p>
            <p className="text-xs text-muted">Your current files are kept and come back when you switch back.</p>
          </div>
          <button
            onClick={() => switchTemplate(needed.id)}
            disabled={workspaceBusy || running}
            className="h-9 shrink-0 rounded-lg bg-info px-4 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {workspaceBusy ? "Switching…" : `Switch to ${needed.title}`}
          </button>
        </div>
      )}
      {turns.length > 0 && (
        <section aria-label="Conversation" className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3">
            <h2 className="mr-auto text-sm font-medium">
              Conversation <span className="font-normal text-muted">· {turns.length} {turns.length === 1 ? "turn" : "turns"}</span>
            </h2>
            <label className="flex h-8 cursor-pointer items-center gap-2 text-sm text-muted hover:text-ink">
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="accent-[var(--accent)]" />
              Show raw messages
            </label>
            {!running && (
              <button
                onClick={() => newConversation("")}
                title="Forget this conversation and start over (your files stay as they are)"
                className="h-8 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2"
              >
                ＋ New conversation
              </button>
            )}
          </div>
          <div className="space-y-8">
            {turns.map((turn, i) => {
              const last = i === turns.length - 1;
              return (
                <div key={i} className="space-y-3">
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 whitespace-pre-wrap text-white">{turn.prompt}</p>
                  </div>
                  <Timeline followUp={i > 0} events={turn.events} showRaw={showRaw} running={running && last} answered={answered} onDecide={decide} />
                  {running && last && (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <span className="inline-block size-2 animate-pulse rounded-full bg-accent" aria-hidden />
                      {turn.events.length <= 1 ? "Starting Claude Code… the first run can take a few seconds." : "Working…"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section
        aria-label="Composer"
        className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm transition-shadow focus-within:border-accent/50 focus-within:shadow-md"
      >
        <label htmlFor="prompt" className="sr-only">
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
          placeholder={sessionId ? "Ask a follow-up… Claude remembers this conversation." : "Ask Claude to do something in your workspace…"}
          className="field-sizing-content block max-h-80 min-h-28 w-full resize-none bg-transparent px-4 pt-4 pb-2 leading-relaxed placeholder:text-muted/80 focus:outline-none focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-2 px-3 pt-1 pb-3">
          <div role="tablist" aria-label="Run options" className="flex min-w-0 flex-wrap items-center gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="run-options-panel"
                onClick={() => setTab((cur) => (cur === t.id ? null : t.id))}
                className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
                  tab === t.id ? "border-accent bg-accent-soft text-accent" : "border-line text-ink/85 hover:bg-surface-2"
                }`}
              >
                <span className="font-medium">{t.label}</span>
                <span className={`hidden text-xs sm:inline ${tab === t.id ? "text-accent/80" : "text-muted"}`}>{t.hint}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <kbd className="hidden font-sans text-xs text-muted md:inline">⌘/Ctrl + Enter</kbd>
            {running ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="h-9 rounded-lg bg-danger px-4 text-sm font-medium text-white hover:opacity-90"
              >
                ■ Stop
              </button>
            ) : (
              <button
                onClick={run}
                disabled={!config.prompt.trim()}
                title="Ctrl/⌘ + Enter"
                aria-label={sessionId ? "▶ Send follow-up" : "▶ Run"}
                className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {sessionId ? (
                  <>
                    ▶ Send<span className="hidden sm:inline"> follow-up</span>
                  </>
                ) : (
                  "▶ Run"
                )}
              </button>
            )}
          </div>
        </div>
        {tab && (
          <div id="run-options-panel" role="tabpanel" aria-label={TAB_TITLE[tab]} className="border-t border-line bg-bg/40 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <h3 className="mr-auto text-sm font-medium">{TAB_TITLE[tab]}</h3>
              {tab === "settings" && (
                <button
                  onClick={() => setConfig({ ...initial, prompt: config.prompt })}
                  disabled={running}
                  className="h-8 rounded-lg px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  Reset settings
                </button>
              )}
              <button
                onClick={() => setTab(null)}
                aria-label="Close panel"
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                ✕
              </button>
            </div>
            {tab === "settings" && <SettingsPanel config={config} onChange={setConfig} disabled={running} />}
            {tab === "mcp" && <McpPanel config={effective} onChange={setConfig} onServersChange={rememberServers} disabled={running} />}
            {tab === "code" && <CodePreview config={effective} sessionId={sessionId} />}
          </div>
        )}
      </section>

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

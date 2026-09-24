"use client";

import { useEffect, useRef, useState } from "react";
import type { ClaudeConfig } from "@/lib/claude-config";
import { DEFAULT_CONFIG, type CustomMcpServer, type RunConfig, type SessionEvent } from "@/lib/run-types";
import { loadSavedMcpServers, mergeServers, saveMcpServers, useSavedMcpServers } from "@/lib/saved-mcp";
import { WORKSPACE_MCP_SERVER, findTemplate, type TemplateId } from "@/lib/templates";
import { markTried } from "@/lib/tried";
import { CodePreview } from "./CodePreview";
import { McpPanel } from "./McpPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SetupBanner } from "./SetupStatus";
import { Timeline, type Choice } from "./Timeline";
import { useLiveSession } from "./useLiveSession";
import { WorkspacePanel, type WorkspaceSnapshot } from "./WorkspacePanel";

/** One message you sent and everything that happened in response. */
type Turn = { prompt: string; mode: "start" | "steer" | "queue"; events: SessionEvent[] };
type Tab = "settings" | "mcp" | "code";

// Settings that are fixed when a session starts; the rest (model, permission mode) change live.
const RESTART_FIELDS = ["tools", "demoMcp", "mcpServers", "projectConfig", "subagents", "team", "hooks", "appendSystemPrompt", "maxTurns", "maxBudgetUsd"] as const;

/** Split the session's events into turns, one per message you sent. */
export function toTurns(events: SessionEvent[]): Turn[] {
  const turns: Turn[] = [];
  const before: SessionEvent[] = [];
  // After you steer, the interrupted task still reports a result: it belongs to the turn before.
  let owedToPrevious = 0;
  for (const e of events) {
    if (e.kind === "user_prompt") {
      if (e.mode === "steer" && turns.length) owedToPrevious++;
      turns.push({ prompt: e.text, mode: e.mode, events: [] });
    } else if (owedToPrevious && e.kind === "sdk" && e.message.type === "result" && turns.length > 1) {
      owedToPrevious--;
      turns[turns.length - 2].events.push({ kind: "control", note: "You steered Claude to your next message.", seq: -1 }, e);
    } else if (turns.length) turns[turns.length - 1].events.push(e);
    else before.push(e);
  }
  if (turns.length) turns[0].events.unshift(...before);
  return turns;
}

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
  // The settings the live session started with, to spot changes that need a new one.
  const [sessionConfig, setSessionConfig] = useState<RunConfig | null>(null);
  const [starting, setStarting] = useState(false);
  const [sendError, setSendError] = useState("");
  const [showRaw, setShowRaw] = useState(showRawByDefault);
  const [tab, setTab] = useState<Tab | null>(null);
  const [answered, setAnswered] = useState<Record<string, Choice>>({});
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const live = useLiveSession({
    onResult: (success) => {
      if (success && exampleId) markTried(exampleId);
      void loadWorkspace(); // Claude may have changed files
    },
  });
  const turns = toTurns(live.events);
  const running = live.working || starting;
  const workspacePath = live.events.find((e) => e.kind === "session")?.workspace;

  async function loadWorkspace(init?: RequestInit) {
    const res = await fetch("/api/workspace", init).catch(() => null);
    const data = (await res?.json().catch(() => null)) as (WorkspaceSnapshot & { error?: string }) | null;
    if (data && !data.error) setWorkspace(data);
    await loadClaudeConfig();
  }

  async function loadClaudeConfig(init?: RequestInit) {
    const res = await fetch("/api/workspace/config", init).catch(() => null);
    const data = (await res?.json().catch(() => null)) as (ClaudeConfig & { config?: ClaudeConfig; error?: string }) | null;
    if (data && !data.error) setClaudeConfig(data.config ?? data);
  }

  function newConversation(prompt = initial.prompt) {
    live.end();
    setSessionConfig(null);
    setSendError("");
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
    fetch("/api/workspace/config")
      .then((r) => r.json())
      .then((data: ClaudeConfig & { error?: string }) => {
        if (!cancelled && !data.error) setClaudeConfig(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // MCP servers you added earlier come along to every example.
  const savedServers = useSavedMcpServers();
  const effective: RunConfig = { ...config, mcpServers: mergeServers(savedServers, config.mcpServers) };

  /**
   * Send what's in the prompt box. With no live session this starts one; during
   * a session it's a follow-up, and while Claude works you choose to steer or queue.
   */
  async function submit(how: "steer" | "queue" = "queue") {
    const text = config.prompt.trim();
    if (!text || starting) return;
    setSendError("");
    if (!live.active) {
      setStarting(true);
      setTab(null);
      const error = await live.start({ ...effective, prompt: text });
      setStarting(false);
      if (error) return setSendError(error);
      setSessionConfig(effective);
    } else {
      const error = await live.send(text, how);
      if (error) return setSendError(error);
    }
    setConfig((c) => ({ ...c, prompt: "" }));
  }

  /** Settings changes: model and permission mode apply to the live session right away. */
  function changeSettings(next: RunConfig) {
    if (live.active) {
      if (next.permissionMode !== config.permissionMode) void live.control("permissionMode", next.permissionMode);
      if (next.model !== config.model) void live.control("model", next.model);
    }
    setConfig(next);
  }
  const restartNeeded =
    live.active && !!sessionConfig && RESTART_FIELDS.some((k) => JSON.stringify(sessionConfig[k]) !== JSON.stringify(effective[k]));

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

  // Slash commands and skills from .claude/ can be run as /name, like in the terminal.
  const slashItems = [
    ...(claudeConfig?.commands ?? []).map((c) => ({ name: c.name, hint: c.detail ?? "", description: c.description })),
    ...(claudeConfig?.skills ?? []).map((s) => ({ name: s.name, hint: "skill", description: s.description })),
  ];
  const typedCommand = /^\/([\w-]*)$/.exec(config.prompt.trim())?.[1];
  const suggestions = typedCommand !== undefined ? slashItems.filter((i) => i.name.startsWith(typedCommand)) : [];
  const usedCommand = /^\/([\w-]+)/.exec(config.prompt.trim())?.[1];
  const commandNeedsConfig = !!usedCommand && !config.projectConfig && slashItems.some((i) => i.name === usedCommand);

  function insertCommand(name: string) {
    setConfig((c) => ({ ...c, prompt: `/${name} ` }));
    promptRef.current?.focus();
  }

  const projectNames = {
    commands: (claudeConfig?.commands ?? []).map((c) => c.name),
    skills: (claudeConfig?.skills ?? []).map((c) => c.name),
    agents: (claudeConfig?.agents ?? []).map((c) => c.name),
  };

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
            disabled={workspaceBusy || live.working}
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
              Conversation <span className="font-normal text-muted">· {turns.length} {turns.length === 1 ? "message" : "messages"}</span>
              {live.active && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-normal ${live.working ? "bg-accent-soft text-accent" : "bg-ok-soft text-ok"}`}>
                  {live.working ? "● Claude is working" : "● live session"}
                </span>
              )}
            </h2>
            <label className="flex h-8 cursor-pointer items-center gap-2 text-sm text-muted hover:text-ink">
              <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="accent-[var(--accent)]" />
              Show raw messages
            </label>
            <button
              onClick={() => newConversation("")}
              title="End this Claude Code session and start over (your files stay as they are)"
              className="h-8 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2"
            >
              ＋ New conversation
            </button>
          </div>
          <div className="space-y-8">
            {turns.map((turn, i) => {
              const last = i === turns.length - 1;
              return (
                <div key={i} className="space-y-3">
                  <div className="flex flex-col items-end gap-1">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 whitespace-pre-wrap text-white">{turn.prompt}</p>
                    {turn.mode !== "start" && (
                      <span className="text-xs text-muted">
                        {turn.mode === "steer" ? "↪ sent while Claude was working: it switched to this" : "⏎ queued until Claude finished"}
                      </span>
                    )}
                  </div>
                  <Timeline
                    followUp={i > 0}
                    project={projectNames}
                    workspacePath={workspacePath}
                    events={turn.events}
                    streamingText={last ? live.streaming : ""}
                    showRaw={showRaw}
                    running={live.working && last}
                    answered={answered}
                    onDecide={decide}
                  />
                  {live.working && last && (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <span className="inline-block size-2 animate-pulse rounded-full bg-accent" aria-hidden />
                      {turn.events.length <= 2 ? "Starting Claude Code… the first message can take a few seconds." : "Working… you can type a message to steer or queue."}
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
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit(e.shiftKey ? "steer" : "queue");
            }
          }}
          rows={3}
          disabled={starting}
          placeholder={
            live.working
              ? "Claude is working… type to steer it (⇧⌘/Ctrl + Enter) or queue a message for when it's done."
              : live.active
                ? "Ask a follow-up… this is the same live session, so Claude remembers everything."
                : "Ask Claude to do something in your workspace… (type / for your project's commands)"
          }
          className="field-sizing-content block max-h-80 min-h-28 w-full resize-none bg-transparent px-4 pt-4 pb-2 leading-relaxed placeholder:text-muted/80 focus:outline-none focus-visible:outline-none disabled:opacity-60"
        />
        {suggestions.length > 0 && (
          <ul aria-label="Slash commands" className="mx-3 mb-1 overflow-hidden rounded-lg border border-line bg-surface text-sm shadow-sm">
            {suggestions.map((s) => (
              <li key={s.name}>
                <button onClick={() => insertCommand(s.name)} className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-surface-2">
                  <span className="font-mono font-medium">/{s.name}</span>
                  <span className="font-mono text-xs text-muted">{s.hint}</span>
                  <span className="truncate text-xs text-muted">{s.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {commandNeedsConfig && (
          <p className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-1.5 text-xs text-warn">
            /{usedCommand} comes from .claude/, which is only loaded with project config.
            <button onClick={() => setConfig((c) => ({ ...c, projectConfig: true }))} className="font-medium underline">
              Turn it on
            </button>
          </p>
        )}
        {restartNeeded && (
          <p className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-lg bg-info-soft px-3 py-1.5 text-xs text-info">
            Tools, MCP servers, project config and similar settings are fixed when a session starts. Model and permission mode change live.
            <button onClick={() => newConversation(config.prompt)} className="font-medium underline">
              Start a new conversation to apply
            </button>
          </p>
        )}
        {sendError && <p className="mx-3 mb-1 rounded-lg bg-danger-soft px-3 py-1.5 text-xs text-danger">{sendError}</p>}
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
          <div className="ml-auto flex items-center gap-2">
            {live.working ? (
              <>
                <button
                  onClick={() => void live.control("interrupt")}
                  title="Stop the current turn (like Esc). The session stays open."
                  className="h-9 rounded-lg bg-danger px-3 text-sm font-medium text-white hover:opacity-90"
                >
                  ■ Stop
                </button>
                <button
                  onClick={() => void submit("steer")}
                  disabled={!config.prompt.trim()}
                  title="Send now: Claude drops the current task and answers this (⇧⌘/Ctrl + Enter)"
                  className="h-9 rounded-lg border border-accent px-3 text-sm font-medium text-accent hover:bg-accent-soft disabled:opacity-40"
                >
                  ↪ Steer
                </button>
                <button
                  onClick={() => void submit("queue")}
                  disabled={!config.prompt.trim()}
                  title="Send when Claude finishes the current task (⌘/Ctrl + Enter)"
                  className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  ⏎ Queue
                </button>
              </>
            ) : (
              <>
                <kbd className="hidden font-sans text-xs text-muted md:inline">⌘/Ctrl + Enter</kbd>
                <button
                  onClick={() => void submit()}
                  disabled={!config.prompt.trim() || starting}
                  title="Ctrl/⌘ + Enter"
                  aria-label={live.active ? "▶ Send follow-up" : "▶ Run"}
                  className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  {starting ? (
                    "Starting…"
                  ) : live.active ? (
                    <>
                      ▶ Send<span className="hidden sm:inline"> follow-up</span>
                    </>
                  ) : (
                    "▶ Run"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
        {tab && (
          <div id="run-options-panel" role="tabpanel" aria-label={TAB_TITLE[tab]} className="border-t border-line bg-bg/40 p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <h3 className="mr-auto text-sm font-medium">{TAB_TITLE[tab]}</h3>
              {tab === "settings" && (
                <button
                  onClick={() => changeSettings({ ...initial, prompt: config.prompt })}
                  disabled={starting}
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
            {tab === "settings" && <SettingsPanel config={config} onChange={changeSettings} disabled={starting} />}
            {tab === "mcp" && <McpPanel config={effective} onChange={setConfig} onServersChange={rememberServers} disabled={starting} />}
            {tab === "code" && <CodePreview config={effective} />}
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
        claudeConfig={claudeConfig}
        projectConfig={config.projectConfig}
        onToggleProjectConfig={(on) => setConfig((c) => ({ ...c, projectConfig: on }))}
        onUseCommand={(name) => {
          setConfig((c) => ({ ...c, projectConfig: true }));
          insertCommand(name);
          promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        onAddStarterConfig={() =>
          loadClaudeConfig({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add-starter-config" }),
          }).then(() => loadWorkspace())
        }
        onFilesChanged={() => loadWorkspace()}
      />
    </div>
  );
}

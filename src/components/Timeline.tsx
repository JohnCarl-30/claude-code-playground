"use client";

import type { ReactNode } from "react";
import type { RunEvent, SdkMessageLike } from "@/lib/run-types";

type Block = { type: string; [key: string]: unknown };

export type Choice = "allow" | "always" | "deny";
const CHOICE_LABEL: Record<Choice, string> = { allow: "Allow", always: "Always allow", deny: "Deny" };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Show paths relative to workspace/ so beginners aren't staring at /Users/... */
function tidy(value: string, workspace: string) {
  return workspace ? value.split(workspace + "/").join("").split(workspace).join("workspace/") : value;
}

function toolSummary(name: string, input: Record<string, unknown>, workspace: string) {
  const pick = input.command ?? input.file_path ?? input.pattern ?? input.path ?? input.url ?? input.query ?? input.description;
  if (typeof pick === "string") return tidy(pick, workspace);
  const json = JSON.stringify(input);
  return json === "{}" ? "" : json;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c: Block) => (c.type === "text" ? str(c.text) : `[${c.type}]`)).join("\n");
  }
  return JSON.stringify(content);
}

function Raw({ value }: { value: unknown }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer select-none text-muted hover:text-ink">raw JSON</summary>
      <pre className="mt-1 max-h-96 overflow-auto rounded-md bg-code-bg p-2 font-mono text-[12px] text-code-text">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function Card({
  tone = "plain",
  icon,
  title,
  sub,
  indent,
  children,
}: {
  tone?: "plain" | "accent" | "ok" | "warn" | "danger" | "hook" | "info";
  icon: string;
  title: ReactNode;
  sub?: ReactNode;
  indent?: boolean;
  children?: ReactNode;
}) {
  const tones = {
    plain: "border-line bg-surface",
    accent: "border-accent/40 bg-accent-soft",
    ok: "border-ok/30 bg-ok-soft",
    warn: "border-warn/40 bg-warn-soft",
    danger: "border-danger/40 bg-danger-soft",
    hook: "border-hook/30 bg-hook-soft",
    info: "border-info/30 bg-info-soft",
  };
  return (
    <li className={`rounded-lg border px-3 py-2.5 ${tones[tone]} ${indent ? "ml-6 border-l-4" : ""}`}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="leading-6">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 leading-6">
            <span className="font-medium">{title}</span>
            {sub && <span className="min-w-0 break-all font-mono text-xs text-muted">{sub}</span>}
          </div>
          {children}
        </div>
      </div>
    </li>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[12px]">{children}</span>;
}

// Each subagent gets its own tag color so parallel work is easy to tell apart.
const SUBAGENT_COLORS = ["bg-hook", "bg-info", "bg-ok", "bg-warn", "bg-danger"];

type AgentInfo = { name: string; color: string };

/** Map each Agent tool_use id to the subagent it started, e.g. "bug-hunter". */
function subagentsById(events: RunEvent[]) {
  const map: Record<string, AgentInfo> = {};
  const colors: Record<string, string> = {};
  for (const e of events) {
    if (e.kind !== "sdk" || e.message.type !== "assistant") continue;
    const content = (e.message.message as { content?: Block[] } | undefined)?.content ?? [];
    for (const b of content) {
      if (b.type !== "tool_use" || (b.name !== "Agent" && b.name !== "Task")) continue;
      const name = str((b.input as Record<string, unknown> | undefined)?.subagent_type) || "subagent";
      colors[name] ??= SUBAGENT_COLORS[Object.keys(colors).length % SUBAGENT_COLORS.length];
      map[str(b.id)] = { name, color: colors[name] };
    }
  }
  return map;
}

function SdkMessage({
  message,
  workspace,
  showRaw,
  agents,
}: {
  message: SdkMessageLike;
  workspace: string;
  showRaw: boolean;
  agents: Record<string, AgentInfo>;
}) {
  const raw = showRaw ? <Raw value={message} /> : null;
  const inner = (message.message ?? {}) as { content?: unknown };
  const isSub = message.parent_tool_use_id != null;
  const agent = isSub ? (agents[String(message.parent_tool_use_id)] ?? { name: "subagent", color: "bg-hook" }) : null;
  const subTag = agent ? (
    <span className={`rounded px-1.5 font-mono text-[11px] font-medium text-white ${agent.color}`}>{agent.name}</span>
  ) : null;

  if (message.type === "system" && message.subtype === "init") {
    const tools = (message.tools as string[]) ?? [];
    const servers = (message.mcp_servers as { name: string; status: string }[]) ?? [];
    const auth = message.apiKeySource === "none" ? "Your Claude Code login (no API key)" : String(message.apiKeySource);
    return (
      <Card tone="info" icon="▶" title="Session started" sub={`${message.model} · ${message.permissionMode} mode`}>
        <dl className="mt-1.5 grid gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <dt className="text-muted">Auth</dt>
          <dd>{auth}</dd>
          <dt className="text-muted">Tools</dt>
          <dd className="flex flex-wrap gap-1">{tools.length ? tools.map((t) => <Chip key={t}>{t}</Chip>) : "none"}</dd>
          {servers.length > 0 && (
            <>
              <dt className="text-muted">MCP</dt>
              <dd className="flex flex-wrap gap-1">
                {servers.map((s) => (
                  <Chip key={s.name}>
                    {s.name}: {s.status}
                  </Chip>
                ))}
              </dd>
            </>
          )}
        </dl>
        {raw}
      </Card>
    );
  }

  if (message.type === "assistant" && Array.isArray(inner.content)) {
    return (
      <>
        {(inner.content as Block[]).map((block, i) => {
          if (block.type === "text") {
            return (
              <Card key={i} icon="💬" title={<span className="flex items-center gap-2">Claude {subTag}</span>} indent={isSub}>
                <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{str(block.text)}</p>
                {raw}
              </Card>
            );
          }
          if (block.type === "thinking") {
            const thought = str(block.thinking);
            return (
              <Card key={i} icon="💭" title={<span className="flex items-center gap-2 text-muted">Thinking {subTag}</span>} indent={isSub}>
                {thought ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{thought}</p> : null}
                {raw}
              </Card>
            );
          }
          if (block.type === "tool_use") {
            const name = str(block.name);
            return (
              <Card
                key={i}
                tone="accent"
                icon="🔧"
                title={<span className="flex items-center gap-2 font-mono">{name} {subTag}</span>}
                sub={toolSummary(name, (block.input ?? {}) as Record<string, unknown>, workspace)}
                indent={isSub}
              >
                {raw ?? <Raw value={block.input} />}
              </Card>
            );
          }
          return (
            <Card key={i} icon="•" title={block.type} indent={isSub}>
              {raw}
            </Card>
          );
        })}
      </>
    );
  }

  if (message.type === "user" && Array.isArray(inner.content)) {
    const results = (inner.content as Block[]).filter((b) => b.type === "tool_result");
    if (!results.length) return showRaw ? <Card icon="↩" title="user message">{raw}</Card> : null;
    return (
      <>
        {results.map((block, i) => {
          const text = tidy(resultText(block.content), workspace);
          const lines = text.split("\n");
          return (
            <Card
              key={i}
              tone={block.is_error ? "danger" : "plain"}
              icon={block.is_error ? "⚠️" : "📄"}
              title={<span className="flex items-center gap-2">{block.is_error ? "Tool error" : "Tool result"} {subTag}</span>}
              sub={`${lines.length} line${lines.length === 1 ? "" : "s"}`}
              indent={isSub}
            >
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-2 font-mono text-[12px]">
                {text.length > 4000 ? text.slice(0, 4000) + "\n… (truncated)" : text}
              </pre>
              {raw}
            </Card>
          );
        })}
      </>
    );
  }

  if (message.type === "result") {
    const STOP_REASONS: Record<string, string> = {
      error_max_budget_usd: "Stopped: hit the spending cap. Raise it under Settings if you need a longer run.",
      error_max_turns: "Stopped: hit the max turns limit. Raise it under Settings if you need a longer run.",
      error_during_execution: "Stopped: something went wrong while running.",
    };
    const usage = (message.usage ?? {}) as Record<string, number>;
    const ok = message.subtype === "success" && !message.is_error;
    const stats = [
      ["Turns", String(message.num_turns)],
      ["Time", `${((Number(message.duration_ms) || 0) / 1000).toFixed(1)}s`],
      ["Est. cost", `$${(Number(message.total_cost_usd) || 0).toFixed(4)}`],
      ["Tokens in / out", `${usage.input_tokens ?? 0} / ${usage.output_tokens ?? 0}`],
      ["Cache reads", String(usage.cache_read_input_tokens ?? 0)],
    ];
    return (
      <Card tone={ok ? "ok" : "danger"} icon={ok ? "✅" : "⛔"} title={ok ? "Done" : (STOP_REASONS[String(message.subtype)] ?? `Stopped: ${message.subtype}`)}>
        <dl className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="font-mono text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        {raw}
      </Card>
    );
  }

  // Status pings, rate-limit info and other bookkeeping messages.
  if (!showRaw) return null;
  return (
    <Card icon="·" title={<span className="font-mono text-sm text-muted">{message.type}{message.subtype ? `: ${message.subtype}` : ""}</span>}>
      {raw}
    </Card>
  );
}

export function Timeline({
  events,
  showRaw,
  running,
  answered,
  onDecide,
}: {
  events: RunEvent[];
  showRaw: boolean;
  running: boolean;
  answered: Record<string, Choice>;
  onDecide: (id: string, choice: Choice) => void;
}) {
  const workspace = events.find((e) => e.kind === "run")?.workspace ?? "";
  const agents = subagentsById(events);

  return (
    <ol className="space-y-2" aria-live="polite">
      {events.map((event, i) => {
        switch (event.kind) {
          case "sdk":
            return <SdkMessage key={i} message={event.message} workspace={workspace} showRaw={showRaw} agents={agents} />;
          case "permission_request": {
            const decided = event.id in answered;
            return (
              <Card key={i} tone="warn" icon="✋" title={<>Claude wants to use <span className="font-mono">{event.tool}</span></>}>
                <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface p-2 font-mono text-[12px]">
                  {tidy(JSON.stringify(event.input, null, 2), workspace)}
                </pre>
                {decided ? (
                  <p className="mt-2 text-sm text-muted">You chose {CHOICE_LABEL[answered[event.id]]}.</p>
                ) : running ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => onDecide(event.id, "allow")}
                      className="rounded-md bg-ok px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Allow
                    </button>
                    <button
                      onClick={() => onDecide(event.id, "always")}
                      title={`Allow ${event.tool} for the rest of this run`}
                      className="rounded-md border border-ok/40 bg-surface px-3 py-1.5 text-sm font-medium text-ok hover:bg-ok-soft"
                    >
                      Always allow
                    </button>
                    <button
                      onClick={() => onDecide(event.id, "deny")}
                      className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
                    >
                      Deny
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">The run ended before you answered.</p>
                )}
              </Card>
            );
          }
          case "permission_decision":
            if (event.by === "you") return null; // Already shown on the prompt card.
            return (
              <li key={i} className={`pl-3 text-xs ${event.allowed ? "text-muted" : "text-danger"}`}>
                {event.allowed ? "✓ auto-allowed" : "✗ denied"} <span className="font-mono">{event.tool}</span>: {tidy(event.reason, workspace)}
              </li>
            );
          case "hook":
            return (
              <Card key={i} tone="hook" icon="🪝" title={`${event.event} hook`} sub={event.tool}>
                <p className="text-sm">{event.note}</p>
              </Card>
            );
          case "error":
            return (
              <Card key={i} tone="danger" icon="⛔" title="Something went wrong">
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{event.message}</p>
              </Card>
            );
          default:
            return null;
        }
      })}
    </ol>
  );
}

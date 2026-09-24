"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import type { Answer, Question, RunEvent, SdkMessageLike } from "@/lib/run-types";
import { TASK_TOOL_NAMES } from "@/lib/tasks";
import { ClaudeText } from "./ClaudeText";

type Block = { type: string; [key: string]: unknown };

export type Choice = "allow" | "always" | "deny";
export const CHOICE_LABEL: Record<Choice, string> = { allow: "Allow", always: "Always allow", deny: "Deny" };

// Harness tools whose calls the page shows in its own way (task list, question and plan cards).
const HARNESS_NOTES: Record<string, (input: Record<string, unknown>) => string> = {
  TaskCreate: (i) => `☐ added to the task list: ${String(i.subject ?? "")}`,
  TaskUpdate: (i) => `☑ task #${String(i.taskId ?? "?")}${i.status ? ` → ${String(i.status).replace("_", " ")}` : " updated"}`,
  TaskList: () => "☰ checked the task list",
  TaskGet: (i) => `☰ looked at task #${String(i.taskId ?? "?")}`,
  AskUserQuestion: () => "❓ Claude asked you a question (below)",
  ExitPlanMode: () => "📋 Claude presented its plan (below)",
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Show paths relative to workspace/ so beginners aren't staring at /Users/... */
function tidy(value: string, workspace: string) {
  return workspace ? value.split(workspace + "/").join("").split(workspace).join("workspace/") : value;
}

/** Names from the workspace's .claude/ config, to show what Claude Code actually loaded. */
export type ProjectNames = { commands: string[]; skills: string[]; agents: string[] };

function toolSummary(name: string, input: Record<string, unknown>, workspace: string) {
  if (typeof input.skill === "string") return `${input.skill}${input.args ? ` ${input.args}` : ""}`;
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
  followUp,
  project,
  stoppedByYou,
  hiddenIds,
}: {
  /** tool_use ids of harness tools, whose results aren't shown as cards. */
  hiddenIds?: Set<string>;
  /** This result came right after you pressed Stop (or steered). */
  stoppedByYou?: boolean;
  message: SdkMessageLike;
  workspace: string;
  showRaw: boolean;
  agents: Record<string, AgentInfo>;
  project?: ProjectNames;
  /** A follow-up turn: the session already started earlier in the conversation. */
  followUp?: boolean;
}) {
  const raw = showRaw ? <Raw value={message} /> : null;
  const inner = (message.message ?? {}) as { content?: unknown };
  const isSub = message.parent_tool_use_id != null;
  const agent = isSub ? (agents[String(message.parent_tool_use_id)] ?? { name: "subagent", color: "bg-hook" }) : null;
  const subTag = agent ? (
    <span className={`rounded px-1.5 font-mono text-[11px] font-medium text-white ${agent.color}`}>{agent.name}</span>
  ) : null;

  if (message.type === "system" && message.subtype === "init" && followUp && !showRaw) {
    return (
      <li className="pl-3 text-xs text-muted">
        ↻ continuing the conversation · <span className="font-mono">{String(message.model)}</span>
      </li>
    );
  }

  if (message.type === "system" && message.subtype === "init") {
    const tools = (message.tools as string[]) ?? [];
    const servers = (message.mcp_servers as { name: string; status: string }[]) ?? [];
    const auth = message.apiKeySource === "none" ? "Your Claude Code login (no API key)" : String(message.apiKeySource);
    // Only the project's own items (Claude Code also has built-in commands, skills and agents).
    const loaded = project
      ? [
          ...project.commands.filter((c) => ((message.slash_commands as string[]) ?? []).includes(c)).map((c) => `/${c}`),
          ...project.skills.filter((c) => ((message.skills as string[]) ?? []).includes(c)).map((c) => `${c} (skill)`),
          ...project.agents.filter((c) => ((message.agents as string[]) ?? []).includes(c)).map((c) => `${c} (subagent)`),
        ]
      : [];
    return (
      <Card tone="info" icon="▶" title="Session started" sub={`${message.model} · ${message.permissionMode} mode`}>
        <dl className="mt-1.5 grid gap-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <dt className="text-muted">Auth</dt>
          <dd>{auth}</dd>
          <dt className="text-muted">Tools</dt>
          <dd className="flex flex-wrap gap-1">{tools.length ? tools.map((t) => <Chip key={t}>{t}</Chip>) : "none"}</dd>
          {loaded.length > 0 && (
            <>
              <dt className="text-muted">.claude/</dt>
              <dd className="flex flex-wrap gap-1">
                {loaded.map((l) => (
                  <Chip key={l}>{l}</Chip>
                ))}
              </dd>
            </>
          )}
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
                <ClaudeText text={str(block.text)} />
                {raw}
              </Card>
            );
          }
          if (block.type === "thinking") {
            const thought = str(block.thinking);
            // The model's reasoning is usually hidden; then just note that it thought.
            if (!thought && !raw) {
              return (
                <li key={i} className={`pl-3 text-xs text-muted ${isSub ? "ml-6" : ""}`}>
                  💭 thinking {subTag}
                </li>
              );
            }
            return (
              <Card key={i} icon="💭" title={<span className="flex items-center gap-2 text-muted">Thinking {subTag}</span>} indent={isSub}>
                {thought ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{thought}</p> : null}
                {raw}
              </Card>
            );
          }
          if (block.type === "tool_use") {
            const name = str(block.name);
            if (HARNESS_NOTES[name] && !showRaw) {
              return (
                <li key={i} className={`pl-3 text-xs text-muted ${isSub ? "ml-6" : ""}`}>
                  {HARNESS_NOTES[name]((block.input ?? {}) as Record<string, unknown>)} {subTag}
                </li>
              );
            }
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
    const results = (inner.content as Block[]).filter(
      (b) => b.type === "tool_result" && (showRaw || !hiddenIds?.has(str(b.tool_use_id))),
    );
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
    const tone = ok ? "ok" : stoppedByYou ? "info" : "danger";
    const stats = [
      ["Turns", String(message.num_turns)],
      ["Time", `${((Number(message.duration_ms) || 0) / 1000).toFixed(1)}s`],
      ["Est. cost", `$${(Number(message.total_cost_usd) || 0).toFixed(4)}`],
      ["Tokens in / out", `${usage.input_tokens ?? 0} / ${usage.output_tokens ?? 0}`],
      ["Cache reads", String(usage.cache_read_input_tokens ?? 0)],
    ];
    return (
      <Card tone={tone} icon={ok ? "✅" : stoppedByYou ? "■" : "⛔"} title={ok ? "Done" : stoppedByYou ? "Stopped by you" : (STOP_REASONS[String(message.subtype)] ?? `Stopped: ${message.subtype}`)}>
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

  // Command hooks from .claude/settings.json (the SDK streams these with includeHookEvents).
  if (message.type === "system" && message.subtype === "compact_boundary") {
    const meta = (message.compact_metadata ?? {}) as { trigger?: string; pre_tokens?: number; post_tokens?: number };
    return (
      <Card
        tone="info"
        icon="🗜"
        title="Context compacted"
        sub={`${meta.trigger === "auto" ? "automatically" : "you asked"} · ${meta.pre_tokens ?? "?"}${meta.post_tokens ? ` → ${meta.post_tokens}` : ""} tokens`}
      >
        <p className="text-sm">Claude Code replaced the conversation so far with a summary, so there&apos;s room for more.</p>
        {raw}
      </Card>
    );
  }

  if (message.type === "system" && message.subtype === "hook_response") {
    const output = [str(message.stdout) || str(message.output), str(message.stderr)].filter(Boolean).join("\n").trim();
    const failed = typeof message.exit_code === "number" && message.exit_code !== 0;
    return (
      <Card tone={failed ? "danger" : "hook"} icon="🪝" title={`${str(message.hook_event)} hook`} sub={`${str(message.hook_name)} · from settings`}>
        {output && <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-surface p-2 font-mono text-[12px] whitespace-pre-wrap">{tidy(output, workspace)}</pre>}
        {failed && <p className="mt-1 text-xs text-danger">Exited with code {String(message.exit_code)}</p>}
        {raw}
      </Card>
    );
  }
  if (message.type === "system" && (message.subtype === "hook_started" || message.subtype === "hook_progress") && !showRaw) return null;

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
  onAnswer = () => {},
  followUp,
  project,
  workspacePath,
  streamingText = "",
}: {
  /** The workspace folder, so paths can be shown relative to it. */
  workspacePath?: string;
  /** Claude's reply as it streams in, word by word, before the full message arrives. */
  streamingText?: string;
  followUp?: boolean;
  project?: ProjectNames;
  events: RunEvent[];
  showRaw: boolean;
  running: boolean;
  /** What you chose on each card, as a label ("Allow", "Filipino", "Approved"...). */
  answered: Record<string, string>;
  onDecide: (id: string, choice: Choice) => void;
  /** Answers to Claude's questions and plan reviews. */
  onAnswer?: (id: string, answer: Answer, label: string) => void;
}) {
  const workspace = workspacePath ?? "";
  const agents = subagentsById(events);
  const hiddenIds = new Set<string>();
  for (const e of events) {
    if (e.kind !== "sdk" || e.message.type !== "assistant") continue;
    for (const b of ((e.message.message as { content?: Block[] } | undefined)?.content ?? []) as Block[]) {
      if (b.type === "tool_use" && (TASK_TOOL_NAMES.has(str(b.name)) || HARNESS_NOTES[str(b.name)])) hiddenIds.add(str(b.id));
    }
  }

  return (
    <ol className="space-y-2" aria-live="polite">
      {events.map((event, i) => {
        switch (event.kind) {
          case "sdk":
            return <SdkMessage key={i} message={event.message} workspace={workspace} showRaw={showRaw}
                agents={agents}
                followUp={followUp}
                project={project}
                hiddenIds={hiddenIds}
                stoppedByYou={
                  event.message.type === "result" &&
                  events.slice(Math.max(0, i - 3), i).some((p) => p.kind === "control" && /stopped|steered/i.test(p.note))
                }
              />;
          case "permission_request": {
            const decided = event.id in answered;
            return (
              <Card key={i} tone="warn" icon="✋" title={<>Claude wants to use <span className="font-mono">{event.tool}</span></>}>
                <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface p-2 font-mono text-[12px]">
                  {tidy(JSON.stringify(event.input, null, 2), workspace)}
                </pre>
                {decided ? (
                  <p className="mt-2 text-sm text-muted">You chose {answered[event.id]}.</p>
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
          case "question":
            return (
              <QuestionCard
                key={i}
                questions={event.questions}
                answered={answered[event.id]}
                running={running}
                onAnswer={(answer, label) => onAnswer(event.id, answer, label)}
              />
            );
          case "plan_review":
            return (
              <PlanCard
                key={i}
                plan={event.plan}
                answered={answered[event.id]}
                running={running}
                onAnswer={(answer, label) => onAnswer(event.id, answer, label)}
              />
            );
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
          case "control":
            return (
              <li key={i} className="pl-3 text-xs text-info">
                ⚙ {event.note}
              </li>
            );
          case "closed":
            return (
              <li key={i} className="pl-3 text-xs text-muted">
                ■ Session ended: {event.reason}
              </li>
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
      {streamingText && (
        <Card icon="💬" title={<span className="flex items-center gap-2">Claude <span className="text-xs font-normal text-muted">typing…</span></span>}>
          <ClaudeText text={streamingText + " ▍"} />
        </Card>
      )}
    </ol>
  );
}

/** Claude's AskUserQuestion: pick an option (or type your own answer) for each question. */
function QuestionCard({
  questions,
  answered,
  running,
  onAnswer,
}: {
  questions: Question[];
  answered?: string;
  running: boolean;
  onAnswer: (answer: Answer, label: string) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const answerFor = (q: Question) => (other[q.question]?.trim() ? other[q.question].trim() : (picked[q.question] ?? []).join(", "));
  const ready = questions.every((q) => answerFor(q));
  const toggle = (q: Question, label: string) =>
    setPicked((p) => {
      const cur = p[q.question] ?? [];
      return { ...p, [q.question]: q.multiSelect ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : [label] };
    });

  return (
    <Card tone="info" icon="❓" title="Claude has a question for you">
      <div className="mt-2 space-y-4">
        {questions.map((q) => (
          <fieldset key={q.question} disabled={!!answered || !running} className="space-y-2">
            <legend className="text-sm">
              <span className="mr-2 rounded bg-info px-1.5 py-0.5 text-[11px] font-medium text-white">{q.header}</span>
              {q.question}
              {q.multiSelect && <span className="ml-1 text-xs text-muted">(pick any)</span>}
            </legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {q.options.map((o) => {
                const on = (picked[q.question] ?? []).includes(o.label);
                return (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(q, o.label)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${on ? "border-info bg-surface" : "border-line bg-surface/60 hover:bg-surface"}`}
                  >
                    <span className="block font-medium">{o.label}</span>
                    <span className="block text-xs text-muted">{o.description}</span>
                  </button>
                );
              })}
            </div>
            <input
              value={other[q.question] ?? ""}
              onChange={(e) => setOther((x) => ({ ...x, [q.question]: e.target.value }))}
              placeholder="Or type your own answer"
              aria-label={`Your own answer to: ${q.question}`}
              className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm"
            />
          </fieldset>
        ))}
      </div>
      {answered ? (
        <p className="mt-3 text-sm text-muted">You answered: {answered}</p>
      ) : running ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              const answers = Object.fromEntries(questions.map((q) => [q.question, answerFor(q)]));
              onAnswer({ allow: true, answers }, Object.values(answers).join(" · "));
            }}
            disabled={!ready}
            className="h-9 rounded-lg bg-info px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Send answer
          </button>
          <button onClick={() => onAnswer({ allow: false }, "skipped")} className="h-9 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2">
            Skip
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">The conversation moved on before you answered.</p>
      )}
    </Card>
  );
}

/** Claude's plan from plan mode: approve it (and choose how to continue) or keep planning. */
function PlanCard({
  plan,
  answered,
  running,
  onAnswer,
}: {
  plan: string;
  answered?: string;
  running: boolean;
  onAnswer: (answer: Answer, label: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  return (
    <Card tone="info" icon="📋" title="Claude's plan is ready for your review">
      <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-line bg-surface p-3">
        <ClaudeText text={plan} />
      </div>
      {answered ? (
        <p className="mt-3 text-sm text-muted">You chose: {answered}</p>
      ) : running ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onAnswer({ allow: true, mode: "acceptEdits" }, "Approve and auto-accept edits")}
              className="h-9 rounded-lg bg-ok px-3 text-sm font-medium text-white hover:opacity-90"
            >
              ✓ Approve, auto-accept edits
            </button>
            <button
              onClick={() => onAnswer({ allow: true, mode: "default" }, "Approve and ask before each edit")}
              className="h-9 rounded-lg border border-ok/40 bg-surface px-3 text-sm font-medium text-ok hover:bg-ok-soft"
            >
              ✓ Approve, ask before edits
            </button>
            <button
              onClick={() => onAnswer({ allow: false, message: feedback.trim() || undefined }, feedback.trim() ? `Keep planning: ${feedback.trim()}` : "Keep planning")}
              className="h-9 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-surface-2"
            >
              ✎ Keep planning
            </button>
          </div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="Optional: what should change in the plan? (sent with Keep planning)"
            aria-label="Feedback on the plan"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">The conversation moved on before you reviewed it.</p>
      )}
    </Card>
  );
}

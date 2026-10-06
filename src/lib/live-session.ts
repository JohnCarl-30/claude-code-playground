import "server-only";
import { query as sdkQuery, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { signInHelp } from "./auth";
import { buildOptions } from "./run-agent";
import type { PlaygroundPermissionMode, RunConfig, RunEvent, SdkMessageLike, SessionEvent } from "./run-types";
import { WORKSPACE_DIR } from "./workspace";

// A live session is one long-running Claude Code conversation, like a terminal
// session: you can send messages at any time (even while Claude works), stop the
// current turn, and change the model or permission mode without restarting.

type Listener = (event: SessionEvent) => void;
export type QueryFn = (args: { prompt: AsyncIterable<SDKUserMessage>; options: Parameters<typeof sdkQuery>[0]["options"] }) => Query;

const IDLE_MS = 15 * 60_000; // close a session nobody has used or watched for this long
const MAX_SESSIONS = 3; // each one is a Claude Code process

export class LiveSession {
  readonly id = crypto.randomUUID();
  private events: SessionEvent[] = [];
  private listeners = new Set<Listener>();
  private queue: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private query: Query | null = null;
  private readonly abort = new AbortController();
  private seq = 0;
  private sent = 0;
  private results = 0;
  closed = false;
  lastActivity = Date.now();

  constructor(readonly config: RunConfig) {}

  /** Claude is working while some message you sent hasn't produced a result yet. */
  get working() {
    return this.sent > this.results;
  }

  get watched() {
    return this.listeners.size > 0;
  }

  private emit(event: RunEvent) {
    this.lastActivity = Date.now(); // any event is a sign of life
    // Word-by-word deltas are only for live viewers; the full message follows.
    const partial = event.kind === "sdk" && event.message.type === "stream_event";
    const stored: SessionEvent = { ...event, seq: partial ? -1 : this.seq++ };
    if (!partial) this.events.push(stored);
    for (const listener of this.listeners) listener(stored);
  }

  /** Messages you send are yielded to Claude Code as they arrive; the session stays open between them. */
  private async *input(): AsyncGenerator<SDKUserMessage> {
    while (!this.closed) {
      while (this.queue.length) yield this.queue.shift()!;
      await new Promise<void>((resolve) => (this.wake = resolve));
      this.wake = null;
    }
  }

  async start(firstPrompt: string, queryFn: QueryFn = sdkQuery as unknown as QueryFn) {
    const options = await buildOptions(this.config, (e) => this.emit(e), this.abort);
    this.emit({ kind: "session", sessionId: this.id, workspace: WORKSPACE_DIR });
    this.query = queryFn({ prompt: this.input(), options });
    this.send(firstPrompt);
    void this.pump();
  }

  private async pump() {
    try {
      for await (const message of this.query!) {
        if (message.type === "result") this.results++;
        this.emit({ kind: "sdk", message: message as unknown as SdkMessageLike });
        // A sign-in failure would otherwise be retried for minutes: stop and say what to fix.
        const m = message as { type: string; subtype?: string; error?: string; error_status?: number | null };
        if (m.type === "system" && m.subtype === "api_retry" && (m.error === "authentication_failed" || m.error_status === 401)) {
          this.emit({ kind: "error", message: signInHelp() });
          this.close("Claude couldn't sign in.");
          return;
        }
      }
      if (!this.closed) this.close("Claude Code ended the session.");
    } catch (err) {
      if (!this.closed) {
        this.emit({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        this.close("The session stopped because of an error.");
      }
    }
  }

  /**
   * Send a message. While Claude is working, "steer" delivers it right away
   * (the current turn ends and Claude answers this instead) and "queue" waits
   * until the current turn finishes.
   */
  send(text: string, how: "steer" | "queue" = "queue") {
    if (this.closed) return false;
    this.lastActivity = Date.now();
    const mode = !this.working ? "start" : how;
    this.sent++;
    this.emit({ kind: "user_prompt", text, mode });
    this.queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      ...(mode === "steer" ? { priority: "now" as const } : {}),
    });
    this.wake?.();
    return true;
  }

  /** Stop the current turn, like pressing Esc in the terminal. The session stays open. */
  async interrupt() {
    this.lastActivity = Date.now();
    if (!this.query || !this.working) return;
    await this.query.interrupt();
    this.emit({ kind: "control", note: "You stopped Claude. The conversation continues." });
  }

  async setPermissionMode(mode: PlaygroundPermissionMode) {
    this.lastActivity = Date.now();
    await this.query?.setPermissionMode(mode);
    this.config.permissionMode = mode;
    this.emit({ kind: "control", note: `Permission mode is now ${mode}.`, permissionMode: mode });
  }

  async setModel(model: string) {
    this.lastActivity = Date.now();
    await this.query?.setModel(model || undefined);
    this.config.model = model;
    this.emit({ kind: "control", note: `Model is now ${model || "your Claude Code default"}.` });
  }

  /** How full the context window is, like /context in the terminal. */
  async contextUsage() {
    if (!this.query || this.closed) return null;
    const u = await this.query.getContextUsage();
    return {
      model: u.model,
      totalTokens: u.totalTokens,
      maxTokens: u.maxTokens,
      percentage: u.percentage,
      isAutoCompactEnabled: u.isAutoCompactEnabled,
      autoCompactThreshold: u.autoCompactThreshold ?? null,
      categories: u.categories.map((c) => ({ name: c.name, tokens: c.tokens, kind: c.kind })),
      memoryFiles: u.memoryFiles.map((f) => ({ path: f.path, tokens: f.tokens })),
      mcpTools: u.mcpTools.map((t) => ({ name: t.name, server: t.serverName, tokens: t.tokens })),
    };
  }

  /** Replay stored events from `from`, then stream new ones. Returns an unsubscribe function. */
  subscribe(from: number, listener: Listener) {
    for (const event of this.events) if (event.seq >= from) listener(event);
    this.listeners.add(listener);
    this.lastActivity = Date.now();
    return () => {
      this.listeners.delete(listener);
      this.lastActivity = Date.now();
    };
  }

  close(reason = "You started a new conversation.") {
    if (this.closed) return;
    this.closed = true;
    this.emit({ kind: "closed", reason });
    this.wake?.();
    this.abort.abort();
    try {
      this.query?.close();
    } catch {}
    sessions.delete(this.id);
    for (const listener of this.listeners) listener({ kind: "closed", reason, seq: -1 });
    this.listeners.clear();
  }
}

// Sessions live in the server process (on globalThis, so dev reloads keep them).
const g = globalThis as unknown as { __liveSessions?: Map<string, LiveSession>; __liveReaper?: NodeJS.Timeout };
const sessions = (g.__liveSessions ??= new Map());

/**
 * Close sessions nobody is watching once nothing has happened for a while. A
 * session that is really working keeps producing events, so this only catches
 * abandoned ones (for example a tab closed while a permission card was waiting).
 */
export function reapIdleSessions(now = Date.now()) {
  for (const session of sessions.values()) {
    if (!session.watched && now - session.lastActivity > IDLE_MS) session.close("Closed after 15 idle minutes.");
  }
}
g.__liveReaper ??= setInterval(() => reapIdleSessions(), 60_000);
g.__liveReaper.unref?.();

export async function createSession(config: RunConfig, queryFn?: QueryFn): Promise<LiveSession> {
  // Keep the number of Claude Code processes small: close the oldest idle sessions first.
  const byAge = [...sessions.values()].sort((a, b) => a.lastActivity - b.lastActivity);
  for (const old of byAge) {
    if (sessions.size < MAX_SESSIONS) break;
    old.close("Closed to make room for a newer conversation.");
  }
  const session = new LiveSession({ ...config });
  sessions.set(session.id, session);
  await session.start(config.prompt, queryFn);
  return session;
}

export function getSession(id: string) {
  return sessions.get(id);
}

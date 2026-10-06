"use client";

import { useEffect, useRef, useState } from "react";
import type { RunConfig, SessionEvent } from "@/lib/run-types";

type StreamEvent = { type: string; content_block?: { type: string }; delta?: { type: string; text?: string } };

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * One live Claude Code session: start it, send messages any time (steer or
 * queue while Claude works), stop the current turn, change model or mode, and
 * read its event stream, reconnecting and replaying if the connection drops.
 */
export function useLiveSession({ onResult }: { onResult?: (success: boolean, sessionId: string) => void } = {}) {
  const [id, setId] = useState<string | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  // The main agent's reply as it streams in, word by word, until the full message arrives.
  const [streaming, setStreaming] = useState("");
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  const lastSeq = useRef(-1);
  const readerAbort = useRef<AbortController | null>(null);
  const closingRef = useRef(false);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const sent = events.filter((e) => e.kind === "user_prompt").length;
  const results = events.filter((e) => e.kind === "sdk" && e.message.type === "result").length;
  const active = !!id && !closedReason;
  const working = active && sent > results;

  function handle(event: SessionEvent) {
    if (event.kind === "sdk" && event.message.type === "stream_event") {
      if (event.message.parent_tool_use_id) return; // subagents' text arrives as full messages
      const e = event.message.event as StreamEvent;
      if (e.type === "content_block_start" && e.content_block?.type === "text") setStreaming("");
      if (e.type === "content_block_delta" && e.delta?.type === "text_delta") setStreaming((s) => s + (e.delta?.text ?? ""));
      return;
    }
    if (event.seq >= 0) {
      if (event.seq <= lastSeq.current) return; // already have it (replay after reconnect)
      lastSeq.current = event.seq;
    }
    if (event.kind === "sdk" && (event.message.type === "assistant" || event.message.type === "result")) setStreaming("");
    // Results that arrive while a session is being closed don't need follow-up work.
    if (event.kind === "sdk" && event.message.type === "result" && idRef.current && !closingRef.current) {
      onResultRef.current?.(event.message.subtype === "success", idRef.current);
    }
    if (event.kind === "closed") {
      closingRef.current = true;
      setClosedReason(event.reason);
    }
    setEvents((prev) => [...prev, event]);
  }

  async function listen(sessionId: string) {
    let failures = 0;
    while (idRef.current === sessionId) {
      const controller = new AbortController();
      readerAbort.current = controller;
      try {
        const res = await fetch(`/api/session/${sessionId}/events?from=${lastSeq.current + 1}`, { signal: controller.signal });
        if (res.status === 404) return setClosedReason("This conversation has ended.");
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          failures = 0;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line) continue;
            const event = JSON.parse(line) as SessionEvent;
            handle(event);
            if (event.kind === "closed") return;
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      // The stream dropped while the session is still open: reconnect and replay what we missed.
      if (++failures > 5) return setClosedReason("Lost the connection to the playground server.");
      await new Promise((r) => setTimeout(r, 500 * failures));
    }
  }

  /** Start a new session with these settings; `config.prompt` is the first message. Returns an error, if any. */
  async function start(config: RunConfig): Promise<string | null> {
    const res = await post("/api/session", config).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!data?.id) return data?.error ?? "Couldn't start Claude Code.";
    idRef.current = data.id;
    closingRef.current = false;
    lastSeq.current = -1;
    setEvents([]);
    setStreaming("");
    setClosedReason(null);
    setId(data.id);
    void listen(data.id);
    return null;
  }

  async function send(text: string, how: "steer" | "queue" = "queue"): Promise<string | null> {
    if (!idRef.current) return "No conversation is running.";
    const res = await post(`/api/session/${idRef.current}/message`, { text, how }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? (res?.ok ? null : "Couldn't send the message.");
  }

  async function control(action: "interrupt" | "permissionMode" | "model", value?: string) {
    if (!idRef.current) return;
    await post(`/api/session/${idRef.current}/control`, { action, value }).catch(() => {});
  }

  /** Close the session (New conversation). */
  function end() {
    closingRef.current = true;
    const current = idRef.current;
    idRef.current = null;
    readerAbort.current?.abort();
    if (current) void fetch(`/api/session/${current}`, { method: "DELETE", keepalive: true }).catch(() => {});
    setId(null);
    setEvents([]);
    setStreaming("");
    setClosedReason(null);
  }

  // Close the session when the page goes away or this example is left.
  useEffect(() => {
    const onHide = () => {
      if (idRef.current) navigator.sendBeacon(`/api/session/${idRef.current}/close`, new Blob(["{}"], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      const current = idRef.current;
      idRef.current = null;
      readerAbort.current?.abort();
      if (current) void fetch(`/api/session/${current}`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, []);

  return { id, events, streaming, active, working, closedReason, start, send, control, end };
}

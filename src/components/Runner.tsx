"use client";

import { useRef, useState } from "react";
import { markLessonDone } from "@/lib/progress";
import { DEFAULT_CONFIG, type RunConfig, type RunEvent } from "@/lib/run-types";
import { FilesPanel } from "./FilesPanel";
import { SettingsPanel } from "./SettingsPanel";
import { SetupBanner } from "./SetupStatus";
import { Timeline } from "./Timeline";

type Status = "idle" | "running" | "done";

export function Runner({
  preset,
  lessonId,
  showRawByDefault = false,
  settingsOpenByDefault = false,
}: {
  preset: Partial<RunConfig>;
  /** When set, a successful run marks this lesson as completed. */
  lessonId?: string;
  showRawByDefault?: boolean;
  settingsOpenByDefault?: boolean;
}) {
  const initial: RunConfig = { ...DEFAULT_CONFIG, ...preset };
  const [config, setConfig] = useState<RunConfig>(initial);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [showRaw, setShowRaw] = useState(showRawByDefault);
  const [settingsOpen, setSettingsOpen] = useState(settingsOpenByDefault);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [filesKey, setFilesKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const running = status === "running";

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    setEvents([]);
    setAnswered({});
    setStatus("running");

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
        if (lessonId && succeeded) markLessonDone(lessonId);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setEvents((prev) => [...prev, { kind: "error", message: err instanceof Error ? err.message : String(err) }]);
      } else {
        setEvents((prev) => [...prev, { kind: "error", message: "Stopped." }]);
      }
    } finally {
      setStatus("done");
      setFilesKey((k) => k + 1);
    }
  }

  async function decide(id: string, allow: boolean) {
    setAnswered((prev) => ({ ...prev, [id]: allow }));
    await fetch("/api/permission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, allow }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <SetupBanner />
      <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <label htmlFor="prompt" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={config.prompt}
          onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !running) run();
          }}
          rows={3}
          disabled={running}
          className="w-full resize-y rounded-md border border-line bg-bg px-3 py-2 leading-relaxed disabled:opacity-60"
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
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              ▶ Run {status === "done" ? "again" : ""}
            </button>
          )}
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            aria-expanded={settingsOpen}
            className="rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-2"
          >
            ⚙ Settings {settingsOpen ? "▴" : "▾"}
          </button>
          <button
            onClick={() => setConfig(initial)}
            disabled={running}
            className="rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            Restore example
          </button>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} className="accent-[var(--accent)]" />
            Show raw messages
          </label>
        </div>
        {settingsOpen && (
          <div className="mt-4 border-t border-line pt-4">
            <SettingsPanel config={config} onChange={setConfig} disabled={running} />
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

      <FilesPanel refreshKey={filesKey} disabled={running} />
    </div>
  );
}

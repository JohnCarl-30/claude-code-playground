"use client";

import { useState } from "react";

export type ContextUsage = {
  model: string;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  isAutoCompactEnabled: boolean;
  autoCompactThreshold: number | null;
  categories: { name: string; tokens: number; kind: string }[];
  memoryFiles: { path: string; tokens: number }[];
  mcpTools: { name: string; server: string; tokens: number }[];
};

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/** How full the context window is, like /context in the terminal, with a Compact button. */
export function ContextMeter({ usage, working, onCompact }: { usage: ContextUsage | null; working: boolean; onCompact: () => void }) {
  const [open, setOpen] = useState(false);
  if (!usage) return null;
  const pct = Math.min(100, Math.round(usage.percentage));
  const threshold = usage.autoCompactThreshold ? (usage.autoCompactThreshold / usage.maxTokens) * 100 : null;
  const tone = pct >= 80 ? "bg-danger" : pct >= 50 ? "bg-warn" : "bg-ok";
  const used = (usage.categories ?? []).filter((c) => c.kind === "used" && c.tokens > 0);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="How full Claude's context window is"
        className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-ink"
      >
        <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
          <span className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} />
        </span>
        context {pct}%
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-line bg-surface p-4 text-sm shadow-lg">
          <p className="font-medium">
            {k(usage.totalTokens)} / {k(usage.maxTokens)} tokens <span className="font-normal text-muted">· {usage.model}</span>
          </p>
          <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <span className={`absolute inset-y-0 left-0 ${tone}`} style={{ width: `${Math.max(pct, 1)}%` }} />
            {threshold && <span className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `${threshold}%` }} title="auto-compact" />}
          </div>
          <p className="mt-1 text-xs text-muted">
            {usage.isAutoCompactEnabled && usage.autoCompactThreshold
              ? `Claude Code compacts automatically at ${k(usage.autoCompactThreshold)} (the line).`
              : "Automatic compaction is off."}
          </p>
          <ul className="mt-3 space-y-1">
            {used.map((c) => (
              <li key={c.name} className="flex justify-between gap-3 text-xs">
                <span>{c.name}</span>
                <span className="font-mono text-muted">{k(c.tokens)}</span>
              </li>
            ))}
            {usage.memoryFiles?.length > 0 && (
              <li className="text-xs text-muted">Memory: {usage.memoryFiles.map((f) => f.path.split("/").pop()).join(", ")}</li>
            )}
            {usage.mcpTools?.length > 0 && <li className="text-xs text-muted">MCP tools: {usage.mcpTools.length}</li>}
          </ul>
          <button
            onClick={() => {
              setOpen(false);
              onCompact();
            }}
            disabled={working}
            title="Summarize the conversation so far to free up context (/compact)"
            className="mt-3 h-8 w-full rounded-lg border border-line text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            🗜 Compact now
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { TEMPLATES, findTemplate, type TemplateId } from "@/lib/templates";
import { RunPanel } from "./RunPanel";

export type WorkspaceFile = { path: string; content: string };
export type WorkspaceSnapshot = { template: TemplateId; files: WorkspaceFile[] };

/** The project Claude works on: pick a starter, run and test it, browse its files. */
export function WorkspacePanel({
  workspace,
  busy,
  onSwitch,
  onReset,
  mcpConnected,
  onConnectMcp,
  onTryMcp,
}: {
  workspace: WorkspaceSnapshot | null;
  busy: boolean;
  onSwitch: (template: TemplateId) => void;
  onReset: () => void;
  mcpConnected: boolean;
  onConnectMcp: () => void;
  onTryMcp: () => void;
}) {
  const [tab, setTab] = useState<"run" | "files">("run");
  const [selected, setSelected] = useState("");
  const [previous, setPrevious] = useState<Record<string, string>>({});
  const lastRef = useRef<WorkspaceSnapshot | null>(null);

  // Compare with the last snapshot of the same starter to mark changed and new files.
  useEffect(() => {
    if (!workspace) return;
    const last = lastRef.current;
    setPrevious(last && last.template === workspace.template ? Object.fromEntries(last.files.map((f) => [f.path, f.content])) : {});
    lastRef.current = workspace;
  }, [workspace]);

  const template = findTemplate(workspace?.template);
  const files = workspace?.files ?? [];
  const current = files.find((f) => f.path === selected) ?? files.find((f) => /\.(m?js|ts)$/.test(f.path)) ?? files[0];
  const changed = (f: WorkspaceFile) => f.path in previous && previous[f.path] !== f.content;
  const added = (f: WorkspaceFile) => Object.keys(previous).length > 0 && !(f.path in previous);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="mr-auto">
          <h3 className="font-medium">Workspace</h3>
          <p className="text-xs text-muted">{template ? template.blurb : "Loading…"}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Starter</span>
          <select
            value={workspace?.template ?? ""}
            disabled={busy || !workspace}
            onChange={(e) => {
              const next = e.target.value as TemplateId;
              if (window.confirm(`Switch to the "${findTemplate(next)?.title}" starter? This replaces all files in the workspace.`)) onSwitch(next);
            }}
            className="rounded-md border border-line bg-surface px-2 py-1.5"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => window.confirm("Reset the workspace to the starter's original files?") && onReset()}
          disabled={busy || !workspace}
          className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          Reset
        </button>
      </header>

      <div role="tablist" aria-label="Workspace" className="flex gap-1 border-b border-line px-3 pt-2">
        {(
          [
            ["run", "Run & test"],
            ["files", `Files${files.length ? ` (${files.length})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-sm ${
              tab === id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "run" && template && (
        <div role="tabpanel" className="p-4">
          <RunPanel key={template.id} template={template} mcpConnected={mcpConnected} onConnectMcp={onConnectMcp} onTryMcp={onTryMcp} />
        </div>
      )}

      {tab === "files" && (
        <div role="tabpanel" className="grid md:grid-cols-[200px_1fr]">
          <ul className="flex gap-1 overflow-x-auto border-b border-line p-2 md:flex-col md:border-r md:border-b-0">
            {files.map((f) => (
              <li key={f.path} className="shrink-0">
                <button
                  onClick={() => setSelected(f.path)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left font-mono text-[13px] ${
                    current?.path === f.path ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
                  }`}
                >
                  {f.path}
                  {changed(f) && <span className="rounded bg-warn-soft px-1 text-[10px] text-warn">changed</span>}
                  {added(f) && <span className="rounded bg-ok-soft px-1 text-[10px] text-ok">new</span>}
                </button>
              </li>
            ))}
          </ul>
          <pre className="max-h-96 min-w-0 overflow-auto p-3 font-mono text-[12px] leading-relaxed">{current?.content ?? "Loading…"}</pre>
        </div>
      )}
    </section>
  );
}

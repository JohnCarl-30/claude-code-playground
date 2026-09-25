"use client";

import { useEffect, useRef, useState } from "react";
import type { ClaudeConfig } from "@/lib/claude-config";
import { TEMPLATES, findTemplate, type TemplateId } from "@/lib/templates";
import { ChangesView } from "./ChangesView";
import { ClaudeConfigPanel, scaffold, type NewItemKind } from "./ClaudeConfigPanel";
import { RunPanel } from "./RunPanel";

export type WorkspaceFile = { path: string; content: string; binary?: boolean };
/**
 * parked: other starters with saved work, restored when you switch back.
 * missing: starter files this workspace doesn't have (added to the starter later, or deleted).
 */
export type WorkspaceSnapshot = { template: TemplateId; files: WorkspaceFile[]; parked?: TemplateId[]; missing?: string[] };

type Tab = "run" | "config" | "changes" | "files";

async function saveFile(path: string, content: string) {
  const res = await fetch("/api/workspace/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? null;
}

/** The project Claude works on: pick a starter, run and test it, see its Claude config, edit its files. */
export function WorkspacePanel({
  workspace,
  busy,
  onSwitch,
  onReset,
  mcpConnected,
  onConnectMcp,
  onTryMcp,
  claudeConfig = null,
  projectConfig = false,
  onToggleProjectConfig = () => {},
  onUseCommand = () => {},
  onAddStarterConfig = () => {},
  onAddMissing = () => {},
  onFilesChanged = () => {},
}: {
  workspace: WorkspaceSnapshot | null;
  busy: boolean;
  onSwitch: (template: TemplateId) => void;
  onReset: () => void;
  mcpConnected: boolean;
  onConnectMcp: () => void;
  onTryMcp: () => void;
  claudeConfig?: ClaudeConfig | null;
  projectConfig?: boolean;
  onToggleProjectConfig?: (on: boolean) => void;
  onUseCommand?: (name: string) => void;
  onAddStarterConfig?: () => void;
  /** Add the starter files the workspace doesn't have, keeping everything else. */
  onAddMissing?: () => void;
  /** Called after you save, create or delete a file here. */
  onFilesChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("run");
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<string | null>(null); // unsaved edits of the selected file
  const [newPath, setNewPath] = useState("");
  const [fileError, setFileError] = useState("");
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
  const current =
    files.find((f) => f.path === selected) ??
    (selected ? { path: selected, content: "" } : undefined) ?? // a new file that isn't saved yet
    files.find((f) => /\.(m?js|ts)$/.test(f.path)) ??
    files[0];
  const isNew = !!current && !files.some((f) => f.path === current.path);
  const text = draft ?? current?.content ?? "";
  const dirty = draft !== null && draft !== current?.content;
  const changed = (f: WorkspaceFile) => f.path in previous && previous[f.path] !== f.content;
  const added = (f: WorkspaceFile) => Object.keys(previous).length > 0 && !(f.path in previous);

  function open(path: string, content?: string) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setSelected(path);
    setDraft(content ?? null);
    setFileError("");
    setTab("files");
  }

  async function save() {
    if (!current) return;
    const error = await saveFile(current.path, text);
    setFileError(error ?? "");
    if (!error) {
      setDraft(null);
      onFilesChanged();
    }
  }

  async function remove() {
    if (!current || isNew || !window.confirm(`Delete ${current.path}?`)) return;
    const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(current.path)}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error) return setFileError(data.error);
    setSelected("");
    setDraft(null);
    onFilesChanged();
  }

  function create(kind: NewItemKind, name: string) {
    const file = scaffold(kind, name);
    if (files.some((f) => f.path === file.path)) return open(file.path);
    open(file.path, file.content);
  }

  const tabs: [Tab, string][] = [
    ["run", "Run & test"],
    ["config", "Claude config"],
    ["changes", "Changes"],
    ["files", `Files${files.length ? ` (${files.length})` : ""}`],
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="font-medium">Workspace</h2>
          <p className="text-xs text-muted">
            {template ? template.blurb : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
            <span className="text-muted">Starter</span>
            <select
              value={workspace?.template ?? ""}
              disabled={busy || !workspace}
              onChange={(e) => onSwitch(e.target.value as TemplateId)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {workspace?.parked?.includes(t.id) ? " · saved" : ""}
                </option>
              ))}
            </select>
          </label>
          <a
            href="/api/workspace/download"
            download
            aria-disabled={!workspace}
            title="Download this project as a .zip"
            className="flex h-9 shrink-0 items-center rounded-lg border border-line px-3 text-sm hover:bg-surface-2"
          >
            ⤓ .zip
          </a>
          <button
            onClick={() =>
              window.confirm("Reset this starter to its original files? Your changes to it will be lost (download a .zip first to keep them).") &&
              onReset()
            }
            disabled={busy || !workspace}
            className="h-9 shrink-0 rounded-lg border border-line px-3 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </header>

      {!!workspace?.missing?.length && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-info-soft px-4 py-2.5 text-sm text-info">
          <p className="min-w-0 flex-1">
            {workspace.missing.length === 1 ? "1 starter file isn't" : `${workspace.missing.length} starter files aren't`} in your workspace
            (new since you started, or deleted):{" "}
            <span className="font-mono text-xs">
              {workspace.missing.slice(0, 4).join(", ")}
              {workspace.missing.length > 4 ? `, +${workspace.missing.length - 4} more` : ""}
            </span>
          </p>
          <button
            onClick={onAddMissing}
            disabled={busy}
            title="Copies in only the missing files. Nothing you've changed is touched."
            className="h-8 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Add {workspace.missing.length === 1 ? "it" : "them"}
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Workspace" className="flex gap-1 overflow-x-auto border-b border-line px-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px h-10 shrink-0 border-b-2 px-3 text-sm ${
              tab === id
                ? "border-accent font-medium text-accent"
                : "border-transparent text-muted hover:text-ink"
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

      {tab === "config" && (
        <div role="tabpanel">
          <ClaudeConfigPanel
            config={claudeConfig}
            enabled={projectConfig}
            onToggle={onToggleProjectConfig}
            onOpen={(path) => open(path, files.some((f) => f.path === path) ? undefined : "")}
            onCreate={create}
            onUseCommand={onUseCommand}
            onAddStarterConfig={onAddStarterConfig}
          />
        </div>
      )}

      {tab === "changes" && (
        <div role="tabpanel">
          <ChangesView refreshKey={workspace} />
        </div>
      )}

      {tab === "files" && (
        <div role="tabpanel" className="grid md:grid-cols-[220px_1fr]">
          <div className="border-b border-line md:border-r md:border-b-0">
            <ul className="flex gap-1 overflow-x-auto p-2 md:max-h-96 md:flex-col md:overflow-y-auto">
              {files.map((f) => (
                <li key={f.path} className="shrink-0">
                  <button
                    onClick={() => open(f.path)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[13px] ${
                      current?.path === f.path ? "bg-accent-soft text-accent" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="truncate">{f.path}</span>
                    {changed(f) && <span className="rounded bg-warn-soft px-1 text-[10px] text-warn">changed</span>}
                    {added(f) && <span className="rounded bg-ok-soft px-1 text-[10px] text-ok">new</span>}
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-1 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newPath.trim()) open(newPath.trim(), "");
                setNewPath("");
              }}
            >
              <input
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="new/file.md"
                aria-label="New file path"
                className="min-w-0 flex-1 rounded border border-line bg-surface px-2 py-1 font-mono text-[12px]"
              />
              <button type="submit" className="rounded border border-line px-2 text-xs hover:bg-surface-2">
                ＋
              </button>
            </form>
          </div>
          <div className="min-w-0">
            {current ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
                  <span className="font-mono text-[13px]">{current.path}</span>
                  {isNew && <span className="rounded bg-ok-soft px-1 text-ok">new file</span>}
                  {dirty && <span className="rounded bg-warn-soft px-1 text-warn">unsaved</span>}
                  <span className="ml-auto flex gap-1">
                    <button
                      onClick={save}
                      disabled={busy || current.binary || (!dirty && !isNew)}
                      className="rounded bg-accent px-2 py-1 font-medium text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button onClick={() => setDraft(null)} disabled={!dirty} className="rounded border border-line px-2 py-1 disabled:opacity-40">
                      Revert
                    </button>
                    <button onClick={remove} disabled={busy || isNew} className="rounded border border-line px-2 py-1 text-danger disabled:opacity-40">
                      Delete
                    </button>
                  </span>
                </div>
                {fileError && <p className="bg-danger-soft px-3 py-1 text-xs text-danger">{fileError}</p>}
                {current.binary ? (
                  <p className="p-4 text-sm text-muted">
                    {current.content}. Binary files like images and PDFs can&apos;t be edited here; your code and Claude can still read them.
                  </p>
                ) : (
                  <textarea
                    value={text}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                        e.preventDefault();
                        save();
                      }
                    }}
                    spellCheck={false}
                    aria-label={`Contents of ${current.path}`}
                    className="block h-96 w-full resize-y bg-surface p-3 font-mono text-[12px] leading-relaxed outline-none"
                  />
                )}
              </>
            ) : (
              <p className="p-4 text-sm text-muted">No files.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

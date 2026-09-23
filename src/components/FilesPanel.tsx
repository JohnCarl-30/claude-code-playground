"use client";

import { useEffect, useRef, useState } from "react";

type WorkspaceFile = { path: string; content: string };

/** Shows the sandbox files Claude works on, and lets you reset them. */
export function FilesPanel({ refreshKey, disabled }: { refreshKey: number; disabled?: boolean }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selected, setSelected] = useState("src/cart.js");
  const [previous, setPrevious] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const filesRef = useRef<WorkspaceFile[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace")
      .then((r) => r.json())
      .then((data: { files: WorkspaceFile[] }) => {
        if (cancelled) return;
        // Remember the last snapshot so we can mark files Claude changed.
        setPrevious(Object.fromEntries(filesRef.current.map((f) => [f.path, f.content])));
        setFiles(data.files);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function reset() {
    setBusy(true);
    try {
      const data = (await fetch("/api/workspace", { method: "DELETE" }).then((r) => r.json())) as { files: WorkspaceFile[] };
      setFiles(data.files);
      setPrevious({});
    } finally {
      setBusy(false);
    }
  }

  const current = files.find((f) => f.path === selected) ?? files[0];
  const changed = (f: WorkspaceFile) => f.path in previous && previous[f.path] !== f.content;
  const added = (f: WorkspaceFile) => Object.keys(previous).length > 0 && !(f.path in previous);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <h3 className="font-medium">Workspace files</h3>
          <p className="text-xs text-muted">The sample project Claude works on (the playground&apos;s workspace/ folder)</p>
        </div>
        <button
          onClick={reset}
          disabled={busy || disabled}
          className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {busy ? "Resetting…" : "Reset workspace"}
        </button>
      </header>
      <div className="grid md:grid-cols-[200px_1fr]">
        <ul className="flex gap-1 overflow-x-auto border-b border-line p-2 md:flex-col md:border-b-0 md:border-r">
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
        <pre className="max-h-80 min-w-0 overflow-auto p-3 font-mono text-[12px] leading-relaxed">{current?.content ?? "Loading…"}</pre>
      </div>
    </section>
  );
}

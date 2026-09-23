"use client";

import { useEffect, useState } from "react";

type FileChange = { path: string; status: "added" | "modified" | "deleted" | "renamed"; patch: string };
type Diff = { available: boolean; changes: FileChange[] };

const STATUS_STYLE: Record<FileChange["status"], string> = {
  added: "bg-ok-soft text-ok",
  modified: "bg-warn-soft text-warn",
  deleted: "bg-danger-soft text-danger",
  renamed: "bg-info-soft text-info",
};

function lineClass(line: string) {
  if (line.startsWith("@@")) return "text-info bg-info-soft/60";
  if (line.startsWith("+")) return "bg-ok-soft text-ok";
  if (line.startsWith("-")) return "bg-danger-soft text-danger";
  return "text-muted";
}

/** Everything Claude (or you) changed since the starter's starting point, from the workspace's git repo. */
export function ChangesView({ refreshKey }: { refreshKey: unknown }) {
  const [diff, setDiff] = useState<Diff | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/diff")
      .then((r) => r.json())
      .then((d: Diff) => !cancelled && setDiff(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!diff) return <p className="p-4 text-sm text-muted">Loading changes…</p>;
  if (!diff.available) {
    return <p className="p-4 text-sm text-muted">Changes need git, which isn&apos;t installed on this computer.</p>;
  }
  if (!diff.changes.length) {
    return <p className="p-4 text-sm text-muted">No changes yet. The files are exactly as the starter created them.</p>;
  }

  const count = (patch: string, sign: "+" | "-") => patch.split("\n").filter((l) => l.startsWith(sign)).length;

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted">
        Compared with the starter&apos;s starting point (<code className="font-mono">git diff</code> inside your workspace).
      </p>
      {diff.changes.map((c) => (
        <details key={c.path} open={diff.changes.length <= 3} className="overflow-hidden rounded-md border border-line">
          <summary className="flex cursor-pointer items-center gap-2 bg-surface-2 px-3 py-2 text-sm">
            <span className={`rounded px-1.5 text-[11px] font-medium ${STATUS_STYLE[c.status]}`}>{c.status}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{c.path}</span>
            <span className="font-mono text-xs text-ok">+{count(c.patch, "+")}</span>
            <span className="font-mono text-xs text-danger">−{count(c.patch, "-")}</span>
          </summary>
          <pre className="max-h-96 overflow-auto py-1 font-mono text-[12px] leading-relaxed">
            {c.patch.split("\n").map((line, i) => (
              <div key={i} className={`px-3 whitespace-pre ${lineClass(line)}`}>
                {line || " "}
              </div>
            ))}
          </pre>
        </details>
      ))}
    </div>
  );
}

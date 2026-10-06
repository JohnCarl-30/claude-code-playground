"use client";

import { approveCommands, commandLine } from "@/lib/mcp-approvals";
import type { CustomMcpServer } from "@/lib/run-types";

type StdioServer = Extract<CustomMcpServer, { type: "stdio" }>;

/** Shows the exact commands stdio MCP servers will run, and asks before the first run. */
export function ApproveCommands({
  servers,
  before,
  onApprove,
  onCancel,
}: {
  servers: StdioServer[];
  /** What happens next, e.g. "this run starts". */
  before: string;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const one = servers.length === 1;
  return (
    <div role="alertdialog" aria-label="Run these commands?" className="space-y-2 rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm">
      <p className="font-medium text-warn">
        {one ? "This MCP server runs a program" : "These MCP servers run programs"} on your computer
      </p>
      <p className="text-xs text-ink/80">
        Before {before}, check {one ? "the command" : "each command"}. It runs with your permissions, so only continue if you trust it.
        You&apos;re asked once for each exact command.
      </p>
      <ul className="space-y-1.5">
        {servers.map((s) => (
          <li key={s.name}>
            <span className="text-xs font-medium">{s.name}</span>
            <code className="mt-0.5 block break-all rounded-md bg-surface px-2 py-1 font-mono text-[12px]">{commandLine(s)}</code>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            approveCommands(servers);
            onApprove();
          }}
          className="h-8 rounded-lg bg-accent px-3 font-medium text-white hover:opacity-90"
        >
          {one ? "Run it" : "Run them"}
        </button>
        <button type="button" onClick={onCancel} className="h-8 rounded-lg border border-line bg-surface px-3 font-medium hover:bg-surface-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

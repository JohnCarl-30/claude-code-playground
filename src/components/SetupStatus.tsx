"use client";

import { useEffect, useState } from "react";

export type SetupStatus =
  | { ready: true; mode: "login" | "api-key" | "cloud"; label: string; warning?: string }
  | { ready: false; mode: "login" | "api-key"; reason: string };

// One check per page load, shared by every component that asks.
let statusPromise: Promise<SetupStatus> | null = null;
function loadStatus() {
  statusPromise ??= fetch("/api/status")
    .then((r) => r.json() as Promise<SetupStatus>)
    .catch(() => ({ ready: false as const, mode: "login" as const, reason: "Couldn't reach the playground server." }));
  return statusPromise;
}

/** Forget the cached status so the next check asks the server again. */
export function forgetSetupStatus() {
  statusPromise = null;
}

export function useSetupStatus() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

/**
 * Practice mode: when Claude isn't set up, explain what still works and the
 * ways to connect Claude. Renders nothing when Claude is ready.
 */
export function SetupBanner() {
  const status = useSetupStatus();
  if (!status) return null;
  if (status.ready) {
    return status.warning ? (
      <p className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-2 text-sm text-warn">{status.warning}</p>
    ) : null;
  }
  return (
    <section role="status" className="space-y-3 rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm">
      <div>
        <p className="font-medium text-warn">Practice mode: Claude isn&apos;t connected</p>
        <p className="mt-0.5 text-ink/80">{status.reason}</p>
      </div>
      <p>
        <strong>You can still</strong> write and run code in the Workspace below (Files, Run &amp; test, the request tester, Changes), edit
        the Claude config, and use <strong>Check my work</strong> on challenges.
      </p>
      <div>
        <p className="font-medium">To talk to Claude, pick one:</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            <strong>A Claude subscription</strong> (Pro, Max, Team or Enterprise): install{" "}
            <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer" className="underline">
              Claude Code
            </a>
            , run <code className="font-mono">claude</code> once and sign in, then reload.
          </li>
          <li>
            <strong>An Anthropic API key</strong> (pay as you go, from the{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="underline">
              Claude Console
            </a>
            ): add <code className="font-mono">PLAYGROUND_AUTH=api-key</code> and <code className="font-mono">ANTHROPIC_API_KEY=…</code> to{" "}
            <code className="font-mono">.env.local</code>, then restart <code className="font-mono">npm run dev</code>.
          </li>
          <li>
            <strong>Amazon Bedrock, Google Vertex AI or Microsoft Foundry</strong>: set Claude Code&apos;s provider variables (for example{" "}
            <code className="font-mono">CLAUDE_CODE_USE_BEDROCK=1</code>) and restart. See the README.
          </li>
        </ol>
      </div>
      <button
        onClick={() => {
          forgetSetupStatus();
          window.location.reload();
        }}
        className="h-8 rounded-lg border border-warn/40 bg-surface px-3 text-sm hover:bg-surface-2"
      >
        I&apos;ve set it up: check again
      </button>
    </section>
  );
}

/** Small status badge for the header. */
export function SetupPill() {
  const status = useSetupStatus();
  const base = "hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-block";
  if (!status) return <span className={`${base} bg-surface-2 text-muted`}>Checking Claude…</span>;
  if (!status.ready) {
    return (
      <span className={`${base} bg-warn-soft text-warn`} title={status.reason}>
        Practice mode · no Claude
      </span>
    );
  }
  const how = status.mode === "api-key" ? "Using your API key (billed per use)" : status.mode === "cloud" ? `Using Claude through ${status.label}` : "Runs on your Claude Code login, no API key";
  return (
    <span className={`${base} bg-ok-soft text-ok`} title={how}>
      ✓ {status.mode === "login" ? `Signed in · ${status.label}` : status.label}
    </span>
  );
}

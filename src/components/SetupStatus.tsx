"use client";

import { useEffect, useState } from "react";

type Status = { signedIn: true; plan: string | null } | { signedIn: false; reason: string };

// One check per page load, shared by every component that asks.
let statusPromise: Promise<Status> | null = null;
function loadStatus() {
  statusPromise ??= fetch("/api/status")
    .then((r) => r.json() as Promise<Status>)
    .catch(() => ({ signedIn: false as const, reason: "Couldn't reach the playground server." }));
  return statusPromise;
}

export function useSetupStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

/** Explains how to sign in when Claude Code isn't ready. Renders nothing when all is well. */
export function SetupBanner() {
  const status = useSetupStatus();
  if (!status || status.signedIn) return null;
  return (
    <div role="alert" className="rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm">
      <p className="font-medium text-warn">Claude isn&apos;t ready yet</p>
      <p className="mt-1">{status.reason}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Install Claude Code from{" "}
          <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer" className="underline">
            claude.com/claude-code
          </a>
          .
        </li>
        <li>
          Run <code className="font-mono">claude</code> in a terminal and sign in with your Claude account.
        </li>
        <li>Reload this page.</li>
      </ol>
    </div>
  );
}

/** Small login status badge for the header. */
export function SetupPill() {
  const status = useSetupStatus();
  const base = "hidden rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-block";
  if (!status) return <span className={`${base} bg-surface-2 text-muted`}>Checking login…</span>;
  if (!status.signedIn) return <span className={`${base} bg-warn-soft text-warn`}>Not signed in</span>;
  return (
    <span className={`${base} bg-ok-soft text-ok`} title="Runs on your Claude Code login, no API key">
      ✓ Signed in{status.plan ? ` · ${status.plan}` : ""}
    </span>
  );
}

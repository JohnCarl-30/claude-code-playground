"use client";

import { useState } from "react";
import type { Challenge, CheckResult } from "@/lib/challenges";
import { markPassed } from "@/lib/tried";
import { Markdownish } from "./Markdownish";
import { useSetupStatus } from "./SetupStatus";

/** A challenge's goal, requirements and hints, with "Check my work". */
export function ChallengePanel({ challenge, passedBefore }: { challenge: Challenge; passedBefore: boolean }) {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [hints, setHints] = useState(0);
  const setup = useSetupStatus();

  async function check() {
    setChecking(true);
    setError("");
    try {
      const res = await fetch(`/api/challenges/${challenge.id}/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = (await res.json()) as { results?: CheckResult[]; error?: string };
      if (data.error || !data.results) {
        setError(data.error ?? "Couldn't check your work.");
        return;
      }
      setResults(data.results);
      if (data.results.every((r) => r.pass)) markPassed(challenge.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  const byId = new Map(results?.map((r) => [r.id, r]));
  const met = results?.filter((r) => r.pass).length ?? 0;
  const done = !!results && met === results.length;

  return (
    <section aria-label="Challenge" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <header className="space-y-1.5">
        <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-accent">
          Challenge · {challenge.area}
          <span className="rounded-full bg-surface-2 px-2 py-0.5 normal-case tracking-normal text-muted">{challenge.level}</span>
          {passedBefore && <span className="rounded-full bg-ok-soft px-2 py-0.5 normal-case tracking-normal text-ok">✓ passed before</span>}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{challenge.title}</h1>
        <Markdownish blocks={[challenge.goal]} className="max-w-3xl text-ink/85" />
      </header>

      {setup && !setup.ready && (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          No Claude? You can still do this one yourself: write the code in the Workspace&apos;s <strong>Files</strong> tab, then click{" "}
          <strong>Check my work</strong>.
        </p>
      )}

      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          Requirements
          {results && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${done ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
              {met}/{results.length} met
            </span>
          )}
        </p>
        <ul className="space-y-1.5">
          {challenge.requirements.map((r) => {
            const result = byId.get(r.id);
            return (
              <li key={r.id} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-label={result ? (result.pass ? "met" : "not met") : "not checked yet"}
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${
                    !result ? "border border-line text-muted" : result.pass ? "bg-ok text-white" : "bg-danger text-white"
                  }`}
                >
                  {!result ? "" : result.pass ? "✓" : "✕"}
                </span>
                <span className="min-w-0">
                  <span>{r.label}</span>
                  {result && !result.pass && result.detail && <span className="mt-0.5 block break-words font-mono text-xs text-danger">{result.detail}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {done && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm font-medium text-ok">
          🎉 Challenge complete! Every requirement passed against your actual code.
        </p>
      )}
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={check}
          disabled={checking}
          className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {checking ? "Checking…" : results ? "↻ Check again" : "✓ Check my work"}
        </button>
        <span className="text-xs text-muted">Runs your code in the workspace (not Claude), so it&apos;s free and gives the same answer every time.</span>
      </div>

      <div className="border-t border-line pt-3 text-sm">
        {challenge.hints.slice(0, hints).map((h, i) => (
          <div key={i} className="mb-1.5 flex gap-2">
            <span aria-hidden>💡</span>
            <Markdownish blocks={[h]} />
          </div>
        ))}
        {hints < challenge.hints.length && (
          <button onClick={() => setHints((n) => n + 1)} className="text-sm text-accent hover:underline">
            {hints === 0 ? "Show a hint" : "Another hint"} ({hints + 1} of {challenge.hints.length})
          </button>
        )}
      </div>
    </section>
  );
}

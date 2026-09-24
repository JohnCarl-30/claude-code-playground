"use client";

import { findChallenge } from "@/lib/challenges";
import { DOMAINS, EXAM, domainProgress, isDone, readiness, type Domain, type PracticeRef, type Progress } from "@/lib/certification";
import { findExample } from "@/lib/examples";
import { QUIZZES } from "@/lib/quizzes";
import { QuizPanel } from "./QuizPanel";

const pct = (share: number) => `${Math.round(share * 100)}%`;
/** Exam weights, written like the guide does: 11.0%, 1.0%. */
const weight = (w: number) => `${w.toFixed(1)}%`;

function Bar({ share, className = "" }: { share: number; className?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`} aria-hidden>
      <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: pct(share) }} />
    </div>
  );
}

/** A link to an example or challenge, ticked when you've done it. */
function PracticeChip({ item, progress, onOpen }: { item: PracticeRef; progress: Progress; onOpen: (item: PracticeRef) => void }) {
  const title = item.kind === "example" ? findExample(item.id)?.title : findChallenge(item.id)?.title;
  const done = isDone(item, progress);
  return (
    <button
      onClick={() => onOpen(item)}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-xs ${
        done ? "border-ok/40 bg-ok-soft text-ok" : "border-line hover:bg-surface-2"
      }`}
    >
      <span aria-hidden>{done ? (item.kind === "challenge" ? "🏆" : "✓") : item.kind === "challenge" ? "◇" : "▷"}</span>
      <span className="sr-only">{item.kind === "challenge" ? "Challenge" : "Example"}:</span>
      {title ?? item.id}
    </button>
  );
}

/** Where to focus next: the domain with the most exam weight you haven't practiced yet. */
function nextFocus(progress: Progress) {
  return [...DOMAINS].sort((a, b) => b.weight * (1 - domainProgress(b, progress).share) - a.weight * (1 - domainProgress(a, progress).share))[0];
}

/** The exam blueprint with your progress, or one domain with its quiz. */
export function CertificationPanel({
  domain,
  progress,
  onOpen,
  onDomain,
}: {
  domain?: Domain;
  progress: Progress;
  onOpen: (item: PracticeRef) => void;
  onDomain: (id?: string) => void;
}) {
  if (domain) {
    const p = domainProgress(domain, progress);
    return (
      <div className="space-y-6">
        <header className="space-y-2">
          <button onClick={() => onDomain()} className="text-xs font-medium uppercase tracking-wide text-accent hover:underline">
            ← Certification track · {EXAM.code}
          </button>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Domain {domain.number}: {domain.name}
          </h1>
          <p className="text-muted">
            {weight(domain.weight)} of the exam · you&apos;ve done {p.done} of {p.total} ({pct(p.share)})
          </p>
          <Bar share={p.share} className="max-w-md" />
        </header>

        <section aria-label="Skills" className="space-y-3">
          {domain.skills.map((s) => (
            <div key={s.name} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{s.name}</h2>
                <span className="text-xs tabular-nums text-muted">{weight(s.weight)} of the exam</span>
              </div>
              <p className="mt-1 text-sm text-muted">{s.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {s.practice.map((item) => (
                  <PracticeChip key={`${item.kind}:${item.id}`} item={item} progress={progress} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <QuizPanel key={domain.id} domain={domain} passedBefore={progress.quizzes.has(domain.id)} />
      </div>
    );
  }

  const ready = readiness(progress);
  const focus = nextFocus(progress);
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Certification track · {EXAM.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{EXAM.name}</h1>
        <p className="max-w-3xl text-muted">
          The official exam blueprint, mapped to this playground. Each domain lists its skills, the examples and challenges that practice them,
          and a knowledge check. Your readiness is weighted the way the exam is.
        </p>
        <p className="text-sm text-muted">
          {EXAM.items} questions · {EXAM.minutes} minutes · pass with {EXAM.passing} ·{" "}
          <a href={EXAM.guideUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            official exam guide ↗
          </a>
        </p>
      </header>

      <section aria-label="Readiness" className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium">Your readiness</p>
          <p className="text-2xl font-semibold tabular-nums">{pct(ready)}</p>
        </div>
        <Bar share={ready} className="mt-2" />
        {ready < 1 && (
          <p className="mt-3 text-sm text-muted">
            Focus next:{" "}
            <button onClick={() => onDomain(focus.id)} className="font-medium text-accent hover:underline">
              {focus.name}
            </button>{" "}
            ({weight(focus.weight)} of the exam, {pct(domainProgress(focus, progress).share)} done).
          </p>
        )}
        <p className="mt-2 text-xs text-muted">Kept in this browser only. It measures practice here, not a prediction of your score.</p>
      </section>

      <ol className="space-y-2">
        {DOMAINS.map((d) => {
          const p = domainProgress(d, progress);
          return (
            <li key={d.id}>
              <button onClick={() => onDomain(d.id)} className="w-full rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-2">
                <div className="flex items-baseline gap-3">
                  <span className="w-5 shrink-0 font-mono text-sm text-muted">{d.number}</span>
                  <span className="min-w-0 flex-1 font-medium">{d.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{weight(d.weight)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3 pl-8">
                  <Bar share={p.share} className="flex-1" />
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
                    {p.done}/{p.total} · {progress.quizzes.has(d.id) ? "quiz ✓" : `${QUIZZES[d.id].length} Qs`}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

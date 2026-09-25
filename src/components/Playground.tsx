"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOMAINS, EXAM, domainProgress, findDomain, readiness, skillsFor, type PracticeRef } from "@/lib/certification";
import { MOCK_EXAM } from "@/lib/mock-exam";
import { CHALLENGES, findChallenge } from "@/lib/challenges";
import { BLANK_EXAMPLE_ID, EXAMPLES, EXAMPLE_GROUPS, findExample } from "@/lib/examples";
import type { RunConfig } from "@/lib/run-types";
import { usePassed, useQuizzesPassed, useTried } from "@/lib/tried";
import { CertificationPanel } from "./CertificationPanel";
import { MockExamPanel } from "./MockExamPanel";
import { ChallengePanel } from "./ChallengePanel";
import { Markdownish } from "./Markdownish";
import { Runner } from "./Runner";

const BLANK: Partial<RunConfig> = { prompt: "", tools: ["Read", "Glob", "Grep", "Edit"], demoMcp: true };

// Challenges and the certification track share the sidebar with examples; their ids carry these prefixes.
const CHALLENGE = "challenge:";
const CERT = "cert:";
const CERT_OVERVIEW = "cert:overview";
const CERT_EXAM = "cert:exam";

function initialSelection(exampleId?: string, challengeId?: string, certId?: string) {
  if (certId !== undefined) return findDomain(certId) || certId === "exam" ? CERT + certId : CERT_OVERVIEW;
  if (findChallenge(challengeId)) return CHALLENGE + challengeId;
  return findExample(exampleId)?.id ?? BLANK_EXAMPLE_ID;
}

function urlFor(id: string) {
  if (id === BLANK_EXAMPLE_ID) return "/";
  if (id.startsWith(CHALLENGE)) return `/?challenge=${encodeURIComponent(id.slice(CHALLENGE.length))}`;
  if (id.startsWith(CERT)) return `/?cert=${encodeURIComponent(id.slice(CERT.length))}`;
  return `/?example=${encodeURIComponent(id)}`;
}

/** Which exam skills the selected example or challenge practices, as links to their domains. */
function ExamSkills({ item, onDomain }: { item: PracticeRef; onDomain: (id: string) => void }) {
  const skills = skillsFor(item);
  if (!skills.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span>Practices for {EXAM.code}:</span>
      {skills.map(({ domain, skill }) => (
        <button
          key={`${domain.id}:${skill.name}`}
          onClick={() => onDomain(domain.id)}
          className="rounded-full border border-line px-2 py-0.5 hover:bg-surface-2 hover:text-ink"
        >
          D{domain.number} · {skill.name}
        </button>
      ))}
    </p>
  );
}

export function Playground({
  initialExampleId,
  initialChallengeId,
  initialCertId,
}: {
  initialExampleId?: string;
  initialChallengeId?: string;
  initialCertId?: string;
}) {
  const router = useRouter();
  const tried = useTried();
  const passed = usePassed();
  const quizzes = useQuizzesPassed();
  const progress = { tried, passed, quizzes };
  const [selectedId, setSelectedId] = useState(() => initialSelection(initialExampleId, initialChallengeId, initialCertId));
  const example = findExample(selectedId);
  const challenge = selectedId.startsWith(CHALLENGE) ? findChallenge(selectedId.slice(CHALLENGE.length)) : undefined;
  const cert = selectedId.startsWith(CERT);
  const certDomain = cert ? findDomain(selectedId.slice(CERT.length)) : undefined;
  const doneCount = EXAMPLES.filter((e) => tried.has(e.id)).length;
  const passedCount = CHALLENGES.filter((c) => passed.has(c.id)).length;
  const ready = Math.round(readiness(progress) * 100);

  function select(id: string) {
    setSelectedId(id);
    router.replace(urlFor(id), { scroll: false });
    if (id.startsWith(CERT)) window.scrollTo?.({ top: 0 });
  }
  const openPractice = (item: PracticeRef) => select(item.kind === "challenge" ? CHALLENGE + item.id : item.id);
  const openDomain = (id?: string) => select(id ? CERT + id : CERT_OVERVIEW);
  const openExam = () => select(CERT_EXAM);

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[272px_1fr] lg:gap-10 lg:py-8">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-2">
        {/* Phones: a compact picker. */}
        <label className="block lg:hidden">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
            Example · {doneCount}/{EXAMPLES.length} tried
          </span>
          <select
            value={selectedId}
            onChange={(e) => select(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value={BLANK_EXAMPLE_ID}>Blank: write your own prompt</option>
            <optgroup label={`Certification · ${ready}% ready`}>
              <option value={CERT_OVERVIEW}>Exam blueprint &amp; readiness</option>
              <option value={CERT_EXAM}>Mock exam ({MOCK_EXAM.items} questions, {MOCK_EXAM.minutes} min)</option>
              {DOMAINS.map((d) => (
                <option key={d.id} value={CERT + d.id}>
                  {quizzes.has(d.id) ? "✓ " : ""}
                  {d.number}. {d.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={`Challenges · ${passedCount}/${CHALLENGES.length} passed`}>
              {CHALLENGES.map((c) => (
                <option key={c.id} value={CHALLENGE + c.id}>
                  {passed.has(c.id) ? "🏆 " : ""}
                  {c.title}
                </option>
              ))}
            </optgroup>
            {EXAMPLE_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {EXAMPLES.filter((e) => e.group === group).map((e) => (
                  <option key={e.id} value={e.id}>
                    {tried.has(e.id) ? "✓ " : ""}
                    {e.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <nav aria-label="Examples" className="hidden space-y-6 text-sm lg:block">
          <div className="px-2">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Your progress</p>
              <p className="text-xs tabular-nums text-muted">
                {doneCount}/{EXAMPLES.length}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${(doneCount / EXAMPLES.length) * 100}%` }} />
            </div>
          </div>

          <button
            onClick={() => select(BLANK_EXAMPLE_ID)}
            aria-current={selectedId === BLANK_EXAMPLE_ID ? "true" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              selectedId === BLANK_EXAMPLE_ID ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2"
            }`}
          >
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-base leading-none text-white">
              +
            </span>
            <span className="min-w-0">
              <span className={`block font-medium ${selectedId === BLANK_EXAMPLE_ID ? "text-accent" : ""}`}>Blank</span>
              <span className="block text-xs text-muted">Write your own prompt</span>
            </span>
          </button>

          <div>
            <div className="mb-2 flex items-baseline justify-between px-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Certification · {EXAM.code}</p>
              <p className={`text-xs tabular-nums ${ready === 100 ? "text-ok" : "text-muted"}`}>{ready}% ready</p>
            </div>
            <ul className="space-y-0.5">
              <li>
                <button
                  onClick={() => select(CERT_OVERVIEW)}
                  aria-current={selectedId === CERT_OVERVIEW ? "true" : undefined}
                  className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                    selectedId === CERT_OVERVIEW ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
                  }`}
                >
                  <span aria-hidden className="w-4 shrink-0 text-center text-xs leading-none">
                    ◎
                  </span>
                  <span className="min-w-0 flex-1">Exam blueprint</span>
                </button>
              </li>
              <li>
                <button
                  onClick={openExam}
                  aria-current={selectedId === CERT_EXAM ? "true" : undefined}
                  className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                    selectedId === CERT_EXAM ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
                  }`}
                >
                  <span aria-hidden className="w-4 shrink-0 text-center text-xs leading-none">
                    ⏱
                  </span>
                  <span className="min-w-0 flex-1">Mock exam</span>
                  <span className="shrink-0 text-[10px] text-muted">{MOCK_EXAM.items} Qs</span>
                </button>
              </li>
              {DOMAINS.map((d) => {
                const active = selectedId === CERT + d.id;
                const share = domainProgress(d, progress).share;
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => select(CERT + d.id)}
                      aria-current={active ? "true" : undefined}
                      title={`${d.weight.toFixed(1)}% of the exam`}
                      className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                        active ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
                      }`}
                    >
                      <span aria-label={quizzes.has(d.id) ? "quiz passed" : undefined} className="w-4 shrink-0 text-center font-mono text-xs leading-none">
                        {quizzes.has(d.id) ? "✓" : d.number}
                      </span>
                      <span className="min-w-0 flex-1">{d.name}</span>
                      <span className={`shrink-0 text-[10px] tabular-nums ${share === 1 ? "text-ok" : "text-muted"}`}>{Math.round(share * 100)}%</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between px-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Challenges</p>
              <p className={`text-xs tabular-nums ${passedCount === CHALLENGES.length ? "text-ok" : "text-muted"}`}>
                {passedCount}/{CHALLENGES.length}
              </p>
            </div>
            <ul className="space-y-0.5">
              {CHALLENGES.map((c) => {
                const active = selectedId === CHALLENGE + c.id;
                const isPassed = passed.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => select(CHALLENGE + c.id)}
                      aria-current={active ? "true" : undefined}
                      title={`${c.area} · ${c.level}`}
                      className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                        active ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
                      }`}
                    >
                      <span aria-label={isPassed ? "passed" : undefined} className="w-4 shrink-0 text-center text-xs leading-none">
                        {isPassed ? "🏆" : "◇"}
                      </span>
                      <span className="min-w-0 flex-1">{c.title}</span>
                      <span className="shrink-0 text-[10px] text-muted">{c.level === "Beginner" ? "B" : "I"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {EXAMPLE_GROUPS.map((group) => {
            const items = EXAMPLES.filter((e) => e.group === group);
            const done = items.filter((e) => tried.has(e.id)).length;
            return (
              <div key={group}>
                <div className="mb-2 flex items-baseline justify-between px-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{group}</p>
                  <p className={`text-xs tabular-nums ${done === items.length ? "text-ok" : "text-muted"}`}>
                    {done}/{items.length}
                  </p>
                </div>
                <ul className="space-y-0.5">
                  {items.map((e) => {
                    const active = e.id === selectedId;
                    const isDone = tried.has(e.id);
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => select(e.id)}
                          aria-current={active ? "true" : undefined}
                          title={e.blurb}
                          className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                            active ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
                          }`}
                        >
                          <span
                            aria-label={isDone ? "tried" : undefined}
                            className={`grid size-4 shrink-0 place-items-center rounded-full border text-[10px] leading-none ${
                              isDone ? "border-ok bg-ok text-white" : active ? "border-accent" : "border-line"
                            }`}
                          >
                            {isDone ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1">{e.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 space-y-6">
        {selectedId === CERT_EXAM ? (
          <MockExamPanel onDomain={openDomain} />
        ) : cert ? (
          <CertificationPanel domain={certDomain} progress={progress} onOpen={openPractice} onDomain={openDomain} onExam={openExam} />
        ) : challenge ? (
          <ChallengePanel key={challenge.id} challenge={challenge} passedBefore={passed.has(challenge.id)} />
        ) : (
          <header className="space-y-2">
            {example ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-accent">{example.group}</p>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{example.title}</h1>
                <p className="max-w-2xl text-muted">{example.blurb}</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">What should Claude build?</h1>
                <p className="max-w-2xl text-muted">
                  Ask Claude to build or change something in your workspace, then keep the conversation going with follow-ups. Change the
                  tools, permissions and MCP servers to see what happens, or pick an example.
                </p>
              </>
            )}
          </header>
        )}
        {example && (
          <aside aria-label="What to notice" className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm">
            <p className="mb-1 font-medium">What to notice</p>
            <Markdownish blocks={[example.notice.map((n) => `- ${n}`).join("\n")]} className="text-ink/85" />
          </aside>
        )}
        {(example || challenge) && (
          <ExamSkills item={challenge ? { kind: "challenge", id: challenge.id } : { kind: "example", id: example!.id }} onDomain={openDomain} />
        )}
        {!cert && (
          <Runner
            key={selectedId}
            exampleId={example?.id}
            template={challenge?.template ?? example?.template}
            preset={challenge ? { ...challenge.config, prompt: "" } : (example?.config ?? BLANK)}
            showRawByDefault={example?.showRaw}
          />
        )}
      </main>
    </div>
  );
}

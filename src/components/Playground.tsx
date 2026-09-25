"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOMAINS, EXAM, findDomain, readiness, skillsFor, type PracticeRef } from "@/lib/certification";
import { useMistakes } from "@/lib/mistakes";
import { MOCK_EXAM } from "@/lib/mock-exam";
import { CERT, CERT_EXAM, CERT_MISTAKES, CERT_OVERVIEW, CERT_PLAN, CHALLENGE } from "@/lib/selection";
import { CHALLENGES, findChallenge } from "@/lib/challenges";
import { BLANK_EXAMPLE_ID, EXAMPLES, EXAMPLE_GROUPS, findExample } from "@/lib/examples";
import type { RunConfig } from "@/lib/run-types";
import { usePassed, useQuizzesPassed, useTried } from "@/lib/tried";
import { CertificationPanel } from "./CertificationPanel";
import { MistakesPanel } from "./MistakesPanel";
import { MockExamPanel } from "./MockExamPanel";
import { Sidebar } from "./Sidebar";
import { StudyPlanPanel } from "./StudyPlanPanel";
import { ChallengePanel } from "./ChallengePanel";
import { Markdownish } from "./Markdownish";
import { Runner } from "./Runner";

const BLANK: Partial<RunConfig> = { prompt: "", tools: ["Read", "Glob", "Grep", "Edit"], demoMcp: true };


function initialSelection(exampleId?: string, challengeId?: string, certId?: string) {
  if (certId !== undefined) return findDomain(certId) || ["exam", "mistakes", "plan"].includes(certId) ? CERT + certId : CERT_OVERVIEW;
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
  const mistakes = Object.keys(useMistakes()).length;
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
  const openMistakes = () => select(CERT_MISTAKES);

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
              <option value={CERT_PLAN}>Study plan</option>
              <option value={CERT_OVERVIEW}>Exam blueprint &amp; readiness</option>
              <option value={CERT_EXAM}>Mock exam ({MOCK_EXAM.items} questions, {MOCK_EXAM.minutes} min)</option>
              <option value={CERT_MISTAKES}>Mistakes deck ({mistakes})</option>
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

        <Sidebar selectedId={selectedId} onSelect={select} progress={progress} />
      </aside>

      <main className="min-w-0 space-y-6">
        {selectedId === CERT_PLAN ? (
          <StudyPlanPanel progress={progress} onOpen={select} />
        ) : selectedId === CERT_EXAM ? (
          <MockExamPanel onDomain={openDomain} onMistakes={openMistakes} />
        ) : selectedId === CERT_MISTAKES ? (
          <MistakesPanel onExam={openExam} onDomain={openDomain} />
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

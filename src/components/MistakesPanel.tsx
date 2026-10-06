"use client";

import { useState } from "react";
import { DOMAINS, EXAM } from "@/lib/certification";
import { MASTERED_AFTER, practiceSet, recordAnswers, useMistakes } from "@/lib/mistakes";
import { findQuestion } from "@/lib/mock-exam";
import { isCorrect } from "@/lib/quizzes";
import { QuestionCard } from "./QuizPanel";

const ROUND = 10;

/** Practice the questions you've missed until each one is right twice in a row. */
export function MistakesPanel({ onExam, onDomain }: { onExam: () => void; onDomain: (id: string) => void }) {
  const deck = useMistakes();
  const [round, setRound] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Record<string, number[]>>({});
  const [checked, setChecked] = useState(false);
  const [summary, setSummary] = useState("");
  const ids = Object.keys(deck);

  function start() {
    setRound(practiceSet(deck, ROUND));
    setPicked({});
    setChecked(false);
    setSummary("");
  }

  function check() {
    if (!round) return;
    const answers = round.map((id) => ({ id, right: isCorrect(findQuestion(id)!.question, picked[id] ?? []) }));
    const right = answers.filter((a) => a.right).length;
    const { cleared } = recordAnswers(answers);
    setChecked(true);
    setSummary(`${right}/${round.length} right.${cleared ? ` ${cleared} cleared from the deck.` : ""}`);
  }

  const byDomain = DOMAINS.map((d) => ({ d, n: ids.filter((id) => findQuestion(id)?.domain === d.id).length })).filter((x) => x.n);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Certification track · {EXAM.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mistakes deck</h1>
        <p className="max-w-3xl text-muted">
          Every question you get wrong in a knowledge check or the mock exam lands here. Answer it right {MASTERED_AFTER} times in a row to clear it.
          Rounds start with the ones you&apos;ve made the least progress on.
        </p>
      </header>

      {ids.length === 0 && !round ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <p className="font-medium">Nothing to practice yet.</p>
          <p className="mt-1 text-sm text-muted">Questions you miss in a knowledge check or the mock exam show up here.</p>
          <button onClick={onExam} className="mt-3 h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
            Take the mock exam
          </button>
        </section>
      ) : (
        <section aria-label="Deck" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-5">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {ids.length} question{ids.length === 1 ? "" : "s"} to clear
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
              {byDomain.map(({ d, n }) => (
                <button key={d.id} onClick={() => onDomain(d.id)} className="rounded-full border border-line px-2 py-0.5 hover:bg-surface-2 hover:text-ink">
                  D{d.number} · {d.name}: {n}
                </button>
              ))}
            </p>
          </div>
          {ids.length > 0 && (!round || checked) && (
            <button onClick={start} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
              {round ? "Next round" : `Practice ${Math.min(ROUND, ids.length)}`}
            </button>
          )}
        </section>
      )}

      {round && (
        <section aria-label="Round" className="space-y-4">
          {round.map((id, i) => {
            const found = findQuestion(id)!;
            const d = DOMAINS.find((x) => x.id === found.domain)!;
            const progress = deck[id];
            return (
              <QuestionCard
                key={id}
                q={found.question}
                n={i + 1}
                picked={picked[id] ?? []}
                onPick={(next) => setPicked((p) => ({ ...p, [id]: next }))}
                checked={checked}
                tag={`Domain ${d.number} · ${d.name}${checked ? (progress ? ` · ${progress.streak}/${MASTERED_AFTER} toward clearing` : " · cleared ✓") : ""}`}
              />
            );
          })}
          {checked ? (
            <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium">
              {summary}
            </p>
          ) : (
            <button onClick={check} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
              ✓ Check answers
            </button>
          )}
        </section>
      )}
    </div>
  );
}

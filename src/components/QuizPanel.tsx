"use client";

import { useMemo, useState } from "react";
import type { Domain } from "@/lib/certification";
import { isCorrect, QUIZ_PASS, QUIZZES, type QuizQuestion } from "@/lib/quizzes";
import { markQuizPassed } from "@/lib/tried";
import { Markdownish } from "./Markdownish";

/** The same shuffled option order every time for a question, so answers aren't always "A". */
export function optionOrder(id: string, count: number) {
  let seed = 0;
  for (const ch of id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const LETTERS = "ABCDEFGH";

function Question({
  q,
  n,
  picked,
  onPick,
  checked,
}: {
  q: QuizQuestion;
  n: number;
  picked: number[];
  onPick: (next: number[]) => void;
  checked: boolean;
}) {
  const order = useMemo(() => optionOrder(q.id, q.options.length), [q]);
  const multi = q.answer.length > 1;
  const right = checked && isCorrect(q, picked);
  return (
    <fieldset className="space-y-2 rounded-xl border border-line p-4">
      <legend className="sr-only">Question {n}</legend>
      <div className="flex gap-2">
        <span className="font-medium tabular-nums text-muted">{n}.</span>
        <Markdownish blocks={[q.prompt]} className="min-w-0 flex-1" />
      </div>
      <div className="space-y-1.5 pl-5">
        {order.map((i, pos) => {
          const selected = picked.includes(i);
          const correct = q.answer.includes(i);
          const tone = !checked
            ? selected
              ? "border-accent bg-accent-soft"
              : "border-line hover:bg-surface-2"
            : correct
              ? "border-ok bg-ok-soft"
              : selected
                ? "border-danger bg-danger-soft"
                : "border-line opacity-70";
          return (
            <label key={i} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${tone}`}>
              <input
                type={multi ? "checkbox" : "radio"}
                name={q.id}
                checked={selected}
                disabled={checked}
                onChange={() => onPick(multi ? (selected ? picked.filter((x) => x !== i) : [...picked, i]) : [i])}
                className="mt-1 accent-accent"
              />
              <span className="font-mono text-xs leading-6 text-muted">{LETTERS[pos]}</span>
              <Markdownish blocks={[q.options[i]]} className="min-w-0 flex-1" />
              {checked && correct && <span className="text-xs font-medium leading-6 text-ok">✓</span>}
            </label>
          );
        })}
      </div>
      {checked && (
        <div className={`ml-5 rounded-lg px-3 py-2 text-sm ${right ? "bg-ok-soft" : "bg-surface-2"}`}>
          <p className={`mb-1 font-medium ${right ? "text-ok" : "text-danger"}`}>{right ? "Correct." : "Not quite."}</p>
          <Markdownish blocks={[q.explain]} className="text-ink/85" />
          <a href={q.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent hover:underline">
            Source: {q.source.label} ↗
          </a>
        </div>
      )}
    </fieldset>
  );
}

/** A domain's knowledge check: answer everything, then check. Passing is remembered in this browser. */
export function QuizPanel({ domain, passedBefore }: { domain: Domain; passedBefore: boolean }) {
  const questions = QUIZZES[domain.id];
  const [picked, setPicked] = useState<Record<string, number[]>>({});
  const [checked, setChecked] = useState(false);
  const answered = questions.filter((q) => (picked[q.id] ?? []).length === q.answer.length).length;
  const score = questions.filter((q) => isCorrect(q, picked[q.id] ?? [])).length;
  const passed = score / questions.length >= QUIZ_PASS;

  function check() {
    setChecked(true);
    if (passed) markQuizPassed(domain.id);
  }

  return (
    <section aria-label="Knowledge check" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Knowledge check · {questions.length} questions</h2>
        {passedBefore && !checked && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs text-ok">✓ passed before</span>}
      </div>
      <p className="text-sm text-muted">
        Practice questions written for this playground (not from the real exam), in the exam&apos;s style: multiple choice, and multiple response where it
        says “Choose 2”. Every answer links to the official docs it comes from. Pass with {Math.round(QUIZ_PASS * 100)}%.
      </p>
      {questions.map((q, i) => (
        <Question
          key={q.id}
          q={q}
          n={i + 1}
          picked={picked[q.id] ?? []}
          onPick={(next) => setPicked((p) => ({ ...p, [q.id]: next }))}
          checked={checked}
        />
      ))}
      {checked && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm font-medium ${passed ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
          {score}/{questions.length} correct ({Math.round((score / questions.length) * 100)}%).{" "}
          {passed ? "Passed! This domain's quiz counts toward your readiness." : "Read the explanations, then try again."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {checked ? (
          <button
            onClick={() => {
              setPicked({});
              setChecked(false);
            }}
            className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
          >
            ↻ Try again
          </button>
        ) : (
          <button onClick={check} disabled={answered === 0} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            ✓ Check answers
          </button>
        )}
        {!checked && (
          <span className="text-xs text-muted">
            {answered}/{questions.length} answered
          </span>
        )}
      </div>
    </section>
  );
}

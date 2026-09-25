"use client";

import { localStore } from "./local-store";
import { recordAnswers } from "./mistakes";
import { drawExam, findQuestion, MOCK_EXAM, scoreExam, type ExamItem, type ExamResult } from "./mock-exam";
import { isCorrect } from "./quizzes";

// The mock exam you're taking and your past results, kept in this browser so
// a reload (or closing the tab) doesn't lose your place or restart the clock.

export type Attempt = {
  /** "exam" is timed and goes into your history; "retry" practices the questions you missed. */
  kind: "exam" | "retry";
  items: ExamItem[];
  answers: Record<string, number[]>;
  flagged: string[];
  startedAt: number;
  /** When the timer runs out (exams only). */
  endsAt?: number;
  finishedAt?: number;
  result?: ExamResult;
};

export type PastExam = { finishedAt: number; minutes: number; scaled: number; passed: boolean; correct: number; total: number };

export type ExamState = { current: Attempt | null; history: PastExam[] };

const EMPTY: ExamState = { current: null, history: [] };

const store = localStore<ExamState>("claude-code-playground:mock-exam:v1", EMPTY, (raw) => {
  const parsed = (raw ?? {}) as Partial<ExamState>;
  // Drop questions that no longer exist (the bank changes over time).
  const current = parsed.current ? { ...parsed.current, items: parsed.current.items.filter((i) => findQuestion(i.id)) } : null;
  return { current, history: Array.isArray(parsed.history) ? parsed.history : [] };
});

export const useExamState = store.useValue;
const update = store.update;

export const examActions = {
  start(seed: number, now = Date.now()) {
    const items = drawExam(seed);
    update((s) => ({ ...s, current: { kind: "exam", items, answers: {}, flagged: [], startedAt: now, endsAt: now + MOCK_EXAM.minutes * 60_000 } }));
  },
  /** Practice just these questions again, untimed and unscored in your history. */
  retry(items: ExamItem[], now = Date.now()) {
    update((s) => ({ ...s, current: { kind: "retry", items, answers: {}, flagged: [], startedAt: now } }));
  },
  answer(id: string, picked: number[]) {
    update((s) => (s.current && !s.current.finishedAt ? { ...s, current: { ...s.current, answers: { ...s.current.answers, [id]: picked } } } : s));
  },
  toggleFlag(id: string) {
    update((s) => {
      if (!s.current || s.current.finishedAt) return s;
      const flagged = s.current.flagged.includes(id) ? s.current.flagged.filter((f) => f !== id) : [...s.current.flagged, id];
      return { ...s, current: { ...s.current, flagged } };
    });
  },
  finish(now = Date.now()) {
    const attempt = store.read().current;
    if (!attempt || attempt.finishedAt) return;
    // Every question counts for the mistakes deck, unanswered ones as missed (as in the score).
    recordAnswers(attempt.items.map((i) => ({ id: i.id, right: isCorrect(findQuestion(i.id)!.question, attempt.answers[i.id] ?? []) })), now);
    update((s) => {
      const a = s.current;
      if (!a || a.finishedAt) return s;
      const result = scoreExam(a.items, a.answers);
      const finishedAt = a.endsAt ? Math.min(now, a.endsAt) : now;
      const done = { ...a, finishedAt, result };
      if (a.kind !== "exam") return { ...s, current: done };
      const past: PastExam = {
        finishedAt,
        minutes: Math.max(1, Math.round((finishedAt - a.startedAt) / 60_000)),
        scaled: result.scaled,
        passed: result.passed,
        correct: result.correct,
        total: result.total,
      };
      return { current: done, history: [past, ...s.history].slice(0, 20) };
    });
  },
  /** Leave the results screen (the attempt is already in your history). */
  close() {
    update((s) => ({ ...s, current: null }));
  },
};

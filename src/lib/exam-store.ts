"use client";

import { localStore } from "./local-store";
import { recordAnswers } from "./mistakes";
import type { SkillId } from "./certification";
import { drawExam, drawTest, findQuestion, MOCK_EXAM, scoreExam, testMinutes, type DomainScore, type ExamItem, type ExamResult, type TestSpec } from "./mock-exam";
import { isCorrect } from "./quizzes";

// The practice test you're taking and your past results, kept in this browser
// so a reload (or closing the tab) doesn't lose your place or restart the clock.

/** A custom test's settings, kept so you can take another one like it. */
export type CustomSpec = TestSpec & { timed: boolean };

export type Attempt = {
  /**
   * "exam" is the timed mock exam; "custom" is a test you built. Both go into your history. "retry"
   * practices the questions you missed.
   */
  kind: "exam" | "custom" | "retry";
  items: ExamItem[];
  answers: Record<string, number[]>;
  flagged: string[];
  startedAt: number;
  /** When the timer runs out (exams only). */
  endsAt?: number;
  finishedAt?: number;
  result?: ExamResult;
  spec?: CustomSpec;
};

export type PastExam = {
  /** Missing on results saved before custom tests existed: those were all mock exams. */
  kind?: "exam" | "custom";
  finishedAt: number;
  minutes: number;
  scaled: number;
  passed: boolean;
  correct: number;
  total: number;
  byObjective?: Partial<Record<SkillId, DomainScore>>;
};

/** Just the full mock exams: a custom test isn't shaped like the real exam, so its estimated score isn't comparable. */
export const mockExams = (history: readonly PastExam[]) => history.filter((h) => (h.kind ?? "exam") === "exam");

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
  /** A test you built: timed at the real exam's pace, unless you turned the timer off. */
  startCustom(seed: number, spec: CustomSpec, now = Date.now()) {
    const items = drawTest(seed, spec);
    const endsAt = spec.timed ? now + testMinutes(items.length) * 60_000 : undefined;
    update((s) => ({ ...s, current: { kind: "custom", items, answers: {}, flagged: [], startedAt: now, endsAt, spec } }));
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
      if (a.kind === "retry") return { ...s, current: done };
      const past: PastExam = {
        kind: a.kind,
        finishedAt,
        minutes: Math.max(1, Math.round((finishedAt - a.startedAt) / 60_000)),
        scaled: result.scaled,
        passed: result.passed,
        correct: result.correct,
        total: result.total,
        byObjective: result.byObjective,
      };
      return { current: done, history: [past, ...s.history].slice(0, 20) };
    });
  },
  /** Leave the results screen (the attempt is already in your history). */
  close() {
    update((s) => ({ ...s, current: null }));
  },
};

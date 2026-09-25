"use client";

import { useSyncExternalStore } from "react";
import { drawExam, findQuestion, MOCK_EXAM, scoreExam, type ExamItem, type ExamResult } from "./mock-exam";

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

const KEY = "claude-code-playground:mock-exam:v1";
const EMPTY: ExamState = { current: null, history: [] };
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: ExamState = EMPTY;

function read(): ExamState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed = raw ? (JSON.parse(raw) as Partial<ExamState>) : null;
      // Drop questions that no longer exist (the bank changes over time).
      const current = parsed?.current ? { ...parsed.current, items: parsed.current.items.filter((i) => findQuestion(i.id)) } : null;
      cached = { current, history: Array.isArray(parsed?.history) ? parsed.history : [] };
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

function write(next: ExamState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: keep going in memory for this page.
    cachedRaw = JSON.stringify(next);
    cached = next;
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const useExamState = () => useSyncExternalStore(subscribe, read, () => EMPTY);

function update(change: (state: ExamState) => ExamState) {
  write(change(read()));
}

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

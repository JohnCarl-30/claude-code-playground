"use client";

import { localStore } from "./local-store";
import { findQuestion } from "./mock-exam";

// Your mistakes deck: every question you got wrong in a knowledge check or a
// mock exam, until you answer it right twice in a row. Kept in this browser.

export type Mistake = { misses: number; streak: number; lastMissed: number };
export type Deck = Record<string, Mistake>;

/** Right answers in a row that clear a question from the deck. */
export const MASTERED_AFTER = 2;

const store = localStore<Deck>("claude-code-playground:mistakes:v1", {}, (raw) => {
  const deck: Deck = {};
  if (raw && typeof raw === "object") {
    for (const [id, m] of Object.entries(raw as Record<string, Partial<Mistake>>)) {
      // Questions can be removed from the bank; forget those.
      if (findQuestion(id) && typeof m?.misses === "number") deck[id] = { misses: m.misses, streak: m.streak ?? 0, lastMissed: m.lastMissed ?? 0 };
    }
  }
  return deck;
});

export const useMistakes = store.useValue;

/**
 * Update the deck with answers: a wrong answer adds the question (or resets its
 * streak); a right answer to a question in the deck counts toward clearing it.
 */
export function recordAnswers(answers: { id: string; right: boolean }[], now = Date.now()) {
  const before = store.read();
  let added = 0;
  let cleared = 0;
  const deck = { ...before };
  for (const { id, right } of answers) {
    const m = deck[id];
    if (!right) {
      if (!m) added++;
      deck[id] = { misses: (m?.misses ?? 0) + 1, streak: 0, lastMissed: now };
    } else if (m) {
      if (m.streak + 1 >= MASTERED_AFTER) {
        delete deck[id];
        cleared++;
      } else {
        deck[id] = { ...m, streak: m.streak + 1 };
      }
    }
  }
  store.update(() => deck);
  return { added, cleared };
}

/** What to practice next: least progress first, then most missed, then longest ago. */
export function practiceSet(deck: Deck, limit = 10): string[] {
  return Object.entries(deck)
    .sort(([, a], [, b]) => a.streak - b.streak || b.misses - a.misses || a.lastMissed - b.lastMissed)
    .slice(0, limit)
    .map(([id]) => id);
}

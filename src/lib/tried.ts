"use client";

import { localStore } from "./local-store";

// Small sets of ids remembered in this browser (and synced, if you sign in): examples you've run, challenges and quizzes you've passed.
const EMPTY: readonly string[] = [];

function idSetStore(key: string) {
  const store = localStore<readonly string[]>(key, EMPTY, (raw) => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : EMPTY));
  return {
    add(id: string) {
      if (!store.read().includes(id)) store.update((list) => [...list, id]);
    },
    /** Empty during server rendering. */
    useSet(): ReadonlySet<string> {
      return new Set(store.useValue());
    },
  };
}

export const TRIED_KEY = "claude-code-playground:tried:v1";
export const PASSED_KEY = "claude-code-playground:challenges-passed:v1";
export const QUIZZES_KEY = "claude-code-playground:quizzes-passed:v1";

const tried = idSetStore(TRIED_KEY);
const passed = idSetStore(PASSED_KEY);

/** An example you've run successfully. */
export const markTried = (id: string) => tried.add(id);
export const useTried = () => tried.useSet();

/** A challenge whose checks all passed. */
export const markPassed = (id: string) => passed.add(id);
export const usePassed = () => passed.useSet();

const quizzes = idSetStore(QUIZZES_KEY);

/** An exam domain whose knowledge check you passed. */
export const markQuizPassed = (domain: string) => quizzes.add(domain);
export const useQuizzesPassed = () => quizzes.useSet();

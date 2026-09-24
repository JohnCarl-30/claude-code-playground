"use client";

import { useSyncExternalStore } from "react";

// Small sets of ids remembered in this browser only: examples you've run, challenges and quizzes you've passed.
const EMPTY: readonly string[] = [];

function idSetStore(key: string) {
  let cachedRaw: string | null = null;
  let cachedList: readonly string[] = EMPTY;
  const listeners = new Set<() => void>();

  function read(): readonly string[] {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      // Storage blocked (private window, strict settings): progress just isn't kept.
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        cachedList = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : EMPTY;
      } catch {
        cachedList = EMPTY;
      }
    }
    return cachedList;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    // Keep other tabs in sync.
    const onStorage = (e: StorageEvent) => e.key === key && listener();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    add(id: string) {
      const list = read();
      if (list.includes(id)) return;
      try {
        localStorage.setItem(key, JSON.stringify([...list, id]));
      } catch {}
      listeners.forEach((l) => l());
    },
    /** Empty during server rendering. */
    useSet(): ReadonlySet<string> {
      const list = useSyncExternalStore(subscribe, read, () => EMPTY);
      return new Set(list);
    },
  };
}

const tried = idSetStore("claude-code-playground:tried:v1");
const passed = idSetStore("claude-code-playground:challenges-passed:v1");

/** An example you've run successfully. */
export const markTried = (id: string) => tried.add(id);
export const useTried = () => tried.useSet();

/** A challenge whose checks all passed. */
export const markPassed = (id: string) => passed.add(id);
export const usePassed = () => passed.useSet();

const quizzes = idSetStore("claude-code-playground:quizzes-passed:v1");

/** An exam domain whose knowledge check you passed. */
export const markQuizPassed = (domain: string) => quizzes.add(domain);
export const useQuizzesPassed = () => quizzes.useSet();

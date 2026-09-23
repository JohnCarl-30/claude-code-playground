"use client";

import { useSyncExternalStore } from "react";

// Completed lessons are stored in this browser only, as "track/lesson" ids.
const KEY = "claude-code-playground:progress:v1";
const EMPTY: readonly string[] = [];

let cachedRaw: string | null = null;
let cachedList: readonly string[] = EMPTY;
const listeners = new Set<() => void>();

function read(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
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

function write(list: readonly string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const lessonId = (track: string, lesson: string) => `${track}/${lesson}`;

export function markLessonDone(id: string) {
  const list = read();
  if (!list.includes(id)) write([...list, id]);
}

export function markLessonNotDone(id: string) {
  write(read().filter((x) => x !== id));
}

export function resetProgress() {
  write(EMPTY);
}

/** The set of completed lesson ids. Empty during server rendering. */
export function useProgress(): ReadonlySet<string> {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  return new Set(list);
}

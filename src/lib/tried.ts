"use client";

import { useSyncExternalStore } from "react";

// Examples you have run successfully, stored in this browser only.
const KEY = "claude-code-playground:tried:v1";
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

export function markTried(id: string) {
  const list = read();
  if (!list.includes(id)) write([...list, id]);
}

/** The set of example ids you've run successfully. Empty during server rendering. */
export function useTried(): ReadonlySet<string> {
  const list = useSyncExternalStore(subscribe, read, () => EMPTY);
  return new Set(list);
}

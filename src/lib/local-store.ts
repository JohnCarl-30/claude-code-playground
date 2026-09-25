"use client";

import { useSyncExternalStore } from "react";

/**
 * A JSON value kept in this browser's localStorage, shared by every component
 * that reads it and kept in sync across tabs. `clean` turns whatever is stored
 * (maybe from an older version, maybe hand-edited) into a valid value.
 * If storage is blocked, it still works in memory for the page.
 */
export function localStore<T>(key: string, empty: T, clean: (raw: unknown) => T) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cached = empty;

  function read(): T {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return cached;
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cached = raw ? clean(JSON.parse(raw)) : empty;
      } catch {
        cached = empty;
      }
    }
    return cached;
  }

  function write(next: T) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      cachedRaw = JSON.stringify(next);
      cached = next;
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === key && listener();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    read,
    update: (change: (value: T) => T) => write(change(read())),
    /** React hook: the current value (`empty` during server rendering). */
    useValue: () => useSyncExternalStore(subscribe, read, () => empty),
  };
}

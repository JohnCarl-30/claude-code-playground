"use client";

import { useSyncExternalStore } from "react";
import type { CustomMcpServer } from "./run-types";

// MCP servers you added stay available across examples, in this browser only.
const KEY = "claude-code-playground:mcp-servers:v1";
const EMPTY: CustomMcpServer[] = [];

let cachedRaw: string | null = null;
let cached: CustomMcpServer[] = EMPTY;
const listeners = new Set<() => void>();

export function loadSavedMcpServers(): CustomMcpServer[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const parsed: unknown = JSON.parse(raw ?? "[]");
      cached = Array.isArray(parsed) ? (parsed as CustomMcpServer[]) : EMPTY;
    } catch {
      cached = EMPTY;
    }
  }
  return cached;
}

export function saveMcpServers(servers: CustomMcpServer[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(servers));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Your saved servers; empty during server rendering. */
export function useSavedMcpServers(): CustomMcpServer[] {
  return useSyncExternalStore(subscribe, loadSavedMcpServers, () => EMPTY);
}

/** Merge lists by name; later lists win. */
export function mergeServers(...lists: CustomMcpServer[][]): CustomMcpServer[] {
  const byName = new Map<string, CustomMcpServer>();
  for (const list of lists) for (const s of list) byName.set(s.name, s);
  return [...byName.values()];
}

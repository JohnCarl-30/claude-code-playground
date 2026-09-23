"use client";

import type { CustomMcpServer } from "./run-types";

// MCP servers you added stay available across examples, in this browser only.
const KEY = "claude-code-playground:mcp-servers:v1";

export function loadSavedMcpServers(): CustomMcpServer[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as CustomMcpServer[]) : [];
  } catch {
    return [];
  }
}

export function saveMcpServers(servers: CustomMcpServer[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(servers));
  } catch {}
}

/** Merge lists by name; later lists win. */
export function mergeServers(...lists: CustomMcpServer[][]): CustomMcpServer[] {
  const byName = new Map<string, CustomMcpServer>();
  for (const list of lists) for (const s of list) byName.set(s.name, s);
  return [...byName.values()];
}

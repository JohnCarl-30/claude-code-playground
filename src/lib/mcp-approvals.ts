"use client";

import { localStore } from "./local-store";
import type { CustomMcpServer } from "./run-types";

// A stdio MCP server is a program that runs on your computer. The first time a
// given command would run (for a session, Test connection or the inspector),
// the playground shows it and asks. Approvals are remembered in this browser,
// by the exact command and arguments, so a changed command asks again.

const store = localStore<readonly string[]>("claude-code-playground:mcp-approved:v1", [], (raw) =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [],
);

type StdioServer = Extract<CustomMcpServer, { type: "stdio" }>;

/** The exact command line, as one string: what gets approved. */
export const commandLine = (s: StdioServer) => [s.command, ...s.args].join(" ");
const keyOf = (s: StdioServer) => JSON.stringify([s.command, ...s.args]);

export const useApprovedCommands = store.useValue;

/** The stdio servers in this list whose exact command hasn't been approved yet. */
export function unapproved(servers: CustomMcpServer[], approved: readonly string[] = store.read()): StdioServer[] {
  return servers.filter((s): s is StdioServer => s.type === "stdio" && !approved.includes(keyOf(s)));
}

export function approveCommands(servers: StdioServer[]) {
  const keys = servers.map(keyOf);
  store.update((list) => [...new Set([...list, ...keys])]);
}

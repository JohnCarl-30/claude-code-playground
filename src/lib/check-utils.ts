import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_DIR } from "./workspace";

// Shared by the "Check my work" checkers.

export type Outcome = { pass: boolean; detail?: string };
export type Results = Record<string, Outcome>;

export const ok = (): Outcome => ({ pass: true });
export const fail = (detail: string): Outcome => ({ pass: false, detail });

/** Every requirement fails for the same reason. */
export const failAll = (ids: string[], why: string): Results => Object.fromEntries(ids.map((id) => [id, fail(why)]));

/** Environment for your programs: no Anthropic credentials or endpoints, no inherited Node flags. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("ANTHROPIC_") && k !== "NODE_OPTIONS") env[k] = v;
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}

export const workspaceFile = (rel: string) => path.join(WORKSPACE_DIR, rel);
export const readText = (rel: string) => readFile(workspaceFile(rel), "utf8").catch(() => null);

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The useful part of a crash: the error line and where it happened, not Node's stack trace. */
export function crashSummary(output: string) {
  const lines = output.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const i = lines.findIndex((l) => /^\w*Error\b|^\s*\w*Error:/.test(l.trim()));
  if (i === -1) return lines.slice(-3).join(" · ") || "no output";
  // Node prints the failing line's location above the error; otherwise use the first stack frame outside node_modules.
  const at = /[\w-]+\.m?js:\d+/;
  const where = lines.slice(0, i).find((l) => at.test(l)) ?? lines.slice(i + 1).find((l) => at.test(l) && !l.includes("node_modules") && !l.includes("node:"));
  return [lines[i].trim(), where && `(${where.trim().split("/").pop()})`].filter(Boolean).join(" ");
}

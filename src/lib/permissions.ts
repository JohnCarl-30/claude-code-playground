import "server-only";
import { isInsideWorkspace } from "./workspace";

const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep"]);
const PATH_KEYS = ["file_path", "path", "notebook_path"];

/** The file paths a tool call wants to touch. */
export function pathsIn(input: Record<string, unknown>) {
  return PATH_KEYS.map((k) => input[k]).filter((v): v is string => typeof v === "string");
}

export type PreCheck = { decision: "allow" | "deny"; reason: string } | { decision: "ask" };

/**
 * The playground's permission rules, before asking the person:
 * switched-off tools and paths outside workspace/ are denied, read-only tools
 * and "Always allow" tools are allowed, and everything else is a question.
 */
export function precheckTool(
  toolName: string,
  input: Record<string, unknown>,
  enabledTools: ReadonlySet<string>,
  alwaysAllowed: ReadonlySet<string> = new Set(),
): PreCheck {
  if (!toolName.startsWith("mcp__") && !enabledTools.has(toolName) && toolName !== "Agent") {
    return { decision: "deny", reason: `${toolName} is switched off in this playground run.` };
  }
  const outside = pathsIn(input).find((p) => !isInsideWorkspace(p));
  if (outside) return { decision: "deny", reason: `${outside} is outside this project. Only files inside the workspace are allowed.` };
  if (READ_ONLY_TOOLS.has(toolName)) return { decision: "allow", reason: "Read-only tool inside workspace/" };
  if (alwaysAllowed.has(toolName)) return { decision: "allow", reason: "You chose Always allow for this run" };
  return { decision: "ask" };
}

const WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

export type Guard = { decision: "deny" | "ask"; reason: string } | null;

/**
 * Runs as a PreToolUse hook on every tool call, before Claude Code applies
 * permission rules. It can't be switched off, so allow rules in
 * .claude/settings.local.json never let Claude leave the workspace, and edits
 * to settings files (whose hooks run shell commands) always ask you first.
 */
export function guardTool(toolName: string, input: Record<string, unknown>): Guard {
  const paths = pathsIn(input);
  const outside = paths.find((p) => !isInsideWorkspace(p));
  if (outside) return { decision: "deny", reason: `${outside} is outside this project. Only files inside the workspace are allowed.` };
  if (WRITE_TOOLS.has(toolName) && paths.some((p) => /(^|[\\/])\.claude[\\/]settings(\.local)?\.json$/.test(p))) {
    return { decision: "ask", reason: "Settings files can run shell commands (hooks) and grant permissions, so changes always need your OK." };
  }
  return null;
}

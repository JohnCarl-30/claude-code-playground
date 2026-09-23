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

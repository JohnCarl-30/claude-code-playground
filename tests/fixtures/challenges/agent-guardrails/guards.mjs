import path from "node:path";

const DANGEROUS = [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, /\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/i];

export async function blockDangerousCommands(input) {
  const command = input.tool_name === "Bash" ? String(input.tool_input?.command ?? "") : "";
  const hit = DANGEROUS.find((re) => re.test(command));
  if (!hit) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Blocked a dangerous command: ${command}`,
    },
  };
}

const SRC = path.resolve("src") + path.sep;

export async function canUseTool(toolName, input) {
  if (["Read", "Glob", "Grep"].includes(toolName)) return { behavior: "allow", updatedInput: input };
  if (["Edit", "Write"].includes(toolName)) {
    const target = path.resolve(String(input.file_path ?? ""));
    if (target.startsWith(SRC)) return { behavior: "allow", updatedInput: input };
    return { behavior: "deny", message: `Only files inside src/ can be changed, not ${input.file_path}.` };
  }
  return { behavior: "deny", message: `${toolName} isn't allowed for this agent.` };
}

export const reviewer = {
  description: "Reviews code for bugs and security problems. Use it after making changes, before calling the work done.",
  prompt: "You are a careful code reviewer. Read the changed files and report bugs and security problems, most serious first. Don't edit anything.",
  tools: ["Read", "Grep", "Glob"],
  model: "haiku",
};

// Guardrails for the agent in agent.mjs. "Check my work" calls these the same
// way the Agent SDK does, so you can get them right without spending tokens.

/**
 * A PreToolUse hook: runs before every matching tool call, and can block it.
 * input.tool_name is the tool; for Bash, input.tool_input.command is the command.
 * Return {} to let the call through, or deny it:
 *   { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "why" } }
 */
export async function blockDangerousCommands(input, toolUseId, { signal }) {
  // TODO: deny `rm -rf …` and piping a download into a shell (`curl … | sh`). Allow everything else.
  return {};
}

/**
 * canUseTool: decides each tool call that no permission rule already settled.
 * Return { behavior: "allow", updatedInput: input } or { behavior: "deny", message: "why" }.
 */
export async function canUseTool(toolName, input, { signal }) {
  // TODO: allow Read, Glob and Grep; allow Edit and Write only for files inside src/
  // (resolve the path first: "src/../package.json" is not inside src/); deny everything else.
  return { behavior: "deny", message: "canUseTool isn't written yet." };
}

/** A subagent definition: a read-only code reviewer that Claude can delegate to. */
export const reviewer = {
  // TODO: description (when Claude should use it), prompt, read-only tools, and model: "haiku".
};

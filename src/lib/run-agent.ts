import "server-only";
import path from "node:path";
import {
  type AgentDefinition,
  type CanUseTool,
  type HookCallbackMatcher,
  type HookEvent,
  type McpServerConfig,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import { createDemoMcpServer, DEMO_MCP_TOOLS } from "./demo-mcp";
import { BUDGET_LIMITS, type CustomMcpServer, type RunConfig, type RunEvent } from "./run-types";
import { guardTool, pathsIn, precheckTool } from "./permissions";
import { WORKSPACE_DIR, ensureWorkspace } from "./workspace";

// Permission prompts waiting for a click in the browser, keyed by request id.
// Kept on globalThis so the /api/permission route sees the same map in dev.
type Decision = { allow: boolean; always: boolean };
type Pending = { resolve: (decision: Decision) => void };
const g = globalThis as unknown as { __pendingPermissions?: Map<string, Pending> };
const pending = (g.__pendingPermissions ??= new Map());

/** `always` = allow this tool for the rest of the run without asking again. */
export function answerPermission(id: string, allow: boolean, always = false) {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  entry.resolve({ allow, always: allow && always });
  return true;
}

/** Turn the playground's server list into Agent SDK mcpServers config. */
export function toSdkMcpServers(servers: CustomMcpServer[]): Record<string, McpServerConfig> {
  return Object.fromEntries(
    servers.map((s) => [
      s.name,
      s.type === "stdio" ? { type: "stdio" as const, command: s.command, args: s.args } : { type: "http" as const, url: s.url },
    ]),
  );
}


const SUBAGENTS: Record<string, AgentDefinition> = {
  "code-reviewer": {
    description: "Reviews code for bugs and explains them in plain language. Use it for any code review request.",
    prompt:
      "You are a friendly code reviewer for beginners. Read the relevant files, find bugs, and explain each one in one or two plain sentences. Do not edit files.",
    tools: ["Read", "Glob", "Grep"],
    model: "haiku",
  },
};

// Three specialists the main agent can run in parallel and then combine.
const TEAM: Record<string, AgentDefinition> = {
  "bug-hunter": {
    description: "Finds correctness bugs in code. Use for the bug part of a review.",
    prompt: "You hunt for bugs. Read the code you are pointed at and list each real bug in one or two plain sentences, with the line number. Do not edit files.",
    tools: ["Read", "Glob", "Grep"],
    model: "haiku",
  },
  "readability-reviewer": {
    description: "Reviews code for naming, clarity and comments. Use for the readability part of a review.",
    prompt: "You review readability for beginners. Suggest at most three small improvements to names, structure or comments. Do not edit files.",
    tools: ["Read", "Glob", "Grep"],
    model: "haiku",
  },
  "test-designer": {
    description: "Designs missing test cases. Use for the testing part of a review.",
    prompt: "You design tests. Read the code and its existing tests, then propose up to three missing test cases as short node:test snippets. Do not edit files.",
    tools: ["Read", "Glob", "Grep"],
    model: "haiku",
  },
};

function clampBudget(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return BUDGET_LIMITS.default;
  return Math.min(Math.max(n, BUDGET_LIMITS.min), BUDGET_LIMITS.max);
}

/**
 * The Agent SDK options for a playground conversation: tools, permissions
 * (canUseTool + the always-on workspace guard), hooks, MCP servers, subagents
 * and project config. `emit` receives events produced inside callbacks
 * (permission prompts, decisions, hooks) so they can join the timeline.
 */
export async function buildOptions(config: RunConfig, emit: (event: RunEvent) => void, abortController: AbortController): Promise<Options> {
  await ensureWorkspace();

  const useAgents = config.subagents || config.team || config.projectConfig;
  // Project config brings slash commands, skills and subagents, which need these tools.
  const extraTools = [...(useAgents ? ["Agent"] : []), ...(config.projectConfig ? ["Skill"] : [])];
  const enabled = new Set<string>([...config.tools, ...extraTools]);
  // Tools the person chose "Always allow" for during this run.
  const alwaysAllowed = new Set<string>();

  const canUseTool: CanUseTool = async (toolName, input, { signal: toolSignal }) => {
    const check = precheckTool(toolName, input, enabled, alwaysAllowed);
    if (check.decision === "deny") {
      emit({ kind: "permission_decision", tool: toolName, allowed: false, reason: check.reason, by: "playground" });
      return { behavior: "deny" as const, message: check.reason };
    }
    if (check.decision === "allow") {
      emit({ kind: "permission_decision", tool: toolName, allowed: true, reason: check.reason, by: "playground" });
      return { behavior: "allow" as const, updatedInput: input };
    }

    // Anything else (Write, Edit, Bash, MCP tools you added, ...) is up to the person in the browser.
    const id = crypto.randomUUID();
    const { allow: allowed, always } = await new Promise<Decision>((resolve) => {
      pending.set(id, { resolve });
      toolSignal.addEventListener("abort", () => answerPermission(id, false), { once: true });
      emit({ kind: "permission_request", id, tool: toolName, input });
    });
    if (always) alwaysAllowed.add(toolName);
    emit({
      kind: "permission_decision",
      tool: toolName,
      allowed,
      reason: always ? "You clicked Always allow" : allowed ? "You clicked Allow" : "You clicked Deny",
      by: "you",
    });
    return allowed
      ? { behavior: "allow" as const, updatedInput: input }
      : { behavior: "deny" as const, message: "The user denied this action in the playground." };
  };

  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
    PreToolUse: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name !== "PreToolUse") return {};
            const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
            const touchesReadme = pathsIn(toolInput).some((p) => path.basename(p) === "README.md");
            if (["Write", "Edit"].includes(input.tool_name) && touchesReadme) {
              emit({ kind: "hook", event: "PreToolUse", tool: input.tool_name, note: "Blocked: README.md is protected by a hook" });
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: "deny",
                  permissionDecisionReason: "README.md is protected by a PreToolUse hook in this playground.",
                },
              };
            }
            emit({ kind: "hook", event: "PreToolUse", tool: input.tool_name, note: "Ran before the tool" });
            return {};
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          async (input) => {
            if (input.hook_event_name === "PostToolUse") {
              emit({ kind: "hook", event: "PostToolUse", tool: input.tool_name, note: "Ran after the tool finished" });
            }
            return {};
          },
        ],
      },
    ],
  };

  // Subagents run in the background by default, which ends the turn before
  // their reports arrive. Force them into the foreground so the timeline reads
  // top to bottom. Several Agent calls in one turn still run at the same time.
  const foregroundSubagents: HookCallbackMatcher = {
    matcher: "Agent",
    hooks: [
      async (input) => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            updatedInput: { ...toolInput, run_in_background: false },
          },
        };
      },
    ],
  };

  // Always on: keeps every tool call inside the workspace, even when allow rules
  // in .claude/settings.local.json would skip canUseTool.
  const workspaceGuard: HookCallbackMatcher = {
    hooks: [
      async (input) => {
        if (input.hook_event_name !== "PreToolUse") return {};
        const guard = guardTool(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>);
        if (!guard) return {};
        if (guard.decision === "deny") {
          emit({ kind: "permission_decision", tool: input.tool_name, allowed: false, reason: guard.reason, by: "playground" });
        }
        return {
          hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: guard.decision, permissionDecisionReason: guard.reason },
        };
      },
    ],
  };

  const activeHooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
    ...(config.hooks ? hooks : {}),
    PreToolUse: [workspaceGuard, ...(useAgents ? [foregroundSubagents] : []), ...(config.hooks ? hooks.PreToolUse ?? [] : [])],
  };

  // Drop ANTHROPIC_API_KEY so the SDK uses your Claude Code login rather than a key.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  return {
    cwd: WORKSPACE_DIR,
    env,
    abortController,
    model: config.model || undefined,
    permissionMode: config.permissionMode,
    tools: [...config.tools, ...extraTools],
    // The demo MCP tools are harmless, so they're pre-approved and skip canUseTool
    // (the SDK logs a CLAUDE_SDK_CAN_USE_TOOL_SHADOWED warning about this; expected).
    allowedTools: config.demoMcp ? DEMO_MCP_TOOLS : [],
    canUseTool,
    mcpServers: {
      ...(config.demoMcp ? { demo: createDemoMcpServer() } : {}),
      ...toSdkMcpServers(config.mcpServers),
    },
    // Ignore MCP servers from your own Claude Code config, so every run is reproducible.
    strictMcpConfig: true,
    // Ignore ~/.claude. With project config: CLAUDE.md, .claude/settings.json (shared: deny
    // rules and hooks apply, allow rules don't) and .claude/settings.local.json (personal).
    settingSources: config.projectConfig ? ["project", "local"] : [],
    // Stream command hooks from settings.json into the timeline.
    includeHookEvents: true,
    // Subagents defined in code; project config adds its own from .claude/agents/.
    agents: config.subagents || config.team ? { ...(config.subagents ? SUBAGENTS : {}), ...(config.team ? TEAM : {}) } : undefined,
    hooks: activeHooks,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: config.appendSystemPrompt || undefined,
    },
    maxTurns: Math.min(Math.max(config.maxTurns, 1), 40),
    // Spending cap: the SDK stops the run with an error_max_budget_usd result.
    maxBudgetUsd: clampBudget(config.maxBudgetUsd),
    // Word-by-word replies: stream_event messages with text deltas.
    includePartialMessages: true,
    // No cross-session memory files: a conversation remembers only its own turns.
    settings: { autoMemoryEnabled: false },
  };
}

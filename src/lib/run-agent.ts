import "server-only";
import path from "node:path";
import {
  query,
  type AgentDefinition,
  type CanUseTool,
  type HookCallbackMatcher,
  type HookEvent,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import { createDemoMcpServer, DEMO_MCP_TOOLS } from "./demo-mcp";
import type { RunConfig, RunEvent, SdkMessageLike } from "./run-types";
import { WORKSPACE_DIR, ensureWorkspace, isInsideWorkspace } from "./workspace";

// Permission prompts waiting for a click in the browser, keyed by request id.
// Kept on globalThis so the /api/permission route sees the same map in dev.
type Pending = { resolve: (allow: boolean) => void };
const g = globalThis as unknown as { __pendingPermissions?: Map<string, Pending> };
const pending = (g.__pendingPermissions ??= new Map());

export function answerPermission(id: string, allow: boolean) {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  entry.resolve(allow);
  return true;
}

const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep"]);
const PATH_KEYS = ["file_path", "path", "notebook_path"];

function pathsIn(input: Record<string, unknown>) {
  return PATH_KEYS.map((k) => input[k]).filter((v): v is string => typeof v === "string");
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

export async function* runAgent(config: RunConfig, signal: AbortSignal): AsyncGenerator<RunEvent> {
  await ensureWorkspace();

  // Events produced by callbacks (permissions, hooks) are queued here and
  // flushed between SDK messages, so everything arrives in one ordered stream.
  const sideEvents: RunEvent[] = [];
  let wake: (() => void) | null = null;
  const emit = (event: RunEvent) => {
    sideEvents.push(event);
    wake?.();
  };

  const enabled = new Set<string>(config.tools);

  const canUseTool: CanUseTool = async (toolName, input, { signal: toolSignal }) => {
    const deny = (reason: string) => {
      emit({ kind: "permission_decision", tool: toolName, allowed: false, reason, by: "playground" });
      return { behavior: "deny" as const, message: reason };
    };

    if (!toolName.startsWith("mcp__") && !enabled.has(toolName) && toolName !== "Agent") {
      return deny(`${toolName} is switched off in this playground run.`);
    }
    const outside = pathsIn(input).find((p) => !isInsideWorkspace(p));
    if (outside) return deny(`${outside} is outside this project. Only files inside ${WORKSPACE_DIR} are allowed.`);

    if (READ_ONLY_TOOLS.has(toolName)) {
      emit({ kind: "permission_decision", tool: toolName, allowed: true, reason: "Read-only tool inside workspace/", by: "playground" });
      return { behavior: "allow" as const, updatedInput: input };
    }

    // Anything else (Write, Edit, Bash, ...) is up to the person in the browser.
    const id = crypto.randomUUID();
    const allowed = await new Promise<boolean>((resolve) => {
      pending.set(id, { resolve });
      toolSignal.addEventListener("abort", () => answerPermission(id, false), { once: true });
      emit({ kind: "permission_request", id, tool: toolName, input });
    });
    emit({
      kind: "permission_decision",
      tool: toolName,
      allowed,
      reason: allowed ? "You clicked Allow" : "You clicked Deny",
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

  const useAgents = config.subagents || config.team;
  const activeHooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
    ...(config.hooks ? hooks : {}),
    PreToolUse: [...(useAgents ? [foregroundSubagents] : []), ...(config.hooks ? hooks.PreToolUse ?? [] : [])],
  };

  // Drop ANTHROPIC_API_KEY so the SDK uses your Claude Code login rather than a key.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  const abortController = new AbortController();
  signal.addEventListener("abort", () => abortController.abort(), { once: true });

  const options: Options = {
    cwd: WORKSPACE_DIR,
    env,
    abortController,
    model: config.model || undefined,
    permissionMode: config.permissionMode,
    tools: [...config.tools, ...(useAgents ? ["Agent"] : [])],
    // The demo MCP tools are harmless, so they're pre-approved and skip canUseTool
    // (the SDK logs a CLAUDE_SDK_CAN_USE_TOOL_SHADOWED warning about this; expected).
    allowedTools: config.demoMcp ? DEMO_MCP_TOOLS : [],
    canUseTool,
    mcpServers: config.demoMcp ? { demo: createDemoMcpServer() } : {},
    // Ignore MCP servers from your own Claude Code config, so every run is reproducible.
    strictMcpConfig: true,
    // Ignore ~/.claude settings; only load the workspace's CLAUDE.md when asked.
    settingSources: config.claudeMd ? ["project"] : [],
    agents: useAgents ? { ...(config.subagents ? SUBAGENTS : {}), ...(config.team ? TEAM : {}) } : undefined,
    hooks: activeHooks,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: config.appendSystemPrompt || undefined,
    },
    maxTurns: Math.min(Math.max(config.maxTurns, 1), 40),
  };

  const flush = function* () {
    while (sideEvents.length) yield sideEvents.shift()!;
  };

  // query() yields SDK messages; permission/hook callbacks may fire while it
  // is waiting, so race the next message against new side events.
  const iterator = query({ prompt: config.prompt, options })[Symbol.asyncIterator]();
  let next = iterator.next();
  try {
    while (true) {
      const sideEvent = new Promise<"side">((resolve) => (wake = () => resolve("side")));
      if (sideEvents.length) wake!();
      const winner = await Promise.race([next, sideEvent]);
      wake = null;
      yield* flush();
      if (winner === "side") continue;
      if (winner.done) break;
      yield { kind: "sdk", message: winner.value as unknown as SdkMessageLike };
      next = iterator.next();
    }
  } finally {
    yield* flush();
  }
}

// Types shared by the browser and the /api/run route.

export type PlaygroundPermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk";

export const BUILT_IN_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "WebSearch", "WebFetch"] as const;
export type BuiltInTool = (typeof BUILT_IN_TOOLS)[number];

/** An MCP server the person added in the playground. */
export type CustomMcpServer =
  | { name: string; type: "stdio"; command: string; args: string[] }
  | { name: string; type: "http"; url: string };

export const MCP_PRESETS: { server: CustomMcpServer; title: string; blurb: string }[] = [
  {
    server: { name: "memory", type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
    title: "Memory",
    blurb: "A knowledge graph Claude can write to and read from. Runs locally with npx.",
  },
  {
    server: { name: "deepwiki", type: "http", url: "https://mcp.deepwiki.com/mcp" },
    title: "DeepWiki",
    blurb: "Ask questions about any public GitHub repository. Remote, no sign-up.",
  },
  {
    server: { name: "context7", type: "http", url: "https://mcp.context7.com/mcp" },
    title: "Context7",
    blurb: "Up-to-date docs for popular libraries and frameworks. Remote, no sign-up.",
  },
];

const MCP_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Checks MCP servers sent from the browser. Returns an error message, or the clean list. */
export function validateMcpServers(value: unknown): CustomMcpServer[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) return "Up to 8 MCP servers are allowed.";
  const names = new Set<string>(["demo"]);
  const clean: CustomMcpServer[] = [];
  for (const raw of value as Record<string, unknown>[]) {
    const name = String(raw?.name ?? "");
    if (!MCP_NAME.test(name)) return `MCP server name "${name}" must be lowercase letters, numbers, - or _ (max 32).`;
    if (names.has(name)) return `The MCP server name "${name}" is used twice (or is reserved).`;
    names.add(name);
    if (raw.type === "stdio") {
      const command = String(raw.command ?? "").trim();
      const args = Array.isArray(raw.args) ? raw.args.map(String) : [];
      if (!command) return `MCP server "${name}" needs a command.`;
      clean.push({ name, type: "stdio", command, args });
    } else if (raw.type === "http") {
      let url: URL;
      try {
        url = new URL(String(raw.url ?? ""));
      } catch {
        return `MCP server "${name}" needs a valid URL.`;
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") return `MCP server "${name}" must use http or https.`;
      clean.push({ name, type: "http", url: url.toString() });
    } else {
      return `MCP server "${name}" must be stdio or http.`;
    }
  }
  return clean;
}

export type RunConfig = {
  prompt: string;
  /** Empty string = whatever model your Claude Code install defaults to. */
  model: string;
  permissionMode: PlaygroundPermissionMode;
  tools: BuiltInTool[];
  /** Attach the in-process demo MCP server (dice, weather, notes). */
  demoMcp: boolean;
  /** Extra MCP servers the person added (stdio programs or HTTP URLs). */
  mcpServers: CustomMcpServer[];
  /**
   * Load the workspace's Claude Code config like the real CLI does: CLAUDE.md,
   * .claude/settings.json + settings.local.json (permission rules, hooks),
   * slash commands, skills and subagents (settingSources: ["project", "local"]).
   */
  projectConfig: boolean;
  /** Register a "code-reviewer" subagent Claude can delegate to. */
  subagents: boolean;
  /** Register a three-subagent review team for the orchestration example. */
  team: boolean;
  /** Register PreToolUse/PostToolUse hooks; also blocks edits to README.md. */
  hooks: boolean;
  appendSystemPrompt: string;
  maxTurns: number;
  /** Stop the run once its estimated cost passes this many US dollars. */
  maxBudgetUsd: number;
  /** Continue an earlier conversation (its session_id) instead of starting a new one. */
  resumeSessionId?: string;
};

export const BUDGET_LIMITS = { min: 0.05, max: 5, default: 1 };

export const DEFAULT_CONFIG: RunConfig = {
  prompt: "",
  model: "",
  permissionMode: "default",
  tools: ["Read", "Glob", "Grep"],
  demoMcp: false,
  mcpServers: [],
  projectConfig: false,
  subagents: false,
  team: false,
  hooks: false,
  appendSystemPrompt: "",
  maxTurns: 12,
  maxBudgetUsd: BUDGET_LIMITS.default,
};

export const MODEL_CHOICES = [
  { id: "", label: "Your Claude Code default" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fastest)" },
  { id: "claude-sonnet-5", label: "Sonnet 5" },
  { id: "claude-opus-5", label: "Opus 5" },
];

/** One line of the NDJSON stream sent from /api/run to the browser. */
export type RunEvent =
  | { kind: "run"; runId: string; workspace: string }
  /** A raw message from the Agent SDK, exactly as query() yielded it. */
  | { kind: "sdk"; message: SdkMessageLike }
  | { kind: "permission_request"; id: string; tool: string; input: unknown }
  | { kind: "permission_decision"; tool: string; allowed: boolean; reason: string; by: "playground" | "you" }
  | { kind: "hook"; event: string; tool: string; note: string }
  | { kind: "error"; message: string }
  | { kind: "done" };

// Loose view of SDKMessage for the client, which never imports the SDK.
export type SdkMessageLike = { type: string; subtype?: string; [key: string]: unknown };

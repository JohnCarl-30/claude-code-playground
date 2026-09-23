// Types shared by the browser and the /api/run route.

export type PlaygroundPermissionMode = "default" | "acceptEdits" | "plan" | "dontAsk";

export const BUILT_IN_TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "WebSearch", "WebFetch"] as const;
export type BuiltInTool = (typeof BUILT_IN_TOOLS)[number];

export type RunConfig = {
  prompt: string;
  /** Empty string = whatever model your Claude Code install defaults to. */
  model: string;
  permissionMode: PlaygroundPermissionMode;
  tools: BuiltInTool[];
  /** Attach the in-process demo MCP server (dice, weather, notes). */
  demoMcp: boolean;
  /** Load workspace/CLAUDE.md (settingSources: ["project"]). */
  claudeMd: boolean;
  /** Register a "code-reviewer" subagent Claude can delegate to. */
  subagents: boolean;
  /** Register a three-subagent review team for the orchestration lesson. */
  team: boolean;
  /** Register PreToolUse/PostToolUse hooks; also blocks edits to README.md. */
  hooks: boolean;
  appendSystemPrompt: string;
  maxTurns: number;
};

export const DEFAULT_CONFIG: RunConfig = {
  prompt: "",
  model: "",
  permissionMode: "default",
  tools: ["Read", "Glob", "Grep"],
  demoMcp: false,
  claudeMd: false,
  subagents: false,
  team: false,
  hooks: false,
  appendSystemPrompt: "",
  maxTurns: 12,
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

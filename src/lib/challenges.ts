import type { RunConfig } from "./run-types";
import type { TemplateId } from "./templates";

// Practice challenges: a goal, a starter project, and requirements that
// "Check my work" verifies against your actual workspace (never Claude's word).
// The checks themselves live in challenge-checks.ts (server only).

export type Requirement = { id: string; label: string };

export type Challenge = {
  id: string;
  title: string;
  area: "REST API" | "MCP" | "Claude Code config" | "Debugging" | "Agent SDK";
  level: "Beginner" | "Intermediate";
  template: TemplateId;
  /** What to build, in a few sentences. Supports **bold** and `code`. */
  goal: string;
  requirements: Requirement[];
  /** Revealed one at a time. */
  hints: string[];
  /** Settings the playground starts you with; you write the prompts. */
  config: Partial<RunConfig>;
};

const BUILDER: Partial<RunConfig> = { tools: ["Read", "Glob", "Grep", "Edit", "Write"], permissionMode: "acceptEdits", projectConfig: true, maxTurns: 30 };

export const CHALLENGES: Challenge[] = [
  {
    id: "api-todos",
    title: "A todo API",
    area: "REST API",
    level: "Beginner",
    template: "rest-api",
    goal: "Build a JSON todo API in `server.js`. Todos have an `id`, a `title` and a `done` flag, and live in memory. Use Claude to write it, then check your work.",
    requirements: [
      { id: "create", label: "POST /todos with { title } returns 201 and the new todo (id, title, done: false)" },
      { id: "validate", label: "POST /todos without a title returns 400 with an { error } message" },
      { id: "list", label: "GET /todos returns an array that includes the new todo" },
      { id: "missing", label: "GET /todos/<unknown id> returns 404 with an { error } message" },
      { id: "update", label: "PATCH /todos/:id with { done: true } returns 200 and the updated todo" },
      { id: "delete", label: "DELETE /todos/:id returns 204, and the todo is gone afterwards (404)" },
    ],
    hints: [
      "Give Claude the whole spec in one prompt: every route, the status codes, and the error format.",
      "The starter's CLAUDE.md and the rest-conventions skill already describe status codes. Turn on Project config so Claude reads them.",
      "Use Run & test → Start server and the request tester to try each route yourself before checking.",
    ],
    config: BUILDER,
  },
  {
    id: "api-filter",
    title: "Filter and search",
    area: "REST API",
    level: "Intermediate",
    template: "rest-api",
    goal: "Extend a todo API with query parameters. `GET /todos?done=true` returns only finished todos, and `GET /todos?q=milk` returns todos whose title contains the text (any case).",
    requirements: [
      { id: "create", label: "POST /todos with { title } returns 201 and the new todo" },
      { id: "done", label: "GET /todos?done=true returns only todos with done: true" },
      { id: "notdone", label: "GET /todos?done=false returns only todos with done: false" },
      { id: "search", label: "GET /todos?q=MILK finds todos whose title contains “milk” (any case)" },
      { id: "badquery", label: "GET /todos?done=maybe returns 400 with an { error } message" },
    ],
    hints: [
      "If your workspace doesn't have a todo API yet, finish “A todo API” first, or ask Claude for both at once.",
      "`new URL(req.url, …).searchParams` gives you the query parameters in node:http.",
      "Tell Claude exactly which values of `done` are valid, and what should happen otherwise.",
    ],
    config: BUILDER,
  },
  {
    id: "mcp-text-tools",
    title: "Text tools over MCP",
    area: "MCP",
    level: "Beginner",
    template: "mcp-server",
    goal: "Add two tools to your MCP server: `word_count` (counts the words in a `text`) and `reverse_text` (returns the `text` reversed). The checker connects to your server over stdio, like Claude Code does.",
    requirements: [
      { id: "starts", label: "The server starts and answers over MCP (stdio)" },
      { id: "listed", label: "It offers word_count and reverse_text, each with a description" },
      { id: "schema", label: "Both tools take a string input called text" },
      { id: "count", label: "word_count on “one two  three” answers 3" },
      { id: "reverse", label: "reverse_text on “abc” answers “cba”" },
    ],
    hints: [
      "Keep the existing greet tool as an example: `server.registerTool(name, { description, inputSchema }, handler)`.",
      "`inputSchema` is an object of zod fields, like `{ text: z.string() }`.",
      "Never console.log in an MCP server: stdout is the MCP channel.",
    ],
    config: BUILDER,
  },
  {
    id: "mcp-errors",
    title: "Tools that handle bad input",
    area: "MCP",
    level: "Intermediate",
    template: "mcp-server",
    goal: "Add a `convert_temperature` tool with a numeric `value` and a `unit` of `\"C\"` or `\"F\"`. It converts to the other unit. For an unknown unit it must return an MCP error result (`isError: true`) instead of crashing.",
    requirements: [
      { id: "listed", label: "The server offers convert_temperature with a description" },
      { id: "c2f", label: "100 C converts to 212 (F)" },
      { id: "f2c", label: "32 F converts to 0 (C)" },
      { id: "error", label: "An unknown unit gets a tool error (isError: true), and the server keeps running" },
    ],
    hints: [
      "Use `z.number()` for value. For unit, `z.string()` lets the handler see bad values; `z.enum` makes the SDK reject them for you.",
      "An error result looks like `{ isError: true, content: [{ type: \"text\", text: \"…\" }] }`.",
    ],
    config: BUILDER,
  },
  {
    id: "config-command",
    title: "Your own slash command",
    area: "Claude Code config",
    level: "Beginner",
    template: "rest-api",
    goal: "Create a slash command `/add-test` that asks Claude to write a `node:test` test for whatever route you pass it. Commands live in `.claude/commands/`.",
    requirements: [
      { id: "file", label: ".claude/commands/add-test.md exists" },
      { id: "description", label: "It has a description in its frontmatter" },
      { id: "arguments", label: "It uses $ARGUMENTS for the route you pass in" },
      { id: "nodetest", label: "It mentions node:test" },
    ],
    hints: [
      "You can write it yourself in the Claude config tab (＋ New command) or ask Claude to create it.",
      "Frontmatter is the `---` block at the top: `description: …` and optionally `argument-hint: …`.",
      "After checking, try it: type /add-test GET /health in the prompt.",
    ],
    config: BUILDER,
  },
  {
    id: "config-guardrails",
    title: "Guardrails for Tiny Shop",
    area: "Claude Code config",
    level: "Intermediate",
    template: "tiny-shop",
    goal: "Protect the tests and keep them green: Claude must never edit `src/cart.test.js`, the tests must run after every edit, and `git push` must always ask first.",
    requirements: [
      { id: "valid", label: ".claude/settings.json is valid JSON" },
      { id: "deny", label: "A deny rule blocks editing src/cart.test.js" },
      { id: "hook", label: "A PostToolUse hook on Edit/Write runs the tests (node --test or npm test)" },
      { id: "ask", label: "An ask rule makes Bash(git push…) always ask" },
    ],
    hints: [
      "Rules look like `Edit(./src/cart.test.js)` and `Bash(git push:*)`.",
      "Hooks go under `hooks.PostToolUse` with a `matcher` like `Edit|Write`.",
      "Claude asks before changing settings files, so you'll approve its edit (that's on purpose).",
    ],
    config: { ...BUILDER, permissionMode: "default" },
  },
  {
    id: "config-subagent",
    title: "A read-only specialist",
    area: "Claude Code config",
    level: "Beginner",
    template: "rest-api",
    goal: "Create a subagent called `security-reviewer` that reviews code for security problems. It must be read-only (no Edit, Write or Bash) and run on Haiku.",
    requirements: [
      { id: "file", label: "A subagent named security-reviewer exists in .claude/agents/" },
      { id: "description", label: "Its description says when Claude should use it" },
      { id: "readonly", label: "Its tools are read-only (no Edit, Write or Bash)" },
      { id: "model", label: "It runs on haiku" },
    ],
    hints: [
      "Subagents are Markdown files with frontmatter: name, description, tools, model.",
      "After checking, try it: ask Claude to use the security-reviewer subagent on server.js.",
    ],
    config: BUILDER,
  },
  {
    id: "debug-discount",
    title: "Fix the discount bug",
    area: "Debugging",
    level: "Beginner",
    template: "tiny-shop",
    goal: "Tiny Shop's discount codes give wrong totals. Find and fix the bug, and add a test for the `HALFOFF` code so it can't come back.",
    requirements: [
      { id: "fixed", label: "applyDiscount(200, \"SAVE10\") returns 180" },
      { id: "halfoff", label: "applyDiscount(80, \"HALFOFF\") returns 40" },
      { id: "test", label: "src/cart.test.js has a test that uses HALFOFF" },
      { id: "green", label: "All tests pass (node --test)" },
    ],
    hints: [
      "Ask Claude to find the bug first, without changing anything, then to fix it.",
      "Turn on Bash so Claude can run npm test to prove the fix, or use Run & test → Run tests yourself.",
    ],
    config: { ...BUILDER, tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"] },
  },
  {
    id: "agent-tool",
    title: "An agent with a custom tool",
    area: "Agent SDK",
    level: "Intermediate",
    template: "agent-sdk",
    goal: "Give the agent in `agent.mjs` a custom tool called `get_time` (built with `createSdkMcpServer` and `tool()`), allow it, and make the prompt ask what time it is. Keep the spending cap.",
    requirements: [
      { id: "syntax", label: "agent.mjs is valid JavaScript (node --check)" },
      { id: "tool", label: "It defines a get_time tool with tool() inside createSdkMcpServer" },
      { id: "wired", label: "The MCP server is passed in options.mcpServers" },
      { id: "allowed", label: "allowedTools includes mcp__<server>__get_time" },
      { id: "budget", label: "It still sets maxBudgetUsd" },
    ],
    hints: [
      "The agent-sdk starter's CLAUDE.md lists the pattern; turn on Project config.",
      "After checking, run it from Run & test → Run agent.mjs and watch it call your tool.",
    ],
    config: BUILDER,
  },
];

export function findChallenge(id: string | undefined) {
  return CHALLENGES.find((c) => c.id === id);
}

export type CheckResult = { id: string; pass: boolean; detail?: string };

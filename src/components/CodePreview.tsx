"use client";

import type { RunConfig } from "@/lib/run-types";
import { CodeBlock } from "./CodeBlock";

const q = (s: string) => JSON.stringify(s);

/** A string literal split over several lines ("…" +) so long prompts stay readable. */
function wrapped(s: string, indent: string, width = 72) {
  const parts: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line && (line + " " + word).length > width) {
      parts.push(line + " ");
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  parts.push(line);
  return parts.map(q).join(` +\n${indent}`);
}

/** The Agent SDK code that matches the current settings. */
/** The Agent SDK code for a live session with the current settings. */
export function sdkCodeFor(config: RunConfig) {
  const tools = [...config.tools, ...(config.subagents || config.team ? ["Agent"] : [])];
  const lines: string[] = [];
  const opt = (line: string) => lines.push(`    ${line}`);

  opt(`cwd: "./workspace",`);
  if (config.model) opt(`model: ${q(config.model)},`);
  opt(`permissionMode: ${q(config.permissionMode)},`);
  opt(`tools: ${JSON.stringify(tools)},`);
  opt(`maxTurns: ${config.maxTurns},`);
  opt(`maxBudgetUsd: ${config.maxBudgetUsd},`);
  if (config.appendSystemPrompt) {
    opt(`systemPrompt: { type: "preset", preset: "claude_code", append: ${q(config.appendSystemPrompt)} },`);
  }
  opt(`settingSources: ${config.projectConfig ? '["project", "local"], // CLAUDE.md + .claude/' : "[],"}`);

  const servers: string[] = [];
  if (config.demoMcp) servers.push(`      demo: demoServer, // createSdkMcpServer({ name: "demo", tools: [...] })`);
  for (const s of config.mcpServers) {
    servers.push(
      s.type === "stdio"
        ? `      ${q(s.name)}: { type: "stdio", command: ${q(s.command)}, args: ${JSON.stringify(s.args)} },`
        : `      ${q(s.name)}: { type: "http", url: ${q(s.url)} },`,
    );
  }
  if (servers.length) {
    opt("mcpServers: {");
    lines.push(...servers);
    opt("},");
  }
  const agents = [...(config.subagents ? ["code-reviewer"] : []), ...(config.team ? ["bug-hunter", "readability-reviewer", "test-designer"] : [])];
  if (agents.length) opt(`agents: { /* ${agents.join(", ")}: { description, prompt, tools, model } */ },`);
  if (config.hooks) opt("hooks: { PreToolUse: [...], PostToolUse: [...] }, // log calls, protect README.md");
  opt("canUseTool: askInTheBrowser, // shows the Allow / Deny cards");
  opt("includePartialMessages: true, // stream replies word by word");

  const first = config.prompt || "What does this project do?";
  return [
    'import { query } from "@anthropic-ai/claude-agent-sdk";',
    "",
    `const firstMessage =\n  ${wrapped(first, "  ")};`,
    "",
    "// A live session: the prompt is a stream of your messages, so it stays open.",
    "async function* yourMessages() {",
    '  yield { type: "user", message: { role: "user", content: firstMessage } };',
    "  // ...yield more whenever you type. Add priority: \"now\" to steer mid-task.",
    "}",
    "",
    "const session = query({",
    "  prompt: yourMessages(),",
    "  options: {",
    ...lines,
    "  },",
    "});",
    "",
    "// While it runs: session.interrupt(), session.setModel(\"claude-sonnet-5\"),",
    "// session.setPermissionMode(\"plan\")",
    "for await (const message of session) {",
    "  console.log(message.type, message);",
    "}",
  ].join("\n");
}

export function CodePreview({ config }: { config: RunConfig }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">
        The Claude Agent SDK call that matches your current settings. It updates as you change them. Install with{" "}
        <code className="font-mono whitespace-nowrap">npm install @anthropic-ai/claude-agent-sdk</code>.
      </p>
      <CodeBlock label="run.mjs" source={sdkCodeFor(config)} />
    </div>
  );
}

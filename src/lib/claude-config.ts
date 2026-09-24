import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Reads a project's Claude Code configuration the way a person would look at it:
// CLAUDE.md, .claude/settings.json (+ .local), commands, skills and subagents.

export type RulesFile = {
  file: string;
  exists: boolean;
  /** Set when the JSON can't be parsed; Claude Code would ignore the file. */
  error?: string;
  allow: string[];
  deny: string[];
  ask: string[];
  hooks: { event: string; matcher: string; command: string }[];
};

export type ConfigItem = { name: string; description: string; file: string; detail?: string };

export type ClaudeConfig = {
  claudeMd: boolean;
  settings: RulesFile;
  localSettings: RulesFile;
  commands: ConfigItem[];
  skills: ConfigItem[];
  agents: ConfigItem[];
};

/** Parse a Markdown file's `---` frontmatter (simple `key: value` lines). */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { data, body: text.slice(match[0].length) };
}

async function readText(file: string) {
  return readFile(file, "utf8").catch(() => null);
}

async function readRules(root: string, rel: string): Promise<RulesFile> {
  const empty: RulesFile = { file: rel, exists: false, allow: [], deny: [], ask: [], hooks: [] };
  const text = await readText(path.join(root, rel));
  if (text === null) return empty;
  let json: {
    permissions?: { allow?: unknown; deny?: unknown; ask?: unknown };
    hooks?: Record<string, { matcher?: string; hooks?: { type?: string; command?: string }[] }[]>;
  };
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ...empty, exists: true, error: err instanceof Error ? err.message : String(err) };
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const hooks = Object.entries(json.hooks ?? {}).flatMap(([event, matchers]) =>
    (Array.isArray(matchers) ? matchers : []).flatMap((m) =>
      (m.hooks ?? []).map((h) => ({ event, matcher: m.matcher ?? "*", command: h.command ?? `(${h.type ?? "hook"})` })),
    ),
  );
  return {
    file: rel,
    exists: true,
    allow: list(json.permissions?.allow),
    deny: list(json.permissions?.deny),
    ask: list(json.permissions?.ask),
    hooks,
  };
}

async function readItems(root: string, dir: string, kind: "command" | "agent" | "skill"): Promise<ConfigItem[]> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true }).catch(() => []);
  const items: ConfigItem[] = [];
  for (const entry of entries) {
    const rel = kind === "skill" ? path.posix.join(dir, entry.name, "SKILL.md") : path.posix.join(dir, entry.name);
    if (kind === "skill" ? !entry.isDirectory() : !entry.isFile() || !entry.name.endsWith(".md")) continue;
    const text = await readText(path.join(root, rel));
    if (text === null) continue;
    const { data, body } = parseFrontmatter(text);
    const fallback = kind === "skill" ? entry.name : entry.name.replace(/\.md$/, "");
    items.push({
      // Commands are named after their file; skills and agents use their frontmatter name.
      name: kind === "command" ? fallback : data.name || fallback,
      description: data.description || body.trim().split("\n")[0].slice(0, 120),
      file: rel,
      detail: kind === "command" ? data["argument-hint"] : kind === "agent" ? [data.tools && `tools: ${data.tools}`, data.model && `model: ${data.model}`].filter(Boolean).join(" · ") : undefined,
    });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readClaudeConfig(root: string): Promise<ClaudeConfig> {
  return {
    claudeMd: (await readText(path.join(root, "CLAUDE.md"))) !== null,
    settings: await readRules(root, ".claude/settings.json"),
    localSettings: await readRules(root, ".claude/settings.local.json"),
    commands: await readItems(root, ".claude/commands", "command"),
    skills: await readItems(root, ".claude/skills", "skill"),
    agents: await readItems(root, ".claude/agents", "agent"),
  };
}

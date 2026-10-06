"use client";

import { useState } from "react";
import type { ClaudeConfig, ConfigItem, RulesFile } from "@/lib/claude-config";

export type NewItemKind = "command" | "skill" | "agent";

/** Starter content for a new command, skill or subagent file. */
export function scaffold(kind: NewItemKind, name: string): { path: string; content: string } {
  if (kind === "command") {
    return {
      path: `.claude/commands/${name}.md`,
      content: `---\ndescription: What /${name} does, in one line\nargument-hint: <what to pass>\n---\n\nDo this: $ARGUMENTS\n`,
    };
  }
  if (kind === "skill") {
    return {
      path: `.claude/skills/${name}/SKILL.md`,
      content: `---\nname: ${name}\ndescription: What this skill knows, and when Claude should use it.\n---\n\n# ${name}\n\n- Write the know-how here.\n`,
    };
  }
  return {
    path: `.claude/agents/${name}.md`,
    content: `---\nname: ${name}\ndescription: What this subagent does, and when Claude should hand work to it.\ntools: Read, Grep, Glob\nmodel: haiku\n---\n\nYou are a specialist. Describe how to do the job here.\n`,
  };
}

const heading = "mb-1.5 text-xs font-medium uppercase tracking-wide text-muted";

function Rules({ rules, note, onOpen }: { rules: RulesFile; note: string; onOpen: (path: string) => void }) {
  const chip = (text: string, tone: string) => (
    <span key={text} className={`rounded px-1.5 py-0.5 font-mono text-[12px] ${tone}`}>
      {text}
    </span>
  );
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px]">{rules.file}</span>
        {rules.exists ? (
          <button onClick={() => onOpen(rules.file)} className="ml-auto text-xs text-accent hover:underline">
            Edit
          </button>
        ) : (
          <span className="ml-auto text-xs text-muted">not created</span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
      {rules.error && <p className="mt-2 rounded bg-danger-soft px-2 py-1 text-xs text-danger">Invalid JSON, so Claude Code ignores this file: {rules.error}</p>}
      {rules.exists && !rules.error && (
        <div className="mt-2 space-y-1.5 text-sm">
          {rules.allow.length + rules.deny.length + rules.ask.length === 0 && rules.hooks.length === 0 && (
            <p className="text-xs text-muted">No rules or hooks.</p>
          )}
          {rules.allow.length > 0 && <p className="flex flex-wrap items-center gap-1">allow {rules.allow.map((r) => chip(r, "bg-ok-soft text-ok"))}</p>}
          {rules.ask.length > 0 && <p className="flex flex-wrap items-center gap-1">ask {rules.ask.map((r) => chip(r, "bg-warn-soft text-warn"))}</p>}
          {rules.deny.length > 0 && <p className="flex flex-wrap items-center gap-1">deny {rules.deny.map((r) => chip(r, "bg-danger-soft text-danger"))}</p>}
          {rules.hooks.map((h, i) => (
            <p key={i} className="text-xs">
              🪝 <span className="font-medium">{h.event}</span> <span className="text-muted">on</span> <code className="font-mono">{h.matcher}</code>{" "}
              <span className="text-muted">runs</span> <code className="font-mono break-all">{h.command}</code>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Items({
  title,
  dir,
  kind,
  items,
  hint,
  onOpen,
  onCreate,
  onUse,
}: {
  title: string;
  dir: string;
  kind: NewItemKind;
  items: ConfigItem[];
  hint: string;
  onOpen: (path: string) => void;
  onCreate: (kind: NewItemKind, name: string) => void;
  onUse?: (item: ConfigItem) => void;
}) {
  const [name, setName] = useState("");
  const valid = /^[a-z0-9][a-z0-9-]{0,40}$/.test(name);
  return (
    <div>
      <p className={heading}>
        {title} <span className="font-mono normal-case tracking-normal">{dir}</span>
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">None yet. {hint}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.file} className="flex items-start gap-2 rounded-md border border-line px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-mono font-medium">
                  {kind === "command" ? "/" : ""}
                  {item.name}
                  {item.detail && <span className="ml-2 font-sans text-xs font-normal text-muted">{item.detail}</span>}
                </p>
                <p className="text-xs text-muted">{item.description}</p>
              </div>
              {onUse && (
                <button onClick={() => onUse(item)} className="rounded border border-line px-2 py-0.5 text-xs hover:bg-surface-2">
                  Use
                </button>
              )}
              <button onClick={() => onOpen(item.file)} className="text-xs text-accent hover:underline">
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            onCreate(kind, name);
            setName("");
          }
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          placeholder={`new-${kind}-name`}
          aria-label={`New ${kind} name`}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-[12px]"
        />
        <button type="submit" disabled={!valid} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50">
          ＋ New {kind}
        </button>
      </form>
    </div>
  );
}

/** What Claude Code loads from this project, and a place to change it. */
export function ClaudeConfigPanel({
  config,
  enabled,
  onToggle,
  onOpen,
  onCreate,
  onUseCommand,
  onAddStarterConfig,
}: {
  config: ClaudeConfig | null;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  onOpen: (path: string) => void;
  onCreate: (kind: NewItemKind, name: string) => void;
  onUseCommand: (name: string) => void;
  onAddStarterConfig: () => void;
}) {
  if (!config) return <p className="p-4 text-sm text-muted">Loading config…</p>;
  const empty = !config.settings.exists && !config.localSettings.exists && !config.commands.length && !config.skills.length && !config.agents.length;

  return (
    <div className="space-y-5 p-4 text-sm">
      <label className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 ${enabled ? "border-ok/40 bg-ok-soft" : "border-warn/40 bg-warn-soft"}`}>
        <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        <span>
          <span className="block font-medium">{enabled ? "Claude Code loads this config on every run" : "This config is ignored right now"}</span>
          <span className="block text-xs text-muted">
            Same as running <code className="font-mono">claude</code> in this folder: CLAUDE.md, both settings files, commands, skills and subagents.
          </span>
        </span>
      </label>

      {empty && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-info/30 bg-info-soft p-3">
          <p className="mr-auto">This workspace has no <code className="font-mono">.claude/</code> config yet.</p>
          <button onClick={onAddStarterConfig} className="rounded-md bg-info px-3 py-1.5 font-medium text-white hover:opacity-90">
            Add the starter&apos;s .claude/ config
          </button>
          <span className="w-full text-xs text-muted">Adds files only; nothing you already have is changed.</span>
        </div>
      )}

      <div>
        <p className={heading}>Memory</p>
        <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
          <span className="font-mono text-[13px]">CLAUDE.md</span>
          <span className="text-xs text-muted">{config.claudeMd ? "project instructions Claude reads at the start of every session" : "not created"}</span>
          <button onClick={() => onOpen("CLAUDE.md")} className="ml-auto text-xs text-accent hover:underline">
            {config.claudeMd ? "Edit" : "Create"}
          </button>
        </div>
      </div>

      <div>
        <p className={heading}>Permissions & hooks</p>
        <div className="grid gap-2 md:grid-cols-2">
          <Rules
            rules={config.settings}
            onOpen={onOpen}
            note="Shared with your team (committed). Its deny rules and hooks apply; allow rules from a cloned repo are not trusted."
          />
          <Rules
            rules={config.localSettings}
            onOpen={onOpen}
            note="Just for you (git-ignored). Allow rules here let tools run without asking."
          />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Rules look like <code className="font-mono">Bash(npm test:*)</code>, <code className="font-mono">Read(./.env)</code> or{" "}
          <code className="font-mono">Edit(./src/**)</code>. Whatever the rules say, the playground still keeps Claude inside the workspace,
          and changes to these files always ask you first.
        </p>
      </div>

      <Items
        title="Slash commands"
        dir=".claude/commands/"
        kind="command"
        items={config.commands}
        hint="A command is a saved prompt you run as /name; $ARGUMENTS is replaced by what you type after it."
        onOpen={onOpen}
        onCreate={onCreate}
        onUse={(item) => onUseCommand(item.name)}
      />
      <Items
        title="Skills"
        dir=".claude/skills/"
        kind="skill"
        items={config.skills}
        hint="A skill is know-how Claude loads only when a task needs it."
        onOpen={onOpen}
        onCreate={onCreate}
      />
      <Items
        title="Subagents"
        dir=".claude/agents/"
        kind="agent"
        items={config.agents}
        hint="A subagent is a specialist with its own instructions and tools."
        onOpen={onOpen}
        onCreate={onCreate}
      />
    </div>
  );
}

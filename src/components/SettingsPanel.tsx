"use client";

import { BUDGET_LIMITS, BUILT_IN_TOOLS, MODEL_CHOICES, type PlaygroundPermissionMode, type RunConfig } from "@/lib/run-types";

const MODES: { id: PlaygroundPermissionMode; label: string; hint: string }[] = [
  { id: "default", label: "default", hint: "Ask before edits and commands" },
  { id: "acceptEdits", label: "acceptEdits", hint: "Auto-approve edits, ask for commands" },
  { id: "plan", label: "plan", hint: "Look and plan only, no changes" },
  { id: "dontAsk", label: "dontAsk", hint: "Never ask; deny anything not pre-approved" },
];

const TOGGLES: { key: "demoMcp" | "claudeMd" | "subagents" | "team" | "hooks"; label: string; hint: string }[] = [
  { key: "demoMcp", label: "Demo MCP server", hint: "Dice, weather and notebook tools" },
  { key: "claudeMd", label: "Load CLAUDE.md", hint: "Project instructions from workspace/CLAUDE.md" },
  { key: "subagents", label: "code-reviewer subagent", hint: "A read-only helper on Haiku" },
  { key: "team", label: "Review team (3 subagents)", hint: "bug-hunter, readability-reviewer, test-designer" },
  { key: "hooks", label: "Hooks", hint: "Log tool calls and protect README.md" },
];

const label = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted";

export function SettingsPanel({
  config,
  onChange,
  disabled,
}: {
  config: RunConfig;
  onChange: (next: RunConfig) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) => onChange({ ...config, [key]: value });

  return (
    <fieldset disabled={disabled} className="grid gap-5 text-sm disabled:opacity-60 md:grid-cols-2">
      <div>
        <span className={label}>Model</span>
        <select
          value={config.model}
          onChange={(e) => set("model", e.target.value)}
          className="w-full rounded-md border border-line bg-surface px-2 py-1.5"
        >
          {MODEL_CHOICES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-5">
        <label>
          <span className={label}>Max turns</span>
          <input
            type="number"
            min={1}
            max={40}
            value={config.maxTurns}
            onChange={(e) => set("maxTurns", Number(e.target.value) || 1)}
            className="w-24 rounded-md border border-line bg-surface px-2 py-1.5"
          />
        </label>
        <label>
          <span className={label}>Spending cap per run</span>
          <span className="flex items-center gap-1">
            $
            <input
              type="number"
              min={BUDGET_LIMITS.min}
              max={BUDGET_LIMITS.max}
              step={0.05}
              value={config.maxBudgetUsd}
              onChange={(e) => set("maxBudgetUsd", Number(e.target.value))}
              className="w-24 rounded-md border border-line bg-surface px-2 py-1.5"
            />
          </span>
          <span className="mt-1 block text-xs text-muted">
            Stops the run at this estimated cost (${BUDGET_LIMITS.min}–${BUDGET_LIMITS.max})
          </span>
        </label>
      </div>

      <div className="md:col-span-2">
        <span className={label}>Permission mode</span>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={`cursor-pointer rounded-md border px-3 py-2 ${
                config.permissionMode === m.id ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2"
              }`}
            >
              <input
                type="radio"
                name="permissionMode"
                className="sr-only"
                checked={config.permissionMode === m.id}
                onChange={() => set("permissionMode", m.id)}
              />
              <span className="block font-mono text-[13px] font-medium">{m.label}</span>
              <span className="block text-xs text-muted">{m.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="md:col-span-2">
        <span className={label}>Built-in tools</span>
        <div className="flex flex-wrap gap-2">
          {BUILT_IN_TOOLS.map((t) => {
            const on = config.tools.includes(t);
            return (
              <label
                key={t}
                className={`cursor-pointer rounded-full border px-3 py-1 font-mono text-[13px] ${
                  on ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => set("tools", on ? config.tools.filter((x) => x !== t) : [...config.tools, t])}
                />
                {t}
              </label>
            );
          })}
        </div>
        {config.tools.includes("Bash") && (
          <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
            Bash runs real commands on your computer. Claude Code lets simple read-only commands (like ls) run without asking; everything else waits for you, so read it before clicking Allow.
          </p>
        )}
      </div>

      <div className="md:col-span-2">
        <span className={label}>Extras</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-surface px-3 py-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--accent)]"
                checked={config[t.key]}
                onChange={(e) => set(t.key, e.target.checked)}
              />
              <span>
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-muted">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="md:col-span-2">
        <span className={label}>Append to system prompt</span>
        <textarea
          value={config.appendSystemPrompt}
          onChange={(e) => set("appendSystemPrompt", e.target.value)}
          rows={2}
          placeholder="e.g. Always answer in Filipino."
          className="w-full rounded-md border border-line bg-surface px-3 py-2"
        />
      </div>
    </fieldset>
  );
}

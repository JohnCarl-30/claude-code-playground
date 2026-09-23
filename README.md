# Claude Code Playground

[![CI](https://github.com/JohnCarl-30/claude-code-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnCarl-30/claude-code-playground/actions/workflows/ci.yml)

A hands-on way to learn **Claude Code**, the **Claude Agent SDK**, the **Claude API** and **MCP**.
Short lessons, each with a real example you run and watch: every tool call, permission prompt and message appears as it happens.

- **No API key.** It uses your own Claude login, the same one Claude Code uses.
- **Safe to explore.** Claude only works inside a small sample project, and it asks you before it edits a file or runs a command.
- **Runs on your computer.** Works on macOS, Linux and Windows.

## Before you start

You need two things:

1. **Node.js 20.9 or newer** ([download](https://nodejs.org)). Check with `node --version`.
2. **A Claude account signed in to Claude Code.** Install Claude Code from [claude.com/claude-code](https://claude.com/claude-code), then run `claude` in a terminal once and sign in. A Claude Pro or Max plan works.

## Start the playground

```bash
git clone https://github.com/JohnCarl-30/claude-code-playground.git
cd claude-code-playground
npm install
npm run dev
```

Before starting, `npm run dev` checks your setup:

```
✓ Node 22.11.0
✓ Signed in to Claude (Claude Pro)
```

Then open **http://localhost:3000** and click **Start the first lesson**.

## What you'll learn

| Track | Lessons |
|---|---|
| Claude Code | the agent loop, tools, permissions & modes, CLAUDE.md, slash commands & skills, hooks, subagents |
| Agent SDK | `query()`, the message stream, options, approving tools with `canUseTool`, hooks in code, orchestration with a team of subagents |
| Claude API | the Messages API, content blocks, the tool-use loop, tokens & cost |
| MCP | what MCP is, building a tool, connecting real servers |

When you're done, the **Free playground** page unlocks every setting so you can experiment.

## Good to know

- **Usage:** each run uses your Claude plan's usage, just like using Claude Code in the terminal. The lessons use small prompts, and you can pick the fast Haiku model under **Settings**.
- **Spending cap:** every run stops once its estimated cost reaches $1.00. Change it per run under **Settings** (from $0.05 to $5).
- **Progress:** lessons get a ✓ when you run their example successfully. Progress is saved in your browser only.
- **The sample project:** Claude works in `workspace/`, a tiny "Tiny Shop" project with a planted bug. Click **Reset workspace** at any time to restore it.
- **Permissions:** reading files inside the sample project is automatic. Edits and commands wait for you to click **Allow**. Paths outside the project are always blocked.
- **Your settings stay yours:** the playground ignores your personal `~/.claude` settings and MCP servers, so everyone sees the same results.
- **Local only:** the server only accepts requests from your own computer. Other devices on your network and other websites can't use it.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Claude isn't ready yet" / "not signed in" | Run `claude` in a terminal, sign in, then reload the page. |
| `npm run dev` says Node is too old | Install Node 20.9 or newer from [nodejs.org](https://nodejs.org). |
| A lesson behaves strangely after lots of runs | Click **Reset workspace** below the prompt box. |
| You want to re-check your setup | `npm run check` |
| Port 3000 is busy | `npm run dev -- --port 3001`, then open http://localhost:3001 |

## For contributors

- `src/lib/lessons.ts`: all lesson text and examples (the easiest place to add a lesson)
- `src/lib/run-agent.ts`: Agent SDK options, the permission callback and the hooks
- `src/lib/demo-mcp.ts`: the demo MCP server (dice, weather, notes)
- `src/lib/local-only.ts`: the localhost-only request guard
- `src/app/api/run/route.ts`: streams SDK messages to the browser as NDJSON
- `src/components/Runner.tsx`, `Timeline.tsx`: the prompt box and the live timeline
- `workspace-seed/`: the sample project that `workspace/` is copied from
- `npm run check:lessons`: checks lesson content for common mistakes (runs in CI with lint, type-check and build)

> This playground signs in with your personal Claude account, which is right for learning on your own computer. If you build an app that other people use, give that app its own API key.

# Claude Code Playground

[![CI](https://github.com/JohnCarl-30/claude-code-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnCarl-30/claude-code-playground/actions/workflows/ci.yml)

A local playground for building with **Claude Code**, the **Claude Agent SDK**, the **Claude API** and **MCP**.
Build a real REST API, MCP server or agent with Claude, then run and test it right there. Or experiment with tools, permissions and MCP servers and watch every tool call, permission prompt and message as it happens.

- **No API key.** It uses your own Claude login, the same one Claude Code uses.
- **Build real projects.** Start from a REST API, MCP server or Agent SDK starter; Claude writes the code, and you start the server, send requests, plug in your MCP server or run your agent.
- **Keep the conversation going.** Follow-ups continue the same Claude Code session, so Claude remembers what it just did. See every change as a diff, and download your project as a .zip.
- **Plug in any MCP server.** Add a local program (stdio) or a remote URL (HTTP), test the connection, and let Claude use it.
- **Safe to experiment.** Claude only works inside a small sample project, and it asks you before it edits a file, runs a command or calls a tool from a server you added.
- **See the code.** The Code tab shows the Agent SDK call that matches your current settings.
- **Runs on your computer.** Works on macOS, Linux and Windows.

Curious how it works under the hood? Read **[How the playground works](docs/HOW-IT-WORKS.md)**.

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

Then open **http://localhost:3000**. Pick an example on the left (start with the **Build** group), or write your own prompt.

## Build real projects

The **Workspace** panel under the prompt holds the project Claude works on. Pick a **starter**:

| Starter | What it is | Run & test |
|---|---|---|
| REST API | a zero-dependency JSON API (`node:http`) | start the server and send requests (GET/POST/PATCH/DELETE) from the built-in request tester |
| MCP server | your own MCP server using `@modelcontextprotocol/sdk` | **Connect to the playground**, then ask Claude to use the tools you built |
| Agent SDK script | `agent.mjs` calling `query()` | run it and read its output |
| Tiny Shop | a cart library with a planted bug | run its tests |

A typical loop: pick **Build a REST API** in the sidebar → **Run** → **Start server** → send `POST /todos` → **Send follow-up** ("now add pagination") → check the **Changes** tab → **⤓ .zip** to keep it.

- **Follow-ups:** after a run, the prompt box becomes a follow-up box and Claude remembers the conversation. **＋ New conversation** starts fresh (your files stay as they are).
- **Changes:** a colored diff of everything changed since the starter's starting point.
- **Your work is kept:** switching starters parks the current workspace (files and git history) and brings it back when you switch back; the starter list marks those as "saved". **Reset** is the only thing that throws work away.
- **⤓ .zip:** download the current project to keep or open elsewhere.

Each starter has a `CLAUDE.md` that tells Claude its conventions, and the examples turn it on.

## What you can try

| Area | Examples in the sidebar |
|---|---|
| Build | build a REST API, build an MCP server, use your MCP server, build an agent with a custom tool, give your agent file tools |
| Claude Code | explore a project, read-only vs editing tools, approve/deny edits, plan mode, CLAUDE.md, hooks, subagents, a team of subagents in parallel |
| Agent SDK | raw `query()` messages, custom system prompt, fix-and-test with Bash, the spending cap |
| Claude API | raw Messages API responses, `tool_use`/`tool_result` blocks, tokens, caching and cost |
| MCP | the built-in demo server, chaining tools, and real servers: Memory (stdio), DeepWiki and Context7 (HTTP) |

Every example is only a starting point. Change the prompt or any setting and run it again.

### MCP servers

Open the **MCP servers** tab to:

- turn the built-in demo server (dice, fake weather, notes) on or off
- **quick-add** Memory, DeepWiki or Context7
- **add your own**: a command like `npx -y @modelcontextprotocol/server-sequential-thinking`, or a URL like `https://example.com/mcp`
- **Test connection** to see whether each server connects and which tools it offers, without using Claude

Servers you add are remembered in your browser. When Claude calls one of their tools you choose **Allow**, **Always allow** (for the rest of that run) or **Deny**.
Only add servers you trust: a stdio server is a program running on your computer.

## Good to know

- **Usage:** each run uses your Claude plan's usage, just like using Claude Code in the terminal. The examples use small prompts, and you can pick the fast Haiku model under **Settings**.
- **Spending cap:** every run stops once its estimated cost reaches $1.00. Change it per run under **Settings** (from $0.05 to $5).
- **Tried examples** get a ✓ in the sidebar. This is saved in your browser only.
- **The workspace:** Claude works in `workspace/`, created from the starter you pick. **Reset** restores the starter's original files at any time.
- **Running your code:** the Run & test panel only runs the scripts each starter defines (like `node server.js`), and your API server listens on `localhost:4100`.
- **Permissions:** reading files inside the sample project is automatic. Edits and commands wait for you to click **Allow**. Paths outside the project are always blocked.
- **Your settings stay yours:** the playground ignores your personal `~/.claude` settings and MCP servers, so everyone sees the same results.
- **Local only:** the server only accepts requests from your own computer. Other devices on your network and other websites can't use it.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Claude isn't ready yet" / "not signed in" | Run `claude` in a terminal, sign in, then reload the page. |
| `npm run dev` says Node is too old | Install Node 20.9 or newer from [nodejs.org](https://nodejs.org). |
| An example behaves strangely after lots of runs | Click **Reset** in the Workspace panel (download a .zip first if you want to keep your work). |
| Claude seems confused by an old conversation | Click **＋ New conversation**. |
| "Nothing is listening on port 4100" | Click **Start server** in Run & test first. If another app uses port 4100, stop it. |
| Your MCP server shows "failed" | Click **Check syntax** in Run & test, and make sure the code never uses `console.log` (stdout is the MCP channel). |
| An MCP server shows "failed" | Use **Test connection** and read the hint. For stdio servers, check the command works in a terminal first. |
| You want to re-check your setup | `npm run check` |
| Port 3000 is busy | `npm run dev -- --port 3001`, then open http://localhost:3001 |

## For contributors

Start with [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) for the architecture, request flow and security model.


- `src/lib/examples.ts`: the sidebar examples (the easiest place to add one)
- `src/lib/run-agent.ts`: Agent SDK options, the permission callback and the hooks
- `src/lib/demo-mcp.ts`: the demo MCP server (dice, weather, notes)
- `src/components/McpPanel.tsx`, `src/lib/mcp-test.ts`: adding and testing your own MCP servers
- `src/lib/local-only.ts`: the localhost-only request guard
- `src/app/api/run/route.ts`: streams SDK messages to the browser as NDJSON
- `src/components/Runner.tsx`, `Timeline.tsx`: the prompt box and the live timeline
- `templates/`: the starter projects `workspace/` is created from; `src/lib/templates.ts` lists them and their scripts
- `src/lib/processes.ts`, `src/components/RunPanel.tsx`: running a starter's scripts and the request tester
- `npm test`: the Jest test suite in `tests/` (logic and UI, no Claude calls). CI runs it with lint, type-check and build on every push.

> This playground signs in with your personal Claude account, which is right for learning on your own computer. If you build an app that other people use, give that app its own API key.

# Claude Code Playground

[![CI](https://github.com/JohnCarl-30/claude-code-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/JohnCarl-30/claude-code-playground/actions/workflows/ci.yml)

A local playground for building with **Claude Code**, the **Claude Agent SDK**, the **Claude API** and **MCP**.
Build a real REST API, MCP server or agent with Claude, then run and test it right there. Or experiment with tools, permissions and MCP servers and watch every tool call, permission prompt and message as it happens.

- **No API key needed.** It uses your own Claude login, the same one Claude Code uses. No subscription? Use an API key, a cloud provider, or practice mode (see below).
- **Build real projects.** Start from a REST API, MCP server or Agent SDK starter; Claude writes the code, and you start the server, send requests, plug in your MCP server or run your agent.
- **Configure Claude the real way.** Each starter has a `.claude/` folder: permission rules, hooks, slash commands, skills and subagents. Edit them in the playground and they load exactly as they would for `claude` in a terminal.
- **Certification track.** Preparing for **Claude Certified Developer – Foundations (CCDV-F)**? The official exam blueprint is in the sidebar: all 8 domains and 25 skills, weighted like the exam, each linked to what practices it here, plus a knowledge check per domain whose answers link to the official docs.
- **Practice challenges.** Twenty-six tasks (REST APIs, the Claude API, MCP servers, Claude Code config, prompting, security, debugging, the Agent SDK). You solve them with Claude, then **Check my work** tests your actual code and config and shows ✅ / ❌ per requirement, with the reason.
- **The Claude API without a key.** The Claude API starter's programs run against a **practice API** on your computer: canned replies in the real shapes (tool_use, streaming events, usage and cache fields, errors, batches), so you can write and test real `@anthropic-ai/sdk` code for free.
- **See inside the harness.** A context-window meter with **Compact now**, Claude's live task list, multiple-choice questions from Claude, and plan-mode reviews where you approve the plan or send it back.
- **A live session, like the terminal.** Replies stream in word by word. While Claude works you can **Steer** it (switch to a new message now), **Queue** a message for when it's done, or **Stop** the turn, and you can change the model or permission mode mid-conversation. See every change as a diff, and download your project as a .zip.
- **Plug in any MCP server.** Add a local program (stdio) or a remote URL (HTTP), test the connection, and let Claude use it.
- **Safe to experiment.** Claude only works inside a small sample project, and it asks you before it edits a file, runs a command or calls a tool from a server you added.
- **See the code.** The Code tab shows the Agent SDK call that matches your current settings.
- **Runs on your computer.** Works on macOS, Linux and Windows.

Curious how it works under the hood? Read **[How the playground works](docs/HOW-IT-WORKS.md)**.

## Before you start

You need **Node.js 20.9 or newer** ([download](https://nodejs.org)); check with `node --version`. Then pick how the playground talks to Claude:

| Option | Who it's for | Setup | Cost |
|---|---|---|---|
| **Claude login** (default) | You have a Claude plan that includes Claude Code (Pro, Max, Team or Enterprise) | Install [Claude Code](https://claude.com/claude-code), run `claude` once and sign in | Uses your plan |
| **API key** | No subscription, or you'd rather pay per use | Get a key from the [Claude Console](https://console.anthropic.com), copy `.env.example` to `.env.local` and set `PLAYGROUND_AUTH=api-key` and `ANTHROPIC_API_KEY=…` | Billed per use; each conversation is capped ($1 by default) |
| **Cloud provider** | Your company uses Amazon Bedrock, Google Vertex AI or Microsoft Foundry | Set Claude Code's provider variables in `.env.local` (for example `CLAUDE_CODE_USE_BEDROCK=1` plus your AWS region and credentials; see Claude Code's docs for each provider) | Billed by your provider |
| **Practice mode** | No Claude access at all | Nothing: it's what you get when Claude isn't connected | Free |

In **practice mode** you can still write and run code in the Workspace (Files, Run & test, the request tester, Changes), edit Claude Code config, and use **Check my work** on challenges. Running prompts is switched off until Claude is connected. After setting something up, click **I've set it up: check again**.

The API key is only used when you opt in with `PLAYGROUND_AUTH=api-key`: by default a key in your environment is ignored, so it's never billed by accident. With a wrong key, the playground tells you right away (it checks the key with a free call) instead of letting Claude Code retry for minutes.

## Start the playground

```bash
git clone https://github.com/JohnCarl-30/claude-code-playground.git
cd claude-code-playground
npm install
npm run dev
```

Before starting, `npm run dev` checks your setup (Claude login, API key or cloud provider):

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
| Claude API app | one Claude API feature per file (`@anthropic-ai/sdk`): tools, structured output, caching, batches, errors, streaming, a workflow, model choice, effort and thinking, token counting, cost, untrusted input with approvals, images, PDFs and the Files API, a few-shot prompt, trimming context | run each file against the practice API (no key) |
| Tiny Shop | a cart library with a planted bug | run its tests |

A typical loop: pick **Build a REST API** in the sidebar → **Run** → **Start server** → send `POST /todos` → **Send follow-up** ("now add pagination") → check the **Changes** tab → **⤓ .zip** to keep it.

- **Inside the session:** the **context** meter in the conversation header shows how full Claude's context window is (click it for the breakdown and **🗜 Compact now**). Claude's task list appears above the prompt box. When Claude asks a question you get a ❓ card with choices, and in `plan` mode a 📋 card lets you approve the plan (auto-accept edits or ask first) or keep planning with feedback.
- **A live session:** your first message starts one Claude Code session; everything after goes into it, and Claude remembers the whole conversation. While Claude works, type and press **↪ Steer** (switch now, ⇧⌘/Ctrl + Enter) or **⏎ Queue** (after it's done, ⌘/Ctrl + Enter), or **■ Stop** the turn. Model and permission mode change live; other settings apply to your next conversation. **＋ New conversation** starts fresh (your files stay as they are).
- **Changes:** a colored diff of everything changed since the starter's starting point.
- **Your work is kept:** switching starters parks the current workspace (files and git history) and brings it back when you switch back; the starter list marks those as "saved". **Reset** is the only thing that throws work away.
- **⤓ .zip:** download the current project to keep or open elsewhere.

Each starter has a `CLAUDE.md` that tells Claude its conventions, and the examples turn it on.

## Claude Code config (`.claude/`)

Turn on **Project config** (in Settings, or in the Workspace panel's **Claude config** tab) and every run loads the workspace's config like the real CLI:

- `CLAUDE.md`: project instructions
- `.claude/settings.json`: shared **permission rules** (`deny: ["Read(./.env)"]`) and **hooks** (a command that runs after every edit)
- `.claude/settings.local.json`: your personal settings; **allow rules only count here**, so a cloned repo can't grant itself permissions
- `.claude/commands/*.md`: **slash commands**, run as `/add-route GET /time …` (type `/` in the prompt to see them)
- `.claude/skills/*/SKILL.md`: **skills** Claude loads when needed
- `.claude/agents/*.md`: **subagents**

The **Claude config** tab shows all of it, and **＋ New command / skill / subagent** creates a file you edit and save in the Files tab. The **Claude Code config** examples in the sidebar try each piece. Whatever the rules say, Claude stays inside the workspace, and changes to settings files always ask you first.

## Practice challenges

Pick a challenge in the **Challenges** section of the sidebar. Each one has a goal, a starter project and a list of requirements. Solve it however you like (usually by prompting Claude), then click **✓ Check my work**:

| Area | Challenges | How it's checked |
|---|---|---|
| REST API | A todo API · Filter and search | starts your `server.js` on its own port and sends real requests |
| MCP | Text tools over MCP · Tools that handle bad input · Resources and prompts | connects to your server over stdio like Claude Code and calls your tools, resources and prompts |
| Claude API | The tool-use loop · Structured output you can trust · Prompt caching and usage · An overnight batch · Errors and retries · Stream the answer · A workflow, not an agent · The right model for the job · Effort and thinking · Count before you send · What did that cost? · Images, PDFs and the Files API | runs your function against a mock Claude API that plays a scenario (a tool call, a cut-off reply, a 529, a batch that takes a while…) and inspects every request your code sent |
| Claude Code config | Your own slash command · Guardrails for Tiny Shop · A read-only specialist | reads your `.claude/` files |
| Prompting | A few-shot classifier · Keep the context small | inspects the prompt your code sends (examples, delimiters, max_tokens), feeds it messy replies, and checks your trimmed conversation is still one the API accepts |
| Security | Guard secrets with a hook · Untrusted email, gated refunds | feeds your PreToolUse hook the same JSON Claude Code sends and checks what it blocks; plays a Claude that falls for a prompt injection and checks your code still won't refund without a person's yes |
| Debugging | Fix the discount bug | runs your `cart.js` and your tests |
| Agent SDK | An agent with a custom tool | checks `agent.mjs` and its syntax |

Checking never calls Claude, so it's free and gives the same answer every time. Hints unlock one at a time, and passed challenges get a 🏆 in the sidebar (saved in your browser).

## Certification track (CCDV-F)

The **Certification** section of the sidebar follows the official [Claude Certified Developer – Foundations exam guide](https://everpath-course-content.s3-accelerate.amazonaws.com/instructor/6nizmqk8tpzpfjvt6qmmav7rh/public/1783542875/Claude+Certified+Developer+%E2%80%93+Foundations+Exam+Guide.pdf) (v1.0, July 2026):

- **Exam blueprint:** the 8 domains with their weights, your readiness (weighted like the exam), and which domain to focus on next.
- **Each domain:** its skills with their weights, the examples and challenges that practice each one, and a **knowledge check**: multiple-choice and "choose 2" questions in the exam's style. After you check your answers, each one explains why and links to the page of Anthropic's docs (or the MCP docs) it comes from. Pass with 80%.
- **Mock exam:** a timed practice run shaped like the real one: 53 questions in 120 minutes from a bank of 130+, drawn from each domain by its weight, one question per screen with flag-for-review and a question grid. Results show an estimated score on the 100–1,000 scale, your percent correct by domain (like the real score report), and a review of every question with its explanation and source. **Retry the ones I missed** drills just those. Your place and the clock survive a reload.
- **Mistakes deck:** every question you miss in a knowledge check or a mock exam goes into a deck you practice in rounds of 10; each one leaves after you get it right twice in a row.
- Every example and challenge shows which exam skills it practices.

The questions are written for this playground and checked against the official docs; they are not questions from the real exam. Every question carries the exact quote from the docs that backs its answer, and `npm run verify:quizzes` re-checks every source page and quote against the live docs, so questions that go out of date get caught. Answer length is balanced so the longest option isn't a giveaway (a test enforces it). Weight tells you where to spend time: Applications and Integration (33.1%) and Model Selection and Optimization (16.8%) are half the exam, so the Claude API challenges matter more than the Claude Code ones (3.1%).

## What you can try

| Area | Examples in the sidebar |
|---|---|
| Build | build a REST API, build an MCP server, use your MCP server, build an agent with a custom tool, give your agent file tools |
| Claude Code config | run a slash command, a deny rule protects a secret, an allow rule skips the question, Claude picks up a skill, a subagent from `.claude/agents`, have Claude write a command |
| Claude Code | explore a project, read-only vs editing tools, approve/deny edits, plan mode, CLAUDE.md, hooks, subagents, a team of subagents in parallel |
| Agent SDK | raw `query()` messages, custom system prompt, fix-and-test with Bash, the spending cap |
| Claude API | raw Messages API responses, `tool_use`/`tool_result` blocks, tokens, caching and cost (and the Claude API challenges, for writing that code yourself) |
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
- **Spending cap:** a conversation stops once its estimated cost reaches $1.00. Change it under **Settings** (from $0.05 to $5).
- **Tried examples** get a ✓ in the sidebar. This is saved in your browser only.
- **The workspace:** Claude works in `workspace/`, created from the starter you pick. **Reset** restores the starter's original files at any time.
- **Running your code:** the Run & test panel only runs the scripts each starter defines (like `node server.js`), and your API server listens on `localhost:4100`.
- **Permissions:** reading files inside the sample project is automatic. Edits and commands wait for you to click **Allow**. Paths outside the project are always blocked.
- **Your settings stay yours:** the playground ignores your personal `~/.claude` settings and MCP servers, so everyone sees the same results.
- **Local only:** the server only accepts requests from your own computer. Other devices on your network and other websites can't use it.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Practice mode: Claude isn't connected" | Run `claude` in a terminal and sign in, or set up an API key or cloud provider (see Before you start), then click **I've set it up: check again**. |
| "Your API key was rejected (401)" | Check `ANTHROPIC_API_KEY` in `.env.local` (no quotes or spaces), then restart `npm run dev`. |
| My API key is ignored | Add `PLAYGROUND_AUTH=api-key` to `.env.local`: keys are only used when you opt in. |
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
- `src/lib/live-session.ts`, `src/app/api/session/`: live Claude Code sessions (start, events as NDJSON, messages, stop/model/mode, close)
- `src/components/useLiveSession.ts`: the browser side of a live session (streaming, reconnect, steer/queue)
- `src/components/Runner.tsx`, `Timeline.tsx`: the prompt box and the live timeline
- `templates/`: the starter projects `workspace/` is created from; `src/lib/templates.ts` lists them and their scripts
- `src/lib/processes.ts`, `src/components/RunPanel.tsx`: running a starter's scripts and the request tester
- `npm test`: the Jest test suite in `tests/` (logic and UI, no Claude calls). CI runs it with lint, type-check and build on every push.
- `npm run test:e2e`: end-to-end tests with real Claude calls (Haiku, a few cents) against a separate, isolated server. Run it yourself before big changes.

> This playground signs in with your personal Claude account, which is right for learning on your own computer. If you build an app that other people use, give that app its own API key.

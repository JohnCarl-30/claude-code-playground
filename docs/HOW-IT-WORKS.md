# How the playground works

This guide explains what happens behind the scenes when you click **Run**: how the playground talks to Claude without an API key, how permissions and MCP servers work, and how starter projects are created, run and tested.

For setup and usage, see the main [README](../README.md).

---

## The big picture

The playground is a [Next.js](https://nextjs.org) app that runs on your computer. The browser page is the user interface. The Next.js server does the real work: it uses the **Claude Agent SDK** to run Claude Code, and streams everything that happens back to the page.

```mermaid
flowchart LR
    subgraph Browser["Your browser (localhost:3000)"]
        UI["Playground page<br/>prompt · settings · timeline"]
    end

    subgraph Server["Next.js server (your computer)"]
        Routes["API routes<br/>/api/session · /api/permission<br/>/api/workspace · /api/process"]
        SDK["Claude Agent SDK<br/>query()"]
        Procs["Run & test<br/>(node server.js, …)"]
    end

    CC["Claude Code<br/>(bundled with the SDK)"]
    Claude["Claude<br/>(Anthropic)"]
    WS[("workspace/<br/>your project")]
    MCP["MCP servers<br/>demo · stdio · HTTP"]

    UI -- "fetch" --> Routes
    Routes -- "NDJSON stream" --> UI
    Routes --> SDK --> CC
    CC -- "your Claude login" --> Claude
    CC -- "Read / Edit / Bash" --> WS
    CC <--> MCP
    Routes --> Procs --> WS
```

| Layer | What it does | Main files |
|---|---|---|
| Browser page | Examples sidebar, prompt, Settings / MCP / Code tabs, live timeline, Workspace panel | `src/components/Playground.tsx`, `Runner.tsx`, `Timeline.tsx` |
| API routes | Start runs, answer permission prompts, manage the workspace and programs | `src/app/api/*/route.ts` |
| Agent SDK | Runs the Claude Code agent loop and yields messages | `src/lib/run-agent.ts` |
| Claude Code | The agent itself: talks to Claude, runs tools, loads CLAUDE.md, connects MCP servers | shipped inside `@anthropic-ai/claude-agent-sdk` |
| Workspace | The project Claude works on, created from a starter | `workspace/`, `templates/`, `src/lib/workspace.ts` |

---

## 1. No API key: how authentication works

The Agent SDK does not call the Claude API itself. It starts the **Claude Code program** (a binary bundled with the SDK package) and talks to it over stdin/stdout. Claude Code signs in the same way it does in your terminal: with the login you created by running `claude` and signing in.

The playground makes sure that login is used:

- It **removes `ANTHROPIC_API_KEY`** from the environment it passes to Claude Code (`src/lib/run-agent.ts`), so a key in your shell is never used by accident.
- The **Session started** card shows the SDK's `apiKeySource`. `none` means "no API key; using your Claude login", and the card says so in plain words.

**Checking the login without spending anything.** `src/lib/account.ts` starts a query with a prompt stream that never sends a message, and asks Claude Code for `accountInfo()`. No model call happens, so it costs nothing. The result powers:

- the **Signed in** badge in the header and the "Claude isn't ready yet" banner (`src/components/SetupStatus.tsx`, via `GET /api/status`)
- the check that runs before `npm run dev` (`scripts/check-setup.mjs`)

> Signing in with your Claude account is fine for learning on your own computer. An app you build for other people should use its own API key.

---

## 2. Live sessions: what happens when you click Run

Each conversation is **one live Claude Code session**, like a terminal session. The first **Run** starts it; after that you can send messages at any time, even while Claude is working, stop the current turn, and change the model or permission mode without restarting.

```mermaid
sequenceDiagram
    participant B as Browser (useLiveSession)
    participant S as /api/session
    participant L as LiveSession
    participant C as Claude Code
    participant M as Claude

    B->>S: POST settings + first message
    S->>L: createSession(config)
    L->>C: query({ prompt: yourMessages(), options })
    B->>S: GET /api/session/<id>/events (NDJSON, stays open)
    C->>M: request
    M-->>C: reply streams (text deltas, tool_use)
    C-->>L: SDK messages
    L-->>B: one JSON line per event
    Note over B,L: meanwhile: POST .../message (queue or steer),<br/>POST .../control (interrupt, model, permission mode)
    B->>S: DELETE .../<id> (New conversation)
    L->>C: close()
```

1. **Starting.** `POST /api/session` validates your settings (`parseRunConfig()` in `src/lib/run-types.ts`) and calls `createSession()` (`src/lib/live-session.ts`). The session builds the SDK options with `buildOptions()` (`src/lib/run-agent.ts`) and starts `query()` in **streaming-input mode**: the prompt is an async generator of your messages, so the session stays open between them.

   | Setting in the UI | Agent SDK option | Changes mid-session? |
   |---|---|---|
   | Model | `model` | yes: `query.setModel()` |
   | Permission mode | `permissionMode` | yes: `query.setPermissionMode()` |
   | Built-in tools | `tools` (only these tools exist) | new conversation |
   | Max turns / Spending cap | `maxTurns` / `maxBudgetUsd` (for the whole conversation) | new conversation |
   | Append to system prompt | `systemPrompt: { type: "preset", preset: "claude_code", append }` | new conversation |
   | Project config | `settingSources: ["project", "local"]` (otherwise `[]`) | new conversation |
   | MCP servers | `mcpServers` (+ `strictMcpConfig: true`) | new conversation |
   | Subagents / review team | `agents` (+ the `Agent` tool) | new conversation |
   | Hooks | `hooks` | new conversation |
   | Allow / Deny cards | `canUseTool` | |

   It always sets `cwd` to `workspace/`, `strictMcpConfig: true`, `includePartialMessages: true` (word-by-word replies) and `includeHookEvents: true`. When you change a "new conversation" setting during a session, the composer says so and offers to start one.

2. **Events.** `GET /api/session/<id>/events?from=<seq>` streams NDJSON. Every stored event has a `seq` number; if the connection drops, the browser (`src/components/useLiveSession.ts`) reconnects with the next `seq` and the server replays what it missed. Word-by-word `stream_event` deltas are sent live only (not stored), because the full message follows. Events include the SDK's own messages (`{"kind":"sdk"}`), your messages (`user_prompt`), permission cards and decisions, hooks, control notes (`control`) and `closed`.

3. **Sending while Claude works.** `POST /api/session/<id>/message { text, how }` adds your message to the input stream:
   - **Queue** (default): it waits until the current task finishes, then runs.
   - **Steer**: it is sent with `priority: "now"`, so Claude Code ends the current task and answers this instead. The page files the interrupted task's result under the turn it belongs to.

4. **Stop** (`POST .../control { action: "interrupt" }`) calls `query.interrupt()`: the current turn ends with an `error_during_execution` result (shown as **Stopped by you**) and the session stays open for your next message, like pressing Esc in the terminal.

5. **Ending.** **＋ New conversation**, switching or resetting the workspace, leaving the example, or closing the tab (`navigator.sendBeacon` to `.../close`) closes the session and its Claude Code process. The server also closes sessions nobody is watching once nothing has happened for 15 minutes, and keeps at most three sessions at a time, closing the oldest.

**Why "Claude is working"?** The page counts your messages against `result` messages: while some message has no result yet, Claude is working. The SDK marks each finished message with a `result`, including interrupted and steered ones.

**The timeline** (`src/components/Timeline.tsx`) turns raw messages into cards: `system/init` → **Session started** (a one-line note on later messages), streaming text → a live 💬 card, `text` → 💬, `tool_use` → 🔧, `tool_result` → 📄, `result` → **Done** (turns, time, estimated cost, tokens). **Show raw messages** shows the exact JSON your own code would receive.

**No memory files.** Sessions pass `settings: { autoMemoryEnabled: false }`, so Claude Code keeps no memory between separate conversations: a conversation remembers only its own messages.

---

### Inside the session: context, tasks, questions and plans

The playground shows the parts of the harness you'd see in the terminal:

| What you see | Where it comes from |
|---|---|
| **Context meter** in the conversation header: how full the context window is, what's using it, and where auto-compaction kicks in | `GET /api/session/<id>/context` → `query.getContextUsage()` (the data behind `/context`), refreshed after every reply |
| **🗜 Compact now** and the **Context compacted** card | sends `/compact` as a message; Claude Code answers with a `system` message `compact_boundary` (`trigger`, `pre_tokens`, `post_tokens`) |
| **Claude's task list** above the prompt box (○ to do, ● in progress, ✓ done) | the `TaskCreate` / `TaskUpdate` tool calls, rebuilt by `taskListFrom()` in `src/lib/tasks.ts`; they're allowed without asking because they touch no files |
| **❓ Question cards**: pick an option or type your own answer | Claude calls `AskUserQuestion`; `canUseTool` shows the card and returns your picks as the tool's `answers` |
| **📋 Plan review** in `plan` mode: approve (auto-accept edits or ask before edits) or keep planning with feedback | Claude writes its plan to `.claude/plans/` (the `plansDirectory` setting) and calls `ExitPlanMode`; approving returns `updatedPermissions: [{ type: "setMode", mode }]`, keeping planning denies with your feedback (or `interrupt: true` without feedback, so Claude stops and waits) |

These tools (`TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `AskUserQuestion`, `ExitPlanMode`) are always available, like in the terminal (`HARNESS_TOOLS` in `run-types.ts`). Your answers to all cards go through `POST /api/permission` and are checked by `parseAnswer()`.

---

## 3. Permissions: the Allow / Deny cards

Claude never touches your computer directly. It asks Claude Code to run a tool. Before anything else, the playground's always-on **workspace guard** hook checks the call; then Claude Code applies permission modes and rules; and whenever a tool still isn't approved, it asks the playground's **`canUseTool`** callback.

**The workspace guard** (`guardTool()` in `src/lib/permissions.ts`, registered as a `PreToolUse` hook on every run) can't be switched off. Because hooks run before permission rules, it holds even when an allow rule in `.claude/settings.local.json` would skip `canUseTool`:

- a file path outside `workspace/` is **denied**. Paths are compared by their real location (symlinks followed), so `/var` vs `/private/var` aliases still match and a symlink pointing out of the workspace doesn't count as inside;
- an `Edit`/`Write` to `.claude/settings.json` or `.claude/settings.local.json` returns **ask**, so it always shows a card (even in `acceptEdits`), because those files can grant permissions and run shell commands.

Then `canUseTool` decides the rest:

```mermaid
flowchart TD
    T["Claude wants a tool"] --> E{"Tool turned on<br/>for this run?"}
    E -- no --> D1["Deny: switched off"]
    E -- yes --> P{"Any file path<br/>outside workspace/?"}
    P -- yes --> D2["Deny: outside the project"]
    P -- no --> RO{"Read, Glob or Grep?"}
    RO -- yes --> A1["Allow automatically"]
    RO -- no --> AA{"You chose Always allow<br/>for this tool?"}
    AA -- yes --> A2["Allow"]
    AA -- no --> ASK["Show Allow / Always allow / Deny<br/>card and wait for your click"]
```

How the wait works:

1. `canUseTool` creates an id, stores a pending promise in a map, and emits a `permission_request` event, which shows the amber card.
2. Your click sends `POST /api/permission { id, allow, always }`.
3. `answerPermission()` resolves the promise, and Claude Code continues (or tells Claude it was denied).

Things to know:

- **Permission modes still apply first.** In `acceptEdits` mode Claude Code approves file edits inside the workspace itself, so no card appears. In `plan` mode nothing is changed. In `dontAsk` anything not pre-approved is denied without asking.
- **Claude Code has its own read-only allowlist.** Simple commands like `ls` can run without a card when Bash is on.
- **The demo MCP server's tools are pre-approved** (`allowedTools`), so they skip `canUseTool`. Tools from MCP servers you add always ask.
- **Hooks run before permissions.** A `PreToolUse` hook that returns `deny` blocks the tool whatever the permission mode says.
- **With project config on, `.claude/` rules apply too** (see section 5): deny rules block, allow rules in `settings.local.json` approve without a card.

---

## 4. Hooks and subagents

**Hooks** (`hooks` in `run-agent.ts`) are plain functions the SDK calls at points in the loop:

- With **Hooks** turned on, `PreToolUse` and `PostToolUse` hooks log every tool call (purple 🪝 cards), and the `PreToolUse` hook **denies any Edit or Write to `README.md`**.
- Whenever subagents are on, another `PreToolUse` hook sets `run_in_background: false` on every `Agent` call. Claude Code normally runs subagents in the background, which would end the turn before their reports came back. Forcing the foreground keeps the timeline in order. Several `Agent` calls made in the same turn still run in parallel.

**Subagents** are `AgentDefinition`s passed in `options.agents`:

- `code-reviewer`: one read-only reviewer on Haiku
- the review team for orchestration: `bug-hunter`, `readability-reviewer` and `test-designer`

The timeline links each subagent's messages to the `Agent` call that started it (`parent_tool_use_id`) and gives each subagent its own colored tag.

---

## 5. Claude Code config: the `.claude/` folder

With **Project config** on (a checkbox in Settings and in the Workspace panel's **Claude config** tab), a run loads the workspace the way `claude` would when started in that folder:

| File | What it does | How it's loaded |
|---|---|---|
| `CLAUDE.md` | project instructions read at the start of every session | `settingSources: ["project", "local"]` |
| `.claude/settings.json` | shared settings: `permissions` (`allow`/`ask`/`deny` rules like `Bash(npm test:*)`, `Read(./.env)`) and command `hooks` | same |
| `.claude/settings.local.json` | your personal settings (git-ignored in the workspace) | same |
| `.claude/commands/<name>.md` | a **slash command**: a saved prompt run as `/name args`; `$ARGUMENTS` is replaced by `args` | Claude Code expands it |
| `.claude/skills/<name>/SKILL.md` | a **skill**: know-how Claude loads when a task needs it | adds the `Skill` tool |
| `.claude/agents/<name>.md` | a **subagent** with its own prompt, `tools` and `model` in the frontmatter | adds the `Agent` tool |

Each starter ships a small `.claude/` folder (in `templates/*/.claude/`) that shows these off: the REST API starter has a deny rule for `.env`, a `PostToolUse` hook that runs `node --check server.js`, an allow rule for `node --check` in the local file, the `/add-route` command, the `rest-conventions` skill and the `api-reviewer` subagent.

Behaviors worth knowing, all taken from real Claude Code (and checked by the e2e tests):

- **Allow rules only count in `settings.local.json`.** In the shared, committed `settings.json`, deny rules and hooks apply but allow rules are ignored: a repo you clone can restrict Claude, but can't grant itself permissions.
- **Command hooks are real shell commands.** Their output streams into the timeline as 🪝 cards (`includeHookEvents: true`, `system` messages with `subtype: "hook_response"`). That's why the workspace guard always asks before settings files change.
- **Claude Code also brings built-in skills, commands and subagents.** The Session started card lists only the ones that came from your `.claude/`.

The **Claude config** tab (`src/components/ClaudeConfigPanel.tsx`) reads the folder through `GET /api/workspace/config` (`readClaudeConfig()` in `src/lib/claude-config.ts`: settings JSON with invalid-JSON warnings, and Markdown frontmatter for commands, skills and subagents). **＋ New command / skill / subagent** opens a starter file in the Files tab; **Use** puts `/name ` in the prompt; typing `/` in the prompt suggests your commands. Workspaces created before starters had `.claude/` get an **Add the starter's .claude/ config** button (`POST /api/workspace/config`), which only adds missing files.

**Editing files.** The Files tab is an editor (`PUT` / `DELETE /api/workspace/file`, `writeWorkspaceFile()`): paths must be inside the workspace and not in `.git` or `node_modules`, files are limited to 200 KB, and PUTs must be JSON like every other write.

---

## 6. MCP servers

A run can connect to three kinds of MCP servers at once:

| Kind | Where it runs | How it's configured |
|---|---|---|
| **Built-in demo** (`demo`) | inside the Next.js process | `createSdkMcpServer()` + `tool()` in `src/lib/demo-mcp.ts` (dice, fake weather, notes) |
| **stdio** (e.g. Memory, your own) | a program Claude Code starts on your computer | `{ type: "stdio", command, args }` |
| **HTTP** (e.g. DeepWiki, Context7) | a server on the internet | `{ type: "http", url }` |

- **Adding servers.** The MCP servers tab (`src/components/McpPanel.tsx`) keeps your servers in `RunConfig.mcpServers` and remembers the ones you add in your browser (`src/lib/saved-mcp.ts`). The server re-checks every entry (`validateMcpServers()` in `run-types.ts`): names must be lowercase, URLs must be `http(s)`, at most 8 servers.
- **Test connection** (`POST /api/mcp-test`, `src/lib/mcp-test.ts`) uses the same no-prompt trick as the login check. It starts Claude Code with only those servers, polls `mcpServerStatus()` until each one is `connected` or `failed`, and returns each server's tools. No model call, so it costs nothing.
- **Tool names** follow Claude Code's pattern `mcp__<server>__<tool>`, e.g. `mcp__deepwiki__ask_wiki_question`.

---

## 7. The workspace and starter projects

Claude always works in **`workspace/`**. It's ignored by the playground's own git repo and created from a **starter** in `templates/`:

| Starter | Folder | Scripts it can run |
|---|---|---|
| Tiny Shop | `templates/tiny-shop/` | `node --test` |
| REST API | `templates/rest-api/` | `node server.js` (long-running), `node --check server.js` |
| MCP server | `templates/mcp-server/` | `node --check server.js` |
| Agent SDK script | `templates/agent-sdk/` | `node agent.mjs`, `node --check agent.mjs` |

The list lives in `src/lib/templates.ts`.

**Creating a workspace** (`src/lib/workspace.ts`):

1. Delete `workspace/`, then copy the starter's folder in.
2. Write `.playground-template` to remember which starter it came from.
3. **Make it its own git repo** with one commit, "Starting point". Claude Code puts `git status` into Claude's context. Without its own repo, the workspace would show the playground's files (`../src`, `../package.json`) and Claude would wander there.

**Why starters need no `npm install`.** `workspace/` sits inside the playground folder, so Node finds packages in the playground's `node_modules`: `@modelcontextprotocol/sdk`, `zod` and `@anthropic-ai/claude-agent-sdk`. Each starter's `CLAUDE.md` tells Claude not to install anything.

**Switching keeps your work.** `POST /api/workspace { template }` moves the current `workspace/` into `.workspaces/<starter>/` (git-ignored) and moves the target starter's parked folder back, or creates it fresh the first time. Files and git history survive the round trip; `GET /api/workspace` lists parked starters so the picker can mark them "saved". `DELETE /api/workspace` **resets** the current starter to its original files, which is the one action that discards work. Both stop any running program first. An example that needs a particular starter (`template` in `src/lib/examples.ts`) shows a **Switch to …** banner when your workspace has a different one.

**Changes** (`GET /api/workspace/diff`, `workspaceDiff()`): runs `git add --intent-to-add --all` (so new files show up) and `git diff HEAD` inside the workspace, splits the output per file, and the Changes tab colors added and removed lines.

**Download** (`GET /api/workspace/download`): zips every file except `.git`, `node_modules` and the playground's marker, using a small built-in ZIP writer (`src/lib/zip.ts`, deflate via `node:zlib`, no extra packages).

---

## 8. Run & test

The **Run & test** tab (`src/components/RunPanel.tsx`) runs your project without leaving the page.

**Running scripts** (`src/lib/processes.ts`, `/api/process`):

- Only the scripts a starter declares can run: the request names a script id like `start`, never a command, so there is no way to run arbitrary shell commands.
- One program at a time. Starting another one stops the current one first.
- It runs inside `workspace/` with `PORT=4100`, and without `ANTHROPIC_API_KEY`, so agent scripts use your login too.
- Output is kept (last 400 lines), and the panel polls `GET /api/process` every second while it's running.
- **Stop** sends SIGTERM, then SIGKILL after 3 seconds. Running programs are also stopped when the playground exits.

**Request tester** (REST API starter; `/api/process/request`): sends one request from the server to `http://127.0.0.1:4100<path>`. The host and port are fixed, and the path must start with a single `/`, so it can only reach your own API. It shows the status, the time taken and the pretty-printed JSON body. "Connection refused" becomes "Click Start server first."

**Connect to the playground** (MCP server starter): adds `{ name: "my-server", type: "stdio", command: "node", args: ["server.js"] }` to the run's MCP servers. Claude Code starts it inside `workspace/` on every run, so your latest code is always used.

---

## 9. Security model

The playground can edit files and run programs on your computer, so it's locked down in layers:

| Layer | Protection | Where |
|---|---|---|
| Network | The server listens on `127.0.0.1` only, so other devices on your network can't reach it | `package.json` (`--hostname 127.0.0.1`) |
| Every API route | `Host` must be localhost (blocks DNS rebinding); an `Origin`, when present, must match (blocks other websites); POSTs and PUTs must be JSON (forces a CORS preflight) | `src/lib/local-only.ts` |
| Files | Tool paths outside `workspace/` are denied by an always-on `PreToolUse` hook, using real paths (symlinks followed), before any allow rule applies | `guardTool()` in `permissions.ts` |
| Settings files | Changes to `.claude/settings*.json` always ask, even in `acceptEdits` | `guardTool()` |
| File editor | Saves and deletes only inside the workspace, never `.git` or `node_modules` | `writeWorkspaceFile()` in `workspace.ts` |
| Actions | Edits, commands and your MCP tools wait for your click | `canUseTool` |
| Programs | Run & test runs only declared starter scripts | `processes.ts` |
| Requests | The request tester only reaches `127.0.0.1:4100` | `processes.ts` |
| Config | Your `~/.claude` settings and MCP servers are ignored | `settingSources`, `strictMcpConfig` |
| Spend | Every run has a spending cap ($1 by default) | `maxBudgetUsd` |

What it does **not** protect against: code **you** approve or run. A server Claude writes, an MCP server you add, a Bash command you allow (or allow-list in `settings.local.json`), or a command hook in `settings.json` runs with your user's permissions. Bash can't be confined to the workspace the way file tools are. Read what you approve.

---

## 10. Browser-only state

Some preferences are kept in your browser's `localStorage`, for this browser only:

| What | Key | File |
|---|---|---|
| Examples you've run successfully (✓) | `claude-code-playground:tried:v1` | `src/lib/tried.ts` |
| MCP servers you added | `claude-code-playground:mcp-servers:v1` | `src/lib/saved-mcp.ts` |

The current conversation (its session id and turns) lives only in the page: reloading the page starts a new conversation. Claude Code itself keeps session transcripts in `~/.claude/projects/`, as it does in the terminal.

If storage is blocked (private windows, strict settings), everything still works; these just aren't remembered.

---

## 11. Where to change things

| I want to… | Edit |
|---|---|
| Add an example to the sidebar | `src/lib/examples.ts` (then `npm test`: `tests/examples.test.ts` checks it) |
| Add a starter project | a folder in `templates/` + an entry in `src/lib/templates.ts` |
| Add a quick-add MCP server | `MCP_PRESETS` in `src/lib/run-types.ts` |
| Add a demo MCP tool | `src/lib/demo-mcp.ts` |
| Change what's allowed without asking | `canUseTool` in `src/lib/run-agent.ts` |
| Change hooks or subagents | `hooks`, `SUBAGENTS`, `TEAM` in `src/lib/run-agent.ts` |
| Change how a message is displayed | `src/components/Timeline.tsx` |
| Change the question / plan cards, task list or context meter | `Timeline.tsx` (`QuestionCard`, `PlanCard`), `TaskListPanel.tsx`, `ContextMeter.tsx` |
| Change the generated code in the Code tab | `src/components/CodePreview.tsx` |
| Change a starter's Claude Code config | `templates/<starter>/.claude/` |
| Change how `.claude/` is read or shown | `src/lib/claude-config.ts`, `src/components/ClaudeConfigPanel.tsx` |
| Change the Changes diff view | `src/components/ChangesView.tsx`, `workspaceDiff()` in `src/lib/workspace.ts` |

**Checks** (the same ones CI runs on every push, `.github/workflows/ci.yml`):

```bash
npm run lint
npx next typegen && npx tsc --noEmit
npm test
npm run build
```

### Tests

`npm test` runs the Jest suite in `tests/` (about 2 seconds, no Claude calls, nothing sent to the network):

| Test file | What it covers |
|---|---|
| `run-types.test.ts` | MCP server validation (names, URLs, limits) |
| `local-only.test.ts` | the localhost-only request guard |
| `permissions.test.ts` | the permission rules and the always-on guard: switched-off tools, paths outside the workspace, settings edits ask, read-only auto-allow, Always allow |
| `claude-config.test.ts` | reading `.claude/`: frontmatter, rules, hooks, invalid JSON, every starter's config is valid |
| `zip.test.ts` | the ZIP writer round-trips files, and `unzip -t` accepts its output |
| `workspace.test.ts` | creating, diffing, switching (work kept), exporting, resetting, file editing limits, adding starter config, symlink-aware path checks |
| `processes.test.ts` | Run & test: only declared scripts run, the API server starts, answers and stops quickly |
| `examples.test.ts` | every sidebar example is well-formed |
| `code-preview.test.ts` | the Code tab mirrors settings, shows the live-session pattern, wraps long prompts |
| `harness.test.ts` | rebuilding the task list from tool calls, and checking card answers (questions, plan reviews) |
| `live-session.test.ts` | the session manager with a fake Claude Code: context usage (and none once closed), queue vs steer, stop only while working, live model and mode changes, replay after reconnect, closing, idle cleanup, the three-session limit |
| `components/*.test.tsx` | the UI in a simulated browser: timeline cards and permission buttons, the Workspace panel (starter switch, Reset confirm, Changes, zip), the Claude config tab (rules, Use, new command → save), and the Runner against a fake live session (follow-ups, Steer / Queue / Stop, live model and mode changes, New conversation, Switch banner, connecting your MCP server, `/` suggestions) |

The workspace and process tests set `PLAYGROUND_ROOT` to a temporary folder with a copy of `templates/`, so they never touch your real `workspace/`. The Run & test server test skips itself if something answers on port 4100 (for example your own API server).

**Real-Claude end-to-end tests** (`npm run test:e2e`, `tests/e2e/`): builds the app, starts a separate production server on a free port with `PLAYGROUND_ROOT` pointing at a temporary folder, and refuses to run unless it can prove the server answering is that one (its workspace appears in the temporary folder). Then it drives it over HTTP with real Claude calls on Haiku (a few cents): a deny rule keeps `.env` private, an allow rule skips the question, `/add-route` edits the API and the `settings.json` hook checks it, settings edits always ask, follow-ups go into the same live session, steering mid-task switches Claude to your new message, Stop interrupts a turn while the session continues on a new model, Claude asks a question and uses your answer, plan mode (keep planning with feedback, then approve with auto-accept edits), the task list, and context usage plus `/compact`. They are not part of `npm test` or CI.


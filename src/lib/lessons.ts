import type { RunConfig } from "./run-types";

export type CodeSample = { label: string; lang: string; source: string };

export type Lesson = {
  slug: string;
  title: string;
  summary: string;
  /** Paragraphs. Supports **bold**, `code`, and lines starting with "- " as bullets. */
  body: string[];
  code?: CodeSample[];
  tryIt?: {
    config: Partial<RunConfig> & { prompt: string };
    /** What to look for in the timeline. */
    watch: string[];
    /** Suggested follow-up experiment. */
    next?: string;
    showRaw?: boolean;
  };
};

export type Track = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  lessons: Lesson[];
};

export const TRACKS: Track[] = [
  {
    slug: "claude-code",
    title: "Claude Code",
    tagline: "The agent in your terminal",
    description: "What Claude Code does, how it uses tools, and how you stay in control with permissions, CLAUDE.md, hooks and subagents.",
    lessons: [
      {
        slug: "agent-loop",
        title: "Meet the agent loop",
        summary: "Claude Code is Claude plus tools plus a loop.",
        body: [
          "A normal chatbot answers from what it already knows. **Claude Code is an agent**: it can look at your files, run commands and edit code, then check its own work.",
          "Every task runs as a loop:",
          "- **Gather context**: read files, search the codebase\n- **Take action**: edit a file, run a command\n- **Verify**: run tests, re-read the result\n- Repeat until the task is done, then write a final answer",
          "Each step in the loop is a **tool call**. In the example below Claude explores a tiny sample project called *Tiny Shop* that lives in the `workspace/` folder of this playground.",
        ],
        tryIt: {
          config: { prompt: "What does this project do? Look around, then summarize it in 3 short bullet points.", tools: ["Read", "Glob", "Grep"] },
          watch: [
            "The **Session started** card lists the tools Claude has.",
            "Each 🔧 card is one tool call: Claude decides what to look at next.",
            "The last card shows how many turns the loop took and what it cost.",
          ],
        },
      },
      {
        slug: "tools",
        title: "Tools: how Claude acts",
        summary: "Read, Glob, Grep, Edit, Write, Bash and more.",
        body: [
          "Claude can't touch your computer directly. It can only ask to use a **tool**, and Claude Code runs that tool for it. The main built-in tools are:",
          "- `Read`: read a file\n- `Glob`: find files by name pattern, like `src/**/*.js`\n- `Grep`: search file contents\n- `Edit` / `Write`: change or create files\n- `Bash`: run a shell command, like `npm test`\n- `WebSearch` / `WebFetch`: look things up online\n- `Agent`: hand a sub-task to a subagent",
          "Which tools are available changes what Claude can do. In this example Claude only has read-only tools, so it can find the bug but can't fix it.",
        ],
        tryIt: {
          config: { prompt: "There's a bug with discount codes. Find it and explain it simply. Don't change any files.", tools: ["Read", "Glob", "Grep"] },
          watch: ["Watch which tools Claude picks: usually Glob or Grep first, then Read.", "Look at a tool result card to see exactly what Claude read."],
          next: "Open **Settings** and switch off Grep and Glob, then run it again. Claude adapts to the tools it has.",
        },
      },
      {
        slug: "permissions",
        title: "Permissions & modes",
        summary: "Claude asks before it changes anything.",
        body: [
          "By default Claude Code asks your permission before it edits files or runs commands. Reading is usually allowed without asking. There are a few **permission modes**:",
          "- `default`: ask before edits and commands\n- `acceptEdits`: auto-approve file edits, still ask for commands\n- `plan`: look around and propose a plan, but don't change anything\n- `dontAsk`: never ask; anything not pre-approved is denied",
          "In the Claude Code terminal you cycle modes with **Shift+Tab**. In this playground, pick them under **Settings**.",
          "Run the example: when Claude wants to edit `src/cart.js`, an **Allow / Deny** card appears. Try denying it first and see how Claude reacts.",
        ],
        tryIt: {
          config: { prompt: "Fix the discount code bug in src/cart.js.", tools: ["Read", "Glob", "Grep", "Edit"], permissionMode: "default" },
          watch: ["The amber card is a permission prompt, just like the one in the terminal.", "After you click Allow, open the **Files** panel to see the change."],
          next: "Reset the workspace, switch to `plan` mode and run it again. Claude only describes the fix.",
        },
      },
      {
        slug: "claude-md",
        title: "CLAUDE.md: project memory",
        summary: "Instructions Claude reads at the start of every session.",
        body: [
          "`CLAUDE.md` is a Markdown file in your project that Claude Code loads automatically. Use it for things Claude should always know: how to run tests, code style, project quirks.",
          "The sample project has one. It says to format prices like `$12.50` and to end every answer with a special line. Run the example with CLAUDE.md turned on, then turn it off under **Settings** and compare.",
          "Tip: in a real project, run `/init` in Claude Code and it writes a starter CLAUDE.md for you.",
        ],
        code: [
          {
            label: "workspace/CLAUDE.md",
            lang: "markdown",
            source: "# Project instructions for Claude\n\n- This project is called **Tiny Shop**.\n- Always say prices in US dollars with two decimals, e.g. `$12.50`.\n- End every answer with the line: `-- answered with CLAUDE.md loaded`",
          },
        ],
        tryIt: {
          config: { prompt: "How much is a Mug in the test data, and what does SAVE10 do?", tools: ["Read", "Glob", "Grep"], claudeMd: true },
          watch: ["The final answer should end with `-- answered with CLAUDE.md loaded`."],
          next: "Turn off **Load CLAUDE.md** and run again. The special ending disappears.",
        },
      },
      {
        slug: "commands-skills",
        title: "Slash commands & skills",
        summary: "Shortcuts you type, and know-how Claude loads when needed.",
        body: [
          "In the Claude Code terminal, anything starting with `/` is a **slash command**. A few worth knowing on day one:",
          "- `/init`: create a CLAUDE.md for this project\n- `/clear`: start a fresh conversation\n- `/compact`: summarize a long conversation to free up context\n- `/model`: switch models\n- `/permissions`: see and edit what's allowed\n- `/mcp`: manage MCP servers\n- `/agents`: manage subagents\n- `/help`: list everything",
          "Other handy keys: `@` to mention a file, `!` to run a shell command yourself, and **Esc** to interrupt Claude.",
          "A **skill** is a folder with a `SKILL.md` file that teaches Claude how to do one kind of task. Claude reads the short description up front and loads the full instructions only when a task needs them. Skills live in `.claude/skills/<name>/SKILL.md`, and you can run a skill directly as `/<name>`.",
        ],
        code: [
          {
            label: ".claude/skills/release-notes/SKILL.md",
            lang: "markdown",
            source: "---\nname: release-notes\ndescription: Write release notes from recent git commits. Use when the user asks for release notes or a changelog.\n---\n\n1. Run `git log --oneline` since the last tag.\n2. Group commits into Features, Fixes and Chores.\n3. Write one plain-English line per change.",
          },
        ],
      },
      {
        slug: "hooks",
        title: "Hooks: your code, at the right moment",
        summary: "Run checks before or after Claude uses a tool.",
        body: [
          "**Hooks** let you run your own code at points in Claude's loop, for example right before a tool runs (`PreToolUse`) or right after (`PostToolUse`). Unlike instructions in CLAUDE.md, a hook **always** runs; Claude can't skip it.",
          "Common uses: block edits to sensitive files, auto-format after every edit, log every command.",
          "This playground's hooks log every tool call and **block any edit to README.md**. Run the example and watch Claude get stopped.",
        ],
        code: [
          {
            label: ".claude/settings.json (Claude Code CLI)",
            lang: "json",
            source: '{\n  "hooks": {\n    "PostToolUse": [\n      {\n        "matcher": "Edit|Write",\n        "hooks": [{ "type": "command", "command": "npx prettier --write ." }]\n      }\n    ]\n  }\n}',
          },
        ],
        tryIt: {
          config: {
            prompt: "Add the line 'Edited by Claude' to the end of README.md, and add a comment '// reviewed by Claude' to the top of src/cart.js.",
            tools: ["Read", "Glob", "Grep", "Edit"],
            permissionMode: "acceptEdits",
            hooks: true,
          },
          watch: ["Purple 🪝 cards are hooks firing.", "The README edit gets blocked by the hook, but the cart.js edit goes through."],
        },
      },
      {
        slug: "subagents",
        title: "Subagents: delegating work",
        summary: "Specialist helpers with their own instructions and tools.",
        body: [
          "A **subagent** is a helper Claude can hand a sub-task to. It gets its own instructions, its own tools and a fresh context window, then reports back a summary. That keeps the main conversation short and focused.",
          "In Claude Code you define subagents as Markdown files in `.claude/agents/`. This playground registers a read-only `code-reviewer` that runs on Haiku.",
        ],
        code: [
          {
            label: ".claude/agents/code-reviewer.md",
            lang: "markdown",
            source: "---\nname: code-reviewer\ndescription: Reviews code for bugs and explains them in plain language.\ntools: Read, Glob, Grep\nmodel: haiku\n---\n\nYou are a friendly code reviewer for beginners. Read the relevant\nfiles, find bugs, and explain each one in one or two plain sentences.",
          },
        ],
        tryIt: {
          config: { prompt: "Use the code-reviewer subagent to review src/cart.js, then give me its findings.", tools: ["Read", "Glob", "Grep"], subagents: true },
          watch: ["An `Agent` tool call starts the subagent.", "Cards tagged `code-reviewer` are the helper working on its own."],
          next: "Want several helpers working at once? See the **Orchestration** lesson at the end of the Agent SDK track.",
        },
      },
    ],
  },
  {
    slug: "agent-sdk",
    title: "Agent SDK",
    tagline: "Claude Code as a library",
    description: "Put the same agent loop inside your own app with @anthropic-ai/claude-agent-sdk. This playground is built on it.",
    lessons: [
      {
        slug: "first-query",
        title: "Your first query()",
        summary: "One function call runs the whole agent loop.",
        body: [
          "The **Claude Agent SDK** is the engine behind Claude Code, packaged as a library. You call `query()` with a prompt and options, and it runs the full loop (tools, permissions, context) and **streams back messages** as it goes.",
          "**Why no API key?** The SDK starts the Claude Code program behind the scenes. If `ANTHROPIC_API_KEY` isn't set, it uses the login you already have from running `claude`. That's great for learning on your own machine. If you ship an app for other people, give it its own API key.",
        ],
        code: [
          {
            label: "hello.mjs",
            lang: "js",
            source: 'import { query } from "@anthropic-ai/claude-agent-sdk";\n\nfor await (const message of query({\n  prompt: "Say hello and list the tools you can use.",\n  options: { tools: ["Read", "Glob"] },\n})) {\n  console.log(message.type, message);\n}',
          },
          { label: "Install", lang: "bash", source: "npm install @anthropic-ai/claude-agent-sdk" },
        ],
        tryIt: {
          config: { prompt: "Say hello, then list the tools you can use in one short sentence.", tools: ["Read", "Glob"] },
          watch: ["Three kinds of messages arrive: `system` (init), `assistant`, and a final `result`.", "In the init card, **Auth** says your Claude Code login is being used."],
          showRaw: true,
        },
      },
      {
        slug: "messages",
        title: "Reading the message stream",
        summary: "system, assistant, user and result messages.",
        body: [
          "Everything `query()` yields has a `type`:",
          "- `system` with `subtype: \"init\"`: the session started. Lists the model, tools and MCP servers.\n- `assistant`: something Claude said. Holds text, thinking or `tool_use` blocks.\n- `user`: usually **tool results** that go back to Claude (not typed by you).\n- `result`: the end. Has the final text, number of turns, duration and estimated cost.",
          "Turn on **Show raw messages** to see the exact objects your code would receive.",
        ],
        code: [
          {
            label: "Handling messages",
            lang: "js",
            source: 'for await (const m of query({ prompt, options })) {\n  if (m.type === "system" && m.subtype === "init") console.log("tools:", m.tools);\n  if (m.type === "assistant") {\n    for (const block of m.message.content) {\n      if (block.type === "text") console.log("Claude:", block.text);\n      if (block.type === "tool_use") console.log("wants to use", block.name, block.input);\n    }\n  }\n  if (m.type === "result") console.log("done in", m.num_turns, "turns");\n}',
          },
        ],
        tryIt: {
          config: { prompt: "How many tests are in src/cart.test.js? Answer with just the number and their names.", tools: ["Read", "Glob"] },
          watch: ["Match each timeline card to its raw message underneath it."],
          showRaw: true,
        },
      },
      {
        slug: "options",
        title: "Options that shape the agent",
        summary: "tools, permissionMode, systemPrompt, model, cwd, maxTurns.",
        body: [
          "The `options` object is where you configure the agent. Every switch in this playground's **Settings** panel maps to one of these:",
          "- `cwd`: the folder the agent works in (here: `workspace/`)\n- `tools`: which built-in tools exist at all\n- `allowedTools`: tools that run without asking\n- `permissionMode`: `default`, `acceptEdits`, `plan`, `dontAsk`\n- `systemPrompt`: use Claude Code's prompt and `append` your own rules\n- `model` and `maxTurns`: which Claude, and how long the loop may run\n- `settingSources`: whether to load CLAUDE.md and settings files",
          "This example appends a system prompt that changes Claude's personality.",
        ],
        code: [
          {
            label: "Options",
            lang: "js",
            source: 'query({\n  prompt: "What does src/cart.js do?",\n  options: {\n    cwd: "./workspace",\n    tools: ["Read", "Glob", "Grep"],\n    permissionMode: "default",\n    systemPrompt: {\n      type: "preset",\n      preset: "claude_code",\n      append: "Answer in exactly one sentence, like a pirate.",\n    },\n    maxTurns: 10,\n  },\n});',
          },
        ],
        tryIt: {
          config: { prompt: "What does src/cart.js do?", tools: ["Read", "Glob", "Grep"], appendSystemPrompt: "Answer in exactly one sentence, like a pirate." },
          watch: ["The answer should be one pirate-y sentence.", "Edit **Append to system prompt** in Settings and try your own rule."],
        },
      },
      {
        slug: "permissions-in-code",
        title: "Approving tools from your code",
        summary: "canUseTool lets your app decide, or ask a human.",
        body: [
          "When Claude wants a tool that isn't pre-approved, the SDK calls your `canUseTool` function. You return `allow` or `deny`. Your function can check the input, ask a person, or both.",
          "That is exactly how this playground works: `canUseTool` auto-allows read-only tools inside `workspace/`, blocks paths outside it, and for everything else it **pauses and shows you an Allow / Deny card**.",
          "This example turns on `Bash`, so Claude can run the tests to check its fix. You approve each command.",
        ],
        code: [
          {
            label: "canUseTool",
            lang: "js",
            source: 'query({\n  prompt,\n  options: {\n    canUseTool: async (toolName, input) => {\n      if (toolName === "Bash" && String(input.command).includes("rm ")) {\n        return { behavior: "deny", message: "No deleting files." };\n      }\n      const ok = await askTheHuman(toolName, input); // your UI\n      return ok\n        ? { behavior: "allow", updatedInput: input }\n        : { behavior: "deny", message: "The user said no." };\n    },\n  },\n});',
          },
        ],
        tryIt: {
          config: { prompt: "Fix the discount code bug, then run npm test to prove it works.", tools: ["Read", "Glob", "Grep", "Edit", "Bash"], permissionMode: "default" },
          watch: ["You'll approve the edit and then the `npm test` command.", "The tool result for `npm test` should show all tests passing."],
          next: "Click **Reset workspace** afterwards to bring the bug back.",
        },
      },
      {
        slug: "hooks-in-code",
        title: "Hooks in code",
        summary: "Plain JavaScript functions at each step.",
        body: [
          "In the SDK, hooks are functions you pass in `options.hooks`. A `PreToolUse` hook can return a **deny** decision to stop a tool call before it happens, no matter what the permission mode says.",
          "The playground's hook blocks any `Edit` or `Write` on `README.md`, even in `acceptEdits` mode.",
        ],
        code: [
          {
            label: "options.hooks",
            lang: "js",
            source: 'hooks: {\n  PreToolUse: [{\n    matcher: "Edit|Write",\n    hooks: [async (input) => {\n      if (String(input.tool_input.file_path).endsWith("README.md")) {\n        return {\n          hookSpecificOutput: {\n            hookEventName: "PreToolUse",\n            permissionDecision: "deny",\n            permissionDecisionReason: "README.md is protected.",\n          },\n        };\n      }\n      return {};\n    }],\n  }],\n}',
          },
        ],
        tryIt: {
          config: { prompt: "Rewrite README.md so it is more exciting.", tools: ["Read", "Glob", "Grep", "Edit", "Write"], permissionMode: "acceptEdits", hooks: true },
          watch: ["The hook denies the edit, and Claude explains why it couldn't do it."],
        },
      },
      {
        slug: "orchestration",
        title: "Orchestration: a team of agents",
        summary: "One coordinator, several specialists working in parallel.",
        body: [
          "So far one agent did all the work. **Orchestration** splits a big job across several agents: a **coordinator** breaks the job into parts, hands each part to a **specialist**, then combines what they send back.",
          "Why bother?",
          "- **Focus**: each specialist has short, specific instructions and only the tools it needs\n- **Speed**: independent parts can run **in parallel** instead of one after another\n- **Clean context**: each specialist reads files in its own context window, so the coordinator only receives short summaries",
          "With the Agent SDK you describe the team in `options.agents`. The main agent becomes the coordinator: it starts each specialist with the `Agent` tool, and it can start several in a single turn so they run at the same time.",
          "Here the team reviews `src/cart.js`: a `bug-hunter`, a `readability-reviewer` and a `test-designer`, all read-only and running on Haiku.",
          "One detail: Claude Code normally runs subagents **in the background**, so the coordinator can keep working and gets notified later. This playground adds a small `PreToolUse` hook that sets `run_in_background: false` on every `Agent` call, so the coordinator waits for all three reports before it writes its answer.",
        ],
        code: [
          {
            label: "options.agents",
            lang: "ts",
            source: 'query({\n  prompt: "Review src/cart.js with your team in parallel, then merge the findings.",\n  options: {\n    tools: ["Read", "Glob", "Grep", "Agent"],\n    agents: {\n      "bug-hunter": {\n        description: "Finds correctness bugs in code.",\n        prompt: "List each real bug with its line number. Do not edit files.",\n        tools: ["Read", "Glob", "Grep"],\n        model: "haiku",\n      },\n      "readability-reviewer": {\n        description: "Reviews naming, clarity and comments.",\n        prompt: "Suggest at most three small readability improvements.",\n        tools: ["Read", "Glob", "Grep"],\n        model: "haiku",\n      },\n      "test-designer": {\n        description: "Designs missing test cases.",\n        prompt: "Propose up to three missing node:test cases.",\n        tools: ["Read", "Glob", "Grep"],\n        model: "haiku",\n      },\n    },\n  },\n});',
          },
        ],
        tryIt: {
          config: {
            prompt:
              "Review src/cart.js with your team. Start bug-hunter, readability-reviewer and test-designer all at once, in parallel. When they finish, merge their findings into one short report with the headings Bugs, Readability and Tests.",
            tools: ["Read", "Glob", "Grep"],
            team: true,
          },
          watch: [
            "Three `Agent` cards appear together: the coordinator starting all three specialists in one turn.",
            "The colored tags show which specialist each card belongs to. Their cards are mixed together because they run at the same time.",
            "The coordinator's final message combines the three reports. Compare its length with everything the specialists read.",
          ],
          next: "Change the prompt to run them **one after another** and compare the time on the Done card.",
        },
      },
    ],
  },
  {
    slug: "claude-api",
    title: "Claude API",
    tagline: "The layer underneath",
    description: "Claude Code and the Agent SDK are built on the Messages API. See its real request and response shapes inside the agent's stream.",
    lessons: [
      {
        slug: "messages-api",
        title: "The Messages API",
        summary: "One request in, one message out.",
        body: [
          "At the bottom of everything is one API call: **send a list of messages, get Claude's next message back**. You pick a `model`, set `max_tokens`, and pass the conversation so far.",
          "Calling the API directly needs an API key from the Claude Console. **You don't need one to learn the shapes, though.** Every `assistant` message from the Agent SDK wraps a real Messages API response. Run the example with raw messages on and look inside `message.message`: you'll see `id`, `model`, `content`, `stop_reason` and `usage`.",
        ],
        code: [
          {
            label: "With an API key (@anthropic-ai/sdk)",
            lang: "ts",
            source: 'import Anthropic from "@anthropic-ai/sdk";\n\nconst client = new Anthropic(); // reads ANTHROPIC_API_KEY\n\nconst response = await client.messages.create({\n  model: "claude-opus-5",\n  max_tokens: 16000,\n  messages: [{ role: "user", content: "Reply with just the word pong." }],\n});\n\nfor (const block of response.content) {\n  if (block.type === "text") console.log(block.text);\n}',
          },
        ],
        tryIt: {
          config: { prompt: "Reply with just the word pong.", tools: [] },
          watch: ["Expand the raw `assistant` message and find `message.content`, `stop_reason` and `usage`."],
          showRaw: true,
        },
      },
      {
        slug: "content-blocks",
        title: "Content blocks",
        summary: "text, thinking, tool_use and tool_result.",
        body: [
          "A message's `content` is a list of **blocks**, each with a `type`:",
          "- `text`: words for the reader\n- `thinking`: Claude reasoning before it answers (may be hidden or summarized)\n- `tool_use`: Claude asking to call a tool, with an `id`, a `name` and an `input`\n- `tool_result`: your answer to a `tool_use`, sent back in a **user** message with the matching `tool_use_id`",
          "Pairing `tool_use` with `tool_result` by id is how Claude and your code take turns.",
        ],
        tryIt: {
          config: { prompt: "Read src/cart.js and tell me the tax rate as a percentage.", tools: ["Read", "Glob"] },
          watch: ["Find a `tool_use` block, then the `tool_result` block that has the same id."],
          showRaw: true,
        },
      },
      {
        slug: "tool-use-loop",
        title: "The tool-use loop",
        summary: "What the Agent SDK automates for you.",
        body: [
          "With the raw API, **you** run the loop: call the API. If `stop_reason` is `\"tool_use\"`, run the tools, append the results and call again. Stop when `stop_reason` is `\"end_turn\"`.",
          "The Agent SDK and Claude Code run this loop for you, and add permissions, hooks, built-in tools and context management on top.",
        ],
        code: [
          {
            label: "A manual loop with the API",
            lang: "ts",
            source: 'let messages: Anthropic.MessageParam[] = [{ role: "user", content: userInput }];\n\nwhile (true) {\n  const response = await client.messages.create({\n    model: "claude-opus-5", max_tokens: 16000, tools, messages,\n  });\n  if (response.stop_reason === "end_turn") break;\n\n  messages.push({ role: "assistant", content: response.content });\n  const toolResults: Anthropic.ToolResultBlockParam[] = [];\n  for (const block of response.content) {\n    if (block.type !== "tool_use") continue;\n    toolResults.push({\n      type: "tool_result",\n      tool_use_id: block.id,\n      content: await executeTool(block.name, block.input),\n    });\n  }\n  messages.push({ role: "user", content: toolResults });\n}',
          },
        ],
        tryIt: {
          config: { prompt: "Roll a 6-sided die three times and tell me the total.", tools: [], demoMcp: true },
          watch: ["Count the loop: tool_use → tool_result → tool_use → ... → final text.", "The result card's **turns** is how many times the loop called the model."],
        },
      },
      {
        slug: "tokens-cost",
        title: "Tokens, cost & models",
        summary: "What you pay for, and how to choose a model.",
        body: [
          "Claude reads and writes **tokens** (roughly ¾ of a word each). Each response's `usage` shows `input_tokens` and `output_tokens`, plus `cache_read_input_tokens` when **prompt caching** reused an earlier prefix. Caching is why the second turn of an agent loop is usually much cheaper.",
          "The `result` message adds it all up in `total_cost_usd`. It's an estimate. With a Claude subscription, runs count against your plan's usage rather than being billed per token.",
          "Model choice is a trade-off: **Haiku** is fastest and cheapest, **Sonnet** balances speed and smarts, **Opus** is the most capable. Try the same prompt with different models under **Settings**.",
        ],
        tryIt: {
          config: { prompt: "In two sentences: what is the bug in src/cart.js?", tools: ["Read", "Glob"], model: "claude-haiku-4-5" },
          watch: ["Compare `usage` on each assistant message: later turns show cache reads.", "Switch the model to Opus and compare time, turns and cost."],
          showRaw: true,
        },
      },
    ],
  },
  {
    slug: "mcp",
    title: "MCP",
    tagline: "Plug new tools into Claude",
    description: "The Model Context Protocol connects Claude to outside tools and data. Use a live MCP server, see how one is built, and learn how to add your own.",
    lessons: [
      {
        slug: "what-is-mcp",
        title: "What is MCP?",
        summary: "A standard plug for AI tools.",
        body: [
          "**MCP (Model Context Protocol)** is an open standard for giving AI apps new abilities. Think of it like USB-C: build a tool once as an **MCP server**, and any MCP **client** (Claude Code, the Agent SDK, Claude Desktop and more) can use it.",
          "An MCP server can offer **tools** (actions Claude can call), **resources** (data it can read) and **prompts** (templates). There are MCP servers for GitHub, databases, browsers, Slack, docs sites and much more.",
          "This playground includes a tiny demo server called `demo` with four tools: `roll_dice`, `get_weather` (fake data), `save_note` and `list_notes`.",
        ],
        tryIt: {
          config: { prompt: "What's the weather in Singapore and in Tokyo? Which one is warmer?", tools: [], demoMcp: true },
          watch: ["The init card shows the `demo` MCP server as connected.", "MCP tools are named `mcp__<server>__<tool>`, like `mcp__demo__get_weather`."],
        },
      },
      {
        slug: "build-a-tool",
        title: "Build an MCP tool",
        summary: "A name, a description, an input schema and a handler.",
        body: [
          "Every MCP tool has four parts:",
          "- a **name** Claude uses to call it\n- a **description** that tells Claude when to use it (write this carefully!)\n- an **input schema** that describes the arguments\n- a **handler** that does the work and returns content",
          "With the Agent SDK you can build a server right inside your app with `createSdkMcpServer` and `tool()`. Here's the notebook part of this playground's `demo` server.",
        ],
        code: [
          {
            label: "src/lib/demo-mcp.ts (simplified)",
            lang: "ts",
            source: 'import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";\nimport { z } from "zod";\n\nconst notes: string[] = [];\n\nexport const demo = createSdkMcpServer({\n  name: "demo",\n  tools: [\n    tool("save_note", "Save a short note to the notebook.",\n      { note: z.string() },\n      async ({ note }) => {\n        notes.push(note);\n        return { content: [{ type: "text", text: "Saved." }] };\n      }),\n  ],\n});\n\n// query({ prompt, options: { mcpServers: { demo },\n//   allowedTools: ["mcp__demo__save_note"] } })',
          },
        ],
        tryIt: {
          config: { prompt: "Save a note that says 'MCP is neat', then list all the notes.", tools: [], demoMcp: true },
          watch: ["Notes stay saved between runs until you restart the dev server. Run it twice!"],
        },
      },
      {
        slug: "connect-servers",
        title: "Connect real MCP servers",
        summary: "claude mcp add, .mcp.json and the SDK's mcpServers.",
        body: [
          "Most MCP servers run as a separate program (**stdio**) or as a web service (**HTTP**). Here are three ways to connect one:",
          "- **Claude Code CLI**: `claude mcp add` (then check with `/mcp`)\n- **Project file**: a `.mcp.json` in your repo, shared with your team\n- **Agent SDK**: the `mcpServers` option",
          "Only install MCP servers you trust. A server's tools run with your permissions.",
        ],
        code: [
          {
            label: "Claude Code CLI",
            lang: "bash",
            source: "# A remote server over HTTP\nclaude mcp add --transport http my-server https://example.com/mcp\n\n# A local server started as a program (stdio)\nclaude mcp add my-local-server -- npx -y some-mcp-server",
          },
          {
            label: ".mcp.json",
            lang: "json",
            source: '{\n  "mcpServers": {\n    "my-local-server": {\n      "command": "npx",\n      "args": ["-y", "some-mcp-server"]\n    }\n  }\n}',
          },
          {
            label: "Agent SDK",
            lang: "ts",
            source: 'query({\n  prompt,\n  options: {\n    mcpServers: {\n      "my-local-server": { type: "stdio", command: "npx", args: ["-y", "some-mcp-server"] },\n      "my-server": { type: "http", url: "https://example.com/mcp" },\n    },\n  },\n});',
          },
        ],
        tryIt: {
          config: {
            prompt: "Roll a 20-sided die. If it's above 10, save a note 'lucky day', otherwise save 'try again tomorrow'. Then list all notes.",
            tools: [],
            demoMcp: true,
          },
          watch: ["Claude chains several MCP tools and decides between them based on the dice result."],
        },
      },
    ],
  },
];

export function findLesson(trackSlug: string, lessonSlug: string) {
  const track = TRACKS.find((t) => t.slug === trackSlug);
  const index = track?.lessons.findIndex((l) => l.slug === lessonSlug) ?? -1;
  if (!track || index < 0) return null;
  return { track, lesson: track.lessons[index], index };
}

/** Flat list across all tracks, for prev/next navigation. */
export const ALL_LESSONS = TRACKS.flatMap((track) => track.lessons.map((lesson) => ({ track, lesson })));

import { MCP_PRESETS, type RunConfig } from "./run-types";

export type Example = {
  /** "group/slug", also used in the URL (?example=...). */
  id: string;
  group: ExampleGroup;
  title: string;
  /** One line shown in the sidebar and above the prompt. */
  blurb: string;
  config: Partial<RunConfig> & { prompt: string };
  /** Things worth noticing in the timeline. Supports **bold** and `code`. */
  notice: string[];
  showRaw?: boolean;
};

export const EXAMPLE_GROUPS = ["Claude Code", "Agent SDK", "Claude API", "MCP"] as const;
export type ExampleGroup = (typeof EXAMPLE_GROUPS)[number];

const preset = (name: string) => MCP_PRESETS.find((p) => p.server.name === name)!.server;
const READ_ONLY = ["Read", "Glob", "Grep"] as const;

export const EXAMPLES: Example[] = [
  // Claude Code
  {
    id: "claude-code/explore",
    group: "Claude Code",
    title: "Explore a project",
    blurb: "Watch the agent loop: look around, then answer.",
    config: { prompt: "What does this project do? Look around, then summarize it in 3 short bullet points.", tools: [...READ_ONLY] },
    notice: ["Each 🔧 card is one tool call Claude chose to make.", "The **Done** card shows how many turns the loop took."],
  },
  {
    id: "claude-code/find-bug",
    group: "Claude Code",
    title: "Find a bug (read-only)",
    blurb: "Claude only has read tools, so it can find but not fix.",
    config: { prompt: "There's a bug with discount codes. Find it and explain it simply. Don't change any files.", tools: [...READ_ONLY] },
    notice: ["Try switching off Grep and Glob under **Settings**: Claude adapts to the tools it has."],
  },
  {
    id: "claude-code/approve-edit",
    group: "Claude Code",
    title: "Approve or deny an edit",
    blurb: "Edits wait for your Allow, just like the terminal.",
    config: { prompt: "Fix the discount code bug in src/cart.js.", tools: [...READ_ONLY, "Edit"], permissionMode: "default" },
    notice: ["Try **Deny** first and see how Claude reacts.", "After **Allow**, check the Workspace files panel for the change."],
  },
  {
    id: "claude-code/plan-mode",
    group: "Claude Code",
    title: "Plan mode",
    blurb: "Claude plans the change but can't make it.",
    config: { prompt: "Fix the discount code bug in src/cart.js.", tools: [...READ_ONLY, "Edit"], permissionMode: "plan" },
    notice: ["Same prompt as **Approve or deny an edit**, but in `plan` mode nothing changes."],
  },
  {
    id: "claude-code/claude-md",
    group: "Claude Code",
    title: "Project memory (CLAUDE.md)",
    blurb: "Instructions Claude loads at the start of every session.",
    config: { prompt: "How much is a Mug in the test data, and what does SAVE10 do?", tools: [...READ_ONLY], claudeMd: true },
    notice: ["The answer ends with a line that `workspace/CLAUDE.md` asks for.", "Turn off **Load CLAUDE.md** in Settings and compare."],
  },
  {
    id: "claude-code/hooks",
    group: "Claude Code",
    title: "A hook blocks an edit",
    blurb: "Your code runs before every tool call and can say no.",
    config: {
      prompt: "Add the line 'Edited by Claude' to the end of README.md, and add a comment '// reviewed by Claude' to the top of src/cart.js.",
      tools: [...READ_ONLY, "Edit"],
      permissionMode: "acceptEdits",
      hooks: true,
    },
    notice: ["Purple 🪝 cards are hooks firing.", "The README edit is blocked; the cart.js edit goes through."],
  },
  {
    id: "claude-code/subagent",
    group: "Claude Code",
    title: "Delegate to a subagent",
    blurb: "A helper with its own instructions and context.",
    config: { prompt: "Use the code-reviewer subagent to review src/cart.js, then give me its findings.", tools: [...READ_ONLY], subagents: true },
    notice: ["Cards tagged `code-reviewer` are the helper working on its own."],
  },
  {
    id: "claude-code/team",
    group: "Claude Code",
    title: "Orchestrate a team",
    blurb: "Three specialists in parallel, one merged report.",
    config: {
      prompt:
        "Review src/cart.js with your team. Start bug-hunter, readability-reviewer and test-designer all at once, in parallel. When they finish, merge their findings into one short report with the headings Bugs, Readability and Tests.",
      tools: [...READ_ONLY],
      team: true,
    },
    notice: ["Three `Agent` calls start in the same turn.", "The colored tags show which specialist each card belongs to."],
  },

  // Agent SDK
  {
    id: "agent-sdk/hello",
    group: "Agent SDK",
    title: "Hello, query()",
    blurb: "The raw messages your code would receive.",
    config: { prompt: "Say hello, then list the tools you can use in one short sentence.", tools: ["Read", "Glob"] },
    notice: ["Messages arrive as `system` (init), `assistant`, then `result`.", "Open the **Code** tab to see the query() call for these settings."],
    showRaw: true,
  },
  {
    id: "agent-sdk/system-prompt",
    group: "Agent SDK",
    title: "Change the system prompt",
    blurb: "Append your own rules to Claude Code's prompt.",
    config: { prompt: "What does src/cart.js do?", tools: [...READ_ONLY], appendSystemPrompt: "Answer in exactly one sentence, like a pirate." },
    notice: ["Edit **Append to system prompt** in Settings and try your own rule."],
  },
  {
    id: "agent-sdk/fix-and-test",
    group: "Agent SDK",
    title: "Fix it and run the tests",
    blurb: "Edit + Bash, each approved through canUseTool.",
    config: { prompt: "Fix the discount code bug, then run npm test to prove it works.", tools: [...READ_ONLY, "Edit", "Bash"] },
    notice: ["You approve the edit, then the `npm test` command.", "Click **Reset workspace** afterwards to bring the bug back."],
  },
  {
    id: "agent-sdk/spending-cap",
    group: "Agent SDK",
    title: "Hit the spending cap",
    blurb: "maxBudgetUsd stops a run that gets too expensive.",
    config: {
      prompt: "Read every file in this project one at a time and write a detailed summary of each.",
      tools: [...READ_ONLY],
      maxBudgetUsd: 0.05,
      model: "claude-haiku-4-5",
    },
    notice: ["The run stops with **hit the spending cap** once it passes $0.05."],
  },

  // Claude API
  {
    id: "claude-api/raw-message",
    group: "Claude API",
    title: "A raw API message",
    blurb: "id, model, content, stop_reason and usage.",
    config: { prompt: "Reply with just the word pong.", tools: [] },
    notice: ["Every `assistant` message wraps a real Messages API response in `message.message`."],
    showRaw: true,
  },
  {
    id: "claude-api/content-blocks",
    group: "Claude API",
    title: "tool_use and tool_result",
    blurb: "How Claude and your code take turns.",
    config: { prompt: "Read src/cart.js and tell me the tax rate as a percentage.", tools: ["Read", "Glob"] },
    notice: ["Find a `tool_use` block, then the `tool_result` with the same id."],
    showRaw: true,
  },
  {
    id: "claude-api/tokens",
    group: "Claude API",
    title: "Tokens, caching and cost",
    blurb: "Compare usage across turns and models.",
    config: { prompt: "In two sentences: what is the bug in src/cart.js?", tools: ["Read", "Glob"], model: "claude-haiku-4-5" },
    notice: ["Later turns show `cache_read_input_tokens`.", "Switch the model to Opus and compare time and cost."],
    showRaw: true,
  },

  // MCP
  {
    id: "mcp/demo-weather",
    group: "MCP",
    title: "Built-in demo server",
    blurb: "Fake weather tools served from this app.",
    config: { prompt: "What's the weather in Singapore and in Tokyo? Which one is warmer?", tools: [], demoMcp: true },
    notice: ["MCP tools are named `mcp__<server>__<tool>`."],
  },
  {
    id: "mcp/demo-chain",
    group: "MCP",
    title: "Chain MCP tools",
    blurb: "Dice, then a decision, then notes.",
    config: {
      prompt: "Roll a 20-sided die. If it's above 10, save a note 'lucky day', otherwise save 'try again tomorrow'. Then list all notes.",
      tools: [],
      demoMcp: true,
    },
    notice: ["Notes stay saved between runs until you restart the server."],
  },
  {
    id: "mcp/memory",
    group: "MCP",
    title: "Memory server (stdio)",
    blurb: "A real MCP server started on your computer with npx.",
    config: {
      prompt:
        "Remember these facts: Tiny Shop sells mugs for $12 and tea for $6, and the SAVE10 code gives 10% off. Then read back everything you remember.",
      tools: [],
      mcpServers: [preset("memory")],
    },
    notice: ["The first run downloads the server with npx, so it takes a little longer.", "Use **Always allow** so you don't approve every call."],
  },
  {
    id: "mcp/deepwiki",
    group: "MCP",
    title: "DeepWiki (remote HTTP)",
    blurb: "Ask questions about any public GitHub repo.",
    config: {
      prompt: "Using DeepWiki, explain in 3 bullets what the modelcontextprotocol/typescript-sdk repository is for.",
      tools: [],
      mcpServers: [preset("deepwiki")],
    },
    notice: ["This server runs on the internet; Claude sends it only the questions it asks."],
  },
  {
    id: "mcp/context7",
    group: "MCP",
    title: "Context7 library docs",
    blurb: "Fresh docs for popular libraries.",
    config: {
      prompt: "Use Context7 to look up how to create a route handler in Next.js, then summarize it in 3 bullets.",
      tools: [],
      mcpServers: [preset("context7")],
    },
    notice: ["Try asking about a library you use, like React or Express."],
  },
];

export const BLANK_EXAMPLE_ID = "blank";

export function findExample(id: string | undefined) {
  return EXAMPLES.find((e) => e.id === id);
}

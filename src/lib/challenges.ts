import type { RunConfig } from "./run-types";
import type { TemplateId } from "./templates";

// Practice challenges: a goal, a starter project, and requirements that
// "Check my work" verifies against your actual workspace (never Claude's word).
// The checks themselves live in challenge-checks.ts (server only).

export type Requirement = { id: string; label: string };

export type Challenge = {
  id: string;
  title: string;
  area: "REST API" | "MCP" | "Claude Code config" | "Debugging" | "Agent SDK" | "Claude API" | "Security";
  level: "Beginner" | "Intermediate";
  template: TemplateId;
  /** What to build, in a few sentences. Supports **bold** and `code`. */
  goal: string;
  requirements: Requirement[];
  /** Revealed one at a time. */
  hints: string[];
  /** Settings the playground starts you with; you write the prompts. */
  config: Partial<RunConfig>;
};

const BUILDER: Partial<RunConfig> = { tools: ["Read", "Glob", "Grep", "Edit", "Write"], permissionMode: "acceptEdits", projectConfig: true, maxTurns: 30 };

// Every Claude API challenge runs your code against the practice API, so this hint applies to all of them.
const PRACTICE_HINT = "Run the file from **Run & test** to see it work against the practice API (canned replies, real shapes, no key needed).";

export const CHALLENGES: Challenge[] = [
  {
    id: "api-todos",
    title: "A todo API",
    area: "REST API",
    level: "Beginner",
    template: "rest-api",
    goal: "Build a JSON todo API in `server.js`. Todos have an `id`, a `title` and a `done` flag, and live in memory. Use Claude to write it, then check your work.",
    requirements: [
      { id: "create", label: "POST /todos with { title } returns 201 and the new todo (id, title, done: false)" },
      { id: "validate", label: "POST /todos without a title returns 400 with an { error } message" },
      { id: "list", label: "GET /todos returns an array that includes the new todo" },
      { id: "missing", label: "GET /todos/<unknown id> returns 404 with an { error } message" },
      { id: "update", label: "PATCH /todos/:id with { done: true } returns 200 and the updated todo" },
      { id: "delete", label: "DELETE /todos/:id returns 204, and the todo is gone afterwards (404)" },
    ],
    hints: [
      "Give Claude the whole spec in one prompt: every route, the status codes, and the error format.",
      "The starter's CLAUDE.md and the rest-conventions skill already describe status codes. Turn on Project config so Claude reads them.",
      "Use Run & test → Start server and the request tester to try each route yourself before checking.",
    ],
    config: BUILDER,
  },
  {
    id: "api-filter",
    title: "Filter and search",
    area: "REST API",
    level: "Intermediate",
    template: "rest-api",
    goal: "Extend a todo API with query parameters. `GET /todos?done=true` returns only finished todos, and `GET /todos?q=milk` returns todos whose title contains the text (any case).",
    requirements: [
      { id: "create", label: "POST /todos with { title } returns 201 and the new todo" },
      { id: "done", label: "GET /todos?done=true returns only todos with done: true" },
      { id: "notdone", label: "GET /todos?done=false returns only todos with done: false" },
      { id: "search", label: "GET /todos?q=MILK finds todos whose title contains “milk” (any case)" },
      { id: "badquery", label: "GET /todos?done=maybe returns 400 with an { error } message" },
    ],
    hints: [
      "If your workspace doesn't have a todo API yet, finish “A todo API” first, or ask Claude for both at once.",
      "`new URL(req.url, …).searchParams` gives you the query parameters in node:http.",
      "Tell Claude exactly which values of `done` are valid, and what should happen otherwise.",
    ],
    config: BUILDER,
  },
  {
    id: "mcp-text-tools",
    title: "Text tools over MCP",
    area: "MCP",
    level: "Beginner",
    template: "mcp-server",
    goal: "Add two tools to your MCP server: `word_count` (counts the words in a `text`) and `reverse_text` (returns the `text` reversed). The checker connects to your server over stdio, like Claude Code does.",
    requirements: [
      { id: "starts", label: "The server starts and answers over MCP (stdio)" },
      { id: "listed", label: "It offers word_count and reverse_text, each with a description" },
      { id: "schema", label: "Both tools take a string input called text" },
      { id: "count", label: "word_count on “one two  three” answers 3" },
      { id: "reverse", label: "reverse_text on “abc” answers “cba”" },
    ],
    hints: [
      "Keep the existing greet tool as an example: `server.registerTool(name, { description, inputSchema }, handler)`.",
      "`inputSchema` is an object of zod fields, like `{ text: z.string() }`.",
      "Never console.log in an MCP server: stdout is the MCP channel.",
    ],
    config: BUILDER,
  },
  {
    id: "mcp-errors",
    title: "Tools that handle bad input",
    area: "MCP",
    level: "Intermediate",
    template: "mcp-server",
    goal: "Add a `convert_temperature` tool with a numeric `value` and a `unit` of `\"C\"` or `\"F\"`. It converts to the other unit. For an unknown unit it must return an MCP error result (`isError: true`) instead of crashing.",
    requirements: [
      { id: "listed", label: "The server offers convert_temperature with a description" },
      { id: "c2f", label: "100 C converts to 212 (F)" },
      { id: "f2c", label: "32 F converts to 0 (C)" },
      { id: "error", label: "An unknown unit gets a tool error (isError: true), and the server keeps running" },
    ],
    hints: [
      "Use `z.number()` for value. For unit, `z.string()` lets the handler see bad values; `z.enum` makes the SDK reject them for you.",
      "An error result looks like `{ isError: true, content: [{ type: \"text\", text: \"…\" }] }`.",
    ],
    config: BUILDER,
  },
  {
    id: "mcp-resources",
    title: "Resources and prompts",
    area: "MCP",
    level: "Intermediate",
    template: "mcp-server",
    goal: "Tools aren't the only thing an MCP server offers. Add a **resource** at `docs://style-guide` (text the app can attach as context) and a **prompt** called `review_code` with a `code` argument (a template the user picks, e.g. as a slash command).",
    requirements: [
      { id: "resource", label: "It lists a resource at docs://style-guide, with a name" },
      { id: "read", label: "Reading docs://style-guide returns some text" },
      { id: "prompt", label: "It lists a review_code prompt with a required code argument" },
      { id: "get", label: "Getting review_code with some code returns a user message that includes that code" },
    ],
    hints: [
      "`server.registerResource(name, uri, { title, description, mimeType }, async (uri) => ({ contents: [{ uri: uri.href, text }] }))`.",
      "`server.registerPrompt(name, { description, argsSchema: { code: z.string() } }, ({ code }) => ({ messages: [{ role: \"user\", content: { type: \"text\", text: … } }] }))`.",
      "Who uses what: the model calls tools, the app attaches resources, the user picks prompts.",
    ],
    config: BUILDER,
  },
  {
    id: "config-command",
    title: "Your own slash command",
    area: "Claude Code config",
    level: "Beginner",
    template: "rest-api",
    goal: "Create a slash command `/add-test` that asks Claude to write a `node:test` test for whatever route you pass it. Commands live in `.claude/commands/`.",
    requirements: [
      { id: "file", label: ".claude/commands/add-test.md exists" },
      { id: "description", label: "It has a description in its frontmatter" },
      { id: "arguments", label: "It uses $ARGUMENTS for the route you pass in" },
      { id: "nodetest", label: "It mentions node:test" },
    ],
    hints: [
      "You can write it yourself in the Claude config tab (＋ New command) or ask Claude to create it.",
      "Frontmatter is the `---` block at the top: `description: …` and optionally `argument-hint: …`.",
      "After checking, try it: type /add-test GET /health in the prompt.",
    ],
    config: BUILDER,
  },
  {
    id: "config-guardrails",
    title: "Guardrails for Tiny Shop",
    area: "Claude Code config",
    level: "Intermediate",
    template: "tiny-shop",
    goal: "Protect the tests and keep them green: Claude must never edit `src/cart.test.js`, the tests must run after every edit, and `git push` must always ask first.",
    requirements: [
      { id: "valid", label: ".claude/settings.json is valid JSON" },
      { id: "deny", label: "A deny rule blocks editing src/cart.test.js" },
      { id: "hook", label: "A PostToolUse hook on Edit/Write runs the tests (node --test or npm test)" },
      { id: "ask", label: "An ask rule makes Bash(git push…) always ask" },
    ],
    hints: [
      "Rules look like `Edit(./src/cart.test.js)` and `Bash(git push:*)`.",
      "Hooks go under `hooks.PostToolUse` with a `matcher` like `Edit|Write`.",
      "Claude asks before changing settings files, so you'll approve its edit (that's on purpose).",
    ],
    config: { ...BUILDER, permissionMode: "default" },
  },
  {
    id: "config-subagent",
    title: "A read-only specialist",
    area: "Claude Code config",
    level: "Beginner",
    template: "rest-api",
    goal: "Create a subagent called `security-reviewer` that reviews code for security problems. It must be read-only (no Edit, Write or Bash) and run on Haiku.",
    requirements: [
      { id: "file", label: "A subagent named security-reviewer exists in .claude/agents/" },
      { id: "description", label: "Its description says when Claude should use it" },
      { id: "readonly", label: "Its tools are read-only (no Edit, Write or Bash)" },
      { id: "model", label: "It runs on haiku" },
    ],
    hints: [
      "Subagents are Markdown files with frontmatter: name, description, tools, model.",
      "After checking, try it: ask Claude to use the security-reviewer subagent on server.js.",
    ],
    config: BUILDER,
  },
  {
    id: "debug-discount",
    title: "Fix the discount bug",
    area: "Debugging",
    level: "Beginner",
    template: "tiny-shop",
    goal: "Tiny Shop's discount codes give wrong totals. Find and fix the bug, and add a test for the `HALFOFF` code so it can't come back.",
    requirements: [
      { id: "fixed", label: "applyDiscount(200, \"SAVE10\") returns 180" },
      { id: "halfoff", label: "applyDiscount(80, \"HALFOFF\") returns 40" },
      { id: "test", label: "src/cart.test.js has a test that uses HALFOFF" },
      { id: "green", label: "All tests pass (node --test)" },
    ],
    hints: [
      "Ask Claude to find the bug first, without changing anything, then to fix it.",
      "Turn on Bash so Claude can run npm test to prove the fix, or use Run & test → Run tests yourself.",
    ],
    config: { ...BUILDER, tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"] },
  },
  {
    id: "agent-tool",
    title: "An agent with a custom tool",
    area: "Agent SDK",
    level: "Intermediate",
    template: "agent-sdk",
    goal: "Give the agent in `agent.mjs` a custom tool called `get_time` (built with `createSdkMcpServer` and `tool()`), allow it, and make the prompt ask what time it is. Keep the spending cap.",
    requirements: [
      { id: "syntax", label: "agent.mjs is valid JavaScript (node --check)" },
      { id: "tool", label: "It defines a get_time tool with tool() inside createSdkMcpServer" },
      { id: "wired", label: "The MCP server is passed in options.mcpServers" },
      { id: "allowed", label: "allowedTools includes mcp__<server>__get_time" },
      { id: "budget", label: "It still sets maxBudgetUsd" },
    ],
    hints: [
      "The agent-sdk starter's CLAUDE.md lists the pattern; turn on Project config.",
      "After checking, run it from Run & test → Run agent.mjs and watch it call your tool.",
    ],
    config: BUILDER,
  },
  {
    id: "security-hook",
    title: "Guard secrets with a hook",
    area: "Security",
    level: "Intermediate",
    template: "rest-api",
    goal: "Layer your guardrails. The deny rule `Read(./.env)` blocks the Read tool and file commands Claude Code recognizes, like `cat .env`, but not a script that opens the file itself (`node -e \"…readFileSync('.env')\"`). Write a **PreToolUse hook** that blocks any tool call that mentions `.env`, and turn it on in `.claude/settings.json`.",
    requirements: [
      { id: "script", label: ".claude/hooks/protect-env.mjs exists and runs" },
      { id: "read", label: "It blocks Read of .env (exit code 2, with the reason on stderr)" },
      { id: "bash", label: "It blocks Bash commands that mention .env, like cat .env or a node -e script that reads it" },
      { id: "allow", label: "It lets everything else through (exit code 0), like Read server.js or Bash ls" },
      { id: "registered", label: "settings.json runs it as a PreToolUse hook whose matcher covers Read and Bash" },
    ],
    hints: [
      "The hook gets JSON on stdin: `tool_name` and `tool_input` (`file_path` for Read/Edit/Write, `command` for Bash).",
      "Exit code 2 blocks the call, and whatever you print to stderr is shown to Claude as the reason. Exit 0 lets it through.",
      "Register it with `{ \"matcher\": \"Read|Edit|Write|Bash\", \"hooks\": [{ \"type\": \"command\", \"command\": \"node .claude/hooks/protect-env.mjs\" }] }` under `hooks.PreToolUse`.",
      "After checking, turn on Bash and ask Claude to print .env with a one-line node script: the hook stops it.",
    ],
    config: { ...BUILDER, permissionMode: "default" },
  },
  {
    id: "api-tool-loop",
    title: "The tool-use loop",
    area: "Claude API",
    level: "Intermediate",
    template: "claude-api",
    goal: "In `tools.mjs`, write `runWithTools(question)`: give Claude a `get_weather` tool, run the tool when Claude asks for it, send the result back, and repeat until Claude gives its final answer. This loop is what every agent harness does under the hood.",
    requirements: [
      { id: "defined", label: "The request describes get_weather with a description and an input_schema with a string city" },
      { id: "loop", label: "After a tool_use, the next request sends Claude's turn back plus a tool_result with the same tool_use_id" },
      { id: "final", label: "It returns Claude's text once stop_reason is end_turn, and stops calling" },
      { id: "parallel", label: "Two tool calls in one reply get both tool_results in a single user message" },
      { id: "error", label: "A failed lookup (unknown city) goes back as a tool_result with is_error: true" },
    ],
    hints: [
      "Loop while `response.stop_reason === \"tool_use\"`. Push `{ role: \"assistant\", content: response.content }`, then one user message with every tool_result.",
      "A tool_result looks like `{ type: \"tool_result\", tool_use_id: block.id, content: \"…\" }`. Add `is_error: true` when the tool failed.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-structured",
    title: "Structured output you can trust",
    area: "Claude API",
    level: "Intermediate",
    template: "claude-api",
    goal: "In `extract.mjs`, write `extractContact(text)`: get `{ name, email, company }` back as JSON using **structured outputs**, and return `null` whenever the reply can't be trusted (cut off, or refused) instead of crashing.",
    requirements: [
      { id: "schema", label: "The request sets output_config.format to a json_schema with name, email, company and additionalProperties: false" },
      { id: "parsed", label: "A normal reply returns the { name, email, company } object" },
      { id: "truncated", label: "A reply cut off by max_tokens returns null" },
      { id: "refusal", label: "A refusal (stop_reason: refusal) returns null" },
    ],
    hints: [
      "`output_config: { format: { type: \"json_schema\", schema: { type: \"object\", properties: {…}, required: […], additionalProperties: false } } }`.",
      "Check `stop_reason` before parsing, and wrap `JSON.parse` in try/catch.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-caching",
    title: "Prompt caching and usage",
    area: "Claude API",
    level: "Intermediate",
    template: "claude-api",
    goal: "In `faq.mjs`, write `answerFaq(question)`: send the long FAQ as a **cached** system prompt, and return the answer with the token usage, including what was written to and read from the cache.",
    requirements: [
      { id: "marked", label: "The FAQ is in the system prompt, marked with cache_control" },
      { id: "stable", label: "The system prompt is byte-identical across two questions (the question goes in messages)" },
      { id: "usage", label: "It returns input, cacheWrite, cacheRead and output from the response's usage" },
      { id: "total", label: "usage.totalInput = input + cacheWrite + cacheRead" },
    ],
    hints: [
      "`system: [{ type: \"text\", text: FAQ, cache_control: { type: \"ephemeral\" } }]`.",
      "Caching is a prefix match: anything that changes (a date, an id) before the breakpoint means a cache miss every time.",
      "`usage.input_tokens` counts only the uncached tokens. The prompt's full size is the sum of all three input fields.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-batch",
    title: "An overnight batch",
    area: "Claude API",
    level: "Intermediate",
    template: "claude-api",
    goal: "In `batch.mjs`, classify product reviews with the **Message Batches API**: it's asynchronous and costs less, a good fit for work that can wait. Submit one request per review, wait for the batch to end, then collect the results by `custom_id`.",
    requirements: [
      { id: "create", label: "submitReviews creates one batch with a request per review, using the review id as custom_id" },
      { id: "params", label: "Each request's params is a full Messages request (model, max_tokens, messages with the review)" },
      { id: "returns", label: "submitReviews returns the batch id" },
      { id: "poll", label: "collectResults waits until processing_status is \"ended\" before reading results" },
      { id: "results", label: "It returns succeeded texts by custom_id and lists the ones that failed" },
    ],
    hints: [
      "`client.messages.batches.create({ requests: [{ custom_id, params: { model, max_tokens, messages } }] })`.",
      "Poll with `client.messages.batches.retrieve(id)`, waiting POLL_MS between checks. Then `for await (const item of await client.messages.batches.results(id))`.",
      "Results can arrive in any order. `item.result.type` is succeeded, errored, canceled or expired.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-errors",
    title: "Errors and retries",
    area: "Claude API",
    level: "Beginner",
    template: "claude-api",
    goal: "In `errors.mjs`, write `safeAsk(question)` that never throws: it tells errors apart by type, retries the ones that can succeed later, and doesn't waste retries on ones that can't. And no API key in the code.",
    requirements: [
      { id: "success", label: "A normal reply returns { ok: true, text }" },
      { id: "badrequest", label: "A 400 returns { ok: false, retryable: false } and is sent only once" },
      { id: "overloaded", label: "A 529 that keeps happening is retried, then returns { ok: false, retryable: true }" },
      { id: "ratelimit", label: "A 429 that clears up on the next try ends in { ok: true }" },
      { id: "nokey", label: "No API key is written in any file (the SDK reads ANTHROPIC_API_KEY)" },
    ],
    hints: [
      "The SDK retries 429s and 5xx errors twice by default (`maxRetries`). It doesn't retry a 400.",
      "Check `err instanceof Anthropic.APIError` and its `status`, or the specific classes like `Anthropic.RateLimitError`.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-streaming",
    title: "Stream the answer",
    area: "Claude API",
    level: "Beginner",
    template: "claude-api",
    goal: "In `stream.mjs`, write `streamAnswer(question, onText)`: stream the reply and hand each piece of text to `onText` as it arrives, so people see progress right away. Return the whole text at the end.",
    requirements: [
      { id: "streams", label: "The request asks for a stream" },
      { id: "chunks", label: "onText gets every text delta, in order" },
      { id: "final", label: "It returns the whole text" },
    ],
    hints: [
      "`const stream = client.messages.stream({...}); stream.on(\"text\", onText); const msg = await stream.finalMessage();`",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-workflow",
    title: "A workflow, not an agent",
    area: "Claude API",
    level: "Beginner",
    template: "claude-api",
    goal: "In `workflow.mjs`, chain two calls: summarize, then translate the summary. Your code decides the steps (that's a **workflow**; in an **agent**, Claude decides). Add a gate: if step 1 didn't finish properly, stop there.",
    requirements: [
      { id: "steps", label: "It makes exactly two requests: summarize, then translate" },
      { id: "chained", label: "The second request contains step 1's summary, not the original text" },
      { id: "result", label: "It returns the translation from step 2" },
      { id: "gate", label: "If step 1 stops with max_tokens, it returns null without a second call" },
    ],
    hints: [
      "Each step is a normal `client.messages.create` call. Pass step 1's text into step 2's prompt.",
      "Workflows are predictable and easy to test; reach for an agent only when the steps can't be known ahead of time.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-model-routing",
    title: "The right model for the job",
    area: "Claude API",
    level: "Beginner",
    template: "claude-api",
    goal: "In `route.mjs`, send each job to a fitting model: simple, high-volume jobs to the fastest, lowest-priced one, and jobs that need reasoning to a more capable one. `chooseModel(taskId)` picks; `runTask(taskId, input)` uses the pick.",
    requirements: [
      { id: "simple", label: "tag-ticket and extract-order use Haiku" },
      { id: "complex", label: "plan-migration and review-design use a more capable model (Sonnet, Opus or Fable)" },
      { id: "valid", label: "Every model is an ID the API knows" },
      { id: "used", label: "runTask sends the model chooseModel picked, with the input" },
      { id: "unknown", label: "An unknown task throws an error instead of guessing" },
    ],
    hints: [
      "The models overview lists each model's ID, speed and price: https://platform.claude.com/docs/en/about-claude/models/overview",
      "Keep the model IDs in one place (a small map), so moving to a newer model later is a one-line change.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-thinking",
    title: "Effort and thinking",
    area: "Claude API",
    level: "Intermediate",
    template: "claude-api",
    goal: "In `think.mjs`, write `solve(problem, depth)`: a `\"quick\"` answer spends few tokens, a `\"deep\"` one works harder and returns a summary of Claude's thinking. First check that the starter's model can do that.",
    requirements: [
      { id: "model", label: "It uses a model that supports effort and adaptive thinking (Haiku 4.5 doesn't)" },
      { id: "quick", label: "\"quick\" sends output_config.effort \"low\"" },
      { id: "deep", label: "\"deep\" sends a higher effort and thinking { type: \"adaptive\", display: \"summarized\" }" },
      { id: "answer", label: "It returns the text as answer and the thinking summary as thoughts, kept apart" },
    ],
    hints: [
      "Effort lives in `output_config: { effort }`. The effort page lists which models support it.",
      "On current models thinking is adaptive: Claude decides how much to think. `budget_tokens` is rejected on them.",
      "Thinking arrives as `thinking` blocks before the `text` blocks. Without `display: \"summarized\"` their text can be empty.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-token-budget",
    title: "Count before you send",
    area: "Claude API",
    level: "Beginner",
    template: "claude-api",
    goal: "In `budget.mjs`, never send a request bigger than a token budget. Count the tokens first with the token counting endpoint; if it's over, skip the call and say so.",
    requirements: [
      { id: "counts", label: "It counts tokens first, with the same model, system and messages it sends" },
      { id: "skips", label: "Over the limit, it sends nothing and returns { skipped: true, inputTokens }" },
      { id: "sends", label: "Within the limit, it returns { skipped: false, inputTokens, answer }" },
      { id: "order", label: "The document comes before the question in the prompt" },
    ],
    hints: [
      "`client.messages.countTokens({ model, system, messages })` returns `{ input_tokens }`. It takes the same fields as `create`, minus `max_tokens`.",
      "Build the request object once and use it for both calls, so what you count is what you send.",
      "Long documents go at the top of the prompt and the question at the end: that gives better answers.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
  {
    id: "api-cost",
    title: "What did that cost?",
    area: "Claude API",
    level: "Intermediate",
    template: "claude-api",
    goal: "In `cost.mjs`, turn a response's `usage` into dollars: input and output tokens, cache writes and reads, and the batch discount. Then report the cost of a real call.",
    requirements: [
      { id: "basic", label: "Input and output tokens are priced per million tokens" },
      { id: "cache", label: "Cache writes cost 1.25× the input price, cache reads 0.1×" },
      { id: "batch", label: "{ batch: true } halves the cost" },
      { id: "unknown", label: "A model missing from PRICES throws, instead of costing $0" },
      { id: "live", label: "askWithCost returns the answer and the cost of that response" },
    ],
    hints: [
      "Prices are per million tokens: `tokens × price ÷ 1,000,000`.",
      "`input_tokens` is only the uncached part. Cache writes and reads are separate fields, each with its own price.",
      "Usage fields can be missing (no caching happened): treat them as 0.",
      PRACTICE_HINT,
    ],
    config: BUILDER,
  },
];

export function findChallenge(id: string | undefined) {
  return CHALLENGES.find((c) => c.id === id);
}

export type CheckResult = { id: string; pass: boolean; detail?: string };

import "server-only";
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { findChallenge, type CheckResult } from "./challenges";
import { API_CHECKERS } from "./challenge-checks-api";
import { childEnv, crashSummary, fail, isObj, ok, readText, type Results } from "./check-utils";
import { parseFrontmatter, readClaudeConfig } from "./claude-config";
import { WORKSPACE_DIR, currentTemplate, ensureWorkspace } from "./workspace";

// "Check my work": verify a challenge against the real workspace. Nothing here
// calls Claude; checks run your code (your API, your MCP server, your tests)
// the same way every time.

const run = promisify(execFile);

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer().once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

// ---------- REST API ----------

type Reply = { status: number; json: unknown; text: string };

/** Start the workspace's server.js on its own free port, run `fn`, then stop it. */
async function withApiServer(fn: (call: (method: string, p: string, body?: unknown) => Promise<Reply>) => Promise<void>) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], { cwd: WORKSPACE_DIR, env: childEnv({ PORT: String(port) }) });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  // "close" fires after the output streams are flushed, so a crash message is complete.
  const closed = new Promise((resolve) => child.once("close", resolve));
  try {
    const started = Date.now();
    while (true) {
      if (child.exitCode !== null) {
        await Promise.race([closed, new Promise((r) => setTimeout(r, 1000))]);
        throw new Error(`server.js crashed: ${crashSummary(output)}`);
      }
      const up = await new Promise<boolean>((resolve) => {
        const s = net.connect(port, "127.0.0.1");
        s.once("connect", () => (s.destroy(), resolve(true)));
        s.once("error", () => resolve(false));
      });
      if (up) break;
      if (Date.now() - started > 8000) throw new Error("server.js didn't start listening on process.env.PORT within 8 seconds.");
      await new Promise((r) => setTimeout(r, 100));
    }
    await fn(async (method, p, body) => {
      const res = await fetch(`http://127.0.0.1:${port}${p}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      return { status: res.status, json, text };
    });
  } finally {
    child.kill("SIGKILL");
  }
}

const hasError = (r: Reply) => isObj(r.json) && typeof r.json.error === "string" && r.json.error.length > 0;
const listOf = (r: Reply): Record<string, unknown>[] | null =>
  Array.isArray(r.json) ? r.json : isObj(r.json) && Array.isArray(r.json.todos) ? (r.json.todos as Record<string, unknown>[]) : null;
const got = (r: Reply) => `got ${r.status}${r.text ? ` ${r.text.slice(0, 120)}` : ""}`;

async function checkTodos(): Promise<Results> {
  const R: Results = {};
  await withApiServer(async (call) => {
    const created = await call("POST", "/todos", { title: "Check my work" });
    const todo = isObj(created.json) ? created.json : null;
    const id = todo?.id;
    R.create =
      created.status === 201 && todo && id !== undefined && todo.title === "Check my work" && todo.done === false
        ? ok()
        : fail(`Expected 201 with { id, title: "Check my work", done: false }; ${got(created)}`);

    const bad = await call("POST", "/todos", {});
    R.validate = bad.status === 400 && hasError(bad) ? ok() : fail(`Expected 400 with { error }; ${got(bad)}`);

    const missing = await call("GET", "/todos/99999999");
    R.missing = missing.status === 404 && hasError(missing) ? ok() : fail(`Expected 404 with { error }; ${got(missing)}`);

    if (id === undefined) {
      for (const k of ["list", "update", "delete"]) R[k] = fail("Needs a working POST /todos first.");
      return;
    }
    const all = await call("GET", "/todos");
    const items = listOf(all);
    R.list =
      all.status === 200 && items?.some((t) => String(t.id) === String(id))
        ? ok()
        : fail(`Expected 200 with an array containing todo ${String(id)}; ${got(all)}`);

    const updated = await call("PATCH", `/todos/${id}`, { done: true });
    R.update =
      updated.status === 200 && isObj(updated.json) && updated.json.done === true
        ? ok()
        : fail(`Expected 200 with done: true; ${got(updated)}`);

    const removed = await call("DELETE", `/todos/${id}`);
    const after = await call("GET", `/todos/${id}`);
    R.delete =
      removed.status === 204 && after.status === 404
        ? ok()
        : fail(`Expected DELETE → 204 and then GET → 404; DELETE ${got(removed)}, GET got ${after.status}`);
  });
  return R;
}

async function checkFilter(): Promise<Results> {
  const R: Results = {};
  await withApiServer(async (call) => {
    const make = async (title: string) => {
      const r = await call("POST", "/todos", { title });
      return r.status === 201 && isObj(r.json) ? r.json : null;
    };
    const milk = await make("Buy milk");
    const dog = await make("Walk the dog");
    const shake = await make("Milkshake recipe");
    if (!milk || !dog || !shake) {
      R.create = fail("POST /todos with { title } should return 201 and the new todo.");
      for (const k of ["done", "notdone", "search"]) R[k] = fail("Needs a working POST /todos first.");
    } else {
      R.create = ok();
      await call("PATCH", `/todos/${dog.id}`, { done: true });
      const titles = (r: Reply) => (listOf(r) ?? []).map((t) => String(t.title));
      const doneR = await call("GET", "/todos?done=true");
      const doneItems = listOf(doneR);
      R.done =
        doneR.status === 200 && doneItems && doneItems.length > 0 && doneItems.every((t) => t.done === true) && titles(doneR).includes("Walk the dog")
          ? ok()
          : fail(`Expected only done todos (including “Walk the dog”); ${got(doneR)}`);
      const openR = await call("GET", "/todos?done=false");
      const openItems = listOf(openR);
      R.notdone =
        openR.status === 200 && openItems && openItems.every((t) => t.done === false) && titles(openR).includes("Buy milk")
          ? ok()
          : fail(`Expected only unfinished todos (including “Buy milk”); ${got(openR)}`);
      const q = await call("GET", "/todos?q=MILK");
      const found = titles(q);
      R.search =
        q.status === 200 && found.includes("Buy milk") && found.includes("Milkshake recipe") && !found.includes("Walk the dog")
          ? ok()
          : fail(`Expected “Buy milk” and “Milkshake recipe” but not “Walk the dog”; ${got(q)}`);
    }
    const bad = await call("GET", "/todos?done=maybe");
    R.badquery = bad.status === 400 && hasError(bad) ? ok() : fail(`Expected 400 with { error }; ${got(bad)}`);
  });
  return R;
}

// ---------- MCP ----------

type ToolInfo = { name: string; description?: string; inputSchema?: { properties?: Record<string, { type?: string }> } };
type ToolResult = { isError?: boolean; content?: { type: string; text?: string }[] };

/** Connect to the workspace's MCP server over stdio, like Claude Code does. */
async function withMcpClient(fn: (client: Client, tools: ToolInfo[]) => Promise<void>) {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["server.js"], cwd: WORKSPACE_DIR, env: childEnv() as Record<string, string>, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (d) => (stderr += d));
  const client = new Client({ name: "playground-checker", version: "1.0.0" });
  try {
    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 10_000)),
    ]);
  } catch (err) {
    await client.close().catch(() => {});
    throw new Error(`Couldn't connect to server.js over MCP (${err instanceof Error ? err.message : err}). ${stderr.trim().slice(-300)}`);
  }
  try {
    const tools = client.getServerCapabilities()?.tools ? (await client.listTools()).tools : [];
    await fn(client, tools as ToolInfo[]);
  } finally {
    await client.close().catch(() => {});
  }
}

const textOf = (r: ToolResult) => (r.content ?? []).map((c) => c.text ?? "").join("\n");

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult | { thrown: string; code?: number }> {
  try {
    return (await client.callTool({ name, arguments: args }, undefined, { timeout: 5000 })) as ToolResult;
  } catch (err) {
    return { thrown: err instanceof Error ? err.message : String(err), code: (err as { code?: number }).code };
  }
}

async function checkTextTools(): Promise<Results> {
  const R: Results = {};
  await withMcpClient(async (client, tools) => {
    R.starts = ok();
    const byName = (n: string) => tools.find((t) => t.name === n);
    const missing = ["word_count", "reverse_text"].filter((n) => !byName(n)?.description?.trim());
    R.listed = missing.length ? fail(`Missing (or without a description): ${missing.join(", ")}. Found: ${tools.map((t) => t.name).join(", ") || "none"}`) : ok();
    const noText = ["word_count", "reverse_text"].filter((n) => byName(n)?.inputSchema?.properties?.text?.type !== "string");
    R.schema = noText.length ? fail(`These tools need a string input called text: ${noText.join(", ")}`) : ok();

    const count = await callTool(client, "word_count", { text: "one two  three" });
    R.count = "thrown" in count || count.isError || !/(^|\D)3(\D|$)/.test(textOf(count))
      ? fail(`Expected an answer containing 3; got ${"thrown" in count ? count.thrown : JSON.stringify(textOf(count))}`)
      : ok();
    const rev = await callTool(client, "reverse_text", { text: "abc" });
    R.reverse = "thrown" in rev || rev.isError || !textOf(rev).includes("cba")
      ? fail(`Expected “cba”; got ${"thrown" in rev ? rev.thrown : JSON.stringify(textOf(rev))}`)
      : ok();
  }).catch((err) => {
    for (const k of ["starts", "listed", "schema", "count", "reverse"]) R[k] ??= fail(err instanceof Error ? err.message : String(err));
  });
  return R;
}

async function checkTempErrors(): Promise<Results> {
  const R: Results = {};
  await withMcpClient(async (client, tools) => {
    const tool = tools.find((t) => t.name === "convert_temperature");
    R.listed = tool?.description?.trim() ? ok() : fail(`convert_temperature is missing or has no description. Found: ${tools.map((t) => t.name).join(", ") || "none"}`);
    const answer = async (value: number, unit: string, expected: RegExp, label: string) => {
      const r = await callTool(client, "convert_temperature", { value, unit });
      return "thrown" in r || r.isError || !expected.test(textOf(r))
        ? fail(`Expected ${label}; got ${"thrown" in r ? r.thrown : JSON.stringify(textOf(r))}`)
        : ok();
    };
    R.c2f = await answer(100, "C", /(^|[^\d.])212(\.0+)?([^\d]|$)/, "212");
    R.f2c = await answer(32, "F", /(^|[^\d.-])0(\.0+)?([^\d]|$)/, "0");
    const bad = await callTool(client, "convert_temperature", { value: 1, unit: "K" });
    const rejected = "thrown" in bad ? bad.code === -32602 : bad.isError === true;
    let alive = false;
    try {
      await client.listTools();
      alive = true;
    } catch {}
    R.error = rejected && alive
      ? ok()
      : fail(!alive ? "The server stopped after the bad input." : `Expected isError: true for unit "K"; got ${"thrown" in bad ? bad.thrown : JSON.stringify(bad).slice(0, 160)}`);
  }).catch((err) => {
    for (const k of ["listed", "c2f", "f2c", "error"]) R[k] ??= fail(err instanceof Error ? err.message : String(err));
  });
  return R;
}

async function checkResourcesAndPrompts(): Promise<Results> {
  const R: Results = {};
  await withMcpClient(async (client) => {
    const caps = client.getServerCapabilities() ?? {};
    const URI = "docs://style-guide";
    if (!caps.resources) {
      R.resource = R.read = fail("The server doesn't offer resources yet. Register one with server.registerResource(…).");
    } else {
      const { resources } = await client.listResources();
      const res = resources.find((r) => r.uri === URI);
      R.resource = res?.name ? ok() : fail(`No resource at ${URI}. Found: ${resources.map((r) => r.uri).join(", ") || "none"}`);
      try {
        const { contents } = await client.readResource({ uri: URI });
        const text = contents.map((c) => ("text" in c && typeof c.text === "string" ? c.text : "")).join("");
        R.read = text.trim() ? ok() : fail(`Reading ${URI} returned no text.`);
      } catch (err) {
        R.read = fail(`Reading ${URI} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!caps.prompts) {
      R.prompt = R.get = fail("The server doesn't offer prompts yet. Register one with server.registerPrompt(…).");
      return;
    }
    const { prompts } = await client.listPrompts();
    const prompt = prompts.find((p) => p.name === "review_code");
    const arg = prompt?.arguments?.find((a) => a.name === "code");
    R.prompt = !prompt
      ? fail(`No review_code prompt. Found: ${prompts.map((p) => p.name).join(", ") || "none"}`)
      : arg?.required
        ? ok()
        : fail("review_code needs a required argument called code (argsSchema: { code: z.string() }).");
    try {
      const got = await client.getPrompt({ name: "review_code", arguments: { code: "let total = price * qty;" } });
      const user = got.messages.filter((m) => m.role === "user").map((m) => (m.content.type === "text" ? m.content.text : "")).join("\n");
      R.get = user.includes("let total = price * qty;") ? ok() : fail(`The prompt's user message should include the code; got ${JSON.stringify(got.messages).slice(0, 160)}`);
    } catch (err) {
      R.get = fail(`Getting review_code failed: ${err instanceof Error ? err.message : err}`);
    }
  }).catch((err) => {
    for (const k of ["resource", "read", "prompt", "get"]) R[k] ??= fail(err instanceof Error ? err.message : String(err));
  });
  return R;
}

// ---------- Claude Code config ----------

async function checkCommand(): Promise<Results> {
  const text = await readText(".claude/commands/add-test.md");
  if (text === null) {
    const missing = fail("Create .claude/commands/add-test.md first.");
    return { file: missing, description: missing, arguments: missing, nodetest: missing };
  }
  const { data, body } = parseFrontmatter(text);
  return {
    file: ok(),
    description: data.description?.trim() ? ok() : fail("Add a --- frontmatter block with description: …"),
    arguments: body.includes("$ARGUMENTS") ? ok() : fail("Use $ARGUMENTS in the prompt where the route should go."),
    nodetest: /node:test/.test(text) ? ok() : fail("Mention node:test so Claude writes the right kind of test."),
  };
}

async function checkGuardrails(): Promise<Results> {
  const { settings } = await readClaudeConfig(WORKSPACE_DIR);
  if (!settings.exists || settings.error) {
    const why = settings.error ? `Invalid JSON: ${settings.error}` : "Create .claude/settings.json first.";
    return { valid: fail(why), deny: fail(why), hook: fail(why), ask: fail(why) };
  }
  const hook = settings.hooks.find((h) => h.event === "PostToolUse" && /Edit|Write|\*/.test(h.matcher) && /node --test|npm (run )?test/.test(h.command));
  return {
    valid: ok(),
    deny: settings.deny.some((r) => /^Edit\((\.\/)?src\/cart\.test\.js\)$/.test(r))
      ? ok()
      : fail(`No deny rule like Edit(./src/cart.test.js). Deny rules: ${settings.deny.join(", ") || "none"}`),
    hook: hook ? ok() : fail("No PostToolUse hook with matcher Edit|Write that runs node --test or npm test."),
    ask: settings.ask.some((r) => /^Bash\(git push/.test(r)) ? ok() : fail(`No ask rule like Bash(git push:*). Ask rules: ${settings.ask.join(", ") || "none"}`),
  };
}

async function checkSubagent(): Promise<Results> {
  const { agents } = await readClaudeConfig(WORKSPACE_DIR);
  const agent = agents.find((a) => a.name === "security-reviewer");
  if (!agent) {
    const missing = fail(`No subagent named security-reviewer in .claude/agents/ (found: ${agents.map((a) => a.name).join(", ") || "none"}).`);
    return { file: missing, description: missing, readonly: missing, model: missing };
  }
  const { data } = parseFrontmatter((await readText(agent.file)) ?? "");
  const tools = (data.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const writers = tools.filter((t) => ["Edit", "Write", "Bash", "NotebookEdit", "MultiEdit"].includes(t));
  return {
    file: ok(),
    description: (data.description ?? "").trim().length >= 15 ? ok() : fail("Write a description that says what it reviews and when to use it."),
    readonly: !tools.length
      ? fail("Without a tools: line a subagent gets every tool. List read-only ones, like Read, Grep, Glob.")
      : writers.length
        ? fail(`These tools can change things: ${writers.join(", ")}`)
        : ok(),
    model: /haiku/i.test(data.model ?? "") ? ok() : fail(`Set model: haiku (now: ${data.model || "not set"}).`),
  };
}

// ---------- Debugging ----------

async function checkDiscount(): Promise<Results> {
  const R: Results = {};
  try {
    const { stdout } = await run(
      process.execPath,
      ["--input-type=module", "-e", `import { applyDiscount } from "./src/cart.js"; console.log(JSON.stringify([applyDiscount(200, "SAVE10"), applyDiscount(80, "HALFOFF")]));`],
      { cwd: WORKSPACE_DIR, env: childEnv(), timeout: 10_000 },
    );
    const [save10, halfoff] = JSON.parse(stdout.trim().split("\n").pop() ?? "[]");
    R.fixed = save10 === 180 ? ok() : fail(`applyDiscount(200, "SAVE10") returned ${save10}`);
    R.halfoff = halfoff === 40 ? ok() : fail(`applyDiscount(80, "HALFOFF") returned ${halfoff}`);
  } catch (err) {
    const why = `Couldn't load src/cart.js: ${err instanceof Error ? err.message.split("\n")[0] : err}`;
    R.fixed = fail(why);
    R.halfoff = fail(why);
  }
  const tests = await readText("src/cart.test.js");
  R.test = tests && /HALFOFF/.test(tests) ? ok() : fail("Add a test in src/cart.test.js that uses HALFOFF.");
  try {
    await run(process.execPath, ["--test"], { cwd: WORKSPACE_DIR, env: childEnv(), timeout: 30_000 });
    R.green = ok();
  } catch (err) {
    const out = (err as { stdout?: string }).stdout ?? "";
    const failed = /# fail (\d+)/.exec(out)?.[1];
    R.green = fail(failed ? `${failed} test(s) failing. Run them in Run & test to see which.` : "The tests didn't pass.");
  }
  return R;
}

// ---------- Agent SDK ----------

async function checkAgentTool(): Promise<Results> {
  const code = await readText("agent.mjs");
  if (code === null) {
    const missing = fail("agent.mjs is missing.");
    return { syntax: missing, tool: missing, wired: missing, allowed: missing, budget: missing };
  }
  let syntax = ok();
  try {
    await run(process.execPath, ["--check", "agent.mjs"], { cwd: WORKSPACE_DIR, timeout: 10_000 });
  } catch (err) {
    syntax = fail(((err as { stderr?: string }).stderr ?? "").trim().split("\n").slice(0, 4).join(" ") || "Syntax error.");
  }
  return {
    syntax,
    tool:
      /createSdkMcpServer\s*\(/.test(code) && /tool\(\s*["'`]get_time["'`]/.test(code)
        ? ok()
        : fail("Expected tool(\"get_time\", …) inside createSdkMcpServer({ tools: [...] })."),
    wired: /mcpServers\s*:/.test(code) ? ok() : fail("Pass the server in options.mcpServers."),
    allowed: /allowedTools\s*:\s*\[[^\]]*mcp__[\w-]+__get_time/.test(code) ? ok() : fail("Add \"mcp__<server name>__get_time\" to options.allowedTools."),
    budget: /maxBudgetUsd\s*:/.test(code) ? ok() : fail("Keep maxBudgetUsd in the options."),
  };
}

// ---------- Security ----------

type HookRun = { code: number | null; stdout: string; stderr: string };

/** Run a hook script the way Claude Code does: the event as JSON on stdin. */
function runHook(script: string, toolName: string, toolInput: Record<string, unknown>) {
  const event = {
    session_id: "playground-check",
    transcript_path: "",
    cwd: WORKSPACE_DIR,
    permission_mode: "default",
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
  };
  return new Promise<HookRun>((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: WORKSPACE_DIR, env: childEnv({ CLAUDE_PROJECT_DIR: WORKSPACE_DIR }) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.on("error", () => {}); // a hook that exits without reading stdin
    child.stdin.end(JSON.stringify(event));
  });
}

/** A hook blocks with exit code 2, or with a JSON decision on stdout. */
function blocked(r: HookRun) {
  if (r.code === 2) return true;
  if (r.code !== 0) return false;
  try {
    const out = JSON.parse(r.stdout.trim().split("\n").pop() ?? "") as { hookSpecificOutput?: { permissionDecision?: string } };
    return ["deny", "block"].includes(out.hookSpecificOutput?.permissionDecision ?? "");
  } catch {
    return false;
  }
}

async function checkSecurityHook(): Promise<Results> {
  const R: Results = {};
  const rel = ".claude/hooks/protect-env.mjs";
  if ((await readText(rel)) === null) {
    const missing = fail(`Create ${rel} first.`);
    R.script = R.read = R.bash = R.allow = missing;
  } else {
    const script = path.join(WORKSPACE_DIR, rel);
    const SCRIPT = `node -e "console.log(require('fs').readFileSync('.env', 'utf8'))"`;
    const [readEnv, catEnv, scriptEnv, readServer, ls] = await Promise.all([
      runHook(script, "Read", { file_path: path.join(WORKSPACE_DIR, ".env") }),
      runHook(script, "Bash", { command: "cat .env", description: "Show the env file" }),
      runHook(script, "Bash", { command: SCRIPT }),
      runHook(script, "Read", { file_path: path.join(WORKSPACE_DIR, "server.js") }),
      runHook(script, "Bash", { command: "ls -la" }),
    ]);
    const crashed = [readEnv, catEnv, readServer].find((r) => r.code !== 0 && r.code !== 2);
    R.script = crashed ? fail(`It exited with code ${crashed.code}: ${crashSummary(crashed.stderr)}`) : ok();
    const why = (r: HookRun) => (blocked(r) ? "" : `exited with ${r.code}${r.stderr.trim() ? ` (${r.stderr.trim().slice(0, 80)})` : ""}`);
    R.read = blocked(readEnv)
      ? readEnv.code === 2 && !readEnv.stderr.trim()
        ? fail("It blocked, but printed no reason on stderr. Claude sees that reason, so say why.")
        : ok()
      : fail(`Read of .env wasn't blocked: it ${why(readEnv)}. Exit with code 2 to block.`);
    R.bash =
      blocked(catEnv) && blocked(scriptEnv)
        ? ok()
        : fail(`Not blocked: ${[!blocked(catEnv) && "cat .env", !blocked(scriptEnv) && SCRIPT].filter(Boolean).join(", ")}. Look at tool_input.command.`);
    const wrongly = [readServer.code !== 0 && "Read server.js", ls.code !== 0 && "Bash ls -la", blocked(readServer) && "Read server.js"].filter(Boolean);
    R.allow = wrongly.length ? fail(`These should be allowed with exit code 0: ${[...new Set(wrongly)].join(", ")}`) : ok();
  }

  const { settings } = await readClaudeConfig(WORKSPACE_DIR);
  const covers = (matcher: string, tool: string) => {
    if (matcher === "" || matcher === "*") return true;
    try {
      return new RegExp(`^(?:${matcher})$`).test(tool);
    } catch {
      return false;
    }
  };
  const hook = settings.hooks.find((h) => h.event === "PreToolUse" && h.command.includes("protect-env.mjs"));
  R.registered = settings.error
    ? fail(`.claude/settings.json isn't valid JSON: ${settings.error}`)
    : !hook
      ? fail("No PreToolUse hook in .claude/settings.json runs protect-env.mjs.")
      : covers(hook.matcher, "Read") && covers(hook.matcher, "Bash")
        ? ok()
        : fail(`The matcher "${hook.matcher}" should cover Read and Bash, e.g. "Read|Edit|Write|Bash".`);
  return R;
}

const CHECKERS: Record<string, () => Promise<Results>> = {
  ...API_CHECKERS,
  "mcp-resources": checkResourcesAndPrompts,
  "security-hook": checkSecurityHook,
  "api-todos": checkTodos,
  "api-filter": checkFilter,
  "mcp-text-tools": checkTextTools,
  "mcp-errors": checkTempErrors,
  "config-command": checkCommand,
  "config-guardrails": checkGuardrails,
  "config-subagent": checkSubagent,
  "debug-discount": checkDiscount,
  "agent-tool": checkAgentTool,
};

/** Run a challenge's checks against the current workspace. */
export async function runChallengeChecks(id: string): Promise<{ results: CheckResult[] } | { error: string }> {
  const challenge = findChallenge(id);
  const checker = CHECKERS[id];
  if (!challenge || !checker) return { error: "Unknown challenge." };
  await ensureWorkspace();
  if ((await currentTemplate()) !== challenge.template) {
    return { error: `This challenge needs the ${challenge.template} starter in your workspace. Switch starters first.` };
  }
  let outcomes: Results;
  try {
    outcomes = await checker();
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    outcomes = Object.fromEntries(challenge.requirements.map((r) => [r.id, fail(why)]));
  }
  return {
    results: challenge.requirements.map((r) => ({ id: r.id, ...(outcomes[r.id] ?? fail("Not checked.")) })),
  };
}

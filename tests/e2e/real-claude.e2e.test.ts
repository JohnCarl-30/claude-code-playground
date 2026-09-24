/**
 * End-to-end tests with real Claude calls (Haiku, a few cents per run).
 * Run with `npm run test:e2e`; they are skipped by `npm test` and CI.
 *
 * They start a separate production server on a free port whose workspace lives
 * in a temporary folder, and refuse to run unless they can prove the server that
 * answers is that one, so your own dev servers and workspaces are never touched.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { taskListFrom } from "@/lib/tasks";
import { createTempPlaygroundRoot } from "../helpers";

jest.setTimeout(240_000);

const temp = createTempPlaygroundRoot();
let server: ChildProcess;
let BASE = "";

/** Ask the OS for a port nobody is using. */
function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer().once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

type Event = { kind: string; [key: string]: unknown };
const sdk = (events: Event[]) => events.filter((e) => e.kind === "sdk").map((e) => e.message as Record<string, unknown>);
const toolUses = (events: Event[]) =>
  sdk(events)
    .filter((m) => m.type === "assistant")
    .flatMap((m) => ((m.message as { content: { type: string; name?: string; input?: Record<string, unknown> }[] }).content ?? []))
    .filter((b) => b.type === "tool_use");
const allText = (events: Event[]) => JSON.stringify(sdk(events));

async function api(pathname: string, init?: RequestInit) {
  const res = await fetch(BASE + pathname, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return res.json();
}

/**
 * A live session driven over HTTP like the browser does: POST /api/session, read
 * the NDJSON event stream, send messages and controls. `answer` decides permission cards.
 */
/** How the test answers a card: permission cards get allow/deny; questions and plan reviews get a full answer. */
type CardAnswer = "allow" | "deny" | Record<string, unknown>;

async function openSession(config: Record<string, unknown>, answer: (e: Event) => CardAnswer = () => "allow") {
  const created = await api("/api/session", {
    method: "POST",
    body: JSON.stringify({ model: "claude-haiku-4-5", maxBudgetUsd: 0.5, ...config }),
  });
  if (!created.id) throw new Error(created.error ?? "no session");
  const id = created.id as string;
  const events: Event[] = [];
  const res = await fetch(`${BASE}/api/session/${id}/events?from=0`);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  void (async () => {
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line) as Event;
        if (event.kind === "sdk" && (event.message as { type: string }).type === "stream_event") continue;
        events.push(event);
        if (event.kind === "permission_request" || event.kind === "question" || event.kind === "plan_review") {
          const a = answer(event);
          const body = typeof a === "string" ? { allow: a === "allow" } : a;
          await api("/api/permission", { method: "POST", body: JSON.stringify({ id: event.id, ...body }) });
        }
      }
    }
  })();
  const results = () => sdk(events).filter((m) => m.type === "result");
  return {
    id,
    events,
    results,
    /** Wait until Claude has finished `n` messages in this session. */
    async untilResults(n: number) {
      for (let i = 0; i < 1200 && results().length < n; i++) await new Promise((r) => setTimeout(r, 200));
      if (results().length < n) throw new Error(`timed out waiting for ${n} results`);
    },
    async until(check: () => boolean) {
      for (let i = 0; i < 1200 && !check(); i++) await new Promise((r) => setTimeout(r, 200));
      if (!check()) throw new Error("timed out");
    },
    send: (text: string, how: "queue" | "steer" = "queue") => api(`/api/session/${id}/message`, { method: "POST", body: JSON.stringify({ text, how }) }),
    control: (action: string, value?: string) => api(`/api/session/${id}/control`, { method: "POST", body: JSON.stringify({ action, value }) }),
    close: () => fetch(`${BASE}/api/session/${id}`, { method: "DELETE" }),
  };
}

/** One message in a fresh session, then close it. */
async function run(config: Record<string, unknown>, answer?: (e: Event) => CardAnswer) {
  const session = await openSession(config, answer);
  await session.untilResults(1);
  await session.close();
  return session.events;
}

beforeAll(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    env: { ...process.env, PLAYGROUND_ROOT: temp.root },
    stdio: "ignore",
    // Its own process group, so stopping it also stops the next-server child.
    detached: process.platform !== "win32",
  });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    if (server.exitCode !== null) throw new Error("The test server exited. Run `npm run build` first.");
    up = await fetch(`${BASE}/api/status`).then(() => true, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) throw new Error("The test server didn't start. Run `npm run build` first.");

  // Safety check before anything can change files: the server that answers must
  // be ours, i.e. it creates its workspace inside our temporary folder.
  await fetch(`${BASE}/api/workspace`);
  if (!existsSync(path.join(temp.root, "workspace", ".playground-template"))) {
    stopServer();
    throw new Error(`The server on ${BASE} isn't using the temporary workspace; refusing to run tests against it.`);
  }
});

function stopServer() {
  if (!server?.pid || server.exitCode !== null) return;
  try {
    if (process.platform === "win32") server.kill();
    else process.kill(-server.pid, "SIGTERM"); // the whole group
  } catch {}
}

afterAll(async () => {
  const exited = server && server.exitCode === null ? new Promise((r) => server.once("exit", r)) : null;
  stopServer();
  await exited;
  temp.cleanup();
});

const workspaceFile = (rel: string) => readFileSync(path.join(temp.root, "workspace", rel), "utf8");

describe("real Claude through the playground", () => {
  beforeAll(async () => {
    const ws = await api("/api/workspace", { method: "POST", body: JSON.stringify({ template: "rest-api" }) });
    expect(ws.template).toBe("rest-api");
  });

  it("a deny rule in settings.json keeps .env private", async () => {
    const events = await run({ prompt: "Read the .env file and tell me what API_SECRET is.", tools: ["Read", "Bash"], projectConfig: true });
    expect(allText(events)).not.toContain("not-a-real-secret");
  });

  it("an allow rule in settings.local.json runs node --check without asking", async () => {
    const events = await run({ prompt: "Run exactly this command: node --check server.js", tools: ["Bash"], projectConfig: true });
    expect(toolUses(events).some((t) => t.name === "Bash" && String(t.input?.command).includes("node --check"))).toBe(true);
    expect(events.some((e) => e.kind === "permission_request")).toBe(false);
  });

  it("a slash command edits the API and the settings.json hook checks it", async () => {
    const events = await run({
      prompt: "/add-route GET /time returns the server's current time as an ISO string",
      tools: ["Read", "Glob", "Grep", "Edit", "Write"],
      permissionMode: "acceptEdits",
      projectConfig: true,
      maxTurns: 25,
    });
    expect(workspaceFile("server.js")).toContain("/time");
    const hooks = sdk(events).filter((m) => m.subtype === "hook_response");
    expect(hooks.some((h) => String(h.output ?? h.stdout).includes("syntax OK"))).toBe(true);
  });

  it("changing a settings file always asks, even in acceptEdits mode", async () => {
    const before = workspaceFile(".claude/settings.local.json");
    const asked: Event[] = [];
    await run(
      {
        prompt: 'Add "Bash(ls:*)" to the allow list in .claude/settings.local.json.',
        tools: ["Read", "Edit", "Write"],
        permissionMode: "acceptEdits",
        projectConfig: true,
      },
      (e) => (asked.push(e), "deny"),
    );
    expect(asked.some((e) => ["Edit", "Write"].includes(String(e.tool)))).toBe(true);
    expect(workspaceFile(".claude/settings.local.json")).toBe(before);
  });

  it("follow-ups go into the same live session and remember it", async () => {
    const session = await openSession({ prompt: "Remember the code word PINEAPPLE. Reply with just OK.", tools: [] });
    await session.untilResults(1);
    await session.send("What was the code word? Reply with just the word.");
    await session.untilResults(2);
    await session.close();
    expect(JSON.stringify(sdk(session.events).filter((m) => m.type === "assistant").at(-1))).toContain("PINEAPPLE");
  });

  it("steering mid-task makes Claude switch to your new message", async () => {
    const session = await openSession({ prompt: "Read every file in this project one by one and describe each in detail.", tools: ["Read", "Glob"] });
    await session.until(() => toolUses(session.events).length > 0);
    await session.send("Stop that. Reply with just the word MANGO.", "steer");
    await session.untilResults(2);
    await session.close();
    expect(session.events.some((e) => e.kind === "user_prompt" && e.mode === "steer")).toBe(true);
    expect(JSON.stringify(sdk(session.events).filter((m) => m.type === "assistant").at(-1))).toContain("MANGO");
  });

  it("stop interrupts the turn, and the session continues on a new model", async () => {
    const session = await openSession({ prompt: "Describe every file in this project in great detail, one by one.", tools: ["Read", "Glob"] });
    await session.until(() => toolUses(session.events).length > 0);
    await session.control("interrupt");
    await session.untilResults(1);
    expect(session.results()[0].subtype).toBe("error_during_execution");
    await session.control("model", "claude-sonnet-5");
    await session.send("Reply with just your model id.");
    await session.untilResults(2);
    await session.close();
    const inits = sdk(session.events).filter((m) => m.subtype === "init");
    expect(inits.at(-1)?.model).toBe("claude-sonnet-5");
  });

});

describe("inside the session (real Claude)", () => {
  beforeAll(async () => {
    const ws = await api("/api/workspace", { method: "POST", body: JSON.stringify({ template: "tiny-shop" }) });
    expect(ws.template).toBe("tiny-shop");
  });

  it("Claude asks a question and continues with your answer", async () => {
    const session = await openSession(
      { prompt: "Use the AskUserQuestion tool to ask me whether to reply in English or Filipino (two options). Then say good morning in the language I pick.", tools: [] },
      (e) => {
        const q = (e.questions as { question: string }[])[0];
        return { allow: true, answers: { [q.question]: "Filipino" } };
      },
    );
    await session.untilResults(1);
    await session.close();
    expect(session.events.some((e) => e.kind === "question")).toBe(true);
    const reply = JSON.stringify(sdk(session.events).filter((m) => m.type === "assistant").at(-1)).toLowerCase();
    expect(reply).toMatch(/magandang|umaga/);
  });

  it("plan mode: keep planning with feedback, then approve with auto-accept edits", async () => {
    let reviews = 0;
    const session = await openSession(
      {
        prompt: "Plan how to fix the discount code bug in src/cart.js. Keep the plan short and present it for my approval.",
        tools: ["Read", "Glob", "Grep", "Edit", "Write"],
        permissionMode: "plan",
        maxTurns: 30,
      },
      (e) => {
        if (e.kind !== "plan_review") return "allow";
        reviews++;
        return reviews === 1 ? { allow: false, message: "Also mention running the tests afterwards." } : { allow: true, mode: "acceptEdits" };
      },
    );
    await session.until(() => session.results().length >= 1 && reviews >= 2);
    await session.close();
    expect(session.events.filter((e) => e.kind === "plan_review").length).toBeGreaterThanOrEqual(2);
    expect(session.events.some((e) => e.kind === "control" && e.permissionMode === "acceptEdits")).toBe(true);
    expect(workspaceFile("src/cart.js")).not.toContain("amount - percent");
    expect(existsSync(path.join(temp.root, "workspace", ".claude", "plans"))).toBe(true);
  });

  it("Claude keeps a task list", async () => {
    const events = await run({
      prompt: "Create a task list with exactly 3 short tasks for reviewing README.md, then do each one, marking it in progress and completed as you go. Be very brief.",
      tools: ["Read"],
    });
    const tasks = taskListFrom(events as unknown as Parameters<typeof taskListFrom>[0]);
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.status === "completed")).toBe(true);
  });

  it("reports context usage, and /compact compacts the conversation", async () => {
    const session = await openSession({ prompt: "Read README.md and summarize it in one line.", tools: ["Read"] });
    await session.untilResults(1);
    const usage = await (await fetch(`${BASE}/api/session/${session.id}/context`)).json();
    expect(usage.totalTokens).toBeGreaterThan(0);
    expect(usage.maxTokens).toBeGreaterThan(usage.totalTokens);
    expect(Array.isArray(usage.categories)).toBe(true);
    await session.send("/compact");
    await session.until(() => sdk(session.events).some((m) => m.subtype === "compact_boundary"));
    await session.close();
  });
});

describe("challenges solved by real Claude, then checked", () => {
  const check = async (id: string) => (await api(`/api/challenges/${id}/check`, { method: "POST", body: "{}" })) as { results?: { id: string; pass: boolean; detail?: string }[]; error?: string };

  it("config-command: Claude writes the slash command and every check passes", async () => {
    await api("/api/workspace", { method: "POST", body: JSON.stringify({ template: "rest-api" }) });
    const before = await check("config-command");
    expect(before.results?.every((r) => r.pass)).toBe(false);
    await run({
      prompt:
        "Create a slash command at .claude/commands/add-test.md. Give it frontmatter with a description, and a prompt that asks Claude to write a node:test test for the route given in $ARGUMENTS.",
      tools: ["Read", "Glob", "Write", "Edit"],
      permissionMode: "acceptEdits",
    });
    const after = await check("config-command");
    expect(after.results?.filter((r) => !r.pass)).toEqual([]);
  });

  it("debug-discount: Claude fixes the bug and adds a test, and the checks prove it", async () => {
    await api("/api/workspace", { method: "POST", body: JSON.stringify({ template: "tiny-shop" }) });
    await api("/api/workspace", { method: "DELETE" }); // fresh Tiny Shop
    await run({
      prompt: "Fix the discount code bug in src/cart.js, and add a test to src/cart.test.js that checks applyDiscount(80, \"HALFOFF\") is 40. Then run the tests with node --test.",
      tools: ["Read", "Glob", "Grep", "Edit", "Bash"],
      permissionMode: "acceptEdits",
      maxTurns: 25,
    });
    const after = await check("debug-discount");
    expect(after.results?.filter((r) => !r.pass)).toEqual([]);
  });
});

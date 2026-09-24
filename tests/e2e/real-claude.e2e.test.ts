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

/** POST /api/run and collect every event; `answer` decides permission cards. */
async function run(config: Record<string, unknown>, answer: (e: Event) => "allow" | "deny" = () => "allow") {
  const res = await fetch(`${BASE}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5", maxBudgetUsd: 0.5, ...config }),
  });
  const events: Event[] = [];
  let buffer = "";
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line) as Event;
      events.push(event);
      if (event.kind === "permission_request") {
        await api("/api/permission", { method: "POST", body: JSON.stringify({ id: event.id, allow: answer(event) === "allow" }) });
      }
    }
  }
  return events;
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

  it("follow-ups continue the same conversation", async () => {
    const first = await run({ prompt: "Remember the code word PINEAPPLE. Reply with just OK.", tools: [] });
    const sessionId = sdk(first).find((m) => typeof m.session_id === "string")?.session_id;
    expect(sessionId).toBeTruthy();
    const second = await run({ prompt: "What was the code word? Reply with just the word.", tools: [], resumeSessionId: sessionId });
    expect(allText(second)).toContain("PINEAPPLE");
  });
});

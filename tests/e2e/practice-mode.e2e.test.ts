/**
 * API-key mode and practice mode, end to end, with a FAKE key (no cost: Claude
 * rejects it before any usage). Runs a separate production server on a free port
 * with its own temporary workspace. Part of `npm run test:e2e`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { createTempPlaygroundRoot } from "../helpers";

jest.setTimeout(120_000);

const temp = createTempPlaygroundRoot();
let server: ChildProcess;
let BASE = "";

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer().once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

const api = async (p: string, init?: RequestInit) =>
  (await fetch(BASE + p, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } })).json();

beforeAll(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    env: { ...process.env, PLAYGROUND_ROOT: temp.root, PLAYGROUND_AUTH: "api-key", ANTHROPIC_API_KEY: "sk-ant-api03-FAKE-KEY-for-tests" },
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    if (server.exitCode !== null) throw new Error("The test server exited. Run `npm run build` first.");
    up = await fetch(`${BASE}/api/workspace`).then(() => true, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up || !existsSync(path.join(temp.root, "workspace", ".playground-template"))) throw new Error("Not our isolated server; refusing to run.");
});

afterAll(async () => {
  if (server?.pid && server.exitCode === null) {
    const exited = new Promise((r) => server.once("exit", r));
    try {
      if (process.platform === "win32") server.kill();
      else process.kill(-server.pid, "SIGTERM");
    } catch {}
    await exited;
  }
  temp.cleanup();
});

describe("API-key mode with a bad key, and practice mode", () => {
  it("the status says the key was rejected, right away", async () => {
    const started = Date.now();
    const status = await api("/api/status");
    expect(status).toMatchObject({ ready: false, mode: "api-key", reason: expect.stringMatching(/rejected \(401\)/) });
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("a run stops within seconds with advice, instead of retrying for minutes", async () => {
    const started = Date.now();
    const { id } = await api("/api/session", { method: "POST", body: JSON.stringify({ prompt: "Say hi", tools: [], model: "claude-haiku-4-5" }) });
    const res = await fetch(`${BASE}/api/session/${id}/events?from=0`);
    const text = await res.text(); // the stream ends when the session closes
    const events = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(events.find((e) => e.kind === "error")?.message).toMatch(/API key was rejected/);
    expect(events.at(-1)).toMatchObject({ kind: "closed", reason: "Claude couldn't sign in." });
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it("practice mode still runs code and checks challenges without Claude", async () => {
    await api("/api/workspace", { method: "POST", body: JSON.stringify({ template: "tiny-shop" }) });
    const tests = await api("/api/process", { method: "POST", body: JSON.stringify({ action: "start", script: "test" }) });
    expect(tests.running ?? tests.logs).toBeTruthy();
    const check = await api("/api/challenges/debug-discount/check", { method: "POST", body: "{}" });
    expect(check.results).toHaveLength(4); // real results (the starter's bug means some fail)
    expect(check.results.some((r: { pass: boolean }) => !r.pass)).toBe(true);
  });
});

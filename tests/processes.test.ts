import net from "node:net";
import { createTempPlaygroundRoot } from "./helpers";

const temp = createTempPlaygroundRoot();
let ws: typeof import("@/lib/workspace");
let proc: typeof import("@/lib/processes");

beforeAll(async () => {
  ws = await import("@/lib/workspace");
  proc = await import("@/lib/processes");
});
afterAll(async () => {
  await proc.stopProcess();
  temp.cleanup();
});

const until = async (check: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
};

/** True when nothing answers on the port (connecting is what the request tester does). */
const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.destroy(), resolve(false)));
    socket.once("error", () => resolve(true));
  });

describe("Run & test", () => {
  it("refuses anything that isn't one of the starter's scripts", async () => {
    await ws.ensureWorkspace();
    expect(await proc.startProcess("rm -rf /")).toMatch(/isn't a script/);
  });

  it("runs a finishing script and captures its output", async () => {
    await ws.switchWorkspace("rest-api");
    await proc.startProcess("check");
    await until(() => !proc.getProcessStatus().running);
    const status = proc.getProcessStatus();
    expect(status.exitCode).toBe(0);
    expect(status.logs[0]).toBe("$ node --check server.js");
  });

  it("gives a friendly error when no API server is running", async () => {
    if (!(await portFree(4100))) return console.warn("Skipped: something is running on port 4100 (maybe your own API server).");
    expect(await proc.sendToApi("GET", "/health", "")).toEqual({ error: expect.stringMatching(/Start server/) });
  });

  it("starts the API server, forwards requests to it, and stops it quickly", async () => {
    if (!(await portFree(4100))) return console.warn("Skipped: something is running on port 4100 (maybe your own API server).");
    await proc.startProcess("start");
    await until(() => proc.getProcessStatus().logs.some((l) => l.includes("listening")));

    const res = await proc.sendToApi("GET", "/health", "");
    expect(res).toMatchObject({ status: 200, body: '{"ok":true}' });
    expect(await proc.sendToApi("GET", "/nope", "")).toMatchObject({ status: 404 });

    const started = Date.now();
    await proc.stopProcess();
    expect(proc.getProcessStatus().running).toBe(false);
    // Stopping twice must not wait for an exit event that already happened.
    await proc.stopProcess();
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it("runs Claude API files against the practice API, never the real one", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-should-never-be-used";
    try {
      await ws.switchWorkspace("claude-api");
      await proc.startProcess("ask");
      await until(() => !proc.getProcessStatus().running, 20_000);
      const { exitCode, logs } = proc.getProcessStatus();
      expect(exitCode).toBe(0);
      expect(logs[0]).toBe("$ node run.mjs ask");
      expect(logs.join("\n")).toMatch(/practice API at http:\/\/127\.0\.0\.1:\d+/);
      expect(logs.join("\n")).toContain("⇄ practice API: POST /v1/messages → stop_reason: end_turn");
      expect(logs.join("\n")).toMatch(/ask\.mjs returned:\n\(practice API\) This is a canned reply/);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("shows why an unfinished file fails", async () => {
    await proc.startProcess("tools");
    await until(() => !proc.getProcessStatus().running, 20_000);
    const { exitCode, logs } = proc.getProcessStatus();
    expect(exitCode).toBe(1);
    expect(logs.join("\n")).toContain("runWithTools isn't written yet");
  });
});

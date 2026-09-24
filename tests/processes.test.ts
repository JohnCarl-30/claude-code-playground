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
});

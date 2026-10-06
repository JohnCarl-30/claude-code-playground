import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createTempPlaygroundRoot } from "./helpers";
import type { CustomMcpServer } from "@/lib/run-types";

// The MCP inspector against a real stdio server (the MCP challenges' reference solution).

const temp = createTempPlaygroundRoot();
let inspect: typeof import("@/lib/mcp-inspect");

const server: CustomMcpServer = { name: "ref", type: "stdio", command: process.execPath, args: [path.join(__dirname, "fixtures/challenges/mcp/server.js")] };
const methods = (r: { messages: { direction: string; message: unknown }[] }, direction: string) =>
  r.messages.filter((m) => m.direction === direction).map((m) => (m.message as { method?: string }).method ?? "(response)");

beforeAll(async () => {
  inspect = await import("@/lib/mcp-inspect");
});
afterAll(async () => {
  await inspect.closeAllInspectors();
  temp.cleanup();
});

describe("MCP inspector", () => {
  it("lists tools, resources and prompts, starting with the handshake", async () => {
    const r = await inspect.inspectMcpServer(server, { kind: "list" });
    expect(r.ok).toBe(true);
    expect(r.connected).toBe(true);
    const listed = r.result as { tools: { name: string }[]; resources: { uri: string }[]; prompts: { name: string }[]; server: { name: string } };
    expect(listed.server.name).toBe("my-server");
    expect(listed.tools.map((t) => t.name)).toEqual(["word_count", "reverse_text", "convert_temperature"]);
    expect(listed.resources.map((x) => x.uri)).toEqual(["docs://style-guide"]);
    expect(listed.prompts.map((p) => p.name)).toEqual(["review_code"]);
    expect(methods(r, "sent").slice(0, 3)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(methods(r, "received")[0]).toBe("(response)");
  }, 30_000);

  it("reuses the connection: a call sends just tools/call and gets its reply", async () => {
    const r = await inspect.inspectMcpServer(server, { kind: "call", name: "word_count", arguments: { text: "one two three" } });
    expect(r.ok).toBe(true);
    expect(r.connected).toBe(false);
    expect(r.result).toMatchObject({ content: [{ type: "text", text: "3" }] });
    expect(r.messages).toHaveLength(2);
    expect(r.messages[0]).toMatchObject({ direction: "sent", message: { method: "tools/call", params: { name: "word_count", arguments: { text: "one two three" } } } });
    expect(r.messages[1]).toMatchObject({ direction: "received", message: { result: { content: [{ text: "3" }] } } });
  }, 30_000);

  it("shows a tool's own error result, reads a resource and gets a prompt", async () => {
    const bad = await inspect.inspectMcpServer(server, { kind: "call", name: "convert_temperature", arguments: { value: 1, unit: "K" } });
    expect(bad.result).toMatchObject({ isError: true });
    const res = await inspect.inspectMcpServer(server, { kind: "read", uri: "docs://style-guide" });
    expect(res.result).toMatchObject({ contents: [{ uri: "docs://style-guide", text: expect.stringContaining("Style guide") }] });
    const prompt = await inspect.inspectMcpServer(server, { kind: "prompt", name: "review_code", arguments: { code: "x = 1" } });
    expect(JSON.stringify(prompt.result)).toContain("x = 1");
  }, 30_000);

  it("reports protocol errors with the messages that caused them", async () => {
    const r = await inspect.inspectMcpServer(server, { kind: "call", name: "no_such_tool", arguments: {} });
    // The SDK server answers an unknown tool with an error result or a JSON-RPC error; either way it's on the wire.
    expect(r.messages.some((m) => m.direction === "sent")).toBe(true);
    expect(r.ok ? JSON.stringify(r.result) : r.error).toMatch(/no_such_tool|not found/i);
  }, 30_000);

  it("disconnects, and a failed start explains itself", async () => {
    await inspect.inspectMcpServer(server, { kind: "disconnect" });
    const again = await inspect.inspectMcpServer(server, { kind: "list" });
    expect(again.connected).toBe(true);
    const missing = await inspect.inspectMcpServer({ name: "nope", type: "stdio", command: "definitely-not-a-command-xyz", args: [] }, { kind: "list" });
    expect(missing.ok).toBe(false);
    expect(missing.error).toBeTruthy();
  }, 30_000);
});

describe("the HTTP starter server", () => {
  let child: ChildProcess;
  let port = 0;

  beforeAll(async () => {
    // A free port, so this never collides with a server you're running.
    port = await new Promise<number>((resolve) => {
      const probe = net.createServer().listen(0, "127.0.0.1", () => {
        const p = (probe.address() as net.AddressInfo).port;
        probe.close(() => resolve(p));
      });
    });
    child = spawn(process.execPath, [path.join(process.cwd(), "templates/mcp-server/server-http.js")], { env: { ...process.env, PORT: String(port) } });
    await new Promise<void>((resolve, reject) => {
      child.stdout!.on("data", (d) => String(d).includes("listening") && resolve());
      child.once("exit", (code) => reject(new Error(`server exited (${code})`)));
    });
  }, 30_000);
  afterAll(() => {
    child?.kill();
  });

  it("offers a tool, a resource and a prompt over HTTP", async () => {
    const remote: CustomMcpServer = { name: "http", type: "http", url: `http://127.0.0.1:${port}/mcp` };
    const r = await inspect.inspectMcpServer(remote, { kind: "list" });
    expect(r.ok).toBe(true);
    const listed = r.result as { tools: { name: string }[]; resources: { uri: string }[]; prompts: { name: string }[] };
    expect(listed.tools.map((t) => t.name)).toEqual(["greet"]);
    expect(listed.resources.map((x) => x.uri)).toEqual(["docs://house-rules"]);
    expect(listed.prompts.map((p) => p.name)).toEqual(["summarize"]);
    const call = await inspect.inspectMcpServer(remote, { kind: "call", name: "greet", arguments: { name: "Ada" } });
    expect(JSON.stringify(call.result)).toContain("Hello, Ada!");
    const empty = await inspect.inspectMcpServer(remote, { kind: "call", name: "greet", arguments: { name: " " } });
    expect(empty.result).toMatchObject({ isError: true });
    await inspect.inspectMcpServer(remote, { kind: "disconnect" });
  }, 30_000);

  it("refuses requests addressed to another host (DNS rebinding)", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/mcp", method: "GET", headers: { Host: `evil.example:${port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });
});

import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CustomMcpServer, InspectAction } from "./run-types";
import { WORKSPACE_DIR, ensureWorkspace } from "./workspace";

// The MCP inspector: the playground itself acts as the MCP client (no Claude),
// so you can list a server's tools, resources and prompts, call them, and see
// every JSON-RPC message exactly as it went over the wire. A connection stays
// open between actions (a stdio server keeps running, so it keeps its state)
// and closes after a few idle minutes.

export type WireMessage = { direction: "sent" | "received"; message: unknown };

export type InspectResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  /** The messages this action sent and received (on a new connection, starting with the handshake). */
  messages: WireMessage[];
  /** What a stdio server printed to stderr (its logs), most recent last. */
  log: string;
  /** This action opened a new connection. */
  connected: boolean;
};

const IDLE_MS = 5 * 60_000;
const CONNECT_MS = 60_000; // npx may need to download a server the first time
const ACTION_MS = 30_000;
const MAX_LOG = 20_000;

type Connection = { client: Client; messages: WireMessage[]; log: { text: string }; pid: () => number | null; idle?: ReturnType<typeof setTimeout> };

// One connection per server configuration, shared by every inspector request.
const connections = new Map<string, Promise<Connection>>();
// Connections whose stdio server may still be running.
const running = new Set<Connection>();
const keyOf = (s: CustomMcpServer) => JSON.stringify(s);

/**
 * Record every message the transport sends and receives. `client.connect()` keeps
 * handlers that are already set and calls them first, so this sees every reply.
 */
function record(transport: Transport, messages: WireMessage[]) {
  const send = transport.send.bind(transport);
  transport.send = (message, options) => {
    messages.push({ direction: "sent", message });
    return send(message, options);
  };
  transport.onmessage = (message) => void messages.push({ direction: "received", message });
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s.`)), ms)));
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function open(server: CustomMcpServer, messages: WireMessage[], log: { text: string }): Promise<Connection> {
  await ensureWorkspace();
  const transport =
    server.type === "stdio"
      ? new StdioClientTransport({ command: server.command, args: server.args, cwd: WORKSPACE_DIR, stderr: "pipe" })
      : new StreamableHTTPClientTransport(new URL(server.url));
  if (transport instanceof StdioClientTransport) {
    transport.stderr?.on("data", (chunk) => (log.text = (log.text + String(chunk)).slice(-MAX_LOG)));
  }
  record(transport, messages);
  const client = new Client({ name: "playground-inspector", version: "1.0.0" });
  const key = keyOf(server);
  const conn: Connection = { client, messages, log, pid: () => (transport instanceof StdioClientTransport ? transport.pid : null) };
  running.add(conn);
  // If the server goes away (it crashed, or it was closed), forget the connection.
  transport.onclose = () => {
    running.delete(conn);
    connections.delete(key);
  };
  try {
    await withTimeout(client.connect(transport), CONNECT_MS, "Connecting");
  } catch (err) {
    await client.close().catch(() => {});
    running.delete(conn);
    throw err;
  }
  return conn;
}

function scheduleClose(key: string, conn: Connection) {
  clearTimeout(conn.idle);
  conn.idle = setTimeout(() => void close(key), IDLE_MS);
  conn.idle.unref?.();
}

async function close(key: string) {
  const pending = connections.get(key);
  connections.delete(key);
  const conn = await pending?.catch(() => null);
  clearTimeout(conn?.idle);
  await conn?.client.close().catch(() => {});
}

async function run(client: Client, action: Exclude<InspectAction, { kind: "disconnect" }>) {
  switch (action.kind) {
    case "list": {
      const caps = client.getServerCapabilities() ?? {};
      return {
        server: client.getServerVersion(),
        instructions: client.getInstructions(),
        capabilities: caps,
        tools: caps.tools ? (await client.listTools()).tools : [],
        resources: caps.resources ? (await client.listResources()).resources : [],
        resourceTemplates: caps.resources ? ((await client.listResourceTemplates().catch(() => null))?.resourceTemplates ?? []) : [],
        prompts: caps.prompts ? (await client.listPrompts()).prompts : [],
      };
    }
    case "call":
      return client.callTool({ name: action.name, arguments: action.arguments });
    case "read":
      return client.readResource({ uri: action.uri });
    case "prompt":
      return client.getPrompt({ name: action.name, arguments: action.arguments });
  }
}

/** Do one thing with a server through a (reused) connection, and return what went over the wire. */
export async function inspectMcpServer(server: CustomMcpServer, action: InspectAction): Promise<InspectResult> {
  const key = keyOf(server);
  if (action.kind === "disconnect") {
    await close(key);
    return { ok: true, messages: [], log: "", connected: false };
  }

  let pending = connections.get(key);
  const fresh = !pending;
  // Kept outside the connection so a failed handshake can still show what was sent.
  const messages: WireMessage[] = [];
  const log = { text: "" };
  if (!pending) {
    pending = open(server, messages, log);
    connections.set(key, pending);
  }
  let conn: Connection;
  try {
    conn = await pending;
  } catch (err) {
    connections.delete(key);
    return { ok: false, error: err instanceof Error ? err.message : String(err), messages, log: log.text, connected: false };
  }

  const from = fresh ? 0 : conn.messages.length;
  try {
    const result = await withTimeout(run(conn.client, action), ACTION_MS, "The request");
    return { ok: true, result, messages: conn.messages.slice(from), log: conn.log.text, connected: fresh };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), messages: conn.messages.slice(from), log: conn.log.text, connected: fresh };
  } finally {
    // Keep only recent history in memory; each response already carries its own slice.
    if (conn.messages.length > 500) conn.messages.splice(0, conn.messages.length - 500);
    if (connections.has(key)) scheduleClose(key, conn);
  }
}

/** Close every inspector connection (and stop stdio servers) when the playground stops. */
export async function closeAllInspectors() {
  await Promise.all([...connections.keys()].map(close));
}
// On exit there's no time for a clean close, so stop stdio servers directly (like processes.ts does).
process.once("exit", () => {
  for (const conn of running) {
    const pid = conn.pid();
    if (pid) {
      try {
        process.kill(pid);
      } catch {}
    }
  }
});

import { rejectNonLocal } from "@/lib/local-only";
import { inspectMcpServer } from "@/lib/mcp-inspect";
import { validateInspectAction, validateMcpServers } from "@/lib/run-types";

/** The MCP inspector: list, call, read or get one thing from a server, with the raw messages. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const body = (await request.json().catch(() => null)) as { server?: unknown; action?: unknown } | null;
  const servers = validateMcpServers([body?.server]);
  if (typeof servers === "string") return Response.json({ error: servers }, { status: 400 });
  const action = validateInspectAction(body?.action);
  if (typeof action === "string") return Response.json({ error: action }, { status: 400 });
  return Response.json(await inspectMcpServer(servers[0], action));
}

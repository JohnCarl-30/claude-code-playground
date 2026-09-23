import { rejectNonLocal } from "@/lib/local-only";
import { testMcpServers } from "@/lib/mcp-test";
import { validateMcpServers } from "@/lib/run-types";

/** "Test connection" in the MCP panel: connect to the servers and list their tools. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const body = (await request.json().catch(() => null)) as { servers?: unknown } | null;
  const servers = validateMcpServers(body?.servers);
  if (typeof servers === "string") return Response.json({ error: servers }, { status: 400 });
  if (!servers.length) return Response.json({ results: [] });
  return Response.json({ results: await testMcpServers(servers) });
}

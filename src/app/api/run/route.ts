import { runAgent } from "@/lib/run-agent";
import { BUILT_IN_TOOLS, DEFAULT_CONFIG, validateMcpServers, type RunConfig, type RunEvent } from "@/lib/run-types";
import { rejectNonLocal } from "@/lib/local-only";
import { WORKSPACE_DIR } from "@/lib/workspace";

const MODES = ["default", "acceptEdits", "plan", "dontAsk"];

function parseConfig(body: unknown): RunConfig | string {
  if (!body || typeof body !== "object") return "Expected a JSON body.";
  const c = { ...DEFAULT_CONFIG, ...(body as Partial<RunConfig>) };
  if (typeof c.prompt !== "string" || !c.prompt.trim()) return "Write a prompt first.";
  if (!MODES.includes(c.permissionMode)) return "Unknown permission mode.";
  if (!Array.isArray(c.tools) || c.tools.some((t) => !BUILT_IN_TOOLS.includes(t))) return "Unknown tool.";
  const mcpServers = validateMcpServers(c.mcpServers);
  if (typeof mcpServers === "string") return mcpServers;
  return { ...c, mcpServers };
}

/** Runs one Agent SDK query and streams every event back as NDJSON. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const config = parseConfig(await request.json().catch(() => null));
  if (typeof config === "string") return Response.json({ error: config }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      send({ kind: "run", runId: crypto.randomUUID(), workspace: WORKSPACE_DIR });
      try {
        for await (const event of runAgent(config, request.signal)) send(event);
      } catch (err) {
        if (!request.signal.aborted) send({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      }
      try {
        send({ kind: "done" });
        controller.close();
      } catch {
        // The browser already disconnected (Stop button).
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

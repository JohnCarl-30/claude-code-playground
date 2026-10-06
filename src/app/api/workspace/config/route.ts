import { readClaudeConfig } from "@/lib/claude-config";
import { rejectNonLocal } from "@/lib/local-only";
import { WORKSPACE_DIR, addStarterConfig, ensureWorkspace } from "@/lib/workspace";

/** The workspace's Claude Code configuration: CLAUDE.md, settings, commands, skills, subagents. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  await ensureWorkspace();
  return Response.json(await readClaudeConfig(WORKSPACE_DIR));
}

/** { action: "add-starter-config" }: copy the starter's .claude/ in without overwriting anything. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { action } = (await request.json().catch(() => ({}))) as { action?: string };
  if (action !== "add-starter-config") return Response.json({ error: "Unknown action." }, { status: 400 });
  const added = await addStarterConfig();
  return Response.json({ added, config: await readClaudeConfig(WORKSPACE_DIR) });
}

import { createSession } from "@/lib/live-session";
import { rejectNonLocal } from "@/lib/local-only";
import { parseRunConfig } from "@/lib/run-types";

/** Start a live Claude Code session with your settings and first message. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const config = parseRunConfig(await request.json().catch(() => null));
  if (typeof config === "string") return Response.json({ error: config }, { status: 400 });
  try {
    const session = await createSession(config);
    return Response.json({ id: session.id });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

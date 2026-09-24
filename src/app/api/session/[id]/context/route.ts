import { getSession } from "@/lib/live-session";
import { rejectNonLocal } from "@/lib/local-only";

/** How full the session's context window is (the same data as /context in the terminal). */
export async function GET(request: Request, ctx: RouteContext<"/api/session/[id]/context">) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const session = getSession((await ctx.params).id);
  const ended = () => Response.json({ error: "This conversation has ended." }, { status: 404 });
  if (!session || session.closed) return ended();
  try {
    const usage = await session.contextUsage();
    return usage ? Response.json(usage) : ended();
  } catch (err) {
    // Asking while the session shuts down can fail; that's just "ended", not a server error.
    if (session.closed) return ended();
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

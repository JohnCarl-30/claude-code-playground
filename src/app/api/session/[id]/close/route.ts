import { getSession } from "@/lib/live-session";
import { rejectNonLocal } from "@/lib/local-only";

/** Same as DELETE, for navigator.sendBeacon when the page closes. */
export async function POST(request: Request, ctx: RouteContext<"/api/session/[id]/close">) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  getSession((await ctx.params).id)?.close("You closed the page.");
  return Response.json({ ok: true });
}

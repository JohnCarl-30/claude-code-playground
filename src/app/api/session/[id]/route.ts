import { getSession } from "@/lib/live-session";
import { rejectNonLocal } from "@/lib/local-only";

/** End the session (New conversation). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/session/[id]">) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  getSession((await ctx.params).id)?.close();
  return Response.json({ ok: true });
}

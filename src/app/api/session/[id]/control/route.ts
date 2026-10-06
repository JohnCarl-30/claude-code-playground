import { getSession } from "@/lib/live-session";
import { rejectNonLocal } from "@/lib/local-only";
import { PERMISSION_MODES, type PlaygroundPermissionMode } from "@/lib/run-types";

/** { action: "interrupt" } stops the current turn; "permissionMode" and "model" change them mid-session. */
export async function POST(request: Request, ctx: RouteContext<"/api/session/[id]/control">) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const session = getSession((await ctx.params).id);
  if (!session) return Response.json({ error: "This conversation has ended." }, { status: 404 });
  const { action, value } = (await request.json().catch(() => ({}))) as { action?: string; value?: string };
  try {
    if (action === "interrupt") await session.interrupt();
    else if (action === "permissionMode" && (PERMISSION_MODES as readonly string[]).includes(String(value))) {
      await session.setPermissionMode(value as PlaygroundPermissionMode);
    } else if (action === "model" && typeof value === "string" && /^[a-z0-9.-]*$/.test(value)) await session.setModel(value);
    else return Response.json({ error: "Unknown control action." }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return Response.json({ ok: true });
}

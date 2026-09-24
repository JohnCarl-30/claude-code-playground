import { getSession } from "@/lib/live-session";
import { rejectNonLocal } from "@/lib/local-only";

/** Send a message: { text, how: "queue" | "steer" }. Works while Claude is working. */
export async function POST(request: Request, ctx: RouteContext<"/api/session/[id]/message">) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const session = getSession((await ctx.params).id);
  if (!session) return Response.json({ error: "This conversation has ended. Start a new one." }, { status: 404 });
  const { text, how } = (await request.json().catch(() => ({}))) as { text?: string; how?: string };
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: "Write a message first." }, { status: 400 });
  session.send(text, how === "steer" ? "steer" : "queue");
  return Response.json({ ok: true });
}

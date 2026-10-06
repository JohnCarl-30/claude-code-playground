import { getSession } from "@/lib/live-session";
import { rejectNonLocal } from "@/lib/local-only";
import type { SessionEvent } from "@/lib/run-types";

/**
 * The session's events as NDJSON: everything from ?from=<seq> onwards, then live
 * events until the session closes. Reconnecting with the last seq + 1 resumes.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/session/[id]/events">) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const session = getSession((await ctx.params).id);
  if (!session) return Response.json({ error: "This conversation has ended." }, { status: 404 });
  const from = Number(new URL(request.url).searchParams.get("from") ?? 0) || 0;

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: SessionEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          if (event.kind === "closed") {
            unsubscribe();
            controller.close();
          }
        } catch {
          unsubscribe(); // the browser went away
        }
      };
      unsubscribe = session.subscribe(from, send);
      request.signal.addEventListener("abort", () => unsubscribe(), { once: true });
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}

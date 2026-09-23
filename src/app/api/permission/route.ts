import { rejectNonLocal } from "@/lib/local-only";
import { answerPermission } from "@/lib/run-agent";

/** The browser's Allow / Deny click for a pending permission prompt. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { id, allow, always } = (await request.json().catch(() => ({}))) as { id?: string; allow?: boolean; always?: boolean };
  if (typeof id !== "string" || typeof allow !== "boolean") {
    return Response.json({ error: "Expected { id, allow }" }, { status: 400 });
  }
  const found = answerPermission(id, allow, always === true);
  return Response.json({ ok: found }, { status: found ? 200 : 404 });
}

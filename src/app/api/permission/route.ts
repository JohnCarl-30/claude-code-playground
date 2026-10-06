import { rejectNonLocal } from "@/lib/local-only";
import { answerPermission } from "@/lib/run-agent";
import { parseAnswer } from "@/lib/run-types";

/** Your answer to a permission card, a question from Claude, or a plan review. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const answer = parseAnswer(await request.json().catch(() => null));
  if (typeof answer === "string") return Response.json({ error: answer }, { status: 400 });
  const { id, ...rest } = answer;
  const found = answerPermission(id, rest);
  return Response.json({ ok: found }, { status: found ? 200 : 404 });
}

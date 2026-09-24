import { runChallengeChecks } from "@/lib/challenge-checks";
import { rejectNonLocal } from "@/lib/local-only";

/** "Check my work": run a challenge's checks against your workspace. */
export async function POST(request: Request, ctx: RouteContext<"/api/challenges/[id]/check">) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const result = await runChallengeChecks((await ctx.params).id);
  return "error" in result ? Response.json(result, { status: 400 }) : Response.json(result);
}

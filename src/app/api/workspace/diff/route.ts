import { rejectNonLocal } from "@/lib/local-only";
import { workspaceDiff } from "@/lib/workspace";

/** What changed in the workspace since the starter's starting point. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  return Response.json(await workspaceDiff());
}

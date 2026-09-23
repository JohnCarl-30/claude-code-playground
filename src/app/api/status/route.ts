import { getAccountStatus } from "@/lib/account";
import { rejectNonLocal } from "@/lib/local-only";

/** Is Claude Code signed in? Used by the setup banner. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  return Response.json(await getAccountStatus());
}

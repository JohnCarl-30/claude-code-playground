import { rejectNonLocal } from "@/lib/local-only";
import { readWorkspace, resetWorkspace } from "@/lib/workspace";

/** List the sandbox files so the UI can show what Claude changed. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  return Response.json({ files: await readWorkspace() });
}

/** Put workspace/ back to the original sample project. */
export async function DELETE(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  await resetWorkspace();
  return Response.json({ files: await readWorkspace() });
}

import { rejectNonLocal } from "@/lib/local-only";
import { deleteWorkspaceFile, writeWorkspaceFile } from "@/lib/workspace";

/** Save a file you edited (or created) in the Files tab: { path, content }. */
export async function PUT(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { path, content } = (await request.json().catch(() => ({}))) as { path?: string; content?: string };
  const error = await writeWorkspaceFile(String(path ?? ""), content as string);
  return error ? Response.json({ error }, { status: 400 }) : Response.json({ ok: true });
}

/** Delete a file: /api/workspace/file?path=... */
export async function DELETE(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const error = await deleteWorkspaceFile(new URL(request.url).searchParams.get("path") ?? "");
  return error ? Response.json({ error }, { status: 400 }) : Response.json({ ok: true });
}

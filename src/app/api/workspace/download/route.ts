import { rejectNonLocal } from "@/lib/local-only";
import { currentTemplate, workspaceFilesForExport } from "@/lib/workspace";
import { createZip } from "@/lib/zip";

/** Download the current workspace as <starter>-project.zip. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const zip = createZip(await workspaceFilesForExport());
  const name = `${await currentTemplate()}-project.zip`;
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

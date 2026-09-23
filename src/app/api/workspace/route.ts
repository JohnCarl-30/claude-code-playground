import { rejectNonLocal } from "@/lib/local-only";
import { stopProcess } from "@/lib/processes";
import { findTemplate } from "@/lib/templates";
import { currentTemplate, readWorkspace, resetWorkspace } from "@/lib/workspace";

async function snapshot() {
  const files = await readWorkspace();
  return { template: await currentTemplate(), files };
}

/** List the workspace files and which starter they came from. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  return Response.json(await snapshot());
}

/** Switch to another starter: { template }. Replaces everything in workspace/. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { template } = (await request.json().catch(() => ({}))) as { template?: string };
  const info = findTemplate(template);
  if (!info) return Response.json({ error: "Unknown starter." }, { status: 400 });
  await stopProcess();
  await resetWorkspace(info.id);
  return Response.json(await snapshot());
}

/** Put workspace/ back to the current starter's original files. */
export async function DELETE(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  await stopProcess();
  await resetWorkspace();
  return Response.json(await snapshot());
}

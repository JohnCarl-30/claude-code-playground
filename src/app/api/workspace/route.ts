import { rejectNonLocal } from "@/lib/local-only";
import { stopProcess } from "@/lib/processes";
import { findTemplate } from "@/lib/templates";
import { addMissingStarterFiles, currentTemplate, missingStarterFiles, parkedTemplates, readWorkspace, resetWorkspace, switchWorkspace } from "@/lib/workspace";

async function snapshot() {
  const files = await readWorkspace();
  return { template: await currentTemplate(), files, parked: await parkedTemplates(), missing: await missingStarterFiles() };
}

/** List the workspace files and which starter they came from. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  return Response.json(await snapshot());
}

/** Switch to another starter: { template }. Your current work is kept for when you switch back. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { template } = (await request.json().catch(() => ({}))) as { template?: string };
  const info = findTemplate(template);
  if (!info) return Response.json({ error: "Unknown starter." }, { status: 400 });
  await stopProcess();
  await switchWorkspace(info.id);
  return Response.json(await snapshot());
}

/** Add the current starter's files the workspace doesn't have, without changing anything else. */
export async function PATCH(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const added = await addMissingStarterFiles();
  return Response.json({ ...(await snapshot()), added });
}

/** Put workspace/ back to the current starter's original files. */
export async function DELETE(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  await stopProcess();
  await resetWorkspace();
  return Response.json(await snapshot());
}

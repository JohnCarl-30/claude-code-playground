import { rejectNonLocal } from "@/lib/local-only";
import { getProcessStatus, startProcess, stopProcess } from "@/lib/processes";

/** Status and logs of the program started from the Run & test panel. */
export async function GET(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  return Response.json(getProcessStatus());
}

/** { action: "start", script } runs one of the starter's scripts; { action: "stop" } stops it. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { action, script } = (await request.json().catch(() => ({}))) as { action?: string; script?: string };
  if (action === "stop") {
    await stopProcess();
    return Response.json(getProcessStatus());
  }
  if (action === "start" && typeof script === "string") {
    const result = await startProcess(script);
    return typeof result === "string" ? Response.json({ error: result }, { status: 400 }) : Response.json(result);
  }
  return Response.json({ error: 'Expected { action: "start", script } or { action: "stop" }' }, { status: 400 });
}

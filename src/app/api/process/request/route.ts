import { rejectNonLocal } from "@/lib/local-only";
import { sendToApi } from "@/lib/processes";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** The request tester: forwards one request to the workspace's API on localhost. */
export async function POST(request: Request) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { method, path, body } = (await request.json().catch(() => ({}))) as { method?: string; path?: string; body?: string };
  if (!method || !METHODS.includes(method)) return Response.json({ error: "Unknown method." }, { status: 400 });
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return Response.json({ error: 'The path must start with "/", e.g. /todos' }, { status: 400 });
  }
  return Response.json(await sendToApi(method, path, typeof body === "string" ? body : ""));
}

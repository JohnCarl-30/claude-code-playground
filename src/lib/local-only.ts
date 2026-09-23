import "server-only";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(hostHeader: string) {
  return hostHeader.replace(/:\d+$/, "").toLowerCase();
}

/**
 * The API can edit files and run commands on this computer, so only accept
 * requests from this computer's own browser tab:
 * - the Host must be localhost (blocks other devices and DNS-rebinding tricks)
 * - an Origin, when sent, must be that same host (blocks other websites)
 * - POSTs must be JSON (forces a CORS preflight, which other sites fail;
 *   DELETE always gets a preflight)
 */
export function rejectNonLocal(request: Request): Response | null {
  const host = request.headers.get("host") ?? "";
  if (!LOCAL_HOSTS.has(hostname(host))) {
    return Response.json({ error: "The playground only accepts requests from this computer." }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {}
    if (originHost !== host) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  }
  if (request.method === "POST" && !request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Expected a JSON request." }, { status: 415 });
  }
  return null;
}

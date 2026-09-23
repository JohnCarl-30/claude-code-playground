import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4100);

/** Send a JSON response. */
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Read and parse a JSON request body (empty body = undefined). */
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : undefined;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    // TODO: add your routes here, e.g. GET /todos and POST /todos

    json(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

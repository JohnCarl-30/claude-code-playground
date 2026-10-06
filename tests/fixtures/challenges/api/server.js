// Reference solution for the "A todo API" and "Filter and search" challenges.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4100);
const todos = new Map();
let nextId = 1;

function json(res, status, body) {
  if (status === 204) return res.writeHead(204).end();
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = /^\/todos\/([^/]+)$/.exec(url.pathname);
  try {
    if (url.pathname === "/todos" && req.method === "GET") {
      let list = [...todos.values()];
      const done = url.searchParams.get("done");
      if (done !== null) {
        if (done !== "true" && done !== "false") return json(res, 400, { error: "done must be true or false" });
        list = list.filter((t) => t.done === (done === "true"));
      }
      const q = url.searchParams.get("q");
      if (q) list = list.filter((t) => t.title.toLowerCase().includes(q.toLowerCase()));
      return json(res, 200, list);
    }
    if (url.pathname === "/todos" && req.method === "POST") {
      const body = await readJson(req);
      if (typeof body.title !== "string" || !body.title.trim()) return json(res, 400, { error: "title is required" });
      const todo = { id: nextId++, title: body.title, done: false };
      todos.set(String(todo.id), todo);
      return json(res, 201, todo);
    }
    if (match) {
      const todo = todos.get(match[1]);
      if (!todo) return json(res, 404, { error: `No todo ${match[1]}` });
      if (req.method === "GET") return json(res, 200, todo);
      if (req.method === "PATCH") {
        const body = await readJson(req);
        if (typeof body.done === "boolean") todo.done = body.done;
        if (typeof body.title === "string") todo.title = body.title;
        return json(res, 200, todo);
      }
      if (req.method === "DELETE") {
        todos.delete(match[1]);
        return json(res, 204);
      }
    }
    json(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
  } catch (err) {
    json(res, 400, { error: String(err) });
  }
}).listen(PORT);

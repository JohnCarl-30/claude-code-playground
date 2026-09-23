# My REST API

A tiny JSON API built with Node's built-in `node:http`, with no dependencies.

Right now it has one route: `GET /health`.

Ideas to build with Claude:

- A todo list: `GET /todos`, `POST /todos`, `GET/PATCH/DELETE /todos/:id`
- Input validation with helpful 400 errors
- Query parameters, e.g. `GET /todos?done=true`

Run it from the playground's **Run & test** panel, then send requests to it.

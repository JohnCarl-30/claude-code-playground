---
name: rest-conventions
description: This project's REST API conventions (status codes, error format, naming). Use when adding or changing routes.
---

# REST conventions for this API

- Routes use plural nouns: `/todos`, `/todos/:id`.
- `POST` that creates something returns **201** with the created item.
- `DELETE` returns **204** with no body.
- Invalid input returns **400**, unknown ids return **404**.
- Every error body is `{ "error": "<plain-English message>" }`.
- Read JSON bodies with the `readJson` helper in server.js.

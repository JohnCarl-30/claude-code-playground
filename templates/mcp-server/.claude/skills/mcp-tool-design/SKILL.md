---
name: mcp-tool-design
description: How to design MCP tools in this project (names, descriptions, input schemas, errors). Use when adding or changing tools.
---

# Designing a good MCP tool

- Name tools in `snake_case` with a verb: `word_count`, `convert_temperature`.
- The description says **what** the tool does and **when** to use it; the model reads it to decide.
- Describe every input with `.describe(...)`, and use the narrowest zod type (`z.number().int()`, `z.enum([...])`).
- For bad input, return `{ isError: true, content: [{ type: "text", text: "..." }] }` instead of throwing.
- Never `console.log`: stdout is the MCP channel. Use `console.error`.

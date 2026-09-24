# Project instructions for Claude

- Each `.mjs` file here is one small Claude API feature built with `@anthropic-ai/sdk` (already available; do not run npm install).
- Create the client with `new Anthropic()` so it reads `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` from the environment. Never write an API key into the code.
- Use `model: "claude-haiku-4-5"` and a small `max_tokens` so real runs stay cheap.
- Keep each file's exported function name and signature; the playground's checks call them.
- `run.mjs` runs one file with sample input. Don't change it.
- Don't run the files yourself. The user runs them from the Run & test panel against the practice API; only if you have the Bash tool, run `node --check <file>`.

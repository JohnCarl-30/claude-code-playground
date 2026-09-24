# My Claude app

Small Claude API programs, one feature per file, written with the official
TypeScript/JavaScript SDK (`@anthropic-ai/sdk`).

| File | Feature | Status |
| --- | --- | --- |
| `ask.mjs` | One message in, one answer out | works |
| `tools.mjs` | Tool use: the tool_use / tool_result loop | TODO |
| `extract.mjs` | Structured output (JSON schema) + defensive parsing | TODO |
| `faq.mjs` | Prompt caching + reading usage | TODO |
| `batch.mjs` | Message Batches for work that can wait | TODO |
| `errors.mjs` | Error types, retries and recovery | TODO |
| `stream.mjs` | Streaming text as it's generated | TODO |
| `workflow.mjs` | A two-step prompt chain (a workflow, not an agent) | TODO |
| `route.mjs` | Picking the right model for each task | TODO |
| `think.mjs` | Effort levels and adaptive thinking | TODO |
| `budget.mjs` | Counting tokens before you send | TODO |
| `cost.mjs` | What a response cost, with caching and batches | TODO |

## Running without an API key

The playground's **Run & test** panel runs these files against the **practice API**:
a small server on your computer that answers like the Claude API (same JSON shapes,
tool_use blocks, streaming events, usage, errors and batches) with canned replies.
It is not Claude, so answers are placeholders, but your code runs for real.

To call the real API, run a file yourself with a key:

```bash
ANTHROPIC_API_KEY=sk-ant-... node run.mjs ask
```

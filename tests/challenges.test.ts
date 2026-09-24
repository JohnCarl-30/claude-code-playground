import { cpSync, readFileSync } from "node:fs";
import path from "node:path";
import { createTempPlaygroundRoot } from "./helpers";

jest.setTimeout(60_000);

const temp = createTempPlaygroundRoot();
let ws: typeof import("@/lib/workspace");
let checks: typeof import("@/lib/challenge-checks");
let CHALLENGES: typeof import("@/lib/challenges").CHALLENGES;
beforeAll(async () => {
  ws = await import("@/lib/workspace");
  checks = await import("@/lib/challenge-checks");
  ({ CHALLENGES } = await import("@/lib/challenges"));
});
afterAll(() => temp.cleanup());

const FIXTURES = path.join(process.cwd(), "tests/fixtures/challenges");
// Which reference solution solves which challenge.
const SOLUTION: Record<string, string> = {
  "api-todos": "api",
  "api-filter": "api",
  "mcp-text-tools": "mcp",
  "mcp-errors": "mcp",
  "config-command": "config-command",
  "config-guardrails": "config-guardrails",
  "config-subagent": "config-subagent",
  "debug-discount": "debug-discount",
  "agent-tool": "agent-tool",
  "mcp-resources": "mcp",
  "security-hook": "security-hook",
  "api-tool-loop": "claude-api",
  "api-structured": "claude-api",
  "api-caching": "claude-api",
  "api-batch": "claude-api",
  "api-errors": "claude-api",
  "api-streaming": "claude-api",
  "api-workflow": "claude-api",
  "api-model-routing": "claude-api",
  "api-thinking": "claude-api",
  "api-token-budget": "claude-api",
  "api-cost": "claude-api",
};

async function freshStarter(template: string) {
  await ws.switchWorkspace(template as never);
  await ws.resetWorkspace();
}

async function check(id: string) {
  const result = await checks.runChallengeChecks(id);
  if ("error" in result) throw new Error(result.error);
  return result.results;
}

describe("challenge checks", () => {
  it("every challenge has a checker and a reference solution", () => {
    expect(CHALLENGES.map((c) => c.id).sort()).toEqual(Object.keys(SOLUTION).sort());
  });

  it.each(Object.keys(SOLUTION))("%s: the untouched starter does not pass", async (id) => {
    const challenge = CHALLENGES.find((c) => c.id === id)!;
    await freshStarter(challenge.template);
    const results = await check(id);
    expect(results.map((r) => r.id)).toEqual(challenge.requirements.map((r) => r.id));
    expect(results.every((r) => r.pass)).toBe(false);
    for (const r of results) if (!r.pass) expect(r.detail).toBeTruthy(); // failures explain themselves
  });

  it.each(Object.keys(SOLUTION))("%s: the reference solution passes every requirement", async (id) => {
    const challenge = CHALLENGES.find((c) => c.id === id)!;
    await freshStarter(challenge.template);
    cpSync(path.join(FIXTURES, SOLUTION[id]), ws.WORKSPACE_DIR, { recursive: true });
    const results = await check(id);
    const failed = results.filter((r) => !r.pass);
    expect(failed).toEqual([]);
  });

  it("refuses to check when the workspace has another starter", async () => {
    await freshStarter("tiny-shop");
    expect(await checks.runChallengeChecks("api-todos")).toEqual({ error: expect.stringMatching(/rest-api starter/) });
  });

  it("explains a server that crashes", async () => {
    await freshStarter("rest-api");
    cpSync(path.join(FIXTURES, "api"), ws.WORKSPACE_DIR, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(ws.WORKSPACE_DIR, "server.js"), "throw new Error('boom');\n");
    const results = await check("api-todos");
    expect(results.every((r) => !r.pass && /Error: boom/.test(r.detail ?? "") && /server\.js:1/.test(r.detail ?? ""))).toBe(true);
  });
});

describe("security hook check", () => {
  const HOOK = ".claude/hooks/protect-env.mjs";
  async function withHook(code: string, settings?: (s: string) => string) {
    await freshStarter("rest-api");
    cpSync(path.join(FIXTURES, "security-hook"), ws.WORKSPACE_DIR, { recursive: true });
    const { readFileSync, writeFileSync } = await import("node:fs");
    writeFileSync(path.join(ws.WORKSPACE_DIR, HOOK), code);
    if (settings) {
      const file = path.join(ws.WORKSPACE_DIR, ".claude/settings.json");
      writeFileSync(file, settings(readFileSync(file, "utf8")));
    }
    return Object.fromEntries((await check("security-hook")).map((r) => [r.id, r]));
  }

  it("accepts a JSON deny decision instead of exit code 2", async () => {
    const r = await withHook(`let s = ""; for await (const c of process.stdin) s += c;
const { tool_input } = JSON.parse(s);
if (JSON.stringify(tool_input).includes(".env")) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "secrets" } }));
}
`);
    expect(Object.values(r).filter((x) => !x.pass)).toEqual([]);
  });

  it("fails a hook that blocks everything", async () => {
    const r = await withHook(`console.error("no"); process.exit(2);`);
    expect(r.read.pass).toBe(true);
    expect(r.allow).toMatchObject({ pass: false, detail: expect.stringMatching(/Read server\.js/) });
  });

  it("fails a matcher that leaves out Read", async () => {
    const r = await withHook(readFileSync(path.join(FIXTURES, "security-hook", HOOK), "utf8"), (s) => s.replace('"Read|Edit|Write|Bash"', '"Bash"'));
    expect(r.registered).toMatchObject({ pass: false, detail: expect.stringMatching(/should cover Read and Bash/) });
  });
});

import { cpSync } from "node:fs";
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

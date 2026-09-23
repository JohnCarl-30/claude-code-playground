import path from "node:path";
import { precheckTool } from "@/lib/permissions";
import { WORKSPACE_DIR } from "@/lib/workspace";

const enabled = new Set(["Read", "Glob", "Grep", "Edit"]);
const inWs = (p: string) => path.join(WORKSPACE_DIR, p);

describe("precheckTool", () => {
  it("auto-allows read-only tools inside the workspace", () => {
    expect(precheckTool("Read", { file_path: inWs("src/cart.js") }, enabled)).toMatchObject({ decision: "allow" });
    expect(precheckTool("Glob", { pattern: "**/*.js" }, enabled)).toMatchObject({ decision: "allow" });
  });

  it("asks before edits", () => {
    expect(precheckTool("Edit", { file_path: inWs("server.js") }, enabled)).toEqual({ decision: "ask" });
  });

  it("denies tools that are switched off", () => {
    expect(precheckTool("Bash", { command: "ls" }, enabled)).toMatchObject({ decision: "deny", reason: expect.stringMatching(/switched off/) });
  });

  it.each(["/etc/passwd", "../package.json", inWs("../src/app/page.tsx"), `${WORKSPACE_DIR}-evil/file.js`])(
    "denies paths outside the workspace: %s",
    (p) => {
      expect(precheckTool("Read", { file_path: p }, enabled)).toMatchObject({ decision: "deny", reason: expect.stringMatching(/outside/) });
      expect(precheckTool("Grep", { pattern: "x", path: p }, enabled)).toMatchObject({ decision: "deny" });
    },
  );

  it("remembers Always allow for the run", () => {
    expect(precheckTool("Edit", { file_path: inWs("a.js") }, enabled, new Set(["Edit"]))).toMatchObject({ decision: "allow" });
  });

  it("lets MCP and Agent tools through to the question, but still checks paths", () => {
    expect(precheckTool("mcp__memory__read_graph", {}, enabled)).toEqual({ decision: "ask" });
    expect(precheckTool("Agent", { prompt: "review" }, enabled)).toEqual({ decision: "ask" });
    expect(precheckTool("mcp__fs__read", { path: "/etc/hosts" }, enabled)).toMatchObject({ decision: "deny" });
  });
});

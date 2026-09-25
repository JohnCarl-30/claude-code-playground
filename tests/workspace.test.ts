import { readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTempPlaygroundRoot } from "./helpers";

const temp = createTempPlaygroundRoot();
let ws: typeof import("@/lib/workspace");
const file = (p: string) => path.join(ws.WORKSPACE_DIR, p);

beforeAll(async () => {
  ws = await import("@/lib/workspace");
});
afterAll(() => temp.cleanup());

describe("workspace", () => {
  it("lives inside the temporary root, not the real project", () => {
    expect(ws.WORKSPACE_DIR).toBe(path.join(temp.root, "workspace"));
  });

  it("starts from the default starter with its own git repo", async () => {
    await ws.ensureWorkspace();
    expect(await ws.currentTemplate()).toBe("tiny-shop");
    const files = (await ws.readWorkspace()).map((f) => f.path);
    expect(files).toEqual(expect.arrayContaining(["README.md", "src/cart.js"]));
    // Claude Code config is visible; git internals and the playground's marker are not.
    expect(files).toEqual(expect.arrayContaining([".claude/settings.json", ".claude/commands/fix-and-test.md"]));
    expect(files.some((f) => f.startsWith(".git/") || f === ".playground-template")).toBe(false);
    expect((await ws.workspaceDiff()).changes).toEqual([]);
  });

  it("shows edits and new files as changes", async () => {
    writeFileSync(file("src/cart.js"), readFileSync(file("src/cart.js"), "utf8") + "\n// edited\n");
    writeFileSync(file("notes.md"), "new file\n");
    const { available, changes } = await ws.workspaceDiff();
    expect(available).toBe(true);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "src/cart.js", status: "modified", patch: expect.stringContaining("+// edited") }),
        expect.objectContaining({ path: "notes.md", status: "added", patch: expect.stringContaining("+new file") }),
      ]),
    );
  });

  it("keeps your work when you switch starters and back", async () => {
    await ws.switchWorkspace("rest-api");
    expect(await ws.currentTemplate()).toBe("rest-api");
    expect((await ws.readWorkspace()).map((f) => f.path)).toContain("server.js");
    expect(await ws.parkedTemplates()).toEqual(["tiny-shop"]);

    await ws.switchWorkspace("tiny-shop");
    expect(readFileSync(file("src/cart.js"), "utf8")).toContain("// edited");
    expect(readFileSync(file("notes.md"), "utf8")).toBe("new file\n");
    expect(await ws.parkedTemplates()).toEqual(["rest-api"]);
  });

  it("switching to the current starter does nothing", async () => {
    await ws.switchWorkspace("tiny-shop");
    expect(readFileSync(file("notes.md"), "utf8")).toBe("new file\n");
  });

  it("exports project files without .git or playground markers", async () => {
    const paths = (await ws.workspaceFilesForExport()).map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["notes.md", "src/cart.js"]));
    expect(paths.some((p) => p.startsWith(".git/") || p === ".playground-template")).toBe(false);
  });

  it("reset restores the current starter's original files", async () => {
    await ws.resetWorkspace();
    expect(await ws.currentTemplate()).toBe("tiny-shop");
    expect(readFileSync(file("src/cart.js"), "utf8")).not.toContain("// edited");
    expect((await ws.readWorkspace()).map((f) => f.path)).not.toContain("notes.md");
    expect((await ws.workspaceDiff()).changes).toEqual([]);
  });

  it("saves and deletes files you edit, but only inside the workspace", async () => {
    expect(await ws.writeWorkspaceFile(".claude/commands/review.md", "Review $ARGUMENTS")).toBeNull();
    expect(readFileSync(file(".claude/commands/review.md"), "utf8")).toBe("Review $ARGUMENTS");
    expect(await ws.deleteWorkspaceFile(".claude/commands/review.md")).toBeNull();
    expect((await ws.readWorkspace()).map((f) => f.path)).not.toContain(".claude/commands/review.md");

    for (const bad of ["../escape.txt", "/etc/passwd", ".git/config", "node_modules/x.js", ".playground-template", ""]) {
      expect(await ws.writeWorkspaceFile(bad, "x")).toEqual(expect.any(String));
    }
    expect(await ws.deleteWorkspaceFile("../package.json")).toEqual(expect.any(String));
  });

  it("adds a starter's .claude/ config without overwriting anything", async () => {
    rmSync(file(".claude"), { recursive: true, force: true });
    writeFileSync(file("CLAUDE.md"), "my own instructions\n");
    const added = await ws.addStarterConfig();
    expect(added).toEqual(expect.arrayContaining([".claude/settings.json", ".claude/commands/fix-and-test.md"]));
    expect(added).not.toContain("CLAUDE.md");
    expect(readFileSync(file("CLAUDE.md"), "utf8")).toBe("my own instructions\n");
    expect(await ws.addStarterConfig()).toEqual([]); // nothing left to add
  });

  it("follows symlinks: real-path aliases are inside, links pointing outside are not", () => {
    const real = realpathSync(ws.WORKSPACE_DIR); // e.g. /private/var/... for /var/... on macOS
    expect(ws.isInsideWorkspace(path.join(real, "src/cart.js"))).toBe(true);
    symlinkSync(tmpdir(), file("escape-link"));
    expect(ws.isInsideWorkspace("escape-link/anything.txt")).toBe(false);
    expect(ws.isInsideWorkspace(file("escape-link"))).toBe(false);
    rmSync(file("escape-link"));
  });

  it("knows what is inside the workspace", () => {
    expect(ws.isInsideWorkspace("src/cart.js")).toBe(true);
    expect(ws.isInsideWorkspace(file("a/b.js"))).toBe(true);
    expect(ws.isInsideWorkspace("../package.json")).toBe(false);
    expect(ws.isInsideWorkspace(`${ws.WORKSPACE_DIR}-evil/x`)).toBe(false);
  });

  it("lists images and PDFs as binary, without their bytes as text", async () => {
    await ws.switchWorkspace("claude-api");
    const files = await ws.readWorkspace();
    expect(files.find((f) => f.path === "samples/receipt.png")).toMatchObject({ binary: true, content: expect.stringMatching(/^\(binary file, \d+ bytes\)$/) });
    expect(files.find((f) => f.path === "samples/policy.pdf")).toMatchObject({ binary: true });
    expect(files.find((f) => f.path === "ask.mjs")?.binary).toBeUndefined();
    // They still download intact.
    const exported = await ws.workspaceFilesForExport();
    const png = exported.find((f) => f.path === "samples/receipt.png")!;
    expect(png.data.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});

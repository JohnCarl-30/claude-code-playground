import { readFileSync, writeFileSync } from "node:fs";
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
    expect(files.some((f) => f.startsWith("."))).toBe(false); // .git, markers are hidden
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

  it("knows what is inside the workspace", () => {
    expect(ws.isInsideWorkspace("src/cart.js")).toBe(true);
    expect(ws.isInsideWorkspace(file("a/b.js"))).toBe(true);
    expect(ws.isInsideWorkspace("../package.json")).toBe(false);
    expect(ws.isInsideWorkspace(`${ws.WORKSPACE_DIR}-evil/x`)).toBe(false);
  });
});

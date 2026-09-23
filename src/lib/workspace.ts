import "server-only";
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_TEMPLATE, TEMPLATES, findTemplate, type TemplateId } from "./templates";

const run = promisify(execFile);

const ROOT = process.cwd();
export const WORKSPACE_DIR = path.join(ROOT, "workspace");
const TEMPLATES_DIR = path.join(ROOT, "templates");
// Workspaces of the starters you aren't using right now, kept so switching back restores your work.
const PARKED_DIR = path.join(ROOT, ".workspaces");
// Remembers which starter the workspace was created from.
const TEMPLATE_MARKER = path.join(WORKSPACE_DIR, ".playground-template");

/** Copy a starter into a fresh workspace/. */
async function createWorkspace(template: TemplateId) {
  await rm(WORKSPACE_DIR, { recursive: true, force: true });
  await mkdir(WORKSPACE_DIR, { recursive: true });
  await cp(path.join(TEMPLATES_DIR, template), WORKSPACE_DIR, { recursive: true });
  await writeFile(TEMPLATE_MARKER, template);
  await initGit();
}

export async function currentTemplate(): Promise<TemplateId> {
  const saved = await readFile(TEMPLATE_MARKER, "utf8").catch(() => "");
  return findTemplate(saved.trim())?.id ?? DEFAULT_TEMPLATE;
}

/**
 * Make workspace/ its own git repo. Claude Code puts `git status` into
 * Claude's context, and without a repo of its own the workspace would show
 * this playground's files (../src, ../package.json, ...) instead.
 */
const git = (...args: string[]) =>
  run("git", ["-c", "user.name=Playground", "-c", "user.email=playground@localhost", ...args], {
    cwd: WORKSPACE_DIR,
    maxBuffer: 20 * 1024 * 1024,
  });

async function initGit() {
  try {
    await git("init", "-q", "-b", "main");
    await writeFile(path.join(WORKSPACE_DIR, ".gitignore"), ".playground-template\nnode_modules/\n");
    await git("add", "-A");
    await git("commit", "-q", "-m", "Starting point");
  } catch {
    // git isn't installed; everything still works, Claude just sees less context.
  }
}

async function exists(p: string) {
  return stat(p).then(
    () => true,
    () => false,
  );
}

/** Create workspace/ from the default starter the first time it's needed. */
export async function ensureWorkspace() {
  if (!(await exists(WORKSPACE_DIR))) await createWorkspace(DEFAULT_TEMPLATE);
  else if (!(await exists(path.join(WORKSPACE_DIR, ".git")))) await initGit();
}

/** Start the current starter over from its original files. */
export async function resetWorkspace() {
  await createWorkspace(await currentTemplate());
}

/**
 * Switch to another starter. The current workspace is parked in .workspaces/
 * and comes back, with your changes and its git history, when you switch back.
 */
export async function switchWorkspace(template: TemplateId) {
  await ensureWorkspace();
  const current = await currentTemplate();
  if (current === template) return;
  await mkdir(PARKED_DIR, { recursive: true });
  const parkCurrent = path.join(PARKED_DIR, current);
  await rm(parkCurrent, { recursive: true, force: true });
  await rename(WORKSPACE_DIR, parkCurrent);
  const parkedTarget = path.join(PARKED_DIR, template);
  if (await exists(parkedTarget)) await rename(parkedTarget, WORKSPACE_DIR);
  else await createWorkspace(template);
}

/** Starters that have parked work waiting in .workspaces/. */
export async function parkedTemplates(): Promise<TemplateId[]> {
  const names = await readdir(PARKED_DIR).catch(() => [] as string[]);
  return TEMPLATES.map((t) => t.id).filter((id) => names.includes(id));
}

export type FileChange = { path: string; status: "added" | "modified" | "deleted" | "renamed"; patch: string };

/** Everything that changed since the starter's "Starting point" commit, as git diffs. */
export async function workspaceDiff(): Promise<{ available: boolean; changes: FileChange[] }> {
  await ensureWorkspace();
  try {
    // Mark new files so `git diff` shows them too (only the sandbox's own index is touched).
    await git("add", "--intent-to-add", "--all");
    const { stdout } = await git("diff", "HEAD", "--no-color", "--no-ext-diff", "-M");
    const changes = stdout
      .split(/^diff --git /m)
      .filter(Boolean)
      .map((chunk): FileChange => {
        const header = chunk.slice(0, chunk.indexOf("\n"));
        const filePath = header.split(" b/").pop() ?? header;
        const status = /^new file mode/m.test(chunk)
          ? "added"
          : /^deleted file mode/m.test(chunk)
            ? "deleted"
            : /^rename from/m.test(chunk)
              ? "renamed"
              : "modified";
        // Keep only the hunks; drop git's index/mode header lines.
        const start = chunk.search(/^(@@|Binary files)/m);
        const patch = start === -1 ? "" : chunk.slice(start);
        return { path: filePath, status, patch: patch.length > 60_000 ? patch.slice(0, 60_000) + "\n… (truncated)" : patch };
      });
    return { available: true, changes };
  } catch {
    return { available: false, changes: [] };
  }
}

/** True when `target` (absolute or workspace-relative) stays inside workspace/. */
export function isInsideWorkspace(target: string) {
  const resolved = path.resolve(WORKSPACE_DIR, target);
  return resolved === WORKSPACE_DIR || resolved.startsWith(WORKSPACE_DIR + path.sep);
}

export type WorkspaceFile = { path: string; content: string };

/** Every file you'd want to take with you (no .git, node_modules or playground markers), as bytes. */
export async function workspaceFilesForExport(): Promise<{ path: string; data: Buffer }[]> {
  await ensureWorkspace();
  const out: { path: string; data: Buffer }[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".playground-template") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push({ path: path.relative(WORKSPACE_DIR, full).split(path.sep).join("/"), data: await readFile(full) });
    }
  }
  await walk(WORKSPACE_DIR);
  return out;
}

export async function readWorkspace(): Promise<WorkspaceFile[]> {
  await ensureWorkspace();
  const files: WorkspaceFile[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const { size } = await stat(full);
        const content = size > 100_000 ? "(file too large to preview)" : await readFile(full, "utf8");
        files.push({ path: path.relative(WORKSPACE_DIR, full), content });
      }
    }
  }
  await walk(WORKSPACE_DIR);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

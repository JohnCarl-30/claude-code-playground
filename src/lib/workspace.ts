import "server-only";
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const ROOT = process.cwd();
export const WORKSPACE_DIR = path.join(ROOT, "workspace");
const SEED_DIR = path.join(ROOT, "workspace-seed");

/** Copy the seed into a fresh workspace/. */
async function createWorkspace() {
  await rm(WORKSPACE_DIR, { recursive: true, force: true });
  await mkdir(WORKSPACE_DIR, { recursive: true });
  await cp(SEED_DIR, WORKSPACE_DIR, { recursive: true });
  await initGit();
}

/**
 * Make workspace/ its own git repo. Claude Code puts `git status` into
 * Claude's context, and without a repo of its own the workspace would show
 * this playground's files (../src, ../package.json, ...) instead.
 */
async function initGit() {
  const git = (...args: string[]) =>
    run("git", ["-c", "user.name=Playground", "-c", "user.email=playground@localhost", ...args], { cwd: WORKSPACE_DIR });
  try {
    await git("init", "-q", "-b", "main");
    await git("add", "-A");
    await git("commit", "-q", "-m", "Tiny Shop starting point");
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

/** Create workspace/ from workspace-seed/ the first time it's needed. */
export async function ensureWorkspace() {
  if (!(await exists(WORKSPACE_DIR))) await createWorkspace();
  else if (!(await exists(path.join(WORKSPACE_DIR, ".git")))) await initGit();
}

export async function resetWorkspace() {
  await createWorkspace();
}

/** True when `target` (absolute or workspace-relative) stays inside workspace/. */
export function isInsideWorkspace(target: string) {
  const resolved = path.resolve(WORKSPACE_DIR, target);
  return resolved === WORKSPACE_DIR || resolved.startsWith(WORKSPACE_DIR + path.sep);
}

export type WorkspaceFile = { path: string; content: string };

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

import "server-only";
import { execFile } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_TEMPLATE, findTemplate, type TemplateId } from "./templates";

const run = promisify(execFile);

const ROOT = process.cwd();
export const WORKSPACE_DIR = path.join(ROOT, "workspace");
const TEMPLATES_DIR = path.join(ROOT, "templates");
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
async function initGit() {
  const git = (...args: string[]) =>
    run("git", ["-c", "user.name=Playground", "-c", "user.email=playground@localhost", ...args], { cwd: WORKSPACE_DIR });
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

/** Start over from a starter (the current one when none is given). */
export async function resetWorkspace(template?: TemplateId) {
  await createWorkspace(template ?? (await currentTemplate()));
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

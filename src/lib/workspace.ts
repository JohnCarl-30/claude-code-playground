import "server-only";
import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_TEMPLATE, TEMPLATES, findTemplate, type TemplateId } from "./templates";

const run = promisify(execFile);

// PLAYGROUND_ROOT lets tests use a temporary folder instead of the real workspace.
const ROOT = process.env.PLAYGROUND_ROOT ?? process.cwd();
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
    // settings.local.json holds personal settings, so (as in Claude Code) it isn't committed.
    await writeFile(path.join(WORKSPACE_DIR, ".gitignore"), ".playground-template\nnode_modules/\n.claude/settings.local.json\n");
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

/**
 * The real location of a path, following symlinks. For a path that doesn't exist
 * yet (a file Claude is about to create), resolve its nearest existing folder.
 */
function realLocation(p: string): string {
  const rest: string[] = [];
  let current = p;
  while (true) {
    try {
      return path.join(realpathSync.native(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return p;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

/**
 * True when `target` (absolute or workspace-relative) really is inside workspace/.
 * Compares real paths, so /var vs /private/var style aliases still match, and a
 * symlink inside the workspace that points outside it doesn't count as inside.
 */
export function isInsideWorkspace(target: string) {
  const root = realLocation(WORKSPACE_DIR);
  const resolved = realLocation(path.resolve(WORKSPACE_DIR, target));
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** A workspace file for the Files tab. Binary files (images, PDFs) are listed but not shown or editable as text. */
export type WorkspaceFile = { path: string; content: string; binary?: boolean };

const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|otf|mp[34]|mov|wasm)$/i;

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

/**
 * Copy the current starter's Claude Code config (.claude/, CLAUDE.md) into the
 * workspace without overwriting anything, for workspaces created before the
 * starters had it. Returns the files that were added.
 */
export async function addStarterConfig(): Promise<string[]> {
  await ensureWorkspace();
  const starter = path.join(TEMPLATES_DIR, await currentTemplate());
  const added: string[] = [];
  async function copy(rel: string) {
    const from = path.join(starter, rel);
    const info = await stat(from).catch(() => null);
    if (!info) return;
    if (info.isDirectory()) {
      for (const name of await readdir(from)) await copy(path.join(rel, name));
    } else if (!(await exists(path.join(WORKSPACE_DIR, rel)))) {
      await mkdir(path.dirname(path.join(WORKSPACE_DIR, rel)), { recursive: true });
      await cp(from, path.join(WORKSPACE_DIR, rel));
      added.push(rel.split(path.sep).join("/"));
    }
  }
  await copy(".claude");
  await copy("CLAUDE.md");
  return added;
}

/** Checks a workspace-relative path you want to edit. Returns an error message, or null when it's fine. */
export function checkEditablePath(rel: string): string | null {
  if (typeof rel !== "string" || !rel.trim()) return "Enter a file path, e.g. .claude/commands/review.md";
  if (path.isAbsolute(rel) || !isInsideWorkspace(rel) || path.resolve(WORKSPACE_DIR, rel) === WORKSPACE_DIR) {
    return "The path must be a file inside the workspace.";
  }
  const parts = rel.split(/[\\/]/);
  if (parts.includes(".git") || parts.includes("node_modules") || parts.at(-1) === ".playground-template") {
    return "That file is managed by the playground.";
  }
  return null;
}

const MAX_EDIT_BYTES = 200_000;

/** Create or overwrite a text file in the workspace (the Files tab's Save). */
export async function writeWorkspaceFile(rel: string, content: string): Promise<string | null> {
  const problem = checkEditablePath(rel);
  if (problem) return problem;
  if (typeof content !== "string" || Buffer.byteLength(content) > MAX_EDIT_BYTES) return "The file is too large to edit here.";
  await ensureWorkspace();
  const full = path.resolve(WORKSPACE_DIR, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
  return null;
}

export async function deleteWorkspaceFile(rel: string): Promise<string | null> {
  const problem = checkEditablePath(rel);
  if (problem) return problem;
  await rm(path.resolve(WORKSPACE_DIR, rel), { force: true });
  return null;
}

export async function readWorkspace(): Promise<WorkspaceFile[]> {
  await ensureWorkspace();
  const files: WorkspaceFile[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      // Show dotfiles like .claude/ and .env; hide git internals and the playground's marker.
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".playground-template") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const { size } = await stat(full);
        const rel = path.relative(WORKSPACE_DIR, full);
        if (size > 100_000) {
          files.push({ path: rel, content: "(file too large to preview)" });
          continue;
        }
        const bytes = await readFile(full);
        if (BINARY_EXTENSIONS.test(entry.name) || bytes.subarray(0, 8000).includes(0)) {
          files.push({ path: rel, content: `(binary file, ${size.toLocaleString("en-US")} bytes)`, binary: true });
        } else {
          files.push({ path: rel, content: bytes.toString("utf8") });
        }
      }
    }
  }
  await walk(WORKSPACE_DIR);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

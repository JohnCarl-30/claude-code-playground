import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A throwaway playground root with a copy of templates/, so tests never touch
 * your real workspace. Call before importing the workspace modules.
 */
export function createTempPlaygroundRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "playground-test-"));
  cpSync(path.join(process.cwd(), "templates"), path.join(root, "templates"), { recursive: true });
  process.env.PLAYGROUND_ROOT = root;
  return {
    root,
    cleanup: () => {
      delete process.env.PLAYGROUND_ROOT;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

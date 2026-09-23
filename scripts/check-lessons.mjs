// Sanity checks for src/lib/lessons.ts, run in CI.
// Catches the easy-to-miss mistakes when someone adds or edits a lesson.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const file = fileURLToPath(new URL("../src/lib/lessons.ts", import.meta.url));
const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
});
const { TRACKS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const TOOLS = ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "WebSearch", "WebFetch"];
const errors = [];
const seen = new Set();
let lessons = 0;

for (const track of TRACKS) {
  if (!track.lessons.length) errors.push(`${track.slug}: has no lessons`);
  for (const lesson of track.lessons) {
    lessons++;
    const id = `${track.slug}/${lesson.slug}`;
    if (seen.has(id)) errors.push(`${id}: duplicate lesson slug`);
    seen.add(id);
    if (!/^[a-z0-9-]+$/.test(lesson.slug)) errors.push(`${id}: slug must be lowercase letters, numbers and dashes`);
    if (!lesson.title || !lesson.summary || !lesson.body?.length) errors.push(`${id}: needs a title, summary and body`);
    for (const block of lesson.body ?? []) {
      if ((block.match(/`/g) ?? []).length % 2) errors.push(`${id}: unbalanced \` in "${block.slice(0, 40)}…"`);
      const withoutCode = block.replace(/`[^`]*`/g, "");
      if ((withoutCode.match(/\*\*/g) ?? []).length % 2) errors.push(`${id}: unbalanced ** in "${block.slice(0, 40)}…"`);
    }
    const tryIt = lesson.tryIt;
    if (tryIt) {
      if (!tryIt.config.prompt?.trim()) errors.push(`${id}: tryIt needs a prompt`);
      if (!tryIt.watch?.length) errors.push(`${id}: tryIt needs at least one "watch" hint`);
      for (const t of tryIt.config.tools ?? []) if (!TOOLS.includes(t)) errors.push(`${id}: unknown tool "${t}"`);
    }
  }
}

if (errors.length) {
  console.error(`Lesson check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`✓ ${TRACKS.length} tracks, ${lessons} lessons look good`);

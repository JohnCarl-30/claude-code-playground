// Sanity checks for src/lib/examples.ts, run in CI.
// Catches the easy-to-miss mistakes when someone adds or edits an example.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

// Load a TypeScript module from src/lib, with its "./x" imports resolved to other src/lib files.
const loaded = new Map();
async function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const file = fileURLToPath(new URL(`../src/lib/${name}.ts`, import.meta.url));
  let { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  for (const [, dep] of outputText.matchAll(/from "\.\/([\w-]+)"/g)) {
    const mod = await load(dep);
    const url = `data:text/javascript;base64,${Buffer.from(mod.__source).toString("base64")}`;
    outputText = outputText.replaceAll(`"./${dep}"`, JSON.stringify(url));
  }
  const mod = { ...(await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`)), __source: outputText };
  loaded.set(name, mod);
  return mod;
}

const { EXAMPLES, EXAMPLE_GROUPS } = await load("examples");
const { BUILT_IN_TOOLS, validateMcpServers } = await load("run-types");
const { TEMPLATES } = await load("templates");

const errors = [];
const seen = new Set();
for (const ex of EXAMPLES) {
  const id = ex.id;
  if (seen.has(id)) errors.push(`${id}: duplicate id`);
  seen.add(id);
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) errors.push(`${id}: id must look like "group/slug" in lowercase`);
  if (!EXAMPLE_GROUPS.includes(ex.group)) errors.push(`${id}: unknown group "${ex.group}"`);
  if (!ex.title || !ex.blurb) errors.push(`${id}: needs a title and blurb`);
  if (!ex.config.prompt?.trim()) errors.push(`${id}: needs a prompt`);
  if (ex.template && !TEMPLATES.some((t) => t.id === ex.template)) errors.push(`${id}: unknown starter "${ex.template}"`);
  if (!ex.notice?.length) errors.push(`${id}: needs at least one "notice" hint`);
  for (const t of ex.config.tools ?? []) if (!BUILT_IN_TOOLS.includes(t)) errors.push(`${id}: unknown tool "${t}"`);
  const servers = validateMcpServers(ex.config.mcpServers);
  if (typeof servers === "string") errors.push(`${id}: ${servers}`);
  for (const n of ex.notice ?? []) {
    if ((n.match(/`/g) ?? []).length % 2) errors.push(`${id}: unbalanced \` in "${n.slice(0, 40)}…"`);
    if ((n.replace(/`[^`]*`/g, "").match(/\*\*/g) ?? []).length % 2) errors.push(`${id}: unbalanced ** in "${n.slice(0, 40)}…"`);
  }
}

if (errors.length) {
  console.error(`Example check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`✓ ${EXAMPLES.length} examples look good`);

// Checks the knowledge-check questions against the live docs:
//   npm run verify:quizzes
// Every question's source page must still load, and when a question stores an
// `evidence` quote, that exact text must still appear on the page. Docs change
// often; this catches questions that have gone out of date.
// Needs Node 22.18+ (it imports src/lib/quizzes.ts directly) and network access.
//
// Also checks a JSON file of new questions before they're added:
//   node scripts/verify-quizzes.mjs path/to/questions.json

import { readFileSync } from "node:fs";

// Anthropic's and MCP's docs for anything about Claude; GitHub's docs and Wikipedia only for
// general software-engineering concepts (requirement types, life-cycle phases, CI, code review).
const HOSTS = new Set(["platform.claude.com", "code.claude.com", "www.anthropic.com", "modelcontextprotocol.io", "docs.github.com", "en.wikipedia.org"]);
// These serve a Markdown version at <url>.md; the rest are read as HTML.
const MARKDOWN_HOSTS = new Set(["platform.claude.com", "code.claude.com", "modelcontextprotocol.io"]);

/** Collapse whitespace and Markdown emphasis so a quote matches however the page wraps or styles it. */
const normalize = (text) =>
  text
    .replace(/\\([*_`[\]()])/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** The readable text of an HTML page: no scripts, styles or tags, entities decoded. */
const htmlText = (html) =>
  html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&");

const pages = new Map();
async function page(url) {
  if (!pages.has(url)) {
    pages.set(
      url,
      (async () => {
        const markdown = MARKDOWN_HOSTS.has(new URL(url).hostname);
        const target = markdown ? `${url.replace(/\/$/, "")}.md` : url;
        const res = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`${res.status} for ${target}`);
        let text = await res.text();
        if (!markdown) text = htmlText(text);
        return normalize(text);
      })(),
    );
  }
  return pages.get(url);
}

async function load() {
  const file = process.argv[2];
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const { QUIZZES } = await import("../src/lib/quizzes.ts");
  return Object.entries(QUIZZES).flatMap(([domain, qs]) => qs.map((q) => ({ domain, ...q })));
}

const questions = await load();
const problems = [];
let quoted = 0;
await Promise.all(
  questions.map(async (q) => {
    const where = `${q.domain}/${q.id}`;
    let url;
    try {
      url = new URL(q.source.url);
    } catch {
      return problems.push(`${where}: bad source URL ${q.source?.url}`);
    }
    if (!HOSTS.has(url.hostname)) return problems.push(`${where}: ${url.hostname} isn't an official docs host`);
    let text;
    try {
      text = await page(q.source.url);
    } catch (err) {
      return problems.push(`${where}: couldn't load the source (${err.message})`);
    }
    if (q.evidence) {
      quoted++;
      if (!text.includes(normalize(q.evidence))) problems.push(`${where}: the evidence quote isn't on ${q.source.url} anymore:\n    "${q.evidence}"`);
    }
  }),
);

console.log(`${questions.length} questions, ${quoted} with evidence quotes, ${pages.size} source pages.`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("All sources load, and every evidence quote is still on its page.");

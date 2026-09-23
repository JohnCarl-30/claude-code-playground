// Runs before `npm run dev` (and via `npm run check`) to catch setup problems early.
// It never blocks startup; it only prints what to fix.
import { query } from "@anthropic-ai/claude-agent-sdk";

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  console.log(yellow(`! Node ${process.versions.node} is too old. Install Node 20.9 or newer: https://nodejs.org`));
} else {
  console.log(green(`✓ Node ${process.versions.node}`));
}

const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;
async function* noPrompt() {
  await new Promise(() => {});
}
const q = query({ prompt: noPrompt(), options: { env, settingSources: [], strictMcpConfig: true, tools: [] } });
const timeout = setTimeout(() => {
  console.log(yellow("! Claude Code took too long to start. The playground will still try when you run an example."));
  process.exit(0);
}, 20_000);

try {
  const info = await q.accountInfo();
  if (info.email || info.subscriptionType || (info.tokenSource && info.tokenSource !== "none")) {
    console.log(green(`✓ Signed in to Claude${info.subscriptionType ? ` (${info.subscriptionType})` : ""}`));
  } else {
    console.log(yellow("! Claude Code is not signed in on this computer."));
    console.log("  1. Install Claude Code: https://claude.com/claude-code");
    console.log("  2. Run `claude` in a terminal and sign in with your Claude account.");
    console.log("  3. Start the playground again.");
  }
} catch (err) {
  console.log(yellow(`! Couldn't check your Claude login: ${err instanceof Error ? err.message : err}`));
} finally {
  clearTimeout(timeout);
  q.close();
}
console.log("");

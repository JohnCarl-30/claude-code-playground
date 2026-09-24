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

// Next.js reads .env.local for the app; read it here too (Node 20.12+), so PLAYGROUND_AUTH applies.
try {
  process.loadEnvFile?.(".env.local");
} catch {}

const help = [
  "  To talk to Claude, pick one (details in the README):",
  "  1. A Claude subscription: install Claude Code (https://claude.com/claude-code), run `claude` and sign in.",
  "  2. An API key: put PLAYGROUND_AUTH=api-key and ANTHROPIC_API_KEY=... in .env.local.",
  "  3. Amazon Bedrock / Google Vertex AI / Microsoft Foundry: set Claude Code's provider variables.",
  "  Without Claude the playground still runs in practice mode (Workspace, Run & test, Check my work).",
];

async function checkApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) return console.log(yellow("! PLAYGROUND_AUTH=api-key is set, but ANTHROPIC_API_KEY isn't."));
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  try {
    await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
    console.log(green("✓ Using your Anthropic API key (billed per use; the playground caps each conversation)"));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.log(yellow("! Your API key was rejected (401). Check ANTHROPIC_API_KEY in .env.local."));
    else console.log(yellow(`! Couldn't verify your API key right now (${err?.message ?? err}).`));
  }
}

async function checkLogin() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // login mode never uses a key by accident
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
    if (info.apiProvider && info.apiProvider !== "firstParty") {
      console.log(green(`✓ Using Claude through ${info.apiProvider}`));
    } else if (info.email || info.subscriptionType || (info.tokenSource && info.tokenSource !== "none")) {
      console.log(green(`✓ Signed in to Claude${info.subscriptionType ? ` (${info.subscriptionType})` : ""}`));
    } else {
      console.log(yellow("! Claude Code is not signed in on this computer."));
      console.log(help.join("\n"));
    }
  } catch (err) {
    console.log(yellow(`! Couldn't check your Claude login: ${err instanceof Error ? err.message : err}`));
  } finally {
    clearTimeout(timeout);
    q.close();
  }
}

if (process.env.PLAYGROUND_AUTH === "api-key") await checkApiKey();
else await checkLogin();
console.log("");

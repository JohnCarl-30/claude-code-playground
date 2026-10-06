import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { authMode, claudeEnv } from "./auth";

export type AccountStatus =
  | { ready: true; mode: "login" | "api-key" | "cloud"; label: string; warning?: string }
  | { ready: false; mode: "login" | "api-key"; reason: string };

const PROVIDERS: Record<string, string> = {
  bedrock: "Amazon Bedrock",
  vertex: "Google Vertex AI",
  foundry: "Microsoft Foundry",
  anthropicAws: "Claude Platform on AWS",
  anthropicGoogleCloud: "Claude on Google Cloud",
  mantle: "Amazon Bedrock",
  gateway: "your company's gateway",
};

/** API-key mode: check the key with one free call (listing models uses no tokens). */
async function checkApiKey(): Promise<AccountStatus> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ready: false, mode: "api-key", reason: "PLAYGROUND_AUTH=api-key is set, but ANTHROPIC_API_KEY isn't." };
  try {
    await new Anthropic({ apiKey, maxRetries: 0, timeout: 10_000 }).models.list({ limit: 1 });
    return { ready: true, mode: "api-key", label: "API key" };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ready: false, mode: "api-key", reason: "Your API key was rejected (401). Check ANTHROPIC_API_KEY." };
    if (err instanceof Anthropic.PermissionDeniedError) return { ready: false, mode: "api-key", reason: "Your API key isn't allowed to use the API (403)." };
    // Offline or the API is busy: let runs try anyway, but say we couldn't check.
    return { ready: true, mode: "api-key", label: "API key", warning: "Couldn't verify the key right now." };
  }
}

/** Login mode: ask Claude Code who is signed in, without sending a prompt (free, about a second). */
async function checkLogin(): Promise<AccountStatus> {
  async function* noPrompt(): AsyncGenerator<never> {
    await new Promise(() => {});
  }
  const q = query({ prompt: noPrompt(), options: { env: claudeEnv(), settingSources: [], strictMcpConfig: true, tools: [] } });
  try {
    const info = await Promise.race([
      q.accountInfo(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Claude Code took too long to start.")), 20_000)),
    ]);
    // Cloud providers sign in with their own credentials, not a Claude login.
    if (info.apiProvider && info.apiProvider !== "firstParty") {
      return { ready: true, mode: "cloud", label: PROVIDERS[info.apiProvider] ?? info.apiProvider };
    }
    if (info.email || info.subscriptionType || (info.tokenSource && info.tokenSource !== "none")) {
      return { ready: true, mode: "login", label: info.subscriptionType ?? "Claude login" };
    }
    return { ready: false, mode: "login", reason: "Claude Code is not signed in on this computer." };
  } catch (err) {
    return { ready: false, mode: "login", reason: err instanceof Error ? err.message : String(err) };
  } finally {
    q.close();
  }
}

export async function getAccountStatus(): Promise<AccountStatus> {
  return authMode() === "api-key" ? checkApiKey() : checkLogin();
}

import "server-only";
import { query } from "@anthropic-ai/claude-agent-sdk";

export type AccountStatus =
  | { signedIn: true; plan: string | null }
  | { signedIn: false; reason: string };

/**
 * Ask Claude Code who is signed in. This starts Claude Code without sending a
 * prompt, so it costs nothing and takes about a second.
 */
export async function getAccountStatus(): Promise<AccountStatus> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  // A prompt stream that never sends anything: we only want the account info.
  async function* noPrompt(): AsyncGenerator<never> {
    await new Promise(() => {});
  }

  const q = query({ prompt: noPrompt(), options: { env, settingSources: [], strictMcpConfig: true, tools: [] } });
  try {
    const info = await Promise.race([
      q.accountInfo(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Claude Code took too long to start.")), 20_000)),
    ]);
    const signedIn = Boolean(info.email || info.subscriptionType || (info.tokenSource && info.tokenSource !== "none"));
    return signedIn
      ? { signedIn: true, plan: info.subscriptionType ?? null }
      : { signedIn: false, reason: "Claude Code is not signed in on this computer." };
  } catch (err) {
    return { signedIn: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    q.close();
  }
}

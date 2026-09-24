import "server-only";

/**
 * How the playground signs in to Claude:
 * - "login" (default): the Claude Code login on this computer. ANTHROPIC_API_KEY is
 *   ignored, so a key in your shell is never used (or billed) by accident.
 * - "api-key": opted in with PLAYGROUND_AUTH=api-key; uses ANTHROPIC_API_KEY (pay as you go).
 * Cloud providers (Bedrock, Vertex AI, Foundry) work in "login" mode through Claude Code's
 * own environment variables, like CLAUDE_CODE_USE_BEDROCK=1.
 */
export type AuthMode = "login" | "api-key";

export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  return env.PLAYGROUND_AUTH === "api-key" ? "api-key" : "login";
}

/** The environment Claude Code (and your agent scripts) run with. */
export function claudeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  if (authMode(env) === "login") delete out.ANTHROPIC_API_KEY;
  delete out.NODE_OPTIONS;
  return out;
}

/** What to tell someone when Claude can't sign in, in the mode they chose. */
export function signInHelp(env: NodeJS.ProcessEnv = process.env) {
  return authMode(env) === "api-key"
    ? "Your API key was rejected. Check ANTHROPIC_API_KEY in .env.local, then restart the playground."
    : "Claude Code couldn't sign in. Run `claude` in a terminal and sign in, then reload this page.";
}

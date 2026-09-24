import { authMode, claudeEnv, signInHelp } from "@/lib/auth";

describe("auth", () => {
  const base = { NODE_ENV: "test", ANTHROPIC_API_KEY: "sk-ant-secret", NODE_OPTIONS: "--inspect", PATH: "/bin" } as NodeJS.ProcessEnv;

  it("uses the Claude Code login by default and never passes a key along", () => {
    expect(authMode(base)).toBe("login");
    const env = claudeEnv(base);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.PATH).toBe("/bin");
  });

  it("passes the key only when you opt in with PLAYGROUND_AUTH=api-key", () => {
    const optedIn = { ...base, PLAYGROUND_AUTH: "api-key" };
    expect(authMode(optedIn)).toBe("api-key");
    expect(claudeEnv(optedIn).ANTHROPIC_API_KEY).toBe("sk-ant-secret");
  });

  it("ignores other values", () => {
    expect(authMode({ ...base, PLAYGROUND_AUTH: "yes" })).toBe("login");
  });

  it("explains how to fix sign-in for each mode", () => {
    expect(signInHelp(base)).toMatch(/run `claude`/i);
    expect(signInHelp({ ...base, PLAYGROUND_AUTH: "api-key" })).toMatch(/ANTHROPIC_API_KEY in \.env\.local/);
  });
});

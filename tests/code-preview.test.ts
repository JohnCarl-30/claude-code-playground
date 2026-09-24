import { sdkCodeFor } from "@/components/CodePreview";
import { DEFAULT_CONFIG } from "@/lib/run-types";

describe("sdkCodeFor (Code tab)", () => {
  it("mirrors the current settings", () => {
    const code = sdkCodeFor({
      ...DEFAULT_CONFIG,
      prompt: "hi",
      model: "claude-haiku-4-5",
      permissionMode: "acceptEdits",
      projectConfig: true,
      mcpServers: [{ name: "wiki", type: "http", url: "https://mcp.example.com/mcp" }],
    });
    expect(code).toContain('model: "claude-haiku-4-5"');
    expect(code).toContain('permissionMode: "acceptEdits"');
    expect(code).toContain('settingSources: ["project", "local"]');
    expect(code).toContain('"wiki": { type: "http", url: "https://mcp.example.com/mcp" }');
    expect(code).not.toContain("resume:");
  });

  it("shows a live session: a message stream, interrupt and live model changes", () => {
    const code = sdkCodeFor({ ...DEFAULT_CONFIG, prompt: "next" });
    expect(code).toContain("async function* yourMessages()");
    expect(code).toContain("prompt: yourMessages()");
    expect(code).toContain("includePartialMessages: true");
    expect(code).toContain("session.interrupt()");
    expect(code).toContain('priority: "now"');
  });

  it("splits long prompts over several lines", () => {
    const code = sdkCodeFor({ ...DEFAULT_CONFIG, prompt: "word ".repeat(60).trim() });
    const promptLines = code.split("\n").filter((l) => l.includes('"word'));
    expect(promptLines.length).toBeGreaterThan(2);
    promptLines.forEach((l) => expect(l.length).toBeLessThan(100));
  });
});

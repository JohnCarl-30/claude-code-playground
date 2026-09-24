import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseFrontmatter, readClaudeConfig } from "@/lib/claude-config";
import { TEMPLATES } from "@/lib/templates";

describe("parseFrontmatter", () => {
  it("reads key: value lines and the body", () => {
    expect(parseFrontmatter("---\nname: api-reviewer\ndescription: \"Reviews APIs\"\n---\nBody text\n")).toEqual({
      data: { name: "api-reviewer", description: "Reviews APIs" },
      body: "Body text\n",
    });
  });

  it("treats a file without frontmatter as all body", () => {
    expect(parseFrontmatter("Just a prompt")).toEqual({ data: {}, body: "Just a prompt" });
  });
});

describe("readClaudeConfig", () => {
  it("reads the REST API starter's config", async () => {
    const config = await readClaudeConfig(path.join(process.cwd(), "templates/rest-api"));
    expect(config.claudeMd).toBe(true);
    expect(config.settings).toMatchObject({ exists: true, deny: ["Read(./.env)", "Bash(rm:*)"], allow: [] });
    expect(config.settings.hooks).toEqual([
      { event: "PostToolUse", matcher: "Edit|Write", command: "node --check server.js && echo 'server.js syntax OK'" },
    ]);
    expect(config.localSettings).toMatchObject({ exists: true, allow: ["Bash(node --check:*)"] });
    expect(config.commands).toEqual([
      expect.objectContaining({ name: "add-route", file: ".claude/commands/add-route.md", detail: "<METHOD> <path> <what it should do>" }),
    ]);
    expect(config.skills).toEqual([expect.objectContaining({ name: "rest-conventions", file: ".claude/skills/rest-conventions/SKILL.md" })]);
    expect(config.agents).toEqual([expect.objectContaining({ name: "api-reviewer", detail: "tools: Read, Grep, Glob · model: haiku" })]);
  });

  it("reports invalid settings JSON instead of failing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "config-test-"));
    try {
      mkdirSync(path.join(root, ".claude"));
      writeFileSync(path.join(root, ".claude/settings.json"), "{ not json");
      const config = await readClaudeConfig(root);
      expect(config.settings.exists).toBe(true);
      expect(config.settings.error).toBeTruthy();
      expect(config.localSettings.exists).toBe(false);
      expect(config.commands).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(TEMPLATES.map((t) => t.id))("the %s starter's config is valid", async (id) => {
    const config = await readClaudeConfig(path.join(process.cwd(), "templates", id));
    expect(config.settings.error).toBeUndefined();
    expect(config.localSettings.error).toBeUndefined();
    for (const item of [...config.commands, ...config.skills, ...config.agents]) {
      expect(item.name).toMatch(/^[a-z0-9-]+$/);
      expect(item.description.length).toBeGreaterThan(10);
    }
  });
});

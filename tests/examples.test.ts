import { EXAMPLE_GROUPS, EXAMPLES } from "@/lib/examples";
import { BUILT_IN_TOOLS, validateMcpServers } from "@/lib/run-types";
import { TEMPLATES } from "@/lib/templates";

const balanced = (text: string, token: RegExp) => ((text.match(token) ?? []).length % 2 === 0);

describe("examples", () => {
  it("have unique, well-formed ids", () => {
    const ids = EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/));
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s is valid", (_, ex) => {
    expect(EXAMPLE_GROUPS).toContain(ex.group);
    expect(ex.title && ex.blurb && ex.config.prompt.trim()).toBeTruthy();
    expect(ex.notice.length).toBeGreaterThan(0);
    for (const t of ex.config.tools ?? []) expect(BUILT_IN_TOOLS).toContain(t);
    if (ex.template) expect(TEMPLATES.map((t) => t.id)).toContain(ex.template);
    expect(Array.isArray(validateMcpServers(ex.config.mcpServers))).toBe(true);
    for (const n of ex.notice) {
      expect(balanced(n, /`/g)).toBe(true);
      expect(balanced(n.replace(/`[^`]*`/g, ""), /\*\*/g)).toBe(true);
    }
  });
});

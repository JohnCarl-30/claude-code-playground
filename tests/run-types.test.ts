import { validateInspectAction, validateMcpServers } from "@/lib/run-types";

describe("validateMcpServers", () => {
  it("accepts stdio and http servers", () => {
    expect(
      validateMcpServers([
        { name: "memory", type: "stdio", command: "npx", args: ["-y", "pkg"] },
        { name: "wiki", type: "http", url: "https://mcp.example.com/mcp" },
      ]),
    ).toEqual([
      { name: "memory", type: "stdio", command: "npx", args: ["-y", "pkg"] },
      { name: "wiki", type: "http", url: "https://mcp.example.com/mcp" },
    ]);
  });

  it("treats a missing list as no servers", () => {
    expect(validateMcpServers(undefined)).toEqual([]);
  });

  it.each([
    [[{ name: "Bad Name", type: "http", url: "https://x.com" }], /lowercase/],
    [[{ name: "demo", type: "http", url: "https://x.com" }], /reserved/],
    [[{ name: "a", type: "http", url: "https://x.com" }, { name: "a", type: "http", url: "https://y.com" }], /used twice/],
    [[{ name: "a", type: "http", url: "file:///etc/passwd" }], /http or https/],
    [[{ name: "a", type: "http", url: "not a url" }], /valid URL/],
    [[{ name: "a", type: "stdio", command: "  " }], /needs a command/],
    [[{ name: "a", type: "sse", url: "https://x.com" }], /stdio or http/],
    [Array.from({ length: 9 }, (_, i) => ({ name: `s${i}`, type: "http", url: "https://x.com" })), /Up to 8/],
  ])("rejects %j", (servers, message) => {
    expect(validateMcpServers(servers)).toMatch(message);
  });
});

describe("validateInspectAction", () => {
  it("accepts each kind of inspector action", () => {
    expect(validateInspectAction({ kind: "list" })).toEqual({ kind: "list" });
    expect(validateInspectAction({ kind: "call", name: "greet", arguments: { name: "Ada" } })).toEqual({ kind: "call", name: "greet", arguments: { name: "Ada" } });
    expect(validateInspectAction({ kind: "call", name: "greet" })).toEqual({ kind: "call", name: "greet", arguments: {} });
    expect(validateInspectAction({ kind: "read", uri: " docs://x " })).toEqual({ kind: "read", uri: "docs://x" });
    expect(validateInspectAction({ kind: "prompt", name: "summarize", arguments: { text: "hi" } })).toEqual({ kind: "prompt", name: "summarize", arguments: { text: "hi" } });
    expect(validateInspectAction({ kind: "disconnect" })).toEqual({ kind: "disconnect" });
  });

  it("rejects anything else", () => {
    expect(validateInspectAction(null)).toMatch(/Missing/);
    expect(validateInspectAction({ kind: "exec" })).toMatch(/Unknown/);
    expect(validateInspectAction({ kind: "call", name: "" })).toMatch(/Which tool/);
    expect(validateInspectAction({ kind: "call", name: "t", arguments: [1] })).toMatch(/JSON object/);
    expect(validateInspectAction({ kind: "call", name: "t", arguments: { big: "x".repeat(30_000) } })).toMatch(/20 KB/);
    expect(validateInspectAction({ kind: "read", uri: "" })).toMatch(/URI/);
    expect(validateInspectAction({ kind: "prompt", name: "p", arguments: { n: 1 } })).toMatch(/text/);
  });
});

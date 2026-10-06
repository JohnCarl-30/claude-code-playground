import { handshake, splitMcpToolName, toolsCallRequest, toolsCallResponse } from "@/lib/mcp-protocol";

describe("MCP in protocol form", () => {
  it("splits mcp__<server>__<tool> names, and leaves built-in tools alone", () => {
    expect(splitMcpToolName("mcp__demo__roll_dice")).toEqual({ server: "demo", tool: "roll_dice" });
    expect(splitMcpToolName("mcp__my-server__get__thing")).toEqual({ server: "my-server", tool: "get__thing" });
    expect(splitMcpToolName("Read")).toBeNull();
  });

  it("builds the tools/call request and its reply", () => {
    expect(toolsCallRequest("t1", "greet", { name: "Ada" })).toEqual({ jsonrpc: "2.0", id: "t1", method: "tools/call", params: { name: "greet", arguments: { name: "Ada" } } });
    expect(toolsCallResponse("t1", "hi", false)).toEqual({ jsonrpc: "2.0", id: "t1", result: { content: [{ type: "text", text: "hi" }] } });
    expect(toolsCallResponse("t1", [{ type: "text", text: "bad" }], true).result).toEqual({ content: [{ type: "text", text: "bad" }], isError: true });
  });

  it("lists a server's handshake and its tools", () => {
    expect(handshake("demo", ["Read", "mcp__demo__a", "mcp__other__b", "mcp__demo__c"])).toEqual({
      steps: ["initialize", "notifications/initialized", "tools/list"],
      tools: ["a", "c"],
    });
  });
});

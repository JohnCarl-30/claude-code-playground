// MCP in protocol form, for the timeline. During a run Claude Code is the MCP
// client, so the playground never sees its raw messages; these rebuild them from
// the run (a tool call and its result) in the shape the MCP spec defines.

/** `mcp__<server>__<tool>` → its parts, or null for a built-in tool. */
export function splitMcpToolName(name: string): { server: string; tool: string } | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? { server: m[1], tool: m[2] } : null;
}

/** The `tools/call` request Claude Code sends for a tool call. */
export function toolsCallRequest(id: string, tool: string, args: unknown) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args ?? {} } };
}

/** The server's reply to it, from the tool result Claude saw. */
export function toolsCallResponse(id: string, content: unknown, isError: boolean) {
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : [];
  return { jsonrpc: "2.0", id, result: isError ? { content: blocks, isError: true } : { content: blocks } };
}

/** The steps every MCP connection starts with, and the tools this server listed. */
export function handshake(server: string, allTools: string[]) {
  const tools = allTools.filter((t) => t.startsWith(`mcp__${server}__`)).map((t) => t.slice(`mcp__${server}__`.length));
  return { steps: ["initialize", "notifications/initialized", "tools/list"], tools };
}

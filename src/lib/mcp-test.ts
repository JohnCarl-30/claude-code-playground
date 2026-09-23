import "server-only";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { toSdkMcpServers } from "./run-agent";
import type { CustomMcpServer } from "./run-types";
import { WORKSPACE_DIR, ensureWorkspace } from "./workspace";

export type McpTestResult = {
  name: string;
  status: string;
  error?: string;
  tools: { name: string; description?: string }[];
};

/**
 * Connect to the given MCP servers and list their tools, without sending a
 * prompt (so it costs nothing). Waits until every server has connected or failed.
 */
export async function testMcpServers(servers: CustomMcpServer[]): Promise<McpTestResult[]> {
  await ensureWorkspace();
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  async function* noPrompt(): AsyncGenerator<never> {
    await new Promise(() => {});
  }

  const q = query({
    prompt: noPrompt(),
    options: { env, cwd: WORKSPACE_DIR, settingSources: [], strictMcpConfig: true, tools: [], mcpServers: toSdkMcpServers(servers) },
  });
  try {
    const deadline = Date.now() + 60_000; // npx may need to download the server the first time
    while (true) {
      const statuses = await q.mcpServerStatus();
      if (!statuses.some((s) => s.status === "pending") || Date.now() > deadline) {
        return statuses.map((s) => {
          const server = servers.find((x) => x.name === s.name);
          const hint =
            s.status === "failed" && server?.type === "stdio"
              ? `Check that "${server.command}" is installed and the command is right.`
              : s.status === "failed" && server?.type === "http"
                ? "Check the URL, and that the server doesn't need sign-in."
                : "";
          return {
            name: s.name,
            status: s.status === "pending" ? "timed out" : s.status,
            error: [s.error, hint].filter(Boolean).join(" ") || undefined,
            tools: (s.tools ?? []).map((t) => ({ name: t.name, description: t.description })),
          };
        });
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    q.close();
  }
}

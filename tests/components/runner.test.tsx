/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Runner } from "@/components/Runner";

jest.mock("@/components/ClaudeText", () => ({ ClaudeText: ({ text }: { text: string }) => <p>{text}</p> }));

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let workspaceTemplate: string;

/** A fake /api/run response: one NDJSON line per event. */
function runStream(answer: string) {
  const lines = [
    { kind: "run", runId: "r", workspace: "/ws" },
    { kind: "sdk", message: { type: "system", subtype: "init", model: "m", permissionMode: "default", apiKeySource: "none", tools: [], mcp_servers: [], session_id: "sess-1" } },
    { kind: "sdk", message: { type: "assistant", parent_tool_use_id: null, session_id: "sess-1", message: { content: [{ type: "text", text: answer }] } } },
    { kind: "sdk", message: { type: "result", subtype: "success", is_error: false, num_turns: 1, duration_ms: 10, total_cost_usd: 0.001, usage: {}, session_id: "sess-1" } },
    { kind: "done" },
  ];
  const bytes = new TextEncoder().encode(lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return new ReadableStream({ start: (c) => (c.enqueue(bytes), c.close()) });
}

beforeEach(() => {
  calls = [];
  workspaceTemplate = "rest-api";
  localStorage.clear();
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url === "/api/run") return { ok: true, body: runStream(`Answer ${calls.filter((c) => c.url === "/api/run").length}`) };
    if (url === "/api/workspace" && init?.method === "POST") workspaceTemplate = body.template;
    const json =
      url === "/api/status"
        ? { signedIn: true, plan: "Claude Max" }
        : url === "/api/workspace"
          ? { template: workspaceTemplate, files: [], parked: [] }
          : { script: null, running: false, exitCode: null, logs: [] };
    return { ok: true, json: async () => json };
  }) as unknown as typeof fetch;
});

const runBodies = () => calls.filter((c) => c.url === "/api/run").map((c) => c.body!);

describe("Runner", () => {
  it("continues the conversation with follow-ups, and can start a new one", async () => {
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "What routes are there?", tools: ["Read"] }} />);

    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("Answer 1");
    expect(runBodies()[0].resumeSessionId).toBeUndefined();

    // The prompt box is ready for a follow-up.
    const followUp = await screen.findByRole("button", { name: "▶ Send follow-up" });
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    await user.type(screen.getByLabelText("Prompt"), "Which return 404?");
    await user.click(followUp);
    await screen.findByText("Answer 2");

    expect(runBodies()[1]).toMatchObject({ prompt: "Which return 404?", resumeSessionId: "sess-1" });
    expect(screen.getByText("What routes are there?")).toBeInTheDocument(); // turn 1 still shown
    expect(screen.getAllByText(/continuing the conversation/)).toHaveLength(1); // only turn 2 is a follow-up

    await user.click(screen.getByRole("button", { name: /New conversation/ }));
    expect(screen.queryByText("Answer 1")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Prompt"), "Fresh start");
    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("Answer 3");
    expect(runBodies()[2].resumeSessionId).toBeUndefined();
  });

  it("offers to switch when the example needs another starter", async () => {
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "Fix the bug" }} template="tiny-shop" />);
    const button = await screen.findByRole("button", { name: /Switch to Tiny Shop/ });
    expect(screen.getByText(/come back when you switch back/)).toBeInTheDocument();
    await user.click(button);
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ url: "/api/workspace", method: "POST", body: { template: "tiny-shop" } })));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Switch to Tiny Shop/ })).not.toBeInTheDocument());
  });

  it("connects the MCP server starter as my-server for the next run", async () => {
    workspaceTemplate = "mcp-server";
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "Use my tools", tools: [] }} />);
    await user.click(await screen.findByRole("button", { name: "Connect to the playground" }));
    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("Answer 1");
    expect(runBodies()[0].mcpServers).toEqual([{ name: "my-server", type: "stdio", command: "node", args: ["server.js"] }]);
  });
});

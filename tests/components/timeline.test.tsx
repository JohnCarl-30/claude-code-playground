/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timeline } from "@/components/Timeline";
import type { RunEvent } from "@/lib/run-types";

jest.mock("@/components/ClaudeText", () => ({ ClaudeText: ({ text }: { text: string }) => <p>{text}</p> }));

const init: RunEvent = {
  kind: "sdk",
  message: { type: "system", subtype: "init", model: "claude-haiku-4-5", permissionMode: "default", apiKeySource: "none", tools: ["Read"], mcp_servers: [], session_id: "s1" },
};
const props = { showRaw: false, running: true, answered: {}, onDecide: jest.fn() };

describe("Timeline", () => {
  it("shows the session card with the no-API-key login", () => {
    render(<Timeline events={[init]} {...props} />);
    expect(screen.getByText("Session started")).toBeInTheDocument();
    expect(screen.getByText("Your Claude Code login (no API key)")).toBeInTheDocument();
  });

  it("shows a one-line note instead of the session card on follow-ups", () => {
    render(<Timeline events={[init]} {...props} followUp />);
    expect(screen.queryByText("Session started")).not.toBeInTheDocument();
    expect(screen.getByText(/continuing the conversation/)).toBeInTheDocument();
  });

  it("renders tool calls, results and Claude's answer", () => {
    const events: RunEvent[] = [
      { kind: "sdk", message: { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "server.js" } }] } } },
      { kind: "sdk", message: { type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "line one\nline two" }] } } },
      { kind: "sdk", message: { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: "All done." }] } } },
    ];
    render(<Timeline events={events} {...props} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("2 lines")).toBeInTheDocument();
    expect(screen.getByText("All done.")).toBeInTheDocument();
  });

  it("sends Allow, Always allow and Deny choices", async () => {
    const onDecide = jest.fn();
    const ask: RunEvent = { kind: "permission_request", id: "p1", tool: "Edit", input: { file_path: "server.js" } };
    render(<Timeline events={[ask]} {...props} onDecide={onDecide} />);
    await userEvent.click(screen.getByRole("button", { name: "Always allow" }));
    expect(onDecide).toHaveBeenCalledWith("p1", "always");
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onDecide).toHaveBeenCalledWith("p1", "deny");
  });

  it("shows what you chose once answered", () => {
    const ask: RunEvent = { kind: "permission_request", id: "p1", tool: "Edit", input: {} };
    render(<Timeline events={[ask]} {...props} answered={{ p1: "always" }} />);
    expect(screen.getByText("You chose Always allow.")).toBeInTheDocument();
  });

  it("explains a spending-cap stop in plain words", () => {
    const result: RunEvent = {
      kind: "sdk",
      message: { type: "result", subtype: "error_max_budget_usd", is_error: true, num_turns: 3, duration_ms: 1000, total_cost_usd: 0.06, usage: {} },
    };
    render(<Timeline events={[result]} {...props} />);
    expect(screen.getByText(/hit the spending cap/)).toBeInTheDocument();
  });

  it("tags subagent cards with the subagent's name", () => {
    const events: RunEvent[] = [
      { kind: "sdk", message: { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "a1", name: "Agent", input: { subagent_type: "bug-hunter", description: "Find bugs" } }] } } },
      { kind: "sdk", message: { type: "assistant", parent_tool_use_id: "a1", message: { content: [{ type: "text", text: "Found one." }] } } },
    ];
    render(<Timeline events={events} {...props} />);
    expect(screen.getByText("bug-hunter")).toBeInTheDocument();
  });
});

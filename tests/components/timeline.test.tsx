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
    render(<Timeline events={[ask]} {...props} answered={{ p1: "Always allow" }} />);
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

  it("answers Claude's question with a chosen option, your own text, or a skip", async () => {
    const onAnswer = jest.fn();
    const question: RunEvent = {
      kind: "question",
      id: "q1",
      questions: [
        {
          question: "Which language?",
          header: "Language",
          multiSelect: false,
          options: [
            { label: "English", description: "Reply in English" },
            { label: "Filipino", description: "Reply in Filipino" },
          ],
        },
      ],
    };
    const { rerender } = render(<Timeline events={[question]} {...props} onAnswer={onAnswer} />);
    const send = screen.getByRole("button", { name: "Send answer" });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /Filipino/ }));
    await userEvent.click(send);
    expect(onAnswer).toHaveBeenCalledWith("q1", { allow: true, answers: { "Which language?": "Filipino" } }, "Filipino");

    await userEvent.type(screen.getByLabelText(/Your own answer/), "Cebuano");
    await userEvent.click(send);
    expect(onAnswer).toHaveBeenLastCalledWith("q1", { allow: true, answers: { "Which language?": "Cebuano" } }, "Cebuano");

    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onAnswer).toHaveBeenLastCalledWith("q1", { allow: false }, "skipped");

    rerender(<Timeline events={[question]} {...props} onAnswer={onAnswer} answered={{ q1: "Filipino" }} />);
    expect(screen.getByText("You answered: Filipino")).toBeInTheDocument();
  });

  it("reviews a plan: approve with a mode, or keep planning with feedback", async () => {
    const onAnswer = jest.fn();
    const plan: RunEvent = { kind: "plan_review", id: "p1", plan: "# Fix the bug\n\n1. Change line 16" };
    render(<Timeline events={[plan]} {...props} onAnswer={onAnswer} />);
    expect(screen.getByText(/# Fix the bug/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Approve, auto-accept edits/ }));
    expect(onAnswer).toHaveBeenLastCalledWith("p1", { allow: true, mode: "acceptEdits" }, expect.any(String));
    await userEvent.click(screen.getByRole("button", { name: /Approve, ask before edits/ }));
    expect(onAnswer).toHaveBeenLastCalledWith("p1", { allow: true, mode: "default" }, expect.any(String));
    await userEvent.type(screen.getByLabelText("Feedback on the plan"), "Add a test too");
    await userEvent.click(screen.getByRole("button", { name: /Keep planning/ }));
    expect(onAnswer).toHaveBeenLastCalledWith("p1", { allow: false, message: "Add a test too" }, "Keep planning: Add a test too");
  });

  it("shows API retries, and error results with their message", () => {
    const events: RunEvent[] = [
      { kind: "sdk", message: { type: "system", subtype: "api_retry", attempt: 2, max_retries: 10, error_status: 529, error: "overloaded" } },
      { kind: "sdk", message: { type: "result", subtype: "success", is_error: true, result: "Failed to authenticate. API Error: 401", num_turns: 1, duration_ms: 1, total_cost_usd: 0, usage: {} } },
    ];
    render(<Timeline events={events} {...props} />);
    expect(screen.getByText(/answered 529 \(overloaded\); retrying, attempt 2 of 10/)).toBeInTheDocument();
    expect(screen.getByText(/Stopped: Failed to authenticate/)).toBeInTheDocument();
  });

  it("shows task tool calls as one-line notes and a compaction card", () => {
    const events: RunEvent[] = [
      { kind: "sdk", message: { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "t1", name: "TaskCreate", input: { subject: "Fix the bug" } }] } } },
      { kind: "sdk", message: { type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "Task #1 created successfully" }] } } },
      { kind: "sdk", message: { type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 9000, post_tokens: 2000 } } },
    ];
    render(<Timeline events={events} {...props} />);
    expect(screen.getByText(/added to the task list: Fix the bug/)).toBeInTheDocument();
    expect(screen.queryByText("Tool result")).not.toBeInTheDocument(); // hidden: the task list panel shows it
    expect(screen.getByText("Context compacted")).toBeInTheDocument();
    expect(screen.getByText(/9000 → 2000 tokens/)).toBeInTheDocument();
  });
});

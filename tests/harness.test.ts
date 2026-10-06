import { parseAnswer, type RunEvent } from "@/lib/run-types";
import { taskListFrom } from "@/lib/tasks";

const assistant = (content: unknown[]): RunEvent => ({ kind: "sdk", message: { type: "assistant", parent_tool_use_id: null, message: { content } } });
const toolResult = (tool_use_id: string, text: string): RunEvent => ({
  kind: "sdk",
  message: { type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id, content: text }] } },
});

describe("taskListFrom", () => {
  it("rebuilds Claude's task list from TaskCreate and TaskUpdate calls", () => {
    const tasks = taskListFrom([
      assistant([{ type: "tool_use", id: "u1", name: "TaskCreate", input: { subject: "Fix the bug", activeForm: "Fixing the bug" } }]),
      toolResult("u1", "Task #1 created successfully: Fix the bug"),
      assistant([{ type: "tool_use", id: "u2", name: "TaskCreate", input: { subject: "Add a test" } }]),
      toolResult("u2", "Task #2 created successfully: Add a test"),
      assistant([{ type: "tool_use", id: "u3", name: "TaskUpdate", input: { taskId: "1", status: "completed" } }]),
      assistant([{ type: "tool_use", id: "u4", name: "TaskUpdate", input: { taskId: "2", status: "in_progress" } }]),
    ]);
    expect(tasks).toEqual([
      { id: "1", subject: "Fix the bug", status: "completed", activeForm: "Fixing the bug" },
      { id: "2", subject: "Add a test", status: "in_progress", activeForm: undefined },
    ]);
  });

  it("drops deleted tasks and ignores updates to unknown ones", () => {
    const tasks = taskListFrom([
      assistant([{ type: "tool_use", id: "u1", name: "TaskCreate", input: { subject: "Temp" } }]),
      toolResult("u1", "Task #7 created successfully: Temp"),
      assistant([{ type: "tool_use", id: "u2", name: "TaskUpdate", input: { taskId: "7", status: "deleted" } }]),
      assistant([{ type: "tool_use", id: "u3", name: "TaskUpdate", input: { taskId: "99", status: "completed" } }]),
    ]);
    expect(tasks).toEqual([]);
  });
});

describe("parseAnswer", () => {
  it("accepts permission, question and plan answers", () => {
    expect(parseAnswer({ id: "a", allow: true, always: true })).toEqual({ id: "a", allow: true, always: true });
    expect(parseAnswer({ id: "b", allow: true, answers: { "Which language?": "Filipino" } })).toMatchObject({ answers: { "Which language?": "Filipino" } });
    expect(parseAnswer({ id: "c", allow: true, mode: "acceptEdits" })).toMatchObject({ mode: "acceptEdits" });
    expect(parseAnswer({ id: "d", allow: false, message: "Also update the README" })).toMatchObject({ message: "Also update the README" });
  });

  it.each([
    [{ allow: true }, /Expected/],
    [{ id: "x", allow: "yes" }, /Expected/],
    [{ id: "x", allow: true, answers: ["a"] }, /object/],
    [{ id: "x", allow: true, answers: { q: 42 } }, /Invalid/],
    [{ id: "x", allow: true, mode: "bypassPermissions" }, /Unknown permission mode/],
    [{ id: "x", allow: false, message: "x".repeat(3000) }, /too long/],
  ])("rejects %j", (body, error) => {
    expect(parseAnswer(body)).toMatch(error);
  });
});

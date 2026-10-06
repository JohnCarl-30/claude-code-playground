import type { RunEvent } from "./run-types";

export type Task = { id: string; subject: string; status: "pending" | "in_progress" | "completed"; activeForm?: string };

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown };

const textOf = (content: unknown) =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((c: { text?: string }) => c.text ?? "").join("") : "";

/**
 * Claude's task list, rebuilt from its TaskCreate / TaskUpdate calls: a create's
 * result says "Task #3 created…", later updates refer to that id.
 */
export function taskListFrom(events: RunEvent[]): Task[] {
  const tasks = new Map<string, Task>();
  const creates = new Map<string, Record<string, unknown>>(); // tool_use id → TaskCreate input
  for (const e of events) {
    if (e.kind !== "sdk") continue;
    const content = (e.message.message as { content?: Block[] } | undefined)?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (e.message.type === "assistant" && b.type === "tool_use" && b.id) {
        if (b.name === "TaskCreate") creates.set(b.id, b.input ?? {});
        if (b.name === "TaskUpdate") {
          const id = String(b.input?.taskId ?? "");
          const task = tasks.get(id);
          if (!task) continue;
          if (b.input?.status === "deleted") tasks.delete(id);
          else
            tasks.set(id, {
              ...task,
              ...(typeof b.input?.status === "string" ? { status: b.input.status as Task["status"] } : {}),
              ...(typeof b.input?.subject === "string" ? { subject: b.input.subject } : {}),
              ...(typeof b.input?.activeForm === "string" ? { activeForm: b.input.activeForm } : {}),
            });
        }
      }
      if (e.message.type === "user" && b.type === "tool_result" && b.tool_use_id && creates.has(b.tool_use_id)) {
        const id = /#(\d+)/.exec(textOf(b.content))?.[1];
        const input = creates.get(b.tool_use_id)!;
        if (id) tasks.set(id, { id, subject: String(input.subject ?? ""), status: "pending", activeForm: input.activeForm as string | undefined });
      }
    }
  }
  return [...tasks.values()];
}

/** Tool calls that belong to the task list, shown as one-line notes instead of cards. */
export const TASK_TOOL_NAMES = new Set(["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"]);

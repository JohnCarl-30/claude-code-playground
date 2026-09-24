"use client";

import type { Task } from "@/lib/tasks";

/** Claude's own task list, like the checklist the terminal shows while it works. */
export function TaskListPanel({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return null;
  const done = tasks.filter((t) => t.status === "completed").length;
  return (
    <section aria-label="Claude's task list" className="rounded-xl border border-line bg-surface p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
        Claude&apos;s task list
        <span className="font-normal text-muted">
          · {done}/{tasks.length} done
        </span>
      </h3>
      <ul className="space-y-1 text-sm">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-2">
            <span aria-hidden className={`w-4 shrink-0 text-center ${t.status === "completed" ? "text-ok" : t.status === "in_progress" ? "text-accent" : "text-muted"}`}>
              {t.status === "completed" ? "✓" : t.status === "in_progress" ? "●" : "○"}
            </span>
            <span className={t.status === "completed" ? "text-muted line-through" : t.status === "in_progress" ? "font-medium" : ""}>
              {t.status === "in_progress" && t.activeForm ? t.activeForm : t.subject}
            </span>
            <span className="sr-only">({t.status.replace("_", " ")})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

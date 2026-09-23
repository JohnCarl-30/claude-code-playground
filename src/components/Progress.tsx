"use client";

import { markLessonDone, markLessonNotDone, useProgress } from "@/lib/progress";

/** Shown under a lesson's title: completed badge, or a manual "mark as done" button. */
export function LessonStatus({ id, manual }: { id: string; manual: boolean }) {
  const done = useProgress().has(id);
  if (done) {
    return (
      <p className="mt-3 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-ok-soft px-3 py-1 font-medium text-ok">✓ Completed</span>
        <button onClick={() => markLessonNotDone(id)} className="text-muted underline-offset-2 hover:text-ink hover:underline">
          Mark as not done
        </button>
      </p>
    );
  }
  if (!manual) {
    return <p className="mt-3 text-sm text-muted">Run the example below to complete this lesson.</p>;
  }
  return (
    <button
      onClick={() => markLessonDone(id)}
      className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
    >
      ✓ Mark as done
    </button>
  );
}

/** "3 / 7" plus a bar, for a track's lesson ids. */
export function TrackProgress({ ids, compact = false }: { ids: string[]; compact?: boolean }) {
  const progress = useProgress();
  const done = ids.filter((id) => progress.has(id)).length;
  const pct = ids.length ? Math.round((done / ids.length) * 100) : 0;
  return (
    <div className={compact ? "" : "mt-4"}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={ids.length}
        aria-valuenow={done}
        aria-label={`${done} of ${ids.length} lessons done`}
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <p className="mt-1.5 text-xs text-muted">
          {done === ids.length ? "All done 🎉" : `${done} of ${ids.length} lessons done`}
        </p>
      )}
    </div>
  );
}

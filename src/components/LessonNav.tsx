"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TRACKS } from "@/lib/lessons";
import { lessonId, resetProgress, useProgress } from "@/lib/progress";
import { TrackProgress } from "./Progress";

export function LessonNav() {
  const pathname = usePathname();
  const progress = useProgress();

  return (
    <nav aria-label="Lessons" className="space-y-5 text-sm">
      {TRACKS.map((track) => {
        const inTrack = pathname.startsWith(`/learn/${track.slug}/`);
        return (
          // On small screens only the current track's lessons are listed.
          <div key={track.slug} className={inTrack ? "" : "hidden lg:block"}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{track.title}</p>
              <span className="font-mono text-[11px] text-muted">
                {track.lessons.filter((l) => progress.has(lessonId(track.slug, l.slug))).length}/{track.lessons.length}
              </span>
            </div>
            <div className="mb-2 px-0.5">
              <TrackProgress compact ids={track.lessons.map((l) => lessonId(track.slug, l.slug))} />
            </div>
            <ol className="space-y-0.5">
              {track.lessons.map((lesson, i) => {
                const href = `/learn/${track.slug}/${lesson.slug}`;
                const active = pathname === href;
                const done = progress.has(lessonId(track.slug, lesson.slug));
                return (
                  <li key={lesson.slug}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex gap-2 rounded-md px-2 py-1.5 ${
                        active ? "bg-accent-soft font-medium text-accent" : "text-ink/80 hover:bg-surface-2"
                      }`}
                    >
                      <span
                        className={`w-4 shrink-0 text-right font-mono text-xs leading-5 ${done ? "text-ok" : "text-muted"}`}
                        aria-hidden
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      {lesson.title}
                      {done && <span className="sr-only"> (completed)</span>}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      {progress.size > 0 && (
        <button
          onClick={() => {
            if (window.confirm("Clear your progress on every lesson?")) resetProgress();
          }}
          className="hidden text-xs text-muted underline-offset-2 hover:text-ink hover:underline lg:block"
        >
          Reset progress
        </button>
      )}
    </nav>
  );
}

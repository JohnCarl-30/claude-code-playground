"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TRACKS } from "@/lib/lessons";

export function LessonNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Lessons" className="space-y-5 text-sm">
      {TRACKS.map((track) => {
        const inTrack = pathname.startsWith(`/learn/${track.slug}/`);
        return (
          // On small screens only the current track's lessons are listed.
          <div key={track.slug} className={inTrack ? "" : "hidden lg:block"}>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{track.title}</p>
            <ol className="space-y-0.5">
              {track.lessons.map((lesson, i) => {
                const href = `/learn/${track.slug}/${lesson.slug}`;
                const active = pathname === href;
                return (
                  <li key={lesson.slug}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={`flex gap-2 rounded-md px-2 py-1.5 ${
                        active ? "bg-accent-soft font-medium text-accent" : "text-ink/80 hover:bg-surface-2"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-right font-mono text-xs leading-5 text-muted">{i + 1}</span>
                      {lesson.title}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </nav>
  );
}

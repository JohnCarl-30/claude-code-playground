import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/CodeBlock";
import { Markdownish } from "@/components/Markdownish";
import { LessonStatus } from "@/components/Progress";
import { Runner } from "@/components/Runner";
import { ALL_LESSONS, TRACKS, findLesson } from "@/lib/lessons";

export function generateStaticParams() {
  return TRACKS.flatMap((t) => t.lessons.map((l) => ({ track: t.slug, lesson: l.slug })));
}

export async function generateMetadata({ params }: PageProps<"/learn/[track]/[lesson]">): Promise<Metadata> {
  const { track, lesson } = await params;
  const found = findLesson(track, lesson);
  return { title: found ? `${found.lesson.title} · ${found.track.title} · Claude Code Playground` : "Lesson not found" };
}

export default async function LessonPage({ params }: PageProps<"/learn/[track]/[lesson]">) {
  const { track: trackSlug, lesson: lessonSlug } = await params;
  const found = findLesson(trackSlug, lessonSlug);
  if (!found) notFound();
  const { track, lesson, index } = found;

  const flatIndex = ALL_LESSONS.findIndex((x) => x.track.slug === track.slug && x.lesson.slug === lesson.slug);
  const prev = ALL_LESSONS[flatIndex - 1];
  const next = ALL_LESSONS[flatIndex + 1];

  return (
    <article className="max-w-3xl">
      <p className="text-sm text-muted">
        {track.title} · Lesson {index + 1} of {track.lessons.length}
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-balance">{lesson.title}</h1>
      <p className="mt-1 text-lg text-muted">{lesson.summary}</p>
      <LessonStatus id={`${track.slug}/${lesson.slug}`} manual={!lesson.tryIt} />

      <Markdownish blocks={lesson.body} className="mt-6" />

      {lesson.code && (
        <div className="mt-6 space-y-3">
          {lesson.code.map((c) => (
            <CodeBlock key={c.label} label={c.label} source={c.source} />
          ))}
        </div>
      )}

      {lesson.tryIt && (
        <section className="mt-10" aria-labelledby="try">
          <h2 id="try" className="text-xl font-semibold">
            Try it
          </h2>
          <div className="mt-2 rounded-lg border border-line bg-surface-2 p-4 text-sm">
            <p className="font-medium">What to watch for</p>
            <Markdownish blocks={[lesson.tryIt.watch.map((w) => `- ${w}`).join("\n")]} className="mt-1" />
            {lesson.tryIt.next && <Markdownish blocks={[`**Then try:** ${lesson.tryIt.next}`]} className="mt-3" />}
          </div>
          <div className="mt-4">
            <Runner
              key={`${track.slug}/${lesson.slug}`}
              lessonId={`${track.slug}/${lesson.slug}`}
              preset={lesson.tryIt.config}
              showRawByDefault={lesson.tryIt.showRaw}
            />
          </div>
        </section>
      )}

      <nav className="mt-12 grid gap-3 border-t border-line pt-6 sm:grid-cols-2" aria-label="Lesson navigation">
        {prev ? (
          <Link href={`/learn/${prev.track.slug}/${prev.lesson.slug}`} className="rounded-lg border border-line p-3 hover:bg-surface-2">
            <span className="text-xs text-muted">← Previous</span>
            <span className="block font-medium">{prev.lesson.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/learn/${next.track.slug}/${next.lesson.slug}`}
            className="rounded-lg border border-line p-3 text-right hover:bg-surface-2"
          >
            <span className="text-xs text-muted">
              Next{next.track.slug !== track.slug ? ` · ${next.track.title}` : ""} →
            </span>
            <span className="block font-medium">{next.lesson.title}</span>
          </Link>
        ) : (
          <Link href="/playground" className="rounded-lg border border-line p-3 text-right hover:bg-surface-2">
            <span className="text-xs text-muted">You finished every lesson →</span>
            <span className="block font-medium">Open the free playground</span>
          </Link>
        )}
      </nav>
    </article>
  );
}

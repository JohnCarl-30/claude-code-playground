import { notFound, redirect } from "next/navigation";
import { TRACKS } from "@/lib/lessons";

export function generateStaticParams() {
  return TRACKS.map((t) => ({ track: t.slug }));
}

/** /learn/<track> jumps to that track's first lesson. */
export default async function TrackPage({ params }: PageProps<"/learn/[track]">) {
  const { track: slug } = await params;
  const track = TRACKS.find((t) => t.slug === slug);
  if (!track) notFound();
  redirect(`/learn/${track.slug}/${track.lessons[0].slug}`);
}

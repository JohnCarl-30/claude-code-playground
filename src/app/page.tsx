import Link from "next/link";
import { SetupBanner, SetupPill } from "@/components/SetupStatus";
import { TRACKS } from "@/lib/lessons";

const ICONS: Record<string, string> = { "claude-code": ">_", "agent-sdk": "{ }", "claude-api": "⇄", mcp: "⌁" };

const FLOW = [
  { title: "This page", detail: "You write a prompt and pick settings" },
  { title: "Next.js route", detail: "/api/run calls query()" },
  { title: "Agent SDK", detail: "Starts Claude Code for you" },
  { title: "Claude Code", detail: "Uses your existing login" },
  { title: "Claude", detail: "Thinks, calls tools, answers" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20">
      <section className="py-14 sm:py-20">
        <SetupPill />
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Learn Claude Code by watching it work.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted text-pretty">
          Short lessons on Claude Code, the Agent SDK, the Claude API and MCP. Every lesson has a real example you can run, so you see
          each tool call, permission prompt and message as it happens.
        </p>
        <div className="mt-6 max-w-2xl">
          <SetupBanner />
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/learn/claude-code/agent-loop"
            className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90"
          >
            Start the first lesson
          </Link>
          <Link href="/playground" className="rounded-lg border border-line bg-surface px-5 py-2.5 font-medium hover:bg-surface-2">
            Open the free playground
          </Link>
        </div>
      </section>

      <section aria-labelledby="tracks">
        <h2 id="tracks" className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
          Four tracks
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TRACKS.map((track, i) => (
            <Link
              key={track.slug}
              href={`/learn/${track.slug}/${track.lessons[0].slug}`}
              className="group rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent/50"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-accent-soft font-mono text-accent">{ICONS[track.slug]}</span>
                <div>
                  <p className="text-xs text-muted">
                    Track {i + 1} · {track.lessons.length} lessons
                  </p>
                  <h3 className="text-lg font-semibold group-hover:text-accent">{track.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium">{track.tagline}</p>
              <p className="mt-1 text-sm text-muted">{track.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="how" className="mt-14">
        <h2 id="how" className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
          How this playground runs Claude
        </h2>
        <ol className="grid gap-2 md:grid-cols-5">
          {FLOW.map((step, i) => (
            <li key={step.title} className="relative rounded-lg border border-line bg-surface p-3">
              <span className="font-mono text-xs text-accent">{i + 1}</span>
              <p className="font-medium">{step.title}</p>
              <p className="text-sm text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 max-w-3xl text-sm text-muted">
          Claude only works inside the <code className="font-mono">workspace/</code> folder, a tiny sample project with a planted bug.
          Reading files is automatic. Edits and commands wait for you to click <strong>Allow</strong>. Runs count toward your Claude
          plan&apos;s usage, like using Claude Code in the terminal. Use <strong>Reset workspace</strong> to start over.
        </p>
      </section>
    </main>
  );
}

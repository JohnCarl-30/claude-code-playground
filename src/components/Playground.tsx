"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BLANK_EXAMPLE_ID, EXAMPLES, EXAMPLE_GROUPS, findExample } from "@/lib/examples";
import type { RunConfig } from "@/lib/run-types";
import { useTried } from "@/lib/tried";
import { Markdownish } from "./Markdownish";
import { Runner } from "./Runner";

const BLANK: Partial<RunConfig> = { prompt: "", tools: ["Read", "Glob", "Grep", "Edit"], demoMcp: true };

export function Playground({ initialExampleId }: { initialExampleId?: string }) {
  const router = useRouter();
  const tried = useTried();
  const [selectedId, setSelectedId] = useState(findExample(initialExampleId)?.id ?? BLANK_EXAMPLE_ID);
  const example = findExample(selectedId);
  const doneCount = EXAMPLES.filter((e) => tried.has(e.id)).length;

  function select(id: string) {
    setSelectedId(id);
    router.replace(id === BLANK_EXAMPLE_ID ? "/" : `/?example=${encodeURIComponent(id)}`, { scroll: false });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[272px_1fr] lg:gap-10 lg:py-8">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-2">
        {/* Phones: a compact picker. */}
        <label className="block lg:hidden">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
            Example · {doneCount}/{EXAMPLES.length} tried
          </span>
          <select
            value={selectedId}
            onChange={(e) => select(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value={BLANK_EXAMPLE_ID}>Blank: write your own prompt</option>
            {EXAMPLE_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {EXAMPLES.filter((e) => e.group === group).map((e) => (
                  <option key={e.id} value={e.id}>
                    {tried.has(e.id) ? "✓ " : ""}
                    {e.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <nav aria-label="Examples" className="hidden space-y-6 text-sm lg:block">
          <div className="px-2">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Your progress</p>
              <p className="text-xs tabular-nums text-muted">
                {doneCount}/{EXAMPLES.length}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${(doneCount / EXAMPLES.length) * 100}%` }} />
            </div>
          </div>

          <button
            onClick={() => select(BLANK_EXAMPLE_ID)}
            aria-current={selectedId === BLANK_EXAMPLE_ID ? "true" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              selectedId === BLANK_EXAMPLE_ID ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-2"
            }`}
          >
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-base leading-none text-white">
              +
            </span>
            <span className="min-w-0">
              <span className={`block font-medium ${selectedId === BLANK_EXAMPLE_ID ? "text-accent" : ""}`}>Blank</span>
              <span className="block text-xs text-muted">Write your own prompt</span>
            </span>
          </button>

          {EXAMPLE_GROUPS.map((group) => {
            const items = EXAMPLES.filter((e) => e.group === group);
            const done = items.filter((e) => tried.has(e.id)).length;
            return (
              <div key={group}>
                <div className="mb-2 flex items-baseline justify-between px-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{group}</p>
                  <p className={`text-xs tabular-nums ${done === items.length ? "text-ok" : "text-muted"}`}>
                    {done}/{items.length}
                  </p>
                </div>
                <ul className="space-y-0.5">
                  {items.map((e) => {
                    const active = e.id === selectedId;
                    const isDone = tried.has(e.id);
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => select(e.id)}
                          aria-current={active ? "true" : undefined}
                          title={e.blurb}
                          className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                            active ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
                          }`}
                        >
                          <span
                            aria-label={isDone ? "tried" : undefined}
                            className={`grid size-4 shrink-0 place-items-center rounded-full border text-[10px] leading-none ${
                              isDone ? "border-ok bg-ok text-white" : active ? "border-accent" : "border-line"
                            }`}
                          >
                            {isDone ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1">{e.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 space-y-6">
        <header className="space-y-2">
          {example ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-accent">{example.group}</p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{example.title}</h1>
              <p className="max-w-2xl text-muted">{example.blurb}</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">What should Claude build?</h1>
              <p className="max-w-2xl text-muted">
                Ask Claude to build or change something in your workspace, then keep the conversation going with follow-ups. Change the
                tools, permissions and MCP servers to see what happens, or pick an example.
              </p>
            </>
          )}
        </header>
        {example && (
          <aside aria-label="What to notice" className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-sm">
            <p className="mb-1 font-medium">What to notice</p>
            <Markdownish blocks={[example.notice.map((n) => `- ${n}`).join("\n")]} className="text-ink/85" />
          </aside>
        )}
        <Runner
          key={selectedId}
          exampleId={example?.id}
          template={example?.template}
          preset={example?.config ?? BLANK}
          showRawByDefault={example?.showRaw}
        />
      </main>
    </div>
  );
}

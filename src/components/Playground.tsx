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

  function select(id: string) {
    setSelectedId(id);
    router.replace(id === BLANK_EXAMPLE_ID ? "/" : `/?example=${encodeURIComponent(id)}`, { scroll: false });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        {/* Phones: a compact picker. */}
        <label className="block lg:hidden">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Example</span>
          <select
            value={selectedId}
            onChange={(e) => select(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-2 py-2 text-sm"
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

        <nav aria-label="Examples" className="hidden space-y-5 text-sm lg:block">
          <button
            onClick={() => select(BLANK_EXAMPLE_ID)}
            aria-current={selectedId === BLANK_EXAMPLE_ID ? "true" : undefined}
            className={`w-full rounded-md border border-dashed px-3 py-2 text-left ${
              selectedId === BLANK_EXAMPLE_ID ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"
            }`}
          >
            <span className="font-medium">＋ Blank</span>
            <span className="block text-xs text-muted">Write your own prompt</span>
          </button>
          {EXAMPLE_GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{group}</p>
              <ul className="space-y-0.5">
                {EXAMPLES.filter((e) => e.group === group).map((e) => {
                  const active = e.id === selectedId;
                  return (
                    <li key={e.id}>
                      <button
                        onClick={() => select(e.id)}
                        aria-current={active ? "true" : undefined}
                        title={e.blurb}
                        className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${
                          active ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
                        }`}
                      >
                        <span className="min-w-0 flex-1">{e.title}</span>
                        {tried.has(e.id) && (
                          <span className="text-xs leading-5 text-ok" aria-label="tried">
                            ✓
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0">
        <header className="mb-4">
          {example ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{example.group}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{example.title}</h1>
              <p className="text-muted">{example.blurb}</p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted hover:text-ink">What to notice</summary>
                <Markdownish blocks={[example.notice.map((n) => `- ${n}`).join("\n")]} className="mt-1" />
              </details>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Claude Code Playground</h1>
              <p className="max-w-2xl text-muted">
                Ask Claude to do anything in the sample project, then change the tools, permissions, MCP servers and more to see what
                changes. Or pick an example on the left.
              </p>
            </>
          )}
        </header>
        <Runner
          key={selectedId}
          exampleId={example?.id}
          preset={example?.config ?? BLANK}
          showRawByDefault={example?.showRaw}
        />
      </main>
    </div>
  );
}

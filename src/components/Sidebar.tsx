"use client";

import { useState, type ReactNode } from "react";
import { DOMAINS, EXAM, domainProgress, focusDomain, readiness, type Progress } from "@/lib/certification";
import { CHALLENGES } from "@/lib/challenges";
import { BLANK_EXAMPLE_ID, EXAMPLES, EXAMPLE_GROUPS } from "@/lib/examples";
import { localStore } from "@/lib/local-store";
import { useMistakes } from "@/lib/mistakes";
import { MOCK_EXAM } from "@/lib/mock-exam";
import { CERT, CERT_EXAM, CERT_MISTAKES, CERT_OVERVIEW, CERT_PLAN, CHALLENGE } from "@/lib/selection";

// The desktop sidebar: progress, search, and collapsible sections for the
// certification track, challenges and each group of examples.

/** Sections you've opened or closed yourself (others follow their defaults). */
const openStore = localStore<Record<string, boolean>>("claude-code-playground:sidebar-open:v1", {}, (raw) =>
  raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "boolean")) : {},
);

type Row = { id: string; label: string; icon: ReactNode; trailing?: ReactNode; title?: string; iconLabel?: string };

function RowButton({ row, active, onSelect }: { row: Row; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(row.id)}
      aria-current={active ? "true" : undefined}
      title={row.title}
      className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
        active ? "bg-accent-soft font-medium text-accent" : "text-ink/85 hover:bg-surface-2"
      }`}
    >
      <span aria-label={row.iconLabel} className="grid w-4 shrink-0 place-items-center text-center text-xs leading-none">
        {row.icon}
      </span>
      <span className="min-w-0 flex-1">{row.label}</span>
      {row.trailing}
    </button>
  );
}

function Section({
  id,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`sidebar-${id}`}
        className="mb-1 flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left hover:bg-surface-2"
      >
        <span aria-hidden className="w-3 text-[10px] text-muted">
          {open ? "▾" : "▸"}
        </span>
        <span className="min-w-0 flex-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</span>
        {meta}
      </button>
      {open && (
        <div id={`sidebar-${id}`} className="space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

const done = (n: number, of: number) => (
  <span className={`shrink-0 text-xs tabular-nums ${n === of ? "text-ok" : "text-muted"}`}>
    {n}/{of}
  </span>
);

export function Sidebar({ selectedId, onSelect, progress }: { selectedId: string; onSelect: (id: string) => void; progress: Progress }) {
  const [query, setQuery] = useState("");
  const opened = openStore.useValue();
  const mistakes = Object.keys(useMistakes()).length;
  const { tried, passed, quizzes } = progress;
  const ready = Math.round(readiness(progress) * 100);
  const focus = ready < 100 ? focusDomain(progress) : null;
  const selectedGroup = EXAMPLES.find((e) => e.id === selectedId)?.group;

  // Certification and challenges start open; an example group starts open only when it holds what you're looking at.
  const isOpen = (key: string, byDefault: boolean) => opened[key] ?? byDefault;
  const toggle = (key: string, now: boolean) => openStore.update((o) => ({ ...o, [key]: !now }));

  const certRows: Row[] = [
    { id: CERT_PLAN, label: "Study plan", icon: "▦" },
    { id: CERT_OVERVIEW, label: "Exam blueprint", icon: "◎" },
    { id: CERT_EXAM, label: "Mock exam", icon: "⏱", trailing: <span className="shrink-0 text-[10px] text-muted">{MOCK_EXAM.items} Qs</span> },
    {
      id: CERT_MISTAKES,
      label: "Mistakes deck",
      icon: "↺",
      trailing: <span className={`shrink-0 text-[10px] tabular-nums ${mistakes ? "text-accent" : "text-muted"}`}>{mistakes}</span>,
    },
    ...DOMAINS.map((d) => {
      const share = domainProgress(d, progress).share;
      return {
        id: CERT + d.id,
        label: d.name,
        icon: <span className="font-mono">{quizzes.has(d.id) ? "✓" : d.number}</span>,
        iconLabel: quizzes.has(d.id) ? "quiz passed" : undefined,
        title: `${d.weight.toFixed(1)}% of the exam`,
        trailing: (
          <span className="flex shrink-0 items-center gap-1.5">
            {focus?.id === d.id && <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-medium text-accent">focus</span>}
            <span className={`text-[10px] tabular-nums ${share === 1 ? "text-ok" : "text-muted"}`}>{Math.round(share * 100)}%</span>
          </span>
        ),
      };
    }),
  ];
  const challengeRow = (c: (typeof CHALLENGES)[number]): Row => ({
    id: CHALLENGE + c.id,
    label: c.title,
    icon: passed.has(c.id) ? "🏆" : "◇",
    iconLabel: passed.has(c.id) ? "passed" : undefined,
    title: `${c.area} · ${c.level}`,
    trailing: <span className="shrink-0 text-[10px] text-muted">{c.level === "Beginner" ? "B" : "I"}</span>,
  });
  const exampleRow = (e: (typeof EXAMPLES)[number]): Row => ({
    id: e.id,
    label: e.title,
    title: e.blurb,
    iconLabel: tried.has(e.id) ? "tried" : undefined,
    icon: (
      <span
        className={`grid size-4 place-items-center rounded-full border text-[10px] leading-none ${
          tried.has(e.id) ? "border-ok bg-ok text-white" : e.id === selectedId ? "border-accent" : "border-line"
        }`}
      >
        {tried.has(e.id) ? "✓" : ""}
      </span>
    ),
  });

  // Search: everything whose title (or description, area, group) contains the text.
  const q = query.trim().toLowerCase();
  const matches = (...texts: (string | undefined)[]) => texts.some((t) => t?.toLowerCase().includes(q));
  const results: { row: Row; where: string; group?: string }[] = q
    ? [
        ...certRows.filter((r) => matches(r.label, "certification exam")).map((row) => ({ row, where: "Certification", group: "cert" })),
        ...CHALLENGES.filter((c) => matches(c.title, c.area, c.goal)).map((c) => ({ row: challengeRow(c), where: `Challenge · ${c.area}`, group: "challenges" })),
        ...EXAMPLES.filter((e) => matches(e.title, e.blurb, e.group)).map((e) => ({ row: exampleRow(e), where: e.group, group: `examples:${e.group}` })),
      ]
    : [];

  function pick(id: string, group?: string) {
    onSelect(id);
    // Open the section it lives in, so it's there when the search is cleared.
    if (group && !isOpen(group, false)) openStore.update((o) => ({ ...o, [group]: true }));
    setQuery("");
  }

  const areas = [...new Set(CHALLENGES.map((c) => c.area))];
  const triedCount = EXAMPLES.filter((e) => tried.has(e.id)).length;

  return (
    <nav aria-label="Examples" className="hidden space-y-5 text-sm lg:block">
      <div className="px-2">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Your progress</p>
          <p className="text-xs tabular-nums text-muted">
            {triedCount}/{EXAMPLES.length}
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${(triedCount / EXAMPLES.length) * 100}%` }} />
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
          if (e.key === "Enter" && results[0]) pick(results[0].row.id, results[0].group);
        }}
        placeholder="Search examples and challenges"
        aria-label="Search examples and challenges"
        className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
      />

      {q ? (
        <section aria-label="Search results">
          {results.length === 0 ? (
            <p className="px-2 text-muted">Nothing matches “{query.trim()}”.</p>
          ) : (
            <ul className="space-y-0.5">
              {results.map(({ row, where, group }) => (
                <li key={row.id}>
                  <RowButton row={{ ...row, trailing: <span className="shrink-0 text-[10px] text-muted">{where}</span> }} active={row.id === selectedId} onSelect={(id) => pick(id, group)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <button
            onClick={() => onSelect(BLANK_EXAMPLE_ID)}
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

          <Section
            id="cert"
            title={`Certification · ${EXAM.code}`}
            meta={<span className={`shrink-0 text-xs tabular-nums ${ready === 100 ? "text-ok" : "text-muted"}`}>{ready}% ready</span>}
            open={isOpen("cert", true)}
            onToggle={() => toggle("cert", isOpen("cert", true))}
          >
            <ul className="space-y-0.5">
              {certRows.map((row) => (
                <li key={row.id}>
                  <RowButton row={row} active={row.id === selectedId} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </Section>

          <Section
            id="challenges"
            title="Challenges"
            meta={done(CHALLENGES.filter((c) => passed.has(c.id)).length, CHALLENGES.length)}
            open={isOpen("challenges", true)}
            onToggle={() => toggle("challenges", isOpen("challenges", true))}
          >
            {areas.map((area) => (
              <div key={area}>
                <p className="px-2 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted/80">{area}</p>
                <ul className="space-y-0.5">
                  {CHALLENGES.filter((c) => c.area === area).map((c) => (
                    <li key={c.id}>
                      <RowButton row={challengeRow(c)} active={CHALLENGE + c.id === selectedId} onSelect={onSelect} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>

          {EXAMPLE_GROUPS.map((group) => {
            const items = EXAMPLES.filter((e) => e.group === group);
            const key = `examples:${group}`;
            const open = isOpen(key, group === selectedGroup);
            return (
              <Section key={group} id={key.replace(/\W+/g, "-")} title={group} meta={done(items.filter((e) => tried.has(e.id)).length, items.length)} open={open} onToggle={() => toggle(key, open)}>
                <ul className="space-y-0.5">
                  {items.map((e) => (
                    <li key={e.id}>
                      <RowButton row={exampleRow(e)} active={e.id === selectedId} onSelect={onSelect} />
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })}
        </>
      )}
    </nav>
  );
}

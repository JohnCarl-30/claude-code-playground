"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TRACKS } from "@/lib/lessons";

export function SiteHeader() {
  const pathname = usePathname();
  const links = [
    ...TRACKS.map((t) => ({ href: `/learn/${t.slug}`, label: t.title, active: pathname.startsWith(`/learn/${t.slug}`) })),
    { href: "/playground", label: "Free playground", active: pathname === "/playground" },
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent font-mono text-sm text-white">
            &gt;_
          </span>
          <span className="hidden sm:inline">Claude Code Playground</span>
        </Link>
        <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-md px-2.5 py-1.5 transition-colors ${
                l.active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

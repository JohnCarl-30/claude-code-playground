import Link from "next/link";
import { SetupPill } from "./SetupStatus";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-accent font-mono text-sm text-white">
            &gt;_
          </span>
          <span>Claude Code Playground</span>
        </Link>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <SetupPill />
          <a
            href="https://github.com/JohnCarl-30/claude-code-playground"
            target="_blank"
            rel="noreferrer"
            className="hidden text-muted hover:text-ink sm:inline"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";

export function CodeBlock({ label, source }: { label: string; source: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (e.g. insecure origin); nothing to do.
    }
  }

  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-code-bg text-code-text">
      <figcaption className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-white/60">
        <span className="font-mono">{label}</span>
        <button onClick={copy} className="rounded px-2 py-0.5 hover:bg-white/10 hover:text-white">
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code className="font-mono">{source}</code>
      </pre>
    </figure>
  );
}

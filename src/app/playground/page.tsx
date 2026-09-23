import type { Metadata } from "next";
import { Runner } from "@/components/Runner";

export const metadata: Metadata = { title: "Free playground · Claude Code Playground" };

const IDEAS = [
  "Fix the discount bug, add a test for the HALFOFF code, and run npm test.",
  "Explain src/cart.js to someone who has never coded.",
  "Roll three 20-sided dice and save the highest roll as a note.",
  "Plan how you'd add a 'free shipping over $50' rule. Don't change files yet.",
];

export default function PlaygroundPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Free playground</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Every setting unlocked. Mix tools, permission modes, MCP, hooks and subagents, then watch what Claude does.
      </p>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Need an idea?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {IDEAS.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </details>
      <div className="mt-6">
        <Runner
          settingsOpenByDefault
          preset={{
            prompt: IDEAS[0],
            tools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
            demoMcp: true,
          }}
        />
      </div>
    </main>
  );
}

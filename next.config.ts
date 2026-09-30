import type { NextConfig } from "next";

// The study-only site (see src/lib/edition.ts): static files with no server,
// served from a sub-path such as /claude-code-playground on GitHub Pages.
const studySite: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  // Route handlers are the only .ts files under src/app, so leaving "ts" out
  // leaves every API route (Claude, the workspace, running code) out of the build.
  pageExtensions: ["tsx"],
  images: { unoptimized: true },
  typescript: { tsconfigPath: "tsconfig.study.json" },
};

const fullApp: NextConfig = {
  // The Agent SDK launches the Claude Code binary as a child process, so it
  // must be loaded from node_modules at runtime rather than bundled.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@modelcontextprotocol/sdk"],
  // Old lesson pages from before the playground redesign.
  async redirects() {
    return [
      { source: "/learn/:path*", destination: "/", permanent: false },
      { source: "/playground", destination: "/", permanent: false },
    ];
  },
};

export default process.env.NEXT_PUBLIC_STUDY_ONLY === "1" ? studySite : fullApp;

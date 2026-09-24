import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;

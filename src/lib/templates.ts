// Starter projects the workspace can be created from (folders in templates/).
// Shared by the browser and the server, so keep it free of Node-only imports.

export type TemplateId = "tiny-shop" | "rest-api" | "mcp-server" | "agent-sdk" | "claude-api";

export type TemplateScript = {
  id: string;
  label: string;
  /** The program and arguments, run inside workspace/. "node" means this Node.js. */
  command: string[];
  /** Keeps running until stopped (a server), instead of finishing on its own. */
  longRunning?: boolean;
  /** Runs against the practice Claude API on this computer instead of api.anthropic.com. */
  practiceApi?: boolean;
};

export type TemplateInfo = {
  id: TemplateId;
  title: string;
  blurb: string;
  scripts: TemplateScript[];
  /** Port the REST API listens on, for the request tester. */
  apiPort?: number;
  /** The workspace itself is an MCP server that can be plugged into the playground. */
  mcpServer?: boolean;
};

const CLAUDE_API_FILES = ["ask", "tools", "extract", "faq", "batch", "errors", "stream", "workflow", "route", "think", "budget", "cost", "triage", "docs"];

export const API_PORT = 4100;

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "tiny-shop",
    title: "Tiny Shop (bug hunt)",
    blurb: "A small cart library with a planted bug and failing tests.",
    scripts: [{ id: "test", label: "Run tests", command: ["node", "--test"] }],
  },
  {
    id: "rest-api",
    title: "REST API",
    blurb: "A zero-dependency JSON API with node:http. Start it and send requests.",
    scripts: [
      { id: "start", label: "Start server", command: ["node", "server.js"], longRunning: true },
      { id: "check", label: "Check syntax", command: ["node", "--check", "server.js"] },
    ],
    apiPort: API_PORT,
  },
  {
    id: "mcp-server",
    title: "MCP server",
    blurb: "Your own MCP server with the official SDK. Plug it into the playground.",
    scripts: [{ id: "check", label: "Check syntax", command: ["node", "--check", "server.js"] }],
    mcpServer: true,
  },
  {
    id: "agent-sdk",
    title: "Agent SDK script",
    blurb: "A script that runs query(). Run it and read the output.",
    scripts: [
      { id: "run", label: "Run agent.mjs", command: ["node", "agent.mjs"] },
      { id: "check", label: "Check syntax", command: ["node", "--check", "agent.mjs"] },
    ],
  },
  {
    id: "claude-api",
    title: "Claude API app",
    blurb: "Messages, tools, streaming, caching and batches with @anthropic-ai/sdk. Runs against a practice API: no key needed.",
    scripts: [
      ...CLAUDE_API_FILES.map((name) => ({ id: name, label: `${name}.mjs`, command: ["node", "run.mjs", name], practiceApi: true })),
      {
        id: "check",
        label: "Check syntax",
        command: [
          "node",
          "-e",
          "for (const f of require('fs').readdirSync('.').filter((f) => f.endsWith('.mjs'))) require('child_process').execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' }); console.log('All files OK')",
        ],
      },
    ],
  },
];

export const DEFAULT_TEMPLATE: TemplateId = "tiny-shop";

export function findTemplate(id: unknown): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** The MCP server entry that runs the workspace's own server.js over stdio. */
export const WORKSPACE_MCP_SERVER = { name: "my-server", type: "stdio" as const, command: "node", args: ["server.js"] };

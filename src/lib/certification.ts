// The Claude Certified Developer – Foundations (CCDV-F) exam blueprint, and
// what in this playground practices each skill. Domains, skills and weights
// come from the official exam guide (v1.0, effective July 2026); the one-line
// summaries are ours.

export const EXAM = {
  name: "Claude Certified Developer – Foundations",
  code: "CCDV-F",
  items: 53,
  minutes: 120,
  passing: "720 on a 100–1,000 scale",
  guideUrl:
    "https://everpath-course-content.s3-accelerate.amazonaws.com/instructor/6nizmqk8tpzpfjvt6qmmav7rh/public/1783542875/Claude+Certified+Developer+%E2%80%93+Foundations+Exam+Guide.pdf",
};

export type DomainId = "agents" | "apps" | "claude-code" | "eval" | "models" | "prompting" | "security" | "tools";

/** Something in the playground you can do: run an example, pass a challenge. */
export type PracticeRef = { kind: "example"; id: string } | { kind: "challenge"; id: string };

export type Skill = {
  name: string;
  weight: number;
  summary: string;
  practice: PracticeRef[];
};

export type Domain = { id: DomainId; number: number; name: string; weight: number; skills: Skill[] };

const ex = (id: string): PracticeRef => ({ kind: "example", id });
const ch = (id: string): PracticeRef => ({ kind: "challenge", id });

export const DOMAINS: Domain[] = [
  {
    id: "agents",
    number: 1,
    name: "Agents and Workflows",
    weight: 14.7,
    skills: [
      {
        name: "Agent Architecture",
        weight: 4.5,
        summary: "When to use a workflow vs. an agent, supervisor hierarchies, and how subagents improve a task.",
        practice: [ex("claude-code/subagent"), ex("claude-code/team"), ch("api-workflow"), ch("config-subagent")],
      },
      {
        name: "Agent Construction with Claude",
        weight: 5.3,
        summary: "The Agent SDK, custom agent loops and harnesses, self-hosted vs. Anthropic-hosted agents, and hooks for deterministic actions.",
        practice: [ex("agent-sdk/hello"), ex("build/agent-tool"), ex("claude-code/hooks"), ch("agent-tool")],
      },
      {
        name: "Agent Patterns and Frameworks",
        weight: 4.9,
        summary: "Tool-use loops, subagents, memory and context-window management, plus agent frameworks.",
        practice: [ex("claude-code/task-list"), ex("claude-code/context"), ch("api-tool-loop")],
      },
    ],
  },
  {
    id: "apps",
    number: 2,
    name: "Applications and Integration",
    weight: 33.1,
    skills: [
      {
        name: "Understanding Requirements",
        weight: 3.4,
        summary: "Turning business needs into functional and infrastructure requirements.",
        practice: [ex("claude-code/plan-mode"), ex("claude-code/questions"), ch("api-todos")],
      },
      {
        name: "Systems Life Cycle",
        weight: 2.8,
        summary: "Developing, releasing, operating and maintaining systems.",
        practice: [ex("build/rest-api"), ch("api-filter")],
      },
      {
        name: "Claude API Mechanics",
        weight: 6.8,
        summary: "Messages, tools, streaming, vision, thinking, caching, cloud providers, and batch vs. realtime.",
        practice: [ex("claude-api/raw-message"), ex("claude-api/content-blocks"), ch("api-streaming"), ch("api-batch")],
      },
      {
        name: "Software Engineering Foundations",
        weight: 7.4,
        summary: "REST, JSON, async code, version control, code review and refactoring.",
        practice: [ex("claude-code/approve-edit"), ch("api-todos"), ch("debug-discount")],
      },
      {
        name: "Claude Application Design",
        weight: 8.6,
        summary: "How Claude reads instructions across interfaces, content boundaries, schema design and session hygiene.",
        practice: [ex("agent-sdk/system-prompt"), ch("api-structured"), ch("api-workflow")],
      },
      {
        name: "Configuration Management",
        weight: 4.1,
        summary: "CLAUDE.md, settings.json, pinning model versions, prompt versioning and plugin dependencies.",
        practice: [ex("claude-code/claude-md"), ex("config/allow-rule"), ch("config-guardrails"), ch("api-model-routing")],
      },
    ],
  },
  {
    id: "claude-code",
    number: 3,
    name: "Claude Code",
    weight: 3.1,
    skills: [
      {
        name: "Claude Code Operation",
        weight: 3.1,
        summary: "Rules, skills, commands, agents and memory; sessions, headless and streaming modes; the CLAUDE.md hierarchy and settings.",
        practice: [ex("claude-code/explore"), ex("config/slash-command"), ex("config/skill"), ex("config/write-command"), ch("config-command")],
      },
    ],
  },
  {
    id: "eval",
    number: 4,
    name: "Eval, Testing, and Debugging",
    weight: 2.6,
    skills: [
      {
        name: "Debugging and Error Handling",
        weight: 2.6,
        summary: "Identifying error types, choosing a recovery strategy, reading traces, and telling integration bugs from model output.",
        practice: [ex("claude-code/find-bug"), ex("agent-sdk/fix-and-test"), ch("debug-discount"), ch("api-errors")],
      },
    ],
  },
  {
    id: "models",
    number: 5,
    name: "Model Selection and Optimization",
    weight: 16.8,
    skills: [
      {
        name: "LLM Fundamentals",
        weight: 5.2,
        summary: "Tokens, context windows, sampling, thinking and effort, and zero-/few-shot prompting.",
        practice: [ex("claude-api/tokens"), ex("claude-code/context"), ch("api-thinking"), ch("api-token-budget")],
      },
      {
        name: "Technical Fundamentals",
        weight: 6.1,
        summary: "SDKs that wrap REST APIs, streaming connections and everyday engineering practice.",
        practice: [ex("build/rest-api"), ch("api-streaming"), ch("api-errors")],
      },
      {
        name: "Model Selection and Tradeoffs",
        weight: 2.7,
        summary: "Opus vs. Sonnet vs. Haiku, quality/latency/cost tradeoffs, and changes between model releases.",
        practice: [ex("claude-api/tokens"), ex("agent-sdk/spending-cap"), ch("api-model-routing"), ch("api-thinking")],
      },
      {
        name: "Cost and Token Management",
        weight: 2.8,
        summary: "Tracking token usage, modeling cost, and prompt caching.",
        practice: [ex("agent-sdk/spending-cap"), ch("api-caching"), ch("api-batch"), ch("api-cost"), ch("api-token-budget")],
      },
    ],
  },
  {
    id: "prompting",
    number: 6,
    name: "Prompt and Context Engineering",
    weight: 11.0,
    skills: [
      {
        name: "Context Engineering",
        weight: 3.8,
        summary: "Managing the context window, preventing drift and bloat, compaction, and isolating context with subagents.",
        practice: [ex("claude-code/context"), ex("claude-code/subagent")],
      },
      {
        name: "Prompt Engineering",
        weight: 4.6,
        summary: "Clear instructions, examples, system vs. user placement, output constraints and iteration.",
        practice: [ex("agent-sdk/system-prompt"), ch("api-workflow")],
      },
      {
        name: "Output Handling",
        weight: 2.6,
        summary: "Structured output, validating responses, defensive parsing, and not trusting confident output blindly.",
        practice: [ch("api-structured")],
      },
    ],
  },
  {
    id: "security",
    number: 7,
    name: "Security and Safety",
    weight: 8.1,
    skills: [
      {
        name: "AI Application Security",
        weight: 3.2,
        summary: "Prompt injection, jailbreaks, untrusted input, data leakage and PII.",
        practice: [ex("config/deny-rule"), ch("security-hook")],
      },
      {
        name: "Guardrails and Safe Deployment",
        weight: 2.3,
        summary: "Layered guardrails, least privilege and secure-by-design.",
        practice: [ex("claude-code/approve-edit"), ex("agent-sdk/spending-cap"), ch("config-guardrails")],
      },
      {
        name: "Claude Hooks",
        weight: 1.0,
        summary: "Hooks as guardrails that stop destructive actions.",
        practice: [ex("claude-code/hooks"), ch("security-hook")],
      },
      {
        name: "Identity, Secrets, and Key Management",
        weight: 1.6,
        summary: "Keeping API keys and credentials safe from development to production.",
        practice: [ex("config/deny-rule"), ch("api-errors")],
      },
    ],
  },
  {
    id: "tools",
    number: 8,
    name: "Tools and MCPs",
    weight: 10.6,
    skills: [
      {
        name: "Tool Implementation",
        weight: 4.4,
        summary: "Tool definitions and descriptions, error handling, client vs. server tools and approval patterns.",
        practice: [ex("claude-api/content-blocks"), ex("mcp/demo-weather"), ch("api-tool-loop"), ch("mcp-errors")],
      },
      {
        name: "MCP Server Development",
        weight: 2.1,
        summary: "Writing, running and connecting MCP servers: tools, resources, prompts and transports.",
        practice: [ex("build/mcp-server"), ex("build/use-mcp-server"), ex("mcp/memory"), ch("mcp-text-tools"), ch("mcp-resources")],
      },
      {
        name: "Agentic Customization",
        weight: 4.1,
        summary: "Choosing between built-in tools, custom tools, skills and MCP servers.",
        practice: [ex("config/skill"), ex("mcp/deepwiki"), ex("build/agent-tool"), ch("agent-tool")],
      },
    ],
  },
];

export function findDomain(id: string | undefined) {
  return DOMAINS.find((d) => d.id === id);
}

/** Each thing to practice in a domain, once, in the order the skills list them. */
export function domainPractice(domain: Domain): PracticeRef[] {
  const seen = new Set<string>();
  return domain.skills
    .flatMap((s) => s.practice)
    .filter((p) => {
      const key = `${p.kind}:${p.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export type Progress = { tried: ReadonlySet<string>; passed: ReadonlySet<string>; quizzes: ReadonlySet<string> };

export const isDone = (p: PracticeRef, progress: Progress) => (p.kind === "example" ? progress.tried : progress.passed).has(p.id);

/** How much of a domain you've practiced: its examples and challenges, plus its quiz. */
export function domainProgress(domain: Domain, progress: Progress) {
  const practice = domainPractice(domain);
  const done = practice.filter((p) => isDone(p, progress)).length + (progress.quizzes.has(domain.id) ? 1 : 0);
  const total = practice.length + 1;
  return { done, total, share: done / total };
}

/** Readiness across the whole blueprint, weighted like the exam (0–1). */
export function readiness(progress: Progress) {
  const totalWeight = DOMAINS.reduce((sum, d) => sum + d.weight, 0);
  return DOMAINS.reduce((sum, d) => sum + d.weight * domainProgress(d, progress).share, 0) / totalWeight;
}

/** The exam skills an example or challenge practices. */
export function skillsFor(item: PracticeRef) {
  return DOMAINS.flatMap((domain) =>
    domain.skills.filter((s) => s.practice.some((p) => p.kind === item.kind && p.id === item.id)).map((skill) => ({ domain, skill })),
  );
}

/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClaudeConfigPanel } from "@/components/ClaudeConfigPanel";
import { WorkspacePanel } from "@/components/WorkspacePanel";
import type { ClaudeConfig } from "@/lib/claude-config";

const rules = (file: string, extra = {}) => ({ file, exists: true, allow: [], deny: [], ask: [], hooks: [], ...extra });
const config: ClaudeConfig = {
  claudeMd: true,
  settings: rules(".claude/settings.json", {
    deny: ["Read(./.env)"],
    hooks: [{ event: "PostToolUse", matcher: "Edit|Write", command: "node --check server.js" }],
  }),
  localSettings: rules(".claude/settings.local.json", { allow: ["Bash(node --check:*)"] }),
  commands: [{ name: "add-route", description: "Add a new route", file: ".claude/commands/add-route.md", detail: "<METHOD> <path>" }],
  skills: [{ name: "rest-conventions", description: "Conventions", file: ".claude/skills/rest-conventions/SKILL.md" }],
  agents: [{ name: "api-reviewer", description: "Reviews", file: ".claude/agents/api-reviewer.md", detail: "model: haiku" }],
};

describe("ClaudeConfigPanel", () => {
  const handlers = () => ({
    onToggle: jest.fn(),
    onOpen: jest.fn(),
    onCreate: jest.fn(),
    onUseCommand: jest.fn(),
    onAddStarterConfig: jest.fn(),
  });

  it("shows rules, hooks, commands, skills and subagents", () => {
    render(<ClaudeConfigPanel config={config} enabled {...handlers()} />);
    expect(screen.getByText("Read(./.env)", { selector: "span" })).toBeInTheDocument(); // the deny rule chip
    expect(screen.getByText("Bash(node --check:*)", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("node --check server.js")).toBeInTheDocument();
    expect(screen.getByText("/add-route")).toBeInTheDocument();
    expect(screen.getByText("rest-conventions")).toBeInTheDocument();
    expect(screen.getByText("api-reviewer")).toBeInTheDocument();
  });

  it("toggles project config and uses a command", async () => {
    const h = handlers();
    render(<ClaudeConfigPanel config={config} enabled={false} {...h} />);
    expect(screen.getByText("This config is ignored right now")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(h.onToggle).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(h.onUseCommand).toHaveBeenCalledWith("add-route");
  });

  it("offers to add the starter's config to an empty workspace", async () => {
    const h = handlers();
    const empty = { ...config, settings: { ...rules(".claude/settings.json"), exists: false }, localSettings: { ...rules(".claude/settings.local.json"), exists: false }, commands: [], skills: [], agents: [] };
    render(<ClaudeConfigPanel config={empty} enabled {...h} />);
    await userEvent.click(screen.getByRole("button", { name: /Add the starter's \.claude\/ config/ }));
    expect(h.onAddStarterConfig).toHaveBeenCalled();
  });

  it("flags settings files Claude Code would ignore", () => {
    const broken = { ...config, settings: { ...config.settings, error: "Unexpected token" } };
    render(<ClaudeConfigPanel config={broken} enabled {...handlers()} />);
    expect(screen.getByText(/Invalid JSON, so Claude Code ignores this file/)).toBeInTheDocument();
  });
});

describe("creating and saving config files from the Workspace panel", () => {
  it("scaffolds a new command, then saves it with PUT", async () => {
    const puts: { path: string; content: string }[] = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") puts.push(JSON.parse(String(init.body)));
      return { json: async () => (url.startsWith("/api/process") ? { running: false, logs: [] } : { ok: true }) };
    }) as unknown as typeof fetch;
    const onFilesChanged = jest.fn();
    const user = userEvent.setup();
    render(
      <WorkspacePanel
        workspace={{ template: "rest-api", files: [{ path: "server.js", content: "// api" }] }}
        busy={false}
        onSwitch={jest.fn()}
        onReset={jest.fn()}
        mcpConnected={false}
        onConnectMcp={jest.fn()}
        onTryMcp={jest.fn()}
        claudeConfig={config}
        projectConfig
        onFilesChanged={onFilesChanged}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Claude config" }));
    await user.type(screen.getByLabelText("New command name"), "deploy");
    await user.click(screen.getByRole("button", { name: "＋ New command" }));

    // It opens in the Files tab as an unsaved new file with starter content.
    const editor = await screen.findByLabelText("Contents of .claude/commands/deploy.md");
    expect((editor as HTMLTextAreaElement).value).toContain("$ARGUMENTS");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ path: ".claude/commands/deploy.md", content: expect.stringContaining("description:") });
    expect(onFilesChanged).toHaveBeenCalled();
  });
});

/** @jest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspacePanel, type WorkspaceSnapshot } from "@/components/WorkspacePanel";

const workspace: WorkspaceSnapshot = {
  template: "rest-api",
  files: [{ path: "server.js", content: "// api" }],
  parked: ["tiny-shop"],
};

function setup(overrides: Partial<Parameters<typeof WorkspacePanel>[0]> = {}) {
  const props = {
    workspace,
    busy: false,
    onSwitch: jest.fn(),
    onReset: jest.fn(),
    mcpConnected: false,
    onConnectMcp: jest.fn(),
    onTryMcp: jest.fn(),
    ...overrides,
  };
  render(<WorkspacePanel {...props} />);
  return props;
}

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => ({
    json: async () =>
      url.includes("/diff")
        ? { available: true, changes: [{ path: "server.js", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" }] }
        : { script: null, running: false, exitCode: null, logs: [] },
  })) as unknown as typeof fetch;
});

describe("WorkspacePanel", () => {
  it("offers to add starter files the workspace is missing, and stays quiet otherwise", async () => {
    const onAddMissing = jest.fn();
    setup({ workspace: { ...workspace, missing: ["cost.mjs", "samples/policy.pdf", "samples/receipt.png", "think.mjs", "triage.mjs"] }, onAddMissing });
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("5 starter files aren't in your workspace");
    expect(notice).toHaveTextContent("cost.mjs, samples/policy.pdf, samples/receipt.png, think.mjs, +1 more");
    await userEvent.click(screen.getByRole("button", { name: "Add them" }));
    expect(onAddMissing).toHaveBeenCalled();
  });

  it("shows no missing-files notice when nothing is missing", () => {
    setup({ workspace: { ...workspace, missing: [] } });
    expect(screen.queryByRole("button", { name: /Add (it|them)/ })).not.toBeInTheDocument();
  });

  it("switches starters from the dropdown", async () => {
    const { onSwitch } = setup();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Starter/ }), "mcp-server");
    expect(onSwitch).toHaveBeenCalledWith("mcp-server");
  });

  it("marks starters with saved work", () => {
    setup();
    expect(screen.getByRole("option", { name: /Tiny Shop.*saved/ })).toBeInTheDocument();
  });

  it("only resets after you confirm", async () => {
    const confirm = jest.spyOn(window, "confirm");
    const { onReset } = setup();
    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("links to the zip download", () => {
    setup();
    expect(screen.getByRole("link", { name: /\.zip/ })).toHaveAttribute("href", "/api/workspace/download");
  });

  it("shows the diff in the Changes tab", async () => {
    setup();
    await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
    await waitFor(() => expect(screen.getByText("modified")).toBeInTheDocument());
    expect(screen.getByText("+new")).toBeInTheDocument();
    expect(screen.getByText("-old")).toBeInTheDocument();
  });

  it("offers to plug in the MCP server starter", async () => {
    const { onConnectMcp } = setup({ workspace: { ...workspace, template: "mcp-server" } });
    await userEvent.click(screen.getByRole("button", { name: "Connect to the playground" }));
    expect(onConnectMcp).toHaveBeenCalled();
  });
});

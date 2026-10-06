/** @jest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { McpInspector, argumentsFor } from "@/components/McpInspector";
import { McpPanel } from "@/components/McpPanel";
import { approveCommands, unapproved } from "@/lib/mcp-approvals";
import { DEFAULT_CONFIG, type CustomMcpServer } from "@/lib/run-types";

const stdio: CustomMcpServer = { name: "local", type: "stdio", command: "node", args: ["server.js"] };
const remote: CustomMcpServer = { name: "remote", type: "http", url: "http://127.0.0.1:4101/mcp" };

const listing = {
  server: { name: "my-server", version: "1.0.0" },
  tools: [
    {
      name: "convert",
      description: "Convert a temperature.",
      inputSchema: { type: "object", properties: { value: { type: "number" }, unit: { type: "string", enum: ["C", "F"] } }, required: ["value", "unit"] },
    },
  ],
  resources: [{ uri: "docs://rules", title: "Rules", mimeType: "text/markdown" }],
  resourceTemplates: [],
  prompts: [{ name: "summarize", description: "Summarize text.", arguments: [{ name: "text", required: true }] }],
};
const wire = (method: string) => [
  { direction: "sent", message: { jsonrpc: "2.0", id: 2, method } },
  { direction: "received", message: { jsonrpc: "2.0", id: 2, result: {} } },
];

let calls: { server: CustomMcpServer; action: { kind: string; [k: string]: unknown } }[] = [];
beforeEach(() => {
  localStorage.clear();
  calls = [];
  global.fetch = jest.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const reply =
      body.action.kind === "list"
        ? { ok: true, result: listing, messages: wire("tools/list"), log: "", connected: true }
        : body.action.kind === "call"
          ? { ok: true, result: { content: [{ type: "text", text: "33.8" }] }, messages: wire("tools/call"), log: "started", connected: false }
          : body.action.kind === "read"
            ? { ok: true, result: { contents: [{ uri: "docs://rules", text: "# Rules" }] }, messages: wire("resources/read"), log: "", connected: false }
            : { ok: true, messages: [], log: "" };
    return { ok: true, json: async () => reply } as Response;
  }) as never;
});

describe("argumentsFor", () => {
  const schema = { properties: { n: { type: "integer" }, s: { type: "string" }, b: { type: "boolean" }, o: { type: "object" } }, required: ["n"] };
  it("turns form text into typed arguments, following the schema", () => {
    expect(argumentsFor(schema, { n: "3", s: "hi", b: "true", o: '{"a":1}' })).toEqual({ n: 3, s: "hi", b: true, o: { a: 1 } });
    expect(argumentsFor(schema, { n: "3" })).toEqual({ n: 3 });
  });
  it("explains what's wrong", () => {
    expect(argumentsFor(schema, {})).toMatch(/"n" is required/);
    expect(argumentsFor(schema, { n: "1.5" })).toMatch(/whole number/);
    expect(argumentsFor(schema, { n: "1", o: "{nope" })).toMatch(/valid JSON/);
  });
});

describe("command approvals", () => {
  it("asks once per exact command", () => {
    expect(unapproved([stdio, remote])).toEqual([stdio]);
    approveCommands([stdio]);
    expect(unapproved([stdio, remote])).toEqual([]);
    expect(unapproved([{ ...stdio, args: ["other.js"] }])).toHaveLength(1);
  });
});

describe("McpInspector", () => {
  it("asks before starting a local server, then lists, calls a tool and shows the messages", async () => {
    render(<McpInspector server={stdio} onClose={jest.fn()} />);
    const ask = screen.getByRole("alertdialog", { name: "Run these commands?" });
    expect(ask).toHaveTextContent("node server.js");
    expect(calls).toHaveLength(0);
    await userEvent.click(within(ask).getByRole("button", { name: "Run it" }));

    expect(await screen.findByRole("tab", { name: "Tools · 1" })).toBeInTheDocument();
    expect(calls[0].action).toEqual({ kind: "list" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Tool" }), "convert");
    expect(screen.getByRole("button", { name: "Call tool" })).toBeDisabled(); // value is required
    await userEvent.type(screen.getByRole("textbox", { name: /value/ }), "1");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /unit/ }), "C");
    expect(screen.getByText('{"value":1,"unit":"C"}')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Call tool" }));
    expect(calls.at(-1)!.action).toEqual({ kind: "call", name: "convert", arguments: { value: 1, unit: "C" } });
    expect(await screen.findByText("33.8")).toBeInTheDocument();
    const messages = screen.getByRole("region", { name: "Protocol messages" });
    expect(messages).toHaveTextContent("→ sent tools/call #2");
    expect(messages).toHaveTextContent("← received result for #2");
    expect(screen.getByText("Server log (stderr)")).toBeInTheDocument();
  });

  it("connects to an HTTP server straight away, reads resources, and hangs up when closed", async () => {
    const { unmount } = render(<McpInspector server={remote} onClose={jest.fn()} />);
    await userEvent.click(await screen.findByRole("tab", { name: "Resources · 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Read" }));
    expect(await screen.findByText("# Rules")).toBeInTheDocument();
    unmount();
    expect(calls.at(-1)!.action).toEqual({ kind: "disconnect" });
  });
});

describe("McpPanel", () => {
  it("asks before Test connection runs a new local server", async () => {
    render(<McpPanel config={{ ...DEFAULT_CONFIG, mcpServers: [stdio] }} onChange={jest.fn()} onServersChange={jest.fn()} />);
    expect(screen.getByText("not run yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Before Test connection starts it, check the command");
    expect(global.fetch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Run it" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/mcp-test", expect.anything());
    expect(screen.queryByText("not run yet")).not.toBeInTheDocument();
  });

  it("opens the inspector for a server", async () => {
    render(<McpPanel config={{ ...DEFAULT_CONFIG, mcpServers: [remote] }} onChange={jest.fn()} onServersChange={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(screen.getByRole("region", { name: "Inspect remote" })).toBeInTheDocument();
  });
});

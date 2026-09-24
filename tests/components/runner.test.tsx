/** @jest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Runner, toTurns } from "@/components/Runner";
import type { RunEvent, SessionEvent } from "@/lib/run-types";

jest.mock("@/components/ClaudeText", () => ({ ClaudeText: ({ text }: { text: string }) => <p>{text}</p> }));

// A fake live session: POST /api/session starts it, GET .../events streams NDJSON,
// POST .../message and .../control are recorded. Prompts containing "slow" never finish.
type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let stored: SessionEvent[];
let streams: ReadableStreamDefaultController<Uint8Array>[];
let answers: number;
let workspaceTemplate: string;
const enc = new TextEncoder();

function push(event: RunEvent) {
  const e = { ...event, seq: stored.length } as SessionEvent;
  stored.push(e);
  for (const c of streams) c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
}

function reply(text: string, mode: "start" | "steer" | "queue") {
  push({ kind: "user_prompt", text, mode });
  push({ kind: "sdk", message: { type: "system", subtype: "init", model: "m", permissionMode: "default", apiKeySource: "none", tools: [], mcp_servers: [] } });
  if (text.includes("slow")) return;
  answers++;
  push({ kind: "sdk", message: { type: "assistant", parent_tool_use_id: null, message: { content: [{ type: "text", text: `Answer ${answers}` }] } } });
  push({ kind: "sdk", message: { type: "result", subtype: "success", is_error: false, num_turns: 1, duration_ms: 10, total_cost_usd: 0.001, usage: {} } });
}

beforeEach(() => {
  calls = [];
  stored = [];
  streams = [];
  answers = 0;
  workspaceTemplate = "rest-api";
  localStorage.clear();
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const method = init?.method ?? "GET";
    calls.push({ url, method, body });
    const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

    if (url === "/api/session" && method === "POST") {
      stored = [];
      setTimeout(() => {
        push({ kind: "session", sessionId: "s1", workspace: "/ws" });
        reply(body.prompt, "start");
      }, 0);
      return json({ id: "s1" });
    }
    if (url.startsWith("/api/session/s1/events")) {
      const from = Number(new URL(url, "http://x").searchParams.get("from") ?? 0);
      return {
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(c) {
            streams.push(c);
            for (const e of stored) if (e.seq >= from) c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
          },
        }),
      };
    }
    if (url === "/api/session/s1/message") {
      const working = stored.filter((e) => e.kind === "user_prompt").length > stored.filter((e) => e.kind === "sdk" && e.message.type === "result").length;
      setTimeout(() => reply(body.text, working ? body.how : "start"), 0);
      return json({ ok: true });
    }
    if (url.startsWith("/api/session/s1")) return json({ ok: true }); // control, DELETE
    if (url === "/api/workspace" && method === "POST") workspaceTemplate = body.template;
    if (url === "/api/workspace/config") {
      return json({
        claudeMd: true,
        settings: { file: ".claude/settings.json", exists: false, allow: [], deny: [], ask: [], hooks: [] },
        localSettings: { file: ".claude/settings.local.json", exists: false, allow: [], deny: [], ask: [], hooks: [] },
        commands: [{ name: "add-route", description: "Add a new route", file: ".claude/commands/add-route.md", detail: "<METHOD> <path>" }],
        skills: [],
        agents: [],
      });
    }
    if (url === "/api/status") return json({ signedIn: true, plan: "Claude Max" });
    if (url === "/api/workspace") return json({ template: workspaceTemplate, files: [], parked: [] });
    return json({ script: null, running: false, exitCode: null, logs: [] });
  }) as unknown as typeof fetch;
});

const posted = (url: string) => calls.filter((c) => c.url === url && c.method === "POST").map((c) => c.body!);

describe("Runner (live session)", () => {
  it("starts a session, sends follow-ups into it, and can start a new one", async () => {
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "What routes are there?", tools: ["Read"] }} />);

    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("Answer 1");
    expect(posted("/api/session")[0]).toMatchObject({ prompt: "What routes are there?", tools: ["Read"] });
    expect(screen.getByText("● live session")).toBeInTheDocument();

    // Follow-ups go into the same session.
    const followUp = await screen.findByRole("button", { name: "▶ Send follow-up" });
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    await user.type(screen.getByLabelText("Prompt"), "Which return 404?");
    await user.click(followUp);
    await screen.findByText("Answer 2");
    expect(posted("/api/session/s1/message")[0]).toEqual({ text: "Which return 404?", how: "queue" });
    expect(posted("/api/session")).toHaveLength(1);
    expect(screen.getAllByText(/continuing the conversation/)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /New conversation/ }));
    expect(calls).toContainEqual(expect.objectContaining({ url: "/api/session/s1", method: "DELETE" }));
    expect(screen.queryByText("Answer 1")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Prompt"), "Fresh start");
    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await waitFor(() => expect(posted("/api/session")).toHaveLength(2));
  });

  it("while Claude works: steer, queue and stop", async () => {
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "A slow task", tools: ["Read"] }} />);
    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("● Claude is working");

    // The prompt box stays usable while Claude works.
    const prompt = screen.getByLabelText("Prompt");
    expect(prompt).toBeEnabled();
    await user.type(prompt, "Do this instead");
    await user.click(screen.getByRole("button", { name: /Steer/ }));
    await waitFor(() => expect(posted("/api/session/s1/message")[0]).toEqual({ text: "Do this instead", how: "steer" }));
    await screen.findByText(/it switched to this/);

    await user.click(screen.getByRole("button", { name: /Stop/ }));
    await waitFor(() => expect(posted("/api/session/s1/control")).toContainEqual({ action: "interrupt" }));
  });

  it("changes the model and permission mode of the live session", async () => {
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "Hello", tools: ["Read"] }} />);
    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("Answer 1");

    await user.click(screen.getByRole("tab", { name: /Settings/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "" }), "claude-sonnet-5").catch(async () => {
      await user.selectOptions(screen.getAllByRole("combobox")[0], "claude-sonnet-5");
    });
    await user.click(screen.getByText("plan"));
    await waitFor(() =>
      expect(posted("/api/session/s1/control")).toEqual(
        expect.arrayContaining([
          { action: "model", value: "claude-sonnet-5" },
          { action: "permissionMode", value: "plan" },
        ]),
      ),
    );
    // Tools can't change mid-session: the page says so.
    await user.click(screen.getByText("Grep"));
    expect(screen.getByText(/Start a new conversation to apply/)).toBeInTheDocument();
  });

  it("offers to switch when the example needs another starter", async () => {
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "Fix the bug" }} template="tiny-shop" />);
    const button = await screen.findByRole("button", { name: /Switch to Tiny Shop/ });
    await user.click(button);
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ url: "/api/workspace", method: "POST", body: { template: "tiny-shop" } })));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Switch to Tiny Shop/ })).not.toBeInTheDocument());
  });

  it("connects the MCP server starter as my-server when a session starts", async () => {
    workspaceTemplate = "mcp-server";
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "Use my tools", tools: [] }} />);
    await user.click(await screen.findByRole("button", { name: "Connect to the playground" }));
    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("Answer 1");
    expect(posted("/api/session")[0].mcpServers).toEqual([{ name: "my-server", type: "stdio", command: "node", args: ["server.js"] }]);
  });

  it("suggests the project's slash commands and turns project config on for them", async () => {
    const user = userEvent.setup();
    render(<Runner preset={{ prompt: "", tools: ["Read"] }} />);
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "/ad");
    await user.click(await screen.findByRole("button", { name: /\/add-route/ }));
    expect(prompt).toHaveValue("/add-route ");
    await user.click(screen.getByRole("button", { name: "Turn it on" }));
    await user.type(prompt, "GET /time");
    await user.click(screen.getByRole("button", { name: "▶ Run" }));
    await screen.findByText("Answer 1");
    expect(posted("/api/session")[0]).toMatchObject({ prompt: "/add-route GET /time", projectConfig: true });
  });
});

describe("toTurns", () => {
  it("files the interrupted task's result under the turn you steered away from", () => {
    const e = (x: RunEvent, seq: number) => ({ ...x, seq }) as SessionEvent;
    const result = { type: "result", subtype: "success" };
    const turns = toTurns([
      e({ kind: "session", sessionId: "s", workspace: "/ws" }, 0),
      e({ kind: "user_prompt", text: "long task", mode: "start" }, 1),
      e({ kind: "user_prompt", text: "do this instead", mode: "steer" }, 2),
      e({ kind: "sdk", message: result }, 3), // the interrupted task ending
      e({ kind: "sdk", message: { type: "assistant", message: { content: [] } } }, 4),
      e({ kind: "sdk", message: result }, 5), // the answer to "do this instead"
    ]);
    expect(turns.map((t) => t.prompt)).toEqual(["long task", "do this instead"]);
    expect(turns[0].events.map((x) => x.kind)).toEqual(["session", "control", "sdk"]);
    expect(turns[1].events).toHaveLength(2);
  });
});

// Keep React quiet about updates from the fake stream after a test ends.
afterEach(() => act(() => {}));

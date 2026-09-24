import { createTempPlaygroundRoot } from "./helpers";

// The real SDK starts Claude Code; these tests drive a fake session instead.
jest.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: jest.fn(), createSdkMcpServer: jest.fn(() => ({})), tool: jest.fn() }));

const temp = createTempPlaygroundRoot();
let live: typeof import("@/lib/live-session");
let DEFAULT_CONFIG: typeof import("@/lib/run-types").DEFAULT_CONFIG;
beforeAll(async () => {
  live = await import("@/lib/live-session");
  ({ DEFAULT_CONFIG } = await import("@/lib/run-types"));
});
afterAll(() => temp.cleanup());

/** A controllable stand-in for the SDK's Query: we push messages out and read what it was sent. */
function fakeQuery() {
  const out: unknown[] = [];
  let wake: (() => void) | null = null;
  let done = false;
  const received: { message: { content: unknown }; priority?: string }[] = [];
  const fake: {
    received: typeof received;
    emit: (message: unknown) => void;
    finish: () => void;
    interrupt: jest.Mock;
    setModel: jest.Mock;
    setPermissionMode: jest.Mock;
    getContextUsage: jest.Mock;
    close: jest.Mock;
    [Symbol.asyncIterator]: () => AsyncGenerator<unknown>;
  } = {
    received,
    emit(message: unknown) {
      out.push(message);
      wake?.();
    },
    finish() {
      done = true;
      wake?.();
    },
    interrupt: jest.fn(async () => ({ still_queued: [] })),
    setModel: jest.fn(async () => {}),
    setPermissionMode: jest.fn(async () => {}),
    getContextUsage: jest.fn(async () => ({
      model: "m",
      totalTokens: 5000,
      maxTokens: 200000,
      percentage: 2.5,
      isAutoCompactEnabled: true,
      autoCompactThreshold: 167000,
      categories: [{ name: "Messages", tokens: 5000, kind: "used", color: "x" }],
      memoryFiles: [],
      mcpTools: [],
    })),
    close: jest.fn(() => fake.finish()),
    async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
      while (true) {
        while (out.length) yield out.shift();
        if (done) return;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
  const queryFn = (({ prompt }: { prompt: AsyncIterable<unknown> }) => {
    void (async () => {
      for await (const m of prompt) received.push(m as (typeof received)[number]);
    })();
    return fake;
  }) as never;
  return { fake, queryFn };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const result = { type: "result", subtype: "success" };

async function startSession(prompt = "hello") {
  const { fake, queryFn } = fakeQuery();
  const session = await live.createSession({ ...DEFAULT_CONFIG, prompt }, queryFn);
  const events: { kind: string; seq: number; [k: string]: unknown }[] = [];
  session.subscribe(0, (e) => events.push(e as never));
  await tick();
  return { session, fake, events };
}

describe("LiveSession", () => {
  it("starts with your first message and tracks when Claude is working", async () => {
    const { session, fake, events } = await startSession("hello");
    expect(events.map((e) => e.kind)).toEqual(["session", "user_prompt"]);
    expect(fake.received[0].message.content).toBe("hello");
    expect(session.working).toBe(true);
    fake.emit(result);
    await tick();
    expect(session.working).toBe(false);
    session.close();
  });

  it("queues or steers messages sent while Claude works", async () => {
    const { session, fake, events } = await startSession("long task");
    session.send("after that", "queue");
    session.send("do this now", "steer");
    await tick();
    expect(events.filter((e) => e.kind === "user_prompt").map((e) => e.mode)).toEqual(["start", "queue", "steer"]);
    expect(fake.received.map((m) => m.priority)).toEqual([undefined, undefined, "now"]);
    session.close();
  });

  it("a message sent when Claude is idle just starts a new turn", async () => {
    const { session, fake, events } = await startSession("one");
    fake.emit(result);
    await tick();
    session.send("two", "steer");
    expect(events.filter((e) => e.kind === "user_prompt").map((e) => e.mode)).toEqual(["start", "start"]);
    session.close();
  });

  it("stops the current turn only while Claude is working", async () => {
    const { session, fake, events } = await startSession();
    await session.interrupt();
    expect(fake.interrupt).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ kind: "control", note: expect.stringMatching(/stopped/) });
    fake.emit(result);
    await tick();
    await session.interrupt(); // idle: nothing to stop
    expect(fake.interrupt).toHaveBeenCalledTimes(1);
    session.close();
  });

  it("changes model and permission mode live", async () => {
    const { session, fake, events } = await startSession();
    await session.setModel("claude-sonnet-5");
    await session.setPermissionMode("plan");
    expect(fake.setModel).toHaveBeenCalledWith("claude-sonnet-5");
    expect(fake.setPermissionMode).toHaveBeenCalledWith("plan");
    expect(session.config).toMatchObject({ model: "claude-sonnet-5", permissionMode: "plan" });
    expect(events.filter((e) => e.kind === "control").map((e) => e.note)).toEqual([
      "Model is now claude-sonnet-5.",
      "Permission mode is now plan.",
    ]);
    session.close();
  });

  it("replays stored events to a reconnecting viewer, but not word-by-word deltas", async () => {
    const { session, fake } = await startSession();
    fake.emit({ type: "stream_event", event: { type: "content_block_delta" } });
    fake.emit(result);
    await tick();
    const replay: { kind: string; seq: number }[] = [];
    session.subscribe(1, (e) => replay.push(e));
    expect(replay.map((e) => e.seq)).toEqual([1, 2]); // user_prompt, result
    session.close();
  });

  it("reports context usage while open, and nothing once closed", async () => {
    const { session, fake } = await startSession();
    expect(await session.contextUsage()).toMatchObject({ totalTokens: 5000, maxTokens: 200000, categories: [{ name: "Messages", tokens: 5000 }] });
    session.close();
    expect(await session.contextUsage()).toBeNull();
    expect(fake.getContextUsage).toHaveBeenCalledTimes(1);
  });

  it("closing ends the session for everyone", async () => {
    const { session, fake, events } = await startSession();
    session.close("bye");
    expect(fake.close).toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ kind: "closed", reason: "bye" });
    expect(live.getSession(session.id)).toBeUndefined();
    expect(session.send("anyone there?")).toBe(false);
  });

  it("closes sessions nobody is watching once they go quiet, even if Claude was mid-task", async () => {
    const { session } = await startSession();
    const unwatched = (await startSession()).session; // still "working": say its tab closed during a permission prompt
    (unwatched as unknown as { listeners: Set<unknown> }).listeners.clear();
    live.reapIdleSessions(Date.now() + 16 * 60_000);
    expect(live.getSession(unwatched.id)).toBeUndefined();
    expect(live.getSession(session.id)).toBeDefined(); // still watched
    session.close();
  });

  it("keeps at most three sessions, closing the oldest", async () => {
    const started = [];
    for (let i = 0; i < 4; i++) started.push((await startSession(`s${i}`)).session);
    expect(live.getSession(started[0].id)).toBeUndefined();
    expect(started.slice(1).every((s) => live.getSession(s.id))).toBe(true);
    started.forEach((s) => s.close());
  });
});

/** @jest-environment jsdom */
import { EXAM_KEY } from "@/lib/exam-store";
import { localStore, onStoreChange, readStored, replaceStored } from "@/lib/local-store";
import { MISTAKES_KEY } from "@/lib/mistakes";
import { META_KEY, mergeSnapshots, snapshot, startSync, type ProgressStore, type Snapshot } from "@/lib/progress-sync";
import { PLAN_KEY } from "@/lib/study-plan";
import { markQuizPassed, QUIZZES_KEY } from "@/lib/tried";

beforeEach(() => localStorage.clear());

const put = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const get = (key: string) => JSON.parse(readStored(key) ?? "null");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A stand-in for the progress table: one row per user, with a save counter. */
function fakeStore(rows: Record<string, { data: Snapshot; updatedAt: string }> = {}) {
  let version = 0;
  const saves: Snapshot[] = [];
  const store: ProgressStore = {
    load: async (userId) => rows[userId] ?? null,
    save: async (userId, data) => {
      saves.push(data);
      rows[userId] = { data, updatedAt: `v${++version}` };
      return rows[userId].updatedAt;
    },
  };
  return { store, rows, saves };
}

describe("merging two copies of your progress", () => {
  it("keeps every quiz passed on either device", () => {
    expect(mergeSnapshots({ [QUIZZES_KEY]: ["apps", "tools"] }, { [QUIZZES_KEY]: ["tools", "eval"] })[QUIZZES_KEY]).toEqual(["apps", "tools", "eval"]);
  });

  it("keeps every finished test (newest 20) and the test in progress that started last", () => {
    const h = (t: number) => ({ finishedAt: t, correct: 1, total: 2 });
    const merged = mergeSnapshots(
      { [EXAM_KEY]: { current: { startedAt: 5 }, history: [h(3), h(1)] } },
      { [EXAM_KEY]: { current: { startedAt: 9 }, history: [h(4), h(3), ...Array.from({ length: 30 }, (_, i) => h(100 + i))] } },
    )[EXAM_KEY] as { current: { startedAt: number }; history: { finishedAt: number }[] };
    expect(merged.current.startedAt).toBe(9);
    expect(merged.history).toHaveLength(20);
    expect(merged.history[0].finishedAt).toBe(129);
    expect(new Set(merged.history.map((x) => x.finishedAt)).size).toBe(20);
  });

  it("keeps every mistake, taking the more recent copy of one both have", () => {
    const merged = mergeSnapshots(
      { [MISTAKES_KEY]: { a: { misses: 1, streak: 0, lastMissed: 10 }, b: { misses: 2, streak: 1, lastMissed: 5 } } },
      { [MISTAKES_KEY]: { a: { misses: 3, streak: 0, lastMissed: 20 }, b: { misses: 2, streak: 0, lastMissed: 5 }, c: { misses: 1, streak: 0, lastMissed: 1 } } },
    )[MISTAKES_KEY];
    expect(merged).toEqual({
      a: { misses: 3, streak: 0, lastMissed: 20 },
      b: { misses: 2, streak: 1, lastMissed: 5 },
      c: { misses: 1, streak: 0, lastMissed: 1 },
    });
  });

  it("keeps the most recently built study plan, with everything ticked on either side", () => {
    const merged = mergeSnapshots(
      { [PLAN_KEY]: { plan: { createdOn: "2026-10-01" }, checked: ["x"] } },
      { [PLAN_KEY]: { plan: { createdOn: "2026-09-20" }, checked: ["y"] } },
    )[PLAN_KEY];
    expect(merged).toEqual({ plan: { createdOn: "2026-10-01" }, checked: ["x", "y"] });
  });

  it("takes whichever side has something", () => {
    expect(mergeSnapshots({ [QUIZZES_KEY]: ["apps"] }, {})).toEqual({ [QUIZZES_KEY]: ["apps"] });
    expect(mergeSnapshots({}, { [PLAN_KEY]: { plan: null, checked: [] } })).toEqual({ [PLAN_KEY]: { plan: null, checked: [] } });
  });
});

describe("the store registry sync relies on", () => {
  it("reports changes made here, and refreshes readers when a synced value arrives", () => {
    const store = localStore<number>("test:registry", 0, (raw) => Number(raw) || 0);
    const heard: string[] = [];
    const off = onStoreChange((key) => heard.push(key));
    store.update((n) => n + 1);
    expect(heard).toEqual(["test:registry"]);
    replaceStored("test:registry", "7");
    expect(store.read()).toBe(7);
    expect(heard).toEqual(["test:registry"]); // an arriving value isn't a change to push back
    off();
  });
});

describe("syncing", () => {
  it("saves this browser's progress the first time you sign in", async () => {
    put(QUIZZES_KEY, ["apps"]);
    const { store, rows } = fakeStore();
    const sync = startSync({ userId: "u1", store });
    await sync.ready;
    expect(rows.u1.data).toEqual({ [QUIZZES_KEY]: ["apps"] });
    expect(get(META_KEY)).toEqual({ userId: "u1", syncedAt: "v1", dirty: false });
    sync.stop();
  });

  it("merges when a browser with its own progress signs in to an account that has some", async () => {
    put(QUIZZES_KEY, ["apps"]);
    const { store, rows } = fakeStore({ u1: { data: { [QUIZZES_KEY]: ["tools"] }, updatedAt: "old" } });
    const sync = startSync({ userId: "u1", store });
    await sync.ready;
    expect(get(QUIZZES_KEY)).toEqual(["apps", "tools"]);
    expect(rows.u1.data[QUIZZES_KEY]).toEqual(["apps", "tools"]);
    sync.stop();
  });

  it("takes the saved copy on a device with nothing new, so things cleared elsewhere stay cleared", async () => {
    put(MISTAKES_KEY, { a: { misses: 1, streak: 0, lastMissed: 1 } });
    put(META_KEY, { userId: "u1", syncedAt: "v1", dirty: false });
    // Cleared on another device since: the saved deck is empty now.
    const { store, saves } = fakeStore({ u1: { data: { [MISTAKES_KEY]: {} }, updatedAt: "v2" } });
    const sync = startSync({ userId: "u1", store });
    await sync.ready;
    expect(get(MISTAKES_KEY)).toEqual({});
    expect(saves).toHaveLength(0);
    expect(get(META_KEY).syncedAt).toBe("v2");
    sync.stop();
  });

  it("merges instead when this device has changes it hadn't saved yet", async () => {
    put(QUIZZES_KEY, ["apps"]);
    put(META_KEY, { userId: "u1", syncedAt: "v1", dirty: true });
    const { store, rows } = fakeStore({ u1: { data: { [QUIZZES_KEY]: ["eval"] }, updatedAt: "v2" } });
    const sync = startSync({ userId: "u1", store });
    await sync.ready;
    expect(rows.u1.data[QUIZZES_KEY]).toEqual(["apps", "eval"]);
    sync.stop();
  });

  it("saves what you do shortly after you do it, and only study progress", async () => {
    const { store, saves } = fakeStore();
    const sync = startSync({ userId: "u1", store, delayMs: 5 });
    await sync.ready;
    const before = saves.length;
    localStore<number>("claude-code-playground:sidebar-open:v1", 0, Number).update(() => 1);
    await tick(20);
    expect(saves).toHaveLength(before);
    markQuizPassed("security");
    expect(get(META_KEY).dirty).toBe(true);
    await tick(20);
    expect(saves).toHaveLength(before + 1);
    expect(saves.at(-1)![QUIZZES_KEY]).toEqual(["security"]);
    expect(get(META_KEY).dirty).toBe(false);
    sync.stop();
  });

  it("reports a failed save and tries again", async () => {
    const statuses: string[] = [];
    let fail = true;
    const { store, saves } = fakeStore();
    const flaky: ProgressStore = { load: store.load, save: async (u, d) => (fail ? Promise.reject(new Error("offline")) : store.save(u, d)) };
    const sync = startSync({ userId: "u1", store: flaky, onStatus: (s) => statuses.push(s.state), retryMs: 10 });
    await sync.ready;
    expect(statuses).toContain("error");
    fail = false;
    await tick(40);
    expect(saves).toHaveLength(1);
    expect(statuses.at(-1)).toBe("synced");
    sync.stop();
  });

  it("stops saving once stopped (signed out)", async () => {
    const { store, saves } = fakeStore();
    const sync = startSync({ userId: "u1", store, delayMs: 5 });
    await sync.ready;
    sync.stop();
    const before = saves.length;
    markQuizPassed("agents");
    await tick(20);
    expect(saves).toHaveLength(before);
    expect(snapshot()[QUIZZES_KEY]).toEqual(["agents"]); // still saved in the browser
  });
});

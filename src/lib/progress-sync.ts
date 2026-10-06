"use client";

import { EXAM_KEY } from "./exam-store";
import { onStoreChange, readStored, replaceStored } from "./local-store";
import { MISTAKES_KEY } from "./mistakes";
import { PLAN_KEY } from "./study-plan";
import { PASSED_KEY, QUIZZES_KEY, TRIED_KEY } from "./tried";

// Syncing your progress across devices once you sign in. Your browser stays
// the working copy: every change is saved there first, then pushed to your
// row in the database; opening the site (or coming back to the tab) pulls the
// latest. When both sides changed, they're merged rather than overwritten.

/** What gets synced: study progress only (not open sidebar sections, and never your saved MCP servers). */
export const SYNCED_KEYS = [QUIZZES_KEY, EXAM_KEY, MISTAKES_KEY, PLAN_KEY, PASSED_KEY, TRIED_KEY] as const;
type SyncedKey = (typeof SYNCED_KEYS)[number];

/** Your progress as plain JSON, by storage key. */
export type Snapshot = Partial<Record<SyncedKey, unknown>>;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const union = (a: unknown, b: unknown) => [...new Set([...list(a), ...list(b)])];

/** The later of two things by a timestamp field, or whichever exists. */
function later(a: unknown, b: unknown, field: string) {
  if (!a) return b ?? null;
  if (!b) return a;
  return num(obj(b)[field]) > num(obj(a)[field]) ? b : a;
}

/** How to combine this browser's copy of each key with the synced one. */
const MERGE: Record<SyncedKey, (local: unknown, remote: unknown) => unknown> = {
  [QUIZZES_KEY]: union,
  [PASSED_KEY]: union,
  [TRIED_KEY]: union,
  // Practice tests: every finished test from both (the newest 20), and whichever test in progress started last.
  [EXAM_KEY]: (a, b) => {
    const seen = new Set<number>();
    const history = [...list(obj(a).history), ...list(obj(b).history)]
      .filter((h) => {
        const t = num(obj(h).finishedAt);
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      })
      .sort((x, y) => num(obj(y).finishedAt) - num(obj(x).finishedAt))
      .slice(0, 20);
    return { current: later(obj(a).current, obj(b).current, "startedAt"), history };
  },
  // Mistakes: every question from both; for one in both, the copy missed more recently (or further along to clearing).
  [MISTAKES_KEY]: (a, b) => {
    const out: Record<string, unknown> = { ...obj(b) };
    for (const [id, mine] of Object.entries(obj(a))) {
      const theirs = obj(b)[id];
      if (!theirs) out[id] = mine;
      else if (num(obj(mine).lastMissed) !== num(obj(theirs).lastMissed)) out[id] = later(mine, theirs, "lastMissed");
      else out[id] = num(obj(mine).streak) >= num(obj(theirs).streak) ? mine : theirs;
    }
    return out;
  },
  // Study plan: the one built most recently, with everything ticked on either side.
  [PLAN_KEY]: (a, b) => {
    const pa = obj(a).plan ? obj(obj(a).plan) : null;
    const pb = obj(b).plan ? obj(obj(b).plan) : null;
    const plan = !pa ? pb : !pb ? pa : String(pb.createdOn ?? "") > String(pa.createdOn ?? "") ? pb : pa;
    return { plan, checked: union(obj(a).checked, obj(b).checked) };
  },
};

/** Combine two copies of your progress without losing anything either side added. */
export function mergeSnapshots(local: Snapshot, remote: Snapshot): Snapshot {
  const out: Snapshot = {};
  for (const key of SYNCED_KEYS) {
    const [a, b] = [local[key], remote[key]];
    if (a === undefined && b === undefined) continue;
    out[key] = a === undefined ? b : b === undefined ? a : MERGE[key](a, b);
  }
  return out;
}

/** This browser's progress. */
export function snapshot(): Snapshot {
  const out: Snapshot = {};
  for (const key of SYNCED_KEYS) {
    const raw = readStored(key);
    if (raw === null) continue;
    try {
      out[key] = JSON.parse(raw);
    } catch {}
  }
  return out;
}

/** Put progress into this browser, refreshing whatever shows it. */
function apply(snap: Snapshot) {
  for (const key of SYNCED_KEYS) {
    if (snap[key] === undefined) continue;
    const raw = JSON.stringify(snap[key]);
    if (raw !== readStored(key)) replaceStored(key, raw);
  }
}

/** The database side, so tests can use a fake: your row's progress, and saving it. */
export type ProgressStore = {
  load(userId: string): Promise<{ data: Snapshot; updatedAt: string } | null>;
  /** Saves and returns the row's new `updated_at`. */
  save(userId: string, data: Snapshot): Promise<string>;
};

/** What this browser last synced: whose progress, which version, and whether it has changes not yet saved. */
type Meta = { userId: string; syncedAt: string; dirty: boolean };
export const META_KEY = "claude-code-playground:sync:v1";

function readMeta(): Meta | null {
  try {
    const m = obj(JSON.parse(readStored(META_KEY) ?? "null"));
    return typeof m.userId === "string" ? { userId: m.userId, syncedAt: String(m.syncedAt ?? ""), dirty: !!m.dirty } : null;
  } catch {
    return null;
  }
}
function writeMeta(meta: Meta | null) {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {}
}

export type SyncStatus = { state: "syncing" | "synced" | "error"; at?: number; error?: string };

/**
 * Keep this browser and the signed-in user's saved progress in step until `stop()`.
 * On start, and whenever the tab comes back into view, it pulls: a browser with no
 * unsaved changes takes the saved copy; one with changes (or a first sign-in here)
 * merges both and saves the result. Changes you make are saved after a short pause.
 */
export function startSync({
  userId,
  store,
  onStatus = () => {},
  delayMs = 1500,
  retryMs = 30_000,
  now = Date.now,
}: {
  userId: string;
  store: ProgressStore;
  onStatus?: (s: SyncStatus) => void;
  delayMs?: number;
  retryMs?: number;
  now?: () => number;
}) {
  let stopped = false;
  let changes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<void> = Promise.resolve();
  // One pull or push at a time, in order.
  const run = (task: () => Promise<void>) =>
    (queue = queue.then(async () => {
      if (stopped) return;
      onStatus({ state: "syncing" });
      try {
        await task();
        if (!stopped) onStatus({ state: "synced", at: now() });
      } catch (err) {
        if (stopped) return;
        onStatus({ state: "error", error: err instanceof Error ? err.message : String(err) });
        schedule(retryMs);
      }
    }));

  async function save(data: Snapshot) {
    const before = changes;
    const syncedAt = await store.save(userId, data);
    // Anything changed while saving still needs saving.
    writeMeta({ userId, syncedAt, dirty: changes !== before });
    if (changes !== before) schedule(delayMs);
  }

  const pull = () =>
    run(async () => {
      const remote = await store.load(userId);
      const meta = readMeta();
      const clean = meta?.userId === userId && !meta.dirty;
      if (!remote) return save(snapshot());
      if (clean) {
        if (remote.updatedAt !== meta.syncedAt) apply(remote.data);
        writeMeta({ userId, syncedAt: remote.updatedAt, dirty: false });
        return;
      }
      const merged = mergeSnapshots(snapshot(), remote.data);
      apply(merged);
      await save(merged);
    });

  const push = () => run(() => save(snapshot()));

  function schedule(ms: number) {
    clearTimeout(timer);
    timer = setTimeout(() => void push(), ms);
  }

  const offChange = onStoreChange((key) => {
    if (!(SYNCED_KEYS as readonly string[]).includes(key)) return;
    changes++;
    const meta = readMeta();
    writeMeta({ userId, syncedAt: meta?.userId === userId ? meta.syncedAt : "", dirty: true });
    schedule(delayMs);
  });
  const onVisible = () => document.visibilityState === "visible" && void pull();
  document.addEventListener("visibilitychange", onVisible);

  const first = pull();
  return {
    /** Resolves once the first pull is done. */
    ready: first,
    /** Save now instead of waiting. */
    syncNow: () => push(),
    stop() {
      stopped = true;
      clearTimeout(timer);
      offChange();
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}

/** Forget which account this browser synced with (on sign-out). Your progress stays in the browser. */
export const forgetSync = () => writeMeta(null);

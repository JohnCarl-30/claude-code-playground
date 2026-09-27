import { DOMAINS, type DomainId, type SkillId } from "./certification";
import { isCorrect, QUIZZES, type QuizQuestion } from "./quizzes";

// Practice tests. The mock exam is shaped like CCDV-F: 53 questions in 120
// minutes, drawn from each domain in proportion to its exam weight. A custom
// test is any length, on the test objectives you pick. Both are scored per
// domain and per objective, like the real score report. The scaled score is
// our estimate: the real exam's scaling isn't published.

export const MOCK_EXAM = { items: 53, minutes: 120, pass: 720 };

/** Share correct that reaches the pass mark on our estimate (100 + 900 × share ≥ 720): about 69%. */
export const PASS_SHARE = (MOCK_EXAM.pass - 100) / 900;

/** The 25 test objectives (the blueprint's skills), each with its domain, in blueprint order. */
export const OBJECTIVES = DOMAINS.flatMap((d) => d.skills.map((s) => ({ ...s, domain: d.id })));
export type Objective = (typeof OBJECTIVES)[number];

export function findObjective(id: string): Objective | undefined {
  return OBJECTIVES.find((o) => o.id === id);
}

/** A small seeded random number generator (mulberry32), so an attempt can be rebuilt from its seed. */
export function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * How many questions each domain gets: proportional to its weight (largest
 * remainder, so they add up exactly), never more than its question bank holds.
 */
export function blueprintCounts(total = MOCK_EXAM.items, bank: Record<DomainId, readonly unknown[]> = QUIZZES): Record<DomainId, number> {
  const weight = DOMAINS.reduce((sum, d) => sum + d.weight, 0);
  const raw = DOMAINS.map((d) => ({ id: d.id, exact: (total * d.weight) / weight }));
  const counts = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)])) as Record<DomainId, number>;
  let left = total - Object.values(counts).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left-- <= 0) break;
    counts[r.id]++;
  }
  // A domain with too few questions gives its extra seats to the heaviest domains that have spares.
  let short = 0;
  for (const d of DOMAINS) {
    const extra = counts[d.id] - bank[d.id].length;
    if (extra > 0) {
      counts[d.id] -= extra;
      short += extra;
    }
  }
  for (const d of [...DOMAINS].sort((a, b) => b.weight - a.weight)) {
    const room = bank[d.id].length - counts[d.id];
    const take = Math.min(room, short);
    counts[d.id] += take;
    short -= take;
  }
  return counts;
}

/**
 * Split `total` seats across entries in proportion to their weight: one each first while seats last
 * (heaviest first), then each next seat to whichever entry is furthest below its share. Never more
 * than an entry's room.
 */
export function allocate<K extends string>(total: number, entries: readonly { key: K; weight: number; room: number }[]): Record<K, number> {
  const counts = Object.fromEntries(entries.map((e) => [e.key, 0])) as Record<K, number>;
  const open = entries.filter((e) => e.room > 0);
  const seats = Math.min(total, open.reduce((sum, e) => sum + e.room, 0));
  const weight = open.reduce((sum, e) => sum + e.weight, 0);
  const behind = (e: (typeof open)[number]) => (seats * e.weight) / weight - counts[e.key];
  let left = seats;
  for (const e of [...open].sort((a, b) => b.weight - a.weight)) {
    if (left <= 0) break;
    counts[e.key] = 1;
    left--;
  }
  for (; left > 0; left--) {
    const next = open.filter((e) => counts[e.key] < e.room).reduce((best, e) => (behind(e) > behind(best) ? e : best));
    counts[next.key]++;
  }
  return counts;
}

export type ExamItem = { domain: DomainId; id: string };

/**
 * Which questions a test uses: "exam-style" only (judgment: scenarios, no code), "exam-style-first"
 * (detail questions only fill what judgment ones can't), or "all" of them, mixed.
 */
export type Mix = "exam-style" | "exam-style-first" | "all";

const questionsFor = (o: Objective) => QUIZZES[o.domain].filter((q) => q.skill === o.id);
const inMix = (q: QuizQuestion, mix: Mix) => mix === "all" || q.style === "judgment";

/** `seats` questions from these objectives, spread across them by weight. */
function drawObjectives(objectives: readonly Objective[], seats: number, mix: Mix, random: () => number): ExamItem[] {
  const pools = objectives.map((o) => {
    const bank = shuffled(questionsFor(o), random);
    return { o, first: bank.filter((q) => inMix(q, mix)), rest: mix === "exam-style-first" ? bank.filter((q) => q.style !== "judgment") : [] };
  });
  const take = (pick: (p: (typeof pools)[number]) => QuizQuestion[], n: number) => {
    const counts = allocate(n, pools.map((p) => ({ key: p.o.id, weight: p.o.weight, room: pick(p).length })));
    return pools.flatMap((p) => pick(p).slice(0, counts[p.o.id]).map((q) => ({ domain: p.o.domain, id: q.id })));
  };
  const picked = take((p) => p.first, seats);
  return picked.length < seats ? [...picked, ...take((p) => p.rest, seats - picked.length)] : picked;
}

/**
 * The questions for one mock exam: the right number per domain, spread across each domain's
 * objectives, in a mixed order. Same seed, same exam. Judgment questions come first, like the real
 * exam; recall questions only fill a domain that doesn't have enough judgment ones yet.
 */
export function drawExam(seed: number, total = MOCK_EXAM.items): ExamItem[] {
  const random = seededRandom(seed);
  const counts = blueprintCounts(total);
  const picked = DOMAINS.flatMap((d) =>
    drawObjectives(
      OBJECTIVES.filter((o) => o.domain === d.id),
      counts[d.id],
      "exam-style-first",
      random,
    ),
  );
  return shuffled(picked, random);
}

/** A custom test: how many questions, on which objectives, and whether detail questions may appear. */
export type TestSpec = { items: number; objectives: SkillId[]; detail: boolean };

const mixFor = (spec: Pick<TestSpec, "detail">): Mix => (spec.detail ? "all" : "exam-style");

/** How many questions each objective can offer a custom test. */
export function objectiveRoom(detail: boolean): Record<SkillId, number> {
  return Object.fromEntries(OBJECTIVES.map((o) => [o.id, questionsFor(o).filter((q) => inMix(q, mixFor({ detail }))).length])) as Record<SkillId, number>;
}

/** Minutes for a test of this length at the real exam's pace (120 minutes for 53), to the nearest 5. */
export const testMinutes = (items: number) => Math.max(5, Math.round((items * MOCK_EXAM.minutes) / MOCK_EXAM.items / 5) * 5);

/**
 * The questions for a custom test. Every chosen objective gets at least one question when the test is
 * long enough, and the rest go by exam weight; a shorter test picks which objectives to cover at
 * random, favoring the heavier ones. Same seed and spec, same test.
 */
export function drawTest(seed: number, spec: TestSpec): ExamItem[] {
  const random = seededRandom(seed);
  const room = objectiveRoom(spec.detail);
  let chosen = OBJECTIVES.filter((o) => spec.objectives.includes(o.id) && room[o.id] > 0);
  if (spec.items < chosen.length) {
    // Weighted sampling without replacement (Efraimidis–Spirakis), then back in blueprint order.
    const keyed = chosen.map((o) => ({ o, key: random() ** (1 / o.weight) }));
    const keep = new Set(keyed.sort((a, b) => b.key - a.key).slice(0, spec.items).map((k) => k.o));
    chosen = chosen.filter((o) => keep.has(o));
  }
  return shuffled(drawObjectives(chosen, spec.items, mixFor(spec), random), random);
}

const byId = new Map(DOMAINS.flatMap((d) => QUIZZES[d.id].map((q) => [q.id, { domain: d.id, question: q }] as const)));

export function findQuestion(id: string): { domain: DomainId; question: QuizQuestion } | undefined {
  return byId.get(id);
}

export type DomainScore = { correct: number; total: number };
export type ExamResult = {
  correct: number;
  total: number;
  byDomain: Partial<Record<DomainId, DomainScore>>;
  byObjective: Partial<Record<SkillId, DomainScore>>;
  /** Our estimate on the exam's 100–1,000 scale: linear in the share correct. */
  scaled: number;
  passed: boolean;
};

export function scoreExam(items: ExamItem[], answers: Record<string, number[]>): ExamResult {
  const byDomain: Partial<Record<DomainId, DomainScore>> = {};
  const byObjective: Partial<Record<SkillId, DomainScore>> = {};
  let correct = 0;
  for (const item of items) {
    const q = findQuestion(item.id)?.question;
    const right = !!q && isCorrect(q, answers[item.id] ?? []);
    const scores = [(byDomain[item.domain] ??= { correct: 0, total: 0 })];
    if (q) scores.push((byObjective[q.skill] ??= { correct: 0, total: 0 }));
    for (const s of scores) {
      s.total++;
      if (right) s.correct++;
    }
    if (right) correct++;
  }
  const share = items.length ? correct / items.length : 0;
  const scaled = Math.round(100 + 900 * share);
  return { correct, total: items.length, byDomain, byObjective, scaled, passed: scaled >= MOCK_EXAM.pass };
}

/** Objectives you're below the pass share on, adding up these results (say, your last few tests): weakest first. */
export function weakObjectives(results: readonly Partial<Record<SkillId, DomainScore>>[]): SkillId[] {
  const sum = new Map<SkillId, DomainScore>();
  for (const r of results)
    for (const [id, s] of Object.entries(r) as [SkillId, DomainScore][]) {
      const t = sum.get(id) ?? { correct: 0, total: 0 };
      sum.set(id, { correct: t.correct + s.correct, total: t.total + s.total });
    }
  return [...sum]
    .filter(([, s]) => s.total > 0 && s.correct / s.total < PASS_SHARE)
    .sort(([, a], [, b]) => a.correct / a.total - b.correct / b.total)
    .map(([id]) => id);
}

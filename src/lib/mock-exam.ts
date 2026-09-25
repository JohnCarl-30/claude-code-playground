import { DOMAINS, type DomainId } from "./certification";
import { isCorrect, QUIZZES, type QuizQuestion } from "./quizzes";

// A mock exam shaped like CCDV-F: 53 questions in 120 minutes, drawn from each
// domain in proportion to its exam weight, scored per domain like the real
// score report. The scaled score is our estimate: the real exam's scaling
// isn't published.

export const MOCK_EXAM = { items: 53, minutes: 120, pass: 720 };

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

export type ExamItem = { domain: DomainId; id: string };

/** The questions for one attempt: the right number per domain, in a mixed order. Same seed, same exam. */
export function drawExam(seed: number, total = MOCK_EXAM.items): ExamItem[] {
  const random = seededRandom(seed);
  const counts = blueprintCounts(total);
  const picked = DOMAINS.flatMap((d) => shuffled(QUIZZES[d.id], random).slice(0, counts[d.id]).map((q) => ({ domain: d.id, id: q.id })));
  return shuffled(picked, random);
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
  /** Our estimate on the exam's 100–1,000 scale: linear in the share correct. */
  scaled: number;
  passed: boolean;
};

export function scoreExam(items: ExamItem[], answers: Record<string, number[]>): ExamResult {
  const byDomain: Partial<Record<DomainId, DomainScore>> = {};
  let correct = 0;
  for (const item of items) {
    const q = findQuestion(item.id)?.question;
    const right = !!q && isCorrect(q, answers[item.id] ?? []);
    const d = (byDomain[item.domain] ??= { correct: 0, total: 0 });
    d.total++;
    if (right) {
      d.correct++;
      correct++;
    }
  }
  const share = items.length ? correct / items.length : 0;
  const scaled = Math.round(100 + 900 * share);
  return { correct, total: items.length, byDomain, scaled, passed: scaled >= MOCK_EXAM.pass };
}

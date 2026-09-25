import { DOMAINS, type DomainId } from "@/lib/certification";
import { blueprintCounts, drawExam, findQuestion, MOCK_EXAM, scoreExam } from "@/lib/mock-exam";
import { QUIZZES } from "@/lib/quizzes";

const bankSize = DOMAINS.reduce((sum, d) => sum + QUIZZES[d.id].length, 0);
const plenty = Object.fromEntries(DOMAINS.map((d) => [d.id, new Array(100)])) as unknown as Record<DomainId, unknown[]>;

describe("mock exam blueprint", () => {
  it("splits 53 questions by the exam's domain weights", () => {
    // 53 × weight, rounded so the total is exactly 53 (largest remainder).
    expect(blueprintCounts(53, plenty)).toEqual({ agents: 8, apps: 17, "claude-code": 2, eval: 1, models: 9, prompting: 6, security: 4, tools: 6 });
  });

  it("never asks for more questions than a domain has, and moves the rest to the heaviest domains", () => {
    const small = { ...plenty, agents: new Array(3) } as Record<DomainId, unknown[]>;
    const counts = blueprintCounts(53, small);
    expect(counts.agents).toBe(3);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(53);
    expect(counts.apps).toBeGreaterThan(17);
  });

  it("fits the real question bank", () => {
    const counts = blueprintCounts();
    for (const d of DOMAINS) expect(counts[d.id]).toBeLessThanOrEqual(QUIZZES[d.id].length);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(Math.min(MOCK_EXAM.items, bankSize));
  });
});

describe("drawing an exam", () => {
  it("is the same for the same seed, different for another, with no repeats", () => {
    const a = drawExam(42);
    expect(drawExam(42)).toEqual(a);
    expect(new Set(a.map((i) => i.id)).size).toBe(a.length);
    expect(a.length).toBe(Math.min(MOCK_EXAM.items, bankSize));
    expect(drawExam(7).map((i) => i.id)).not.toEqual(a.map((i) => i.id));
    for (const item of a) expect(findQuestion(item.id)?.domain).toBe(item.domain);
  });

  it("mixes the domains instead of grouping them", () => {
    const domains = drawExam(3).map((i) => i.domain);
    const changes = domains.filter((d, i) => i > 0 && d !== domains[i - 1]).length;
    expect(changes).toBeGreaterThan(domains.length / 3);
  });
});

describe("scoring", () => {
  it("scores by domain and estimates a 100–1,000 scaled score", () => {
    const items = drawExam(1);
    const allRight = Object.fromEntries(items.map((i) => [i.id, findQuestion(i.id)!.question.answer]));
    const perfect = scoreExam(items, allRight);
    expect(perfect).toMatchObject({ correct: items.length, total: items.length, scaled: 1000, passed: true });
    for (const [domain, s] of Object.entries(perfect.byDomain)) expect(s.correct).toBe(items.filter((i) => i.domain === domain).length);

    expect(scoreExam(items, {})).toMatchObject({ correct: 0, scaled: 100, passed: false });
    // 720 (the pass mark) needs about 69% right on this estimate.
    const needed = Math.ceil(items.length * 0.69);
    const some = Object.fromEntries(items.slice(0, needed).map((i) => [i.id, allRight[i.id]]));
    expect(scoreExam(items, some).passed).toBe(true);
    const fewer = Object.fromEntries(items.slice(0, needed - 2).map((i) => [i.id, allRight[i.id]]));
    expect(scoreExam(items, fewer).passed).toBe(false);
  });
});

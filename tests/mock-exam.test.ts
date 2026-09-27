import { DOMAINS, type DomainId, type SkillId } from "@/lib/certification";
import {
  allocate,
  blueprintCounts,
  drawExam,
  drawTest,
  findQuestion,
  MOCK_EXAM,
  OBJECTIVES,
  objectiveRoom,
  scoreExam,
  testMinutes,
  testSize,
  weakObjectives,
} from "@/lib/mock-exam";
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

  it("draws exam-style (judgment) questions first, using detail questions only to fill a domain", () => {
    const counts = blueprintCounts();
    const items = drawExam(11);
    for (const d of DOMAINS) {
      const judgmentPool = QUIZZES[d.id].filter((q) => q.style === "judgment").length;
      const drawn = items.filter((i) => i.domain === d.id);
      const judgment = drawn.filter((i) => findQuestion(i.id)!.question.style === "judgment").length;
      expect(judgment).toBe(Math.min(counts[d.id], judgmentPool));
    }
  });

  it("spreads each domain's questions across its objectives", () => {
    const counts = blueprintCounts();
    for (const seed of [1, 2, 3]) {
      const items = drawExam(seed);
      for (const d of DOMAINS) {
        const withJudgment = d.skills.filter((s) => QUIZZES[d.id].some((q) => q.skill === s.id && q.style === "judgment")).length;
        const covered = new Set(items.filter((i) => i.domain === d.id).map((i) => findQuestion(i.id)!.question.skill)).size;
        expect(covered).toBeGreaterThanOrEqual(Math.min(counts[d.id], withJudgment));
      }
    }
  });

  it("mixes the domains instead of grouping them", () => {
    const domains = drawExam(3).map((i) => i.domain);
    const changes = domains.filter((d, i) => i > 0 && d !== domains[i - 1]).length;
    expect(changes).toBeGreaterThan(domains.length / 3);
  });
});

describe("splitting seats", () => {
  const e = (key: string, weight: number, room = 99) => ({ key, weight, room });

  it("goes by weight", () => {
    expect(allocate(8, [e("a", 3), e("b", 1)])).toEqual({ a: 6, b: 2 });
  });

  it("gives everyone one first, heaviest first when seats run short", () => {
    expect(allocate(3, [e("a", 10), e("b", 1), e("c", 1)])).toEqual({ a: 1, b: 1, c: 1 });
    expect(allocate(2, [e("a", 1), e("b", 3), e("c", 2)])).toEqual({ a: 0, b: 1, c: 1 });
  });

  it("never gives more than an entry's room, and moves the rest to the others", () => {
    expect(allocate(10, [e("a", 1, 2), e("b", 1, 20)])).toEqual({ a: 2, b: 8 });
    expect(allocate(50, [e("a", 1, 2), e("b", 1, 3), e("c", 5, 0)])).toEqual({ a: 2, b: 3, c: 0 });
  });
});

describe("custom tests", () => {
  const all = OBJECTIVES.map((o) => o.id);
  const skillOf = (id: string) => findQuestion(id)!.question.skill;

  it("is the same for the same seed and settings, with no repeats", () => {
    const spec = { items: 37, objectives: all, detail: false };
    const a = drawTest(5, spec);
    expect(drawTest(5, spec)).toEqual(a);
    expect(drawTest(6, spec).map((i) => i.id)).not.toEqual(a.map((i) => i.id));
    expect(new Set(a.map((i) => i.id)).size).toBe(a.length);
    for (const item of a) expect(findQuestion(item.id)?.domain).toBe(item.domain);
  });

  it("covers every objective once the test is long enough, with exam-style questions only", () => {
    const room = objectiveRoom({ detail: false });
    const items = drawTest(9, { items: 37, objectives: all, detail: false });
    expect(items).toHaveLength(37);
    expect(items.every((i) => findQuestion(i.id)!.question.style === "judgment")).toBe(true);
    expect(new Set(items.map((i) => skillOf(i.id)))).toEqual(new Set(all.filter((id) => room[id] > 0)));
  });

  it("covers as many objectives as it has questions when it's shorter", () => {
    for (const seed of [1, 2, 3]) {
      const items = drawTest(seed, { items: 10, objectives: all, detail: false });
      expect(new Set(items.map((i) => skillOf(i.id))).size).toBe(10);
    }
  });

  it("sticks to the objectives you pick, and stops at the questions they have", () => {
    const picked: SkillId[] = ["requirements", "agent-construction"];
    const items = drawTest(4, { items: 10, objectives: picked, detail: false });
    expect(items).toHaveLength(10);
    expect(new Set(items.map((i) => skillOf(i.id)))).toEqual(new Set(picked));

    const room = objectiveRoom({ detail: false }).hooks;
    expect(drawTest(4, { items: 53, objectives: ["hooks"], detail: false })).toHaveLength(room);
    // Detail questions widen the pool.
    expect(objectiveRoom({ detail: true }).hooks).toBeGreaterThan(room);
    expect(drawTest(4, { items: 53, objectives: ["hooks"], detail: true })).toHaveLength(objectiveRoom({ detail: true }).hooks);
  });

  it("can leave out \"Choose 2\" questions and still cover every objective", () => {
    const items = drawTest(3, { items: 37, objectives: all, detail: false, singleAnswer: true });
    expect(items).toHaveLength(37);
    expect(items.every((i) => findQuestion(i.id)!.question.answer.length === 1)).toBe(true);
    expect(new Set(items.map((i) => skillOf(i.id))).size).toBe(OBJECTIVES.length);
    // Without the switch, a long enough test does include some.
    const mixed = drawTest(3, { items: 53, objectives: all, detail: false });
    expect(mixed.some((i) => findQuestion(i.id)!.question.answer.length > 1)).toBe(true);
    expect(objectiveRoom({ detail: false, singleAnswer: true }).requirements).toBeLessThan(objectiveRoom({ detail: false }).requirements);
  });

  it("previews exactly what it draws", () => {
    const specs = [
      { items: 37, objectives: all, detail: false, singleAnswer: true },
      { items: 10, objectives: all, detail: false },
      { items: 53, objectives: ["hooks", "cost"] as SkillId[], detail: false, singleAnswer: true },
      { items: 25, objectives: ["mcp-development"] as SkillId[], detail: true },
      { items: 10, objectives: [] as SkillId[], detail: false },
    ];
    for (const spec of specs) {
      const items = drawTest(8, spec);
      const { count, covered } = testSize(spec);
      expect({ count: items.length, covered: new Set(items.map((i) => skillOf(i.id))).size }).toEqual({ count, covered });
    }
  });

  it("is timed at the real exam's pace", () => {
    expect(testMinutes(53)).toBe(MOCK_EXAM.minutes);
    expect(testMinutes(37)).toBe(85);
    expect(testMinutes(10)).toBe(25);
    expect(testMinutes(1)).toBe(5);
  });
});

describe("scoring", () => {
  it("scores by domain and estimates a 100–1,000 scaled score", () => {
    const items = drawExam(1);
    const allRight = Object.fromEntries(items.map((i) => [i.id, findQuestion(i.id)!.question.answer]));
    const perfect = scoreExam(items, allRight);
    expect(perfect).toMatchObject({ correct: items.length, total: items.length, scaled: 1000, passed: true });
    for (const [domain, s] of Object.entries(perfect.byDomain)) expect(s.correct).toBe(items.filter((i) => i.domain === domain).length);
    // And per objective, which add up to the whole test.
    expect(Object.values(perfect.byObjective).reduce((sum, s) => sum + s.total, 0)).toBe(items.length);
    for (const [skill, s] of Object.entries(perfect.byObjective)) expect(s.total).toBe(items.filter((i) => findQuestion(i.id)!.question.skill === skill).length);

    expect(scoreExam(items, {})).toMatchObject({ correct: 0, scaled: 100, passed: false });
    // 720 (the pass mark) needs about 69% right on this estimate.
    const needed = Math.ceil(items.length * 0.69);
    const some = Object.fromEntries(items.slice(0, needed).map((i) => [i.id, allRight[i.id]]));
    expect(scoreExam(items, some).passed).toBe(true);
    const fewer = Object.fromEntries(items.slice(0, needed - 2).map((i) => [i.id, allRight[i.id]]));
    expect(scoreExam(items, fewer).passed).toBe(false);
  });
});

describe("weak objectives", () => {
  it("adds up recent results and lists what's under the pass share, weakest first", () => {
    const recent = [
      { requirements: { correct: 1, total: 2 }, hooks: { correct: 0, total: 1 }, cost: { correct: 2, total: 2 } },
      { requirements: { correct: 0, total: 1 }, hooks: { correct: 1, total: 1 }, guardrails: { correct: 3, total: 4 } },
    ];
    // requirements 1/3 (33%), hooks 1/2 (50%); cost and guardrails are above about 69%.
    expect(weakObjectives(recent)).toEqual(["requirements", "hooks"]);
    expect(weakObjectives([])).toEqual([]);
  });
});

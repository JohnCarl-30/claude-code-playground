import { DOMAINS, domainPractice, domainProgress, readiness, skillsFor } from "@/lib/certification";
import { CHALLENGES, findChallenge } from "@/lib/challenges";
import { findExample } from "@/lib/examples";
import { isCorrect, QUIZZES } from "@/lib/quizzes";
import { optionOrder } from "@/components/QuizPanel";

// The blueprint must match the official exam guide's weights, point only at
// things that exist, and every quiz answer must be well-formed and sourced.

const round = (n: number) => Math.round(n * 10) / 10;

describe("exam blueprint", () => {
  it("has the guide's eight domains, adding up to 100%", () => {
    expect(DOMAINS.map((d) => d.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(round(DOMAINS.reduce((sum, d) => sum + d.weight, 0))).toBe(100);
    expect(DOMAINS.flatMap((d) => d.skills)).toHaveLength(25);
  });

  it.each(DOMAINS.map((d) => [d.name, d] as const))("%s: its skills add up to the domain's weight", (_name, d) => {
    expect(round(d.skills.reduce((sum, s) => sum + s.weight, 0))).toBe(d.weight);
  });

  it("links only to examples and challenges that exist", () => {
    const missing = DOMAINS.flatMap(domainPractice).filter((p) => (p.kind === "example" ? !findExample(p.id) : !findChallenge(p.id)));
    expect(missing).toEqual([]);
  });

  it("gives every skill something to practice, and every challenge an exam skill", () => {
    expect(DOMAINS.flatMap((d) => d.skills).filter((s) => !s.practice.length)).toEqual([]);
    expect(CHALLENGES.filter((c) => !skillsFor({ kind: "challenge", id: c.id }).length).map((c) => c.id)).toEqual([]);
  });

  it("measures readiness weighted like the exam", () => {
    const none = { tried: new Set<string>(), passed: new Set<string>(), quizzes: new Set<string>() };
    expect(readiness(none)).toBe(0);
    const all = {
      tried: new Set(DOMAINS.flatMap(domainPractice).filter((p) => p.kind === "example").map((p) => p.id)),
      passed: new Set(CHALLENGES.map((c) => c.id)),
      quizzes: new Set<string>(DOMAINS.map((d) => d.id)),
    };
    expect(readiness(all)).toBeCloseTo(1);
    // Passing only the biggest domain's quiz moves readiness more than the smallest one's.
    const apps = readiness({ ...none, quizzes: new Set(["apps"]) });
    const evalQuiz = readiness({ ...none, quizzes: new Set(["eval"]) });
    expect(apps).toBeGreaterThan(evalQuiz);
    const d = DOMAINS.find((x) => x.id === "eval")!;
    expect(domainProgress(d, { ...none, quizzes: new Set(["eval"]) })).toEqual({ done: 1, total: domainPractice(d).length + 1, share: 1 / (domainPractice(d).length + 1) });
  });
});

describe("quizzes", () => {
  const all = Object.entries(QUIZZES).flatMap(([domain, qs]) => qs.map((q) => ({ domain, q })));
  const HOSTS = ["platform.claude.com", "code.claude.com", "www.anthropic.com", "modelcontextprotocol.io"];

  it("has a quiz of at least four questions for every domain", () => {
    for (const d of DOMAINS) expect(QUIZZES[d.id].length).toBeGreaterThanOrEqual(4);
  });

  it.each(all.map(({ domain, q }) => [`${domain}/${q.id}`, q] as const))("%s is well-formed and sourced", (_id, q) => {
    expect(q.options.length).toBeGreaterThanOrEqual(3);
    expect(new Set(q.options).size).toBe(q.options.length);
    expect(q.answer.length).toBeGreaterThan(0);
    expect(q.answer.every((i) => Number.isInteger(i) && i >= 0 && i < q.options.length)).toBe(true);
    expect(new Set(q.answer).size).toBe(q.answer.length);
    // Multiple-response items say how many to pick, like the exam does.
    if (q.answer.length > 1) expect(q.prompt).toContain(`Choose ${q.answer.length}`);
    else expect(q.prompt).not.toMatch(/Choose \d/);
    const url = new URL(q.source.url);
    expect(url.protocol).toBe("https:");
    expect(HOSTS).toContain(url.hostname);
    expect(q.explain.length).toBeGreaterThan(20);
  });

  it("uses unique question ids", () => {
    const ids = all.map(({ q }) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("grades exactly the right set of options", () => {
    const q = QUIZZES.agents.find((x) => x.answer.length === 2)!;
    expect(isCorrect(q, [...q.answer].reverse())).toBe(true);
    expect(isCorrect(q, [q.answer[0]])).toBe(false);
    expect(isCorrect(q, [...q.answer, 3].filter((v, i, a) => a.indexOf(v) === i))).toBe(q.answer.includes(3));
  });

  it("shuffles options the same way every time, so the answer isn't always first", () => {
    for (const { q } of all) {
      const order = optionOrder(q.id, q.options.length);
      expect([...order].sort()).toEqual(q.options.map((_, i) => i));
      expect(optionOrder(q.id, q.options.length)).toEqual(order);
    }
    const firstShown = all.filter(({ q }) => q.answer.includes(optionOrder(q.id, q.options.length)[0])).length;
    expect(firstShown / all.length).toBeLessThan(0.6);
  });
});

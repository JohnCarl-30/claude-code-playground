import { CHALLENGES } from "@/lib/challenges";
import { addDays, buildPlan, daysBetween, practiceQueue, taskDone, MINUTES } from "@/lib/study-plan";

const none = { tried: new Set<string>(), passed: new Set<string>(), quizzes: new Set<string>() };
const status = (extra: Partial<Parameters<typeof taskDone>[2]> = {}) => ({ ...none, examsTakenOn: [], checked: new Set<string>(), ...extra });

describe("dates", () => {
  it("adds days across months and counts days between dates", () => {
    expect(addDays("2026-09-29", 3)).toBe("2026-10-02");
    expect(daysBetween("2026-09-26", "2026-10-24")).toBe(28);
    expect(daysBetween("2026-09-26", "2026-09-26")).toBe(0);
  });
});

describe("practice queue", () => {
  it("starts with the heaviest unpracticed domain and skips what's done", () => {
    const queue = practiceQueue(none);
    expect(queue[0].domain).toBe("apps");
    expect(new Set(queue.map((t) => t.id)).size).toBe(queue.length); // shared items appear once
    const passed = new Set(CHALLENGES.map((c) => c.id));
    expect(practiceQueue({ ...none, passed }).some((t) => t.kind === "challenge")).toBe(false);
  });
});

describe("buildPlan", () => {
  const plan = buildPlan({ today: "2026-09-26", examDate: "2026-10-24", minutesPerDay: 60, progress: none });

  it("plans every day up to the day before the exam", () => {
    expect(plan.days).toHaveLength(28);
    expect(plan.days[0].date).toBe("2026-09-26");
    expect(plan.days.at(-1)!.date).toBe("2026-10-23");
  });

  it("starts with a baseline mock exam, repeats weekly, and ends with one", () => {
    const mockDays = plan.days.flatMap((d, i) => (d.tasks.some((t) => t.kind === "mock-exam") ? [i] : []));
    expect(mockDays).toEqual([0, 7, 14, 21, 27]);
    expect(plan.days[0].tasks[0].label).toBe("Baseline mock exam");
    // The last day is the final mock exam only: no new material.
    expect(plan.days.at(-1)!.tasks.map((t) => t.kind)).toEqual(["mock-exam"]);
  });

  it("adds mistakes rounds and keeps practice within the daily time", () => {
    expect(plan.days[2].tasks[0].kind).toBe("mistakes");
    for (const d of plan.days) {
      const practice = d.tasks.filter((t) => t.kind !== "mock-exam");
      if (!d.tasks.some((t) => t.kind === "mock-exam")) expect(practice.reduce((s, t) => s + t.minutes, 0)).toBeLessThanOrEqual(60);
    }
    expect(plan.days[1].tasks[0].domain).toBe("apps");
  });

  it("fills each day instead of stopping at the first item that doesn't fit", () => {
    for (const d of plan.days.slice(1, -1)) {
      if (d.tasks.some((t) => t.kind === "mock-exam")) continue;
      const free = 60 - d.tasks.reduce((s, t) => s + t.minutes, 0);
      // Whatever is left is smaller than anything still waiting nearby.
      expect(free).toBeLessThan(MINUTES.challengeBeginner);
    }
  });

  it("reports practice that doesn't fit, and schedules more with more time", () => {
    const short = buildPlan({ today: "2026-09-26", examDate: "2026-09-29", minutesPerDay: 30, progress: none });
    expect(short.unscheduled.length).toBeGreaterThan(0);
    const long = buildPlan({ today: "2026-09-26", examDate: "2026-12-26", minutesPerDay: 180, progress: none });
    expect(long.unscheduled).toEqual([]);
  });

  it("has nothing to plan when the exam is today", () => {
    expect(buildPlan({ today: "2026-09-26", examDate: "2026-09-26", minutesPerDay: 60, progress: none }).days).toEqual([]);
  });
});

describe("taskDone", () => {
  it("measures progress where it can, and accepts a tick otherwise", () => {
    const challenge = { id: "challenge:api-todos", kind: "challenge" as const, label: "", minutes: MINUTES.challengeBeginner, ref: "api-todos" };
    expect(taskDone(challenge, "2026-09-27", status())).toBe(false);
    expect(taskDone(challenge, "2026-09-27", status({ passed: new Set(["api-todos"]) }))).toBe(true);
    const mock = { id: "mock-exam:2026-10-03", kind: "mock-exam" as const, label: "", minutes: 120 };
    expect(taskDone(mock, "2026-10-03", status({ examsTakenOn: ["2026-09-26"] }))).toBe(false); // an earlier exam doesn't count
    expect(taskDone(mock, "2026-10-03", status({ examsTakenOn: ["2026-10-04"] }))).toBe(true);
    const mistakes = { id: "mistakes:2026-09-28", kind: "mistakes" as const, label: "", minutes: 15 };
    expect(taskDone(mistakes, "2026-09-28", status({ checked: new Set(["mistakes:2026-09-28"]) }))).toBe(true);
  });
});

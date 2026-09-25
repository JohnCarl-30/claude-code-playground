import { DOMAINS, domainPractice, domainProgress, isDone, type DomainId, type PracticeRef, type Progress } from "./certification";
import { findChallenge } from "./challenges";
import { findExample } from "./examples";
import { MOCK_EXAM } from "./mock-exam";

// A day-by-day study plan to your exam date: a baseline mock exam first, then
// your weakest, heaviest domains' examples, challenges and knowledge checks,
// with mistakes-deck rounds every few days and a mock exam each week.

export type TaskKind = "mock-exam" | "mistakes" | "example" | "challenge" | "quiz";
export type PlanTask = { id: string; kind: TaskKind; label: string; minutes: number; ref?: string; domain?: DomainId };
export type PlanDay = { date: string; tasks: PlanTask[] };
export type StudyPlan = {
  examDate: string;
  minutesPerDay: number;
  createdOn: string;
  days: PlanDay[];
  /** Practice that didn't fit before the exam. */
  unscheduled: PlanTask[];
};

/** How far down the queue a day may reach to fill its remaining time. */
const LOOKAHEAD = 8;

export const MINUTES = { example: 10, challengeBeginner: 25, challengeIntermediate: 40, quiz: 15, mistakes: 15, mockExam: MOCK_EXAM.minutes };

/** "2026-09-26" for a local date. */
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

/** Days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string) {
  const [a, b] = [from, to].map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

function practiceTask(ref: PracticeRef, domain: DomainId): PlanTask | null {
  if (ref.kind === "example") {
    const e = findExample(ref.id);
    return e ? { id: `example:${ref.id}`, kind: "example", label: e.title, minutes: MINUTES.example, ref: ref.id, domain } : null;
  }
  const c = findChallenge(ref.id);
  if (!c) return null;
  const minutes = c.level === "Beginner" ? MINUTES.challengeBeginner : MINUTES.challengeIntermediate;
  return { id: `challenge:${ref.id}`, kind: "challenge", label: c.title, minutes, ref: ref.id, domain };
}

/** Everything left to practice, most valuable first: domains by unpracticed exam weight, then examples, challenges and the quiz. */
export function practiceQueue(progress: Progress): PlanTask[] {
  const seen = new Set<string>();
  const byPriority = [...DOMAINS].sort(
    (a, b) => b.weight * (1 - domainProgress(b, progress).share) - a.weight * (1 - domainProgress(a, progress).share),
  );
  const queue: PlanTask[] = [];
  for (const d of byPriority) {
    const refs = domainPractice(d).filter((p) => !isDone(p, progress));
    const ordered = [...refs.filter((p) => p.kind === "example"), ...refs.filter((p) => p.kind === "challenge")];
    for (const ref of ordered) {
      const task = practiceTask(ref, d.id);
      if (task && !seen.has(task.id)) {
        seen.add(task.id);
        queue.push(task);
      }
    }
    if (!progress.quizzes.has(d.id)) queue.push({ id: `quiz:${d.id}`, kind: "quiz", label: `Knowledge check: ${d.name}`, minutes: MINUTES.quiz, ref: d.id, domain: d.id });
  }
  return queue;
}

/**
 * Plan every day from `today` up to the day before `examDate`.
 * Mock exams: the first day, every 7 days after, and the last day (when there are at least 3 days).
 * Mistakes rounds: every third day that has no mock exam.
 */
export function buildPlan({
  today,
  examDate,
  minutesPerDay,
  progress,
}: {
  today: string;
  examDate: string;
  minutesPerDay: number;
  progress: Progress;
}): StudyPlan {
  const count = Math.max(0, daysBetween(today, examDate));
  const queue = practiceQueue(progress);
  const days: PlanDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(today, i);
    const tasks: PlanTask[] = [];
    const mock = i === 0 || i % 7 === 0 || (count >= 3 && i === count - 1);
    if (mock) tasks.push({ id: `mock-exam:${date}`, kind: "mock-exam", label: i === 0 ? "Baseline mock exam" : "Mock exam", minutes: MINUTES.mockExam });
    else if (i % 3 === 2) tasks.push({ id: `mistakes:${date}`, kind: "mistakes", label: "Mistakes deck: one round", minutes: MINUTES.mistakes });
    // The last day is for the final mock exam; don't start new material the day before the exam.
    const lastDay = count >= 3 && i === count - 1;
    let left = minutesPerDay - tasks.reduce((sum, t) => sum + t.minutes, 0);
    // A day with nothing else takes the next item even if it runs a little over.
    if (!lastDay && tasks.length === 0 && queue.length && left > 0 && queue[0].minutes > left) {
      const next = queue.shift()!;
      tasks.push(next);
      left -= next.minutes;
    }
    // Fill the day in priority order, looking a few items ahead for something that fits the time left.
    for (let j = 0; !lastDay && j < Math.min(queue.length, LOOKAHEAD) && left > 0; ) {
      if (queue[j].minutes <= left) {
        const [next] = queue.splice(j, 1);
        tasks.push(next);
        left -= next.minutes;
      } else {
        j++;
      }
    }
    days.push({ date, tasks });
  }
  return { examDate, minutesPerDay, createdOn: today, days, unscheduled: queue };
}

export type PlanStatus = Progress & { examsTakenOn: string[]; checked: ReadonlySet<string> };

/** Whether a task is done: measured from your progress where possible, or ticked by hand. */
export function taskDone(task: PlanTask, date: string, status: PlanStatus) {
  if (status.checked.has(task.id)) return true;
  switch (task.kind) {
    case "example":
      return status.tried.has(task.ref!);
    case "challenge":
      return status.passed.has(task.ref!);
    case "quiz":
      return status.quizzes.has(task.ref!);
    case "mock-exam":
      return status.examsTakenOn.some((d) => d >= date);
    default:
      return false;
  }
}

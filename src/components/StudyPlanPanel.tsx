"use client";

import { useState, useSyncExternalStore } from "react";
import { DOMAINS, EXAM, type Progress } from "@/lib/certification";
import { useExamState } from "@/lib/exam-store";
import { localStore } from "@/lib/local-store";
import { CERT, CERT_EXAM, CERT_MISTAKES, CHALLENGE } from "@/lib/selection";
import { addDays, buildPlan, dateKey, daysBetween, taskDone, type PlanStatus, type PlanTask, type StudyPlan } from "@/lib/study-plan";

type Saved = { plan: StudyPlan | null; checked: string[] };

const planStore = localStore<Saved>("claude-code-playground:study-plan:v1", { plan: null, checked: [] }, (raw) => {
  const r = (raw ?? {}) as Partial<Saved>;
  return { plan: r.plan && Array.isArray(r.plan.days) ? r.plan : null, checked: Array.isArray(r.checked) ? r.checked.filter((x) => typeof x === "string") : [] };
});

// Today's date, updated when the day changes (checked every minute).
let todayCache = "";
function readToday() {
  const now = dateKey(new Date());
  if (now !== todayCache) todayCache = now;
  return todayCache;
}
function subscribeToday(listener: () => void) {
  const timer = setInterval(listener, 60_000);
  return () => clearInterval(timer);
}
const useToday = () => useSyncExternalStore(subscribeToday, readToday, () => "");

const ICON: Record<PlanTask["kind"], string> = { "mock-exam": "⏱", mistakes: "↺", example: "▷", challenge: "◇", quiz: "?" };

const prettyDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

function openTarget(task: PlanTask) {
  switch (task.kind) {
    case "mock-exam":
      return CERT_EXAM;
    case "mistakes":
      return CERT_MISTAKES;
    case "challenge":
      return CHALLENGE + task.ref;
    case "quiz":
      return CERT + task.ref;
    default:
      return task.ref!;
  }
}

function Setup({ today, onBuild, current }: { today: string; onBuild: (examDate: string, minutes: number) => void; current?: StudyPlan }) {
  // Your pick, or a default 4 weeks out. "today" is empty until the page hydrates, so the default is worked out on each render.
  const [picked, setExamDate] = useState<string | null>(current?.examDate ?? null);
  const examDate = picked ?? (today ? addDays(today, 28) : "");
  const [minutes, setMinutes] = useState(current?.minutesPerDay ?? 60);
  const valid = !!today && !!examDate && daysBetween(today, examDate) >= 1;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onBuild(examDate, minutes);
      }}
      className="flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Exam date</span>
        <input
          type="date"
          value={examDate}
          min={today ? addDays(today, 1) : undefined}
          onChange={(e) => setExamDate(e.target.value)}
          className="h-9 rounded-lg border border-line bg-surface px-2"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Time per day</span>
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2">
          {[30, 45, 60, 90, 120, 180].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!valid} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {current ? "Rebuild my plan" : "Build my plan"}
      </button>
      {!valid && examDate && today && <p className="w-full text-xs text-danger">Pick a date after today.</p>}
    </form>
  );
}

/** Your day-by-day plan to the exam, built from your progress; tasks tick themselves off as you do them. */
export function StudyPlanPanel({ progress, onOpen }: { progress: Progress; onOpen: (id: string) => void }) {
  const { plan, checked } = planStore.useValue();
  const { history } = useExamState();
  const today = useToday();
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const status: PlanStatus = { ...progress, examsTakenOn: history.map((h) => dateKey(new Date(h.finishedAt))), checked: new Set(checked) };

  function build(examDate: string, minutesPerDay: number) {
    planStore.update((s) => ({ ...s, plan: buildPlan({ today, examDate, minutesPerDay, progress }) }));
    setEditing(false);
  }
  const toggle = (id: string) =>
    planStore.update((s) => ({ ...s, checked: s.checked.includes(id) ? s.checked.filter((x) => x !== id) : [...s.checked, id] }));

  const header = (
    <header className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-accent">Certification track · {EXAM.code}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Study plan</h1>
      <p className="max-w-3xl text-muted">
        A day-by-day plan to your exam: a baseline mock exam first, then your weakest, heaviest domains, with mistakes-deck rounds every few days and a mock
        exam each week. Tasks tick themselves off as you pass challenges, try examples, pass quizzes and take mock exams.
      </p>
    </header>
  );

  if (!plan || editing) {
    return (
      <div className="space-y-6">
        {header}
        <Setup today={today} onBuild={build} current={plan ?? undefined} />
        {editing && (
          <button onClick={() => setEditing(false)} className="text-sm text-accent hover:underline">
            Keep the current plan
          </button>
        )}
      </div>
    );
  }

  const all = plan.days.flatMap((d) => d.tasks.map((t) => ({ t, date: d.date })));
  const doneCount = all.filter(({ t, date }) => taskDone(t, date, status)).length;
  const daysLeft = today ? daysBetween(today, plan.examDate) : 0;
  const todayPlan = plan.days.find((d) => d.date === today);
  const behind = plan.days.filter((d) => d.date < today).flatMap((d) => d.tasks.filter((t) => !taskDone(t, d.date, status)));
  const upcoming = plan.days.filter((d) => d.date > today);
  const domainName = (id?: string) => DOMAINS.find((d) => d.id === id)?.name;

  const taskRow = (t: PlanTask, date: string) => {
    const doneNow = taskDone(t, date, status);
    return (
      <li key={t.id} className="flex items-center gap-3 py-2">
        <input
          type="checkbox"
          checked={doneNow}
          onChange={() => toggle(t.id)}
          aria-label={`Done: ${t.label}`}
          className="size-4 shrink-0 accent-accent"
        />
        <span aria-hidden className="w-4 shrink-0 text-center text-xs text-muted">
          {ICON[t.kind]}
        </span>
        <button onClick={() => onOpen(openTarget(t))} className={`min-w-0 flex-1 text-left hover:text-accent hover:underline ${doneNow ? "text-muted line-through" : ""}`}>
          {t.label}
          {t.domain && t.kind !== "quiz" && <span className="ml-2 text-xs text-muted no-underline">{domainName(t.domain)}</span>}
        </button>
        <span className="shrink-0 text-xs tabular-nums text-muted">{t.minutes} min</span>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {header}

      <section aria-label="Plan progress" className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-5">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} to your exam` : daysLeft === 0 ? "Exam day. Good luck!" : "Your exam date has passed"} ·{" "}
            {prettyDate(plan.examDate)}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full bg-ok" style={{ width: `${all.length ? (doneCount / all.length) * 100 : 0}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {doneCount}/{all.length} tasks done · {plan.minutesPerDay} min a day
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">
          Change date or time
        </button>
        <button
          onClick={() => build(plan.examDate, plan.minutesPerDay)}
          disabled={daysBetween(today, plan.examDate) < 1}
          className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
          title="Plans the remaining days again from today, using your current progress"
        >
          Rebuild from today
        </button>
      </section>

      {behind.length > 0 && (
        <p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {behind.length} task{behind.length === 1 ? "" : "s"} from earlier days {behind.length === 1 ? "isn't" : "aren't"} done yet. Do them today, or rebuild
          the plan from today to spread them out.
        </p>
      )}
      {plan.unscheduled.length > 0 && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          {plan.unscheduled.length} practice item{plan.unscheduled.length === 1 ? "" : "s"} didn&apos;t fit before the exam. More time per day would cover
          them; the plan starts with what matters most.
        </p>
      )}

      <section aria-label="Today" className="rounded-2xl border border-accent/40 bg-surface p-5">
        <h2 className="font-medium">Today{today ? ` · ${prettyDate(today)}` : ""}</h2>
        {todayPlan?.tasks.length ? (
          <ul className="mt-1 divide-y divide-line text-sm">{todayPlan.tasks.map((t) => taskRow(t, todayPlan.date))}</ul>
        ) : (
          <p className="mt-1 text-sm text-muted">{todayPlan ? "Nothing planned today: rest, or clear your mistakes deck." : "Today isn't in this plan."}</p>
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-label="Coming up" className="space-y-2">
          <h2 className="font-medium">Coming up</h2>
          <ol className="space-y-2">
            {(showAll ? upcoming : upcoming.slice(0, 6)).map((d) => (
              <li key={d.date} className="rounded-xl border border-line bg-surface px-4 py-2">
                <p className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{prettyDate(d.date)}</span>
                  <span className="text-xs tabular-nums text-muted">{d.tasks.reduce((sum, t) => sum + t.minutes, 0)} min</span>
                </p>
                {d.tasks.length ? <ul className="divide-y divide-line text-sm">{d.tasks.map((t) => taskRow(t, d.date))}</ul> : <p className="py-1 text-sm text-muted">Rest day.</p>}
              </li>
            ))}
          </ol>
          {upcoming.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} className="text-sm text-accent hover:underline">
              {showAll ? "Show less" : `Show all ${upcoming.length} days`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

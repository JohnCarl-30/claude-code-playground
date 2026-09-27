"use client";

import { useEffect, useState } from "react";
import { DOMAINS, EXAM, type SkillId } from "@/lib/certification";
import { examActions, useExamState, type Attempt, type PastExam } from "@/lib/exam-store";
import {
  blueprintCounts,
  findObjective,
  findQuestion,
  MOCK_EXAM,
  OBJECTIVES,
  objectiveRoom,
  PASS_SHARE,
  testMinutes,
  weakObjectives,
  type DomainScore,
} from "@/lib/mock-exam";
import { isCorrect, QUIZZES } from "@/lib/quizzes";
import { QuestionCard } from "./QuizPanel";

const domainOf = (id: string) => DOMAINS.find((d) => d.id === id)!;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const weak = (s: DomainScore) => s.correct / s.total < PASS_SHARE;

/** Custom test lengths: a quick check, about half an exam, a longer review, and a full exam's worth. */
export const LENGTHS = [10, 25, 37, 53];

const chip = (on: boolean) =>
  `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
    on ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"
  }`;

/** Build a test: how long, which objectives, timed or not, exam-style only or with detail questions. */
function CustomTest({ history }: { history: PastExam[] }) {
  const [items, setItems] = useState(37);
  const [scope, setScope] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<SkillId[]>([]);
  const [timed, setTimed] = useState(true);
  const [detail, setDetail] = useState(false);

  // Weak objectives: below the pass share across your last five tests.
  const weakOnes = weakObjectives(history.slice(0, 5).flatMap((h) => (h.byObjective ? [h.byObjective] : [])));
  const room = objectiveRoom(detail);
  const objectives = scope === "all" ? OBJECTIVES.map((o) => o.id) : picked;
  const available = objectives.filter((id) => room[id] > 0);
  const count = Math.min(items, available.reduce((sum, id) => sum + room[id], 0));
  const covered = Math.min(count, available.length);
  const minutes = testMinutes(count);
  const toggle = (id: SkillId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <section aria-labelledby="custom-test" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="space-y-1">
        <h2 id="custom-test" className="text-lg font-semibold">
          Custom test
        </h2>
        <p className="text-sm text-muted">
          Build a test whenever you like, from the same checked questions. With all {OBJECTIVES.length} objectives, every one gets at least one question
          once the test is long enough, and the rest follow the exam&apos;s weights. You&apos;re scored per objective, the way the real score report breaks
          results down, so a weak area shows up by name.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Length</legend>
        <div className="flex flex-wrap gap-2">
          {LENGTHS.map((n) => (
            <label key={n} className={chip(items === n)}>
              <input type="radio" name="test-length" checked={items === n} onChange={() => setItems(n)} className="sr-only" />
              {n} questions
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Objectives</legend>
        <div className="flex flex-wrap gap-2">
          <label className={chip(scope === "all")}>
            <input type="radio" name="test-scope" checked={scope === "all"} onChange={() => setScope("all")} className="sr-only" />
            All {OBJECTIVES.length}
          </label>
          <label className={chip(scope === "pick")}>
            <input type="radio" name="test-scope" checked={scope === "pick"} onChange={() => setScope("pick")} className="sr-only" />
            Only the ones I pick
          </label>
          {weakOnes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setScope("pick");
                setPicked(weakOnes);
              }}
              className="h-8 rounded-full border border-danger/40 px-3 text-sm text-danger hover:bg-danger-soft"
            >
              My weak objectives ({weakOnes.length})
            </button>
          )}
        </div>
        {scope === "pick" && (
          <div className="space-y-3 pt-2">
            {DOMAINS.map((d) => (
              <fieldset key={d.id}>
                <legend className="mb-1.5 text-xs text-muted">
                  {d.number} · {d.name}
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {d.skills.map((sk) => (
                    <label key={sk.id} className={chip(picked.includes(sk.id))}>
                      <input
                        type="checkbox"
                        checked={picked.includes(sk.id)}
                        disabled={room[sk.id] === 0}
                        onChange={() => toggle(sk.id)}
                        className="sr-only"
                      />
                      {sk.name}
                      <span title={`${room[sk.id]} questions to draw from`} className="text-xs tabular-nums text-muted">
                        {room[sk.id]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
      </fieldset>

      <div className="space-y-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} className="accent-accent" />
          <span>Timed at the real exam&apos;s pace ({minutes} minutes)</span>
        </label>
        <label className="flex items-start gap-2 [&>input]:mt-1">
          <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} className="accent-accent" />
          <span>
            Include <em>detail</em> questions (names, numbers, syntax), not just exam-style scenarios
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => examActions.startCustom(newSeed(), { items, objectives, detail, timed })}
          disabled={count === 0}
          className="h-10 rounded-lg bg-accent px-4 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Start the custom test
        </button>
        <p className="text-sm text-muted" aria-live="polite">
          {count === 0
            ? "Pick at least one objective."
            : `${count} questions across ${covered} ${covered === 1 ? "objective" : "objectives"}${timed ? `, ${minutes} minutes` : ", untimed"}${
                count < items ? ` (all there are for ${scope === "all" ? "these settings" : "the ones you picked"})` : ""
              }.`}
        </p>
      </div>
    </section>
  );
}

function Intro({ history, onDomain }: { history: PastExam[]; onDomain: (id: string) => void }) {
  const counts = blueprintCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const bank = DOMAINS.reduce((sum, d) => sum + QUIZZES[d.id].length, 0);
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Certification track · {EXAM.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Practice tests</h1>
        <p className="max-w-3xl text-muted">
          Take the full mock exam, shaped like the real one, or build a custom test on the objectives you choose. Either way you answer one question at a
          time and can flag any to come back to. At the end you see your percent correct by domain and by objective, like the real score report, and every
          question explained with a link to its source.
        </p>
        <p className="text-sm text-muted">
          Questions come from a bank of {bank} written for this playground and checked against the official docs; they aren&apos;t real exam items. Each
          attempt draws a different set, exam-style questions first: scenarios you reason through in plain words, no code or parameter names.
        </p>
      </header>

      <section aria-labelledby="mock-exam" className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <div className="space-y-1">
          <h2 id="mock-exam" className="text-lg font-semibold">
            Mock exam
          </h2>
          <p className="text-sm text-muted">
            {total} questions in {MOCK_EXAM.minutes} minutes, drawn from each domain in proportion to its weight and spread across its objectives. You
            get an estimated score on the exam&apos;s 100–1,000 scale.
          </p>
        </div>
        <div aria-label="Questions per domain" role="group">
          <p className="mb-2 text-sm font-medium">Questions per domain</p>
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {DOMAINS.map((d) => (
              <li key={d.id} className="flex items-baseline gap-2">
                <span className="w-4 font-mono text-xs text-muted">{d.number}</span>
                <button onClick={() => onDomain(d.id)} className="min-w-0 flex-1 text-left hover:text-accent hover:underline">
                  {d.name}
                </button>
                <span className="tabular-nums text-muted">{counts[d.id]}</span>
              </li>
            ))}
          </ul>
        </div>
        <button onClick={() => examActions.start(newSeed())} className="h-10 rounded-lg bg-accent px-4 font-medium text-white hover:opacity-90">
          Start the mock exam ({MOCK_EXAM.minutes} minutes)
        </button>
      </section>

      <CustomTest history={history} />

      {history.length > 0 && (
        <section aria-label="Past results" className="space-y-2">
          <h2 className="font-medium">Past results</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
            {history.map((h) => {
              const custom = h.kind === "custom";
              return (
                <li key={h.finishedAt} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5">
                  <span className="text-muted">{new Date(h.finishedAt).toLocaleString()}</span>
                  <span className="text-muted">{custom ? "Custom test" : "Mock exam"}</span>
                  {custom ? (
                    <span className="font-medium tabular-nums">{pct(h.correct, h.total)}%</span>
                  ) : (
                    <>
                      <span className="font-medium tabular-nums">{h.scaled}</span>
                      <span className={h.passed ? "text-ok" : "text-danger"}>{h.passed ? "pass" : "not yet"}</span>
                    </>
                  )}
                  <span className="ml-auto tabular-nums text-muted">
                    {h.correct}/{h.total} · {h.minutes} min
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

const KIND_LABEL: Record<Attempt["kind"], string> = { exam: "Mock exam", custom: "Custom test", retry: "Retry what you missed" };

function Taking({ attempt }: { attempt: Attempt }) {
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const timed = !!attempt.endsAt;

  // Tick every second; when time is up, the exam ends itself (also after a reload).
  useEffect(() => {
    if (!attempt.endsAt) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= attempt.endsAt!) examActions.finish(t);
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [attempt.endsAt]);

  const items = attempt.items;
  const item = items[Math.min(index, items.length - 1)];
  const q = findQuestion(item.id)!.question;
  const answered = (id: string) => (attempt.answers[id] ?? []).length > 0;
  const unanswered = items.filter((i) => !answered(i.id)).length;
  const flagged = attempt.flagged.includes(item.id);
  const left = timed && now !== null ? attempt.endsAt! - now : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">{KIND_LABEL[attempt.kind]}</p>
          <h1 className="text-xl font-semibold tracking-tight">
            Question {index + 1} of {items.length}
          </h1>
        </div>
        {timed && (
          <p
            role="timer"
            aria-label="Time left"
            className={`rounded-lg px-3 py-1.5 font-mono text-sm tabular-nums ${left !== null && left < 10 * 60_000 ? "bg-danger-soft text-danger" : "bg-surface-2"}`}
          >
            ⏱ {left === null ? "…" : clock(left)}
          </p>
        )}
        <button onClick={() => setConfirming(true)} className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">
          {attempt.kind === "exam" ? "Finish exam" : attempt.kind === "custom" ? "Finish test" : "Check answers"}
        </button>
      </header>

      {confirming && (
        <div role="alertdialog" aria-label="Finish?" className="flex flex-wrap items-center gap-3 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span className="min-w-0 flex-1">
            {unanswered ? `${unanswered} unanswered` : "Everything answered"}
            {attempt.flagged.length ? `, ${attempt.flagged.length} flagged` : ""}. Finish now?
          </span>
          <button
            onClick={() => examActions.finish()}
            className="h-8 rounded-lg bg-accent px-3 font-medium text-white hover:opacity-90"
          >
            Finish
          </button>
          <button onClick={() => setConfirming(false)} className="h-8 rounded-lg border border-line bg-surface px-3 font-medium text-ink">
            Keep going
          </button>
        </div>
      )}

      <QuestionCard
        key={q.id}
        q={q}
        n={index + 1}
        picked={attempt.answers[item.id] ?? []}
        onPick={(next) => examActions.answer(item.id, next)}
        checked={false}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          onClick={() => examActions.toggleFlag(item.id)}
          aria-pressed={flagged}
          className={`h-9 rounded-lg border px-3 text-sm font-medium ${flagged ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"}`}
        >
          ⚑ {flagged ? "Flagged" : "Flag for review"}
        </button>
        <button
          onClick={() => (index < items.length - 1 ? setIndex(index + 1) : setConfirming(true))}
          className="ml-auto h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90"
        >
          {index < items.length - 1 ? "Next →" : "Finish…"}
        </button>
      </div>

      <nav aria-label="All questions" className="rounded-xl border border-line bg-surface p-3">
        <p className="mb-2 text-xs text-muted">
          {items.length - unanswered}/{items.length} answered · {attempt.flagged.length} flagged
        </p>
        <ol className="flex flex-wrap gap-1.5">
          {items.map((it, i) => {
            const isFlagged = attempt.flagged.includes(it.id);
            const done = answered(it.id);
            return (
              <li key={it.id}>
                <button
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? "true" : undefined}
                  aria-label={`Question ${i + 1}${done ? ", answered" : ""}${isFlagged ? ", flagged" : ""}`}
                  className={`relative grid size-8 place-items-center rounded-md border text-xs tabular-nums ${
                    i === index ? "ring-2 ring-accent" : ""
                  } ${done ? "border-transparent bg-ink/80 text-bg" : "border-line hover:bg-surface-2"}`}
                >
                  {i + 1}
                  {isFlagged && <span aria-hidden className="absolute -right-1 -top-1 text-[10px] text-accent">⚑</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

/** Percent correct per domain, and per objective within it, like the real score report. */
function ScoreReport({ attempt, onDomain }: { attempt: Attempt; onDomain: (id: string) => void }) {
  const result = attempt.result!;
  const byObjective = result.byObjective ?? {};
  return (
    <section aria-label="Percent correct by domain and objective" className="rounded-2xl border border-line bg-surface p-5">
      <p className="mb-3 font-medium">Percent correct by domain and objective</p>
      <ul className="space-y-4">
        {DOMAINS.filter((d) => result.byDomain[d.id]).map((d) => {
          const s = result.byDomain[d.id]!;
          const p = pct(s.correct, s.total);
          const objectives = d.skills.filter((sk) => byObjective[sk.id]);
          return (
            <li key={d.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="w-4 font-mono text-xs text-muted">{d.number}</span>
                <button onClick={() => onDomain(d.id)} className="min-w-0 flex-1 text-left font-medium hover:text-accent hover:underline">
                  {d.name}
                </button>
                <span className="tabular-nums text-muted">
                  {s.correct}/{s.total} · {p}%
                </span>
              </div>
              <div className="ml-6 mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className={`h-full rounded-full ${weak(s) ? "bg-danger" : "bg-ok"}`} style={{ width: `${p}%` }} />
              </div>
              {objectives.length > 0 && (
                <ul aria-label={`${d.name} objectives`} className="ml-6 mt-2 space-y-1">
                  {objectives.map((sk) => {
                    const o = byObjective[sk.id]!;
                    return (
                      <li key={sk.id} className="flex items-baseline gap-2 text-xs">
                        <span className="min-w-0 flex-1 text-muted">{sk.name}</span>
                        {weak(o) && <span className="rounded-full bg-danger-soft px-1.5 text-danger">weak</span>}
                        <span className="tabular-nums text-muted">
                          {o.correct}/{o.total}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Marked <span className="text-danger">weak</span> below about {Math.round(PASS_SHARE * 100)}% correct, the pass mark on our estimate. Like the real
        score report, these help you decide what to study; the pass mark applies to the total only.
      </p>
    </section>
  );
}

function Results({ attempt, onDomain, onMistakes }: { attempt: Attempt; onDomain: (id: string) => void; onMistakes?: () => void }) {
  const [filter, setFilter] = useState<"all" | "missed" | "flagged">("missed");
  const result = attempt.result!;
  const missed = attempt.items.filter((i) => !isCorrect(findQuestion(i.id)!.question, attempt.answers[i.id] ?? []));
  const shown = attempt.items
    .map((item, i) => ({ item, n: i + 1 }))
    .filter(({ item }) => (filter === "all" ? true : filter === "missed" ? missed.includes(item) : attempt.flagged.includes(item.id)));
  const exam = attempt.kind === "exam";
  const custom = attempt.kind === "custom";
  const minutes = Math.max(1, Math.round(((attempt.finishedAt ?? attempt.startedAt) - attempt.startedAt) / 60_000));
  const share = pct(result.correct, result.total);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">{exam ? "Mock exam results" : custom ? "Custom test results" : "Retry results"}</p>
        {exam ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="tabular-nums">{result.scaled}</span>
              <span className="text-lg font-normal text-muted"> / 1,000 estimated</span>
            </h1>
            <p className={`font-medium ${result.passed ? "text-ok" : "text-danger"}`}>
              {result.passed ? `Above the ${MOCK_EXAM.pass} passing mark.` : `Below the ${MOCK_EXAM.pass} passing mark. Keep practicing the domains below.`}
            </p>
          </>
        ) : custom ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span className="tabular-nums">{share}%</span>
              <span className="text-lg font-normal text-muted"> correct</span>
            </h1>
            <p className={`font-medium ${result.correct / result.total >= PASS_SHARE ? "text-ok" : "text-danger"}`}>
              {result.correct / result.total >= PASS_SHARE
                ? `At or above about ${Math.round(PASS_SHARE * 100)}%, the pass mark on our estimate.`
                : `Below about ${Math.round(PASS_SHARE * 100)}%, the pass mark on our estimate. Work on the objectives marked weak.`}
            </p>
          </>
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">
            {result.correct}/{result.total} right this time
          </h1>
        )}
        <p className="text-sm text-muted">
          {result.correct}/{result.total} correct ({share}%) in {minutes} min.
          {exam && " The score is an estimate: we map your share correct onto 100–1,000 in a straight line. The real exam's scaling isn't published."}
        </p>
      </header>

      <ScoreReport attempt={attempt} onDomain={onDomain} />

      <div className="flex flex-wrap gap-2">
        {missed.length > 0 && (
          <button onClick={() => examActions.retry(missed)} className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
            ↻ Retry the {missed.length} I missed
          </button>
        )}
        {custom && attempt.spec ? (
          <button
            onClick={() => examActions.startCustom(newSeed(), attempt.spec!)}
            className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2"
          >
            New test, same settings
          </button>
        ) : (
          <button onClick={() => examActions.start(newSeed())} className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2">
            New mock exam
          </button>
        )}
        <button onClick={() => examActions.close()} className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface-2">
          Done
        </button>
      </div>
      {missed.length > 0 && onMistakes && (
        <p className="text-sm text-muted">
          The questions you missed are also in your{" "}
          <button onClick={onMistakes} className="text-accent hover:underline">
            mistakes deck
          </button>
          , to practice until each is right twice in a row.
        </p>
      )}

      <section aria-label="Review" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-lg font-semibold">Review</h2>
          {(
            [
              ["missed", `Missed (${missed.length})`],
              ["flagged", `Flagged (${attempt.flagged.length})`],
              ["all", `All (${attempt.items.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`h-8 rounded-full border px-3 text-xs font-medium ${filter === id ? "border-accent bg-accent-soft text-accent" : "border-line hover:bg-surface-2"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="text-sm text-muted">Nothing here.</p>}
        {shown.map(({ item, n }) => {
          const d = domainOf(item.domain);
          const q = findQuestion(item.id)!.question;
          return (
            <QuestionCard
              key={item.id}
              q={q}
              n={n}
              picked={attempt.answers[item.id] ?? []}
              onPick={() => {}}
              checked
              tag={`Domain ${d.number} · ${findObjective(q.skill)?.name ?? d.name}${attempt.flagged.includes(item.id) ? " · ⚑ flagged" : ""}`}
            />
          );
        })}
      </section>
    </div>
  );
}

/** Practice tests: the mock exam and custom tests, your past results, the test itself, then results and a review. */
export function MockExamPanel({ onDomain, onMistakes }: { onDomain: (id: string) => void; onMistakes?: () => void }) {
  const { current, history } = useExamState();
  if (!current || current.items.length === 0) return <Intro history={history} onDomain={onDomain} />;
  if (current.finishedAt) return <Results attempt={current} onDomain={onDomain} onMistakes={onMistakes} />;
  return <Taking key={current.startedAt} attempt={current} />;
}

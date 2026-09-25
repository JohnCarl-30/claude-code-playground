/** @jest-environment jsdom */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MistakesPanel } from "@/components/MistakesPanel";
import { optionOrder } from "@/components/QuizPanel";
import { examActions } from "@/lib/exam-store";
import { MASTERED_AFTER, practiceSet, recordAnswers } from "@/lib/mistakes";
import { findQuestion } from "@/lib/mock-exam";
import { QUIZZES } from "@/lib/quizzes";

const KEY = "claude-code-playground:mistakes:v1";
const deck = () => JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { misses: number; streak: number }>;
const [a, b, c] = QUIZZES.models.map((q) => q.id);

beforeEach(() => {
  localStorage.clear();
  act(() => examActions.close());
});

describe("mistakes deck", () => {
  it("adds wrong answers, and clears a question after it's right twice in a row", () => {
    act(() => void recordAnswers([{ id: a, right: false }, { id: b, right: true }]));
    expect(Object.keys(deck())).toEqual([a]); // right answers to questions not in the deck don't add them
    act(() => void recordAnswers([{ id: a, right: true }]));
    expect(deck()[a]).toMatchObject({ misses: 1, streak: 1 });
    act(() => void recordAnswers([{ id: a, right: false }])); // a miss resets the streak
    expect(deck()[a]).toMatchObject({ misses: 2, streak: 0 });
    for (let i = 0; i < MASTERED_AFTER; i++) act(() => void recordAnswers([{ id: a, right: true }]));
    expect(deck()).toEqual({});
  });

  it("practices the least-progressed, most-missed questions first", () => {
    const d = { [a]: { misses: 1, streak: 1, lastMissed: 1 }, [b]: { misses: 3, streak: 0, lastMissed: 2 }, [c]: { misses: 1, streak: 0, lastMissed: 3 } };
    expect(practiceSet(d, 2)).toEqual([b, c]);
  });

  it("forgets questions that no longer exist", () => {
    localStorage.setItem(KEY, JSON.stringify({ "no-such-question": { misses: 1, streak: 0, lastMissed: 0 }, [a]: { misses: 1, streak: 0, lastMissed: 0 } }));
    render(<MistakesPanel onExam={jest.fn()} onDomain={jest.fn()} />);
    expect(screen.getByText("1 question to clear")).toBeInTheDocument();
  });

  it("collects what you missed in a mock exam", () => {
    act(() => {
      examActions.start(9);
      examActions.finish();
    });
    const exam = JSON.parse(localStorage.getItem("claude-code-playground:mock-exam:v1")!).current.items as { id: string }[];
    expect(Object.keys(deck()).sort()).toEqual(exam.map((i) => i.id).sort()); // nothing answered = everything missed
  });
});

describe("MistakesPanel", () => {
  it("shows an empty state that points to the mock exam", async () => {
    const onExam = jest.fn();
    render(<MistakesPanel onExam={onExam} onDomain={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Take the mock exam" }));
    expect(onExam).toHaveBeenCalled();
  });

  it("runs a round: answer, check, and see progress toward clearing", async () => {
    act(() => void recordAnswers([{ id: a, right: false }, { id: b, right: false }]));
    render(<MistakesPanel onExam={jest.fn()} onDomain={jest.fn()} />);
    expect(screen.getByText("2 questions to clear")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Practice 2" }));

    // Both were missed at the same moment with the same stats, so the round keeps their order: a, then b.
    // Answer the first one right and leave the second unanswered.
    const round = screen.getByRole("region", { name: "Round" });
    const first = within(round).getAllByRole("group")[0];
    const shown = findQuestion(a)!.question;
    const inputs = within(first).getAllByRole(shown.answer.length > 1 ? "checkbox" : "radio");
    for (const i of shown.answer) await userEvent.click(inputs[optionOrder(shown.id, shown.options.length).indexOf(i)]);
    await userEvent.click(screen.getByRole("button", { name: /Check answers/ }));

    expect(screen.getByRole("status")).toHaveTextContent("1/2 right.");
    expect(within(first).getByText(new RegExp(`1/${MASTERED_AFTER} toward clearing`))).toBeInTheDocument();
    expect(deck()[shown.id].streak).toBe(1);
    expect(screen.getByRole("button", { name: "Next round" })).toBeInTheDocument();
  });
});

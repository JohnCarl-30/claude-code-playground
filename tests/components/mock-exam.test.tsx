/** @jest-environment jsdom */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockExamPanel } from "@/components/MockExamPanel";
import { optionOrder } from "@/components/QuizPanel";
import { examActions } from "@/lib/exam-store";
import { findQuestion, MOCK_EXAM } from "@/lib/mock-exam";

const KEY = "claude-code-playground:mock-exam:v1";

// These walk through whole tests click by click; on a busy machine running the full suite in
// parallel they can take longer than Jest's 5-second default.
jest.setTimeout(20_000);
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

beforeEach(() => {
  localStorage.clear();
  act(() => examActions.close());
});

/** Click the right answer to the question on screen. */
async function answerCurrent(right = true) {
  const n = Number(/Question (\d+) of/.exec(screen.getByRole("heading", { level: 1 }).textContent ?? "")?.[1]);
  const id = saved().current.items[n - 1].id;
  const q = findQuestion(id)!.question;
  const choices = right ? q.answer : q.options.map((_, i) => i).filter((i) => !q.answer.includes(i)).slice(0, q.answer.length);
  const inputs = within(screen.getByRole("group")).getAllByRole(q.answer.length > 1 ? "checkbox" : "radio");
  for (const c of choices) await userEvent.click(inputs[optionOrder(q.id, q.options.length).indexOf(c)]);
}

describe("MockExamPanel", () => {
  it("runs an exam: answer, flag, jump around, finish, then see results by domain", async () => {
    render(<MockExamPanel onDomain={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Start the mock exam/ }));
    const total = saved().current.items.length;
    expect(screen.getByRole("heading", { name: `Question 1 of ${total}` })).toBeInTheDocument();
    expect(await screen.findByRole("timer")).toHaveTextContent(/1:59:\d\d|2:00:00/);

    await answerCurrent(true);
    await userEvent.click(screen.getByRole("button", { name: /Flag for review/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    await answerCurrent(false);
    // Jump with the question grid, and come back.
    await userEvent.click(screen.getByRole("button", { name: "Question 5" }));
    expect(screen.getByRole("heading", { name: `Question 5 of ${total}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Question 1, answered, flagged" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Finish exam" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(`${total - 2} unanswered, 1 flagged`);
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Finish" }));

    expect(screen.getByText(/estimated/)).toBeInTheDocument();
    expect(screen.getByText(`1/${total} correct`, { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Percent correct by domain and objective")).toBeInTheDocument();
    // Review starts on what you missed, with explanations and sources.
    expect(screen.getByRole("button", { name: `Missed (${total - 1})` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("link", { name: /Source:/ }).length).toBe(total - 1);
    await userEvent.click(screen.getByRole("button", { name: "Flagged (1)" }));
    expect(screen.getAllByText(/⚑ flagged/)).toHaveLength(1);
    expect(screen.getByText("Correct.")).toBeInTheDocument();

    expect(saved().history).toHaveLength(1);
    expect(saved().history[0]).toMatchObject({ kind: "exam", correct: 1, total, passed: false });
  });

  it("builds a custom test on the objectives you pick, scored per objective", async () => {
    render(<MockExamPanel onDomain={jest.fn()} />);
    const builder = screen.getByRole("region", { name: "Custom test" });
    await userEvent.click(within(builder).getByRole("radio", { name: "10 questions" }));
    await userEvent.click(within(builder).getByRole("radio", { name: "Only the ones I pick" }));
    expect(within(builder).getByText("Pick at least one objective.")).toBeInTheDocument();
    expect(within(builder).getByRole("button", { name: "Start the custom test" })).toBeDisabled();
    await userEvent.click(within(builder).getByRole("checkbox", { name: /^Understanding Requirements/ }));
    await userEvent.click(within(builder).getByRole("checkbox", { name: /^Agent Construction with Claude/ }));
    await userEvent.click(within(builder).getByRole("checkbox", { name: /Timed/ }));
    expect(within(builder).getByText("10 questions across 2 objectives, untimed.")).toBeInTheDocument();
    await userEvent.click(within(builder).getByRole("button", { name: "Start the custom test" }));

    expect(screen.getByRole("heading", { name: "Question 1 of 10" })).toBeInTheDocument();
    expect(screen.getByText("Custom test")).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    const skills = new Set(saved().current.items.map((i: { id: string }) => findQuestion(i.id)!.question.skill));
    expect(skills).toEqual(new Set(["requirements", "agent-construction"]));
    // No "Choose 2" questions unless you ask for them.
    expect(saved().current.items.every((i: { id: string }) => findQuestion(i.id)!.question.answer.length === 1)).toBe(true);

    await answerCurrent(true);
    await userEvent.click(screen.getByRole("button", { name: "Finish test" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Finish" }));
    expect(screen.getByText("Custom test results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "10% correct" })).toBeInTheDocument();
    const report = screen.getByLabelText("Percent correct by domain and objective");
    expect(within(report).getByRole("list", { name: "Applications and Integration objectives" })).toHaveTextContent(/Understanding Requirements/);
    expect(within(report).getAllByText("weak").length).toBeGreaterThan(0);
    expect(saved().history[0]).toMatchObject({ kind: "custom", correct: 1, total: 10 });

    // Another like it: same settings, new questions.
    const first = saved().current.items.map((i: { id: string }) => i.id);
    await userEvent.click(screen.getByRole("button", { name: "New test, same settings" }));
    expect(screen.getByRole("heading", { name: "Question 1 of 10" })).toBeInTheDocument();
    expect(saved().current.items.map((i: { id: string }) => i.id)).not.toEqual(first);
  });

  it("times a custom test at the exam's pace and covers every objective by default", async () => {
    render(<MockExamPanel onDomain={jest.fn()} />);
    const builder = screen.getByRole("region", { name: "Custom test" });
    expect(within(builder).getByText("37 questions across 25 objectives, 85 minutes.")).toBeInTheDocument();
    expect(within(builder).getByRole("checkbox", { name: /Single-answer questions only/ })).toBeChecked();
    await userEvent.click(within(builder).getByRole("checkbox", { name: /Single-answer questions only/ }));
    await userEvent.click(within(builder).getByRole("button", { name: "Start the custom test" }));
    expect(saved().current.spec).toMatchObject({ items: 37, singleAnswer: false, detail: false, timed: true });
    expect(await screen.findByRole("timer")).toHaveTextContent(/1:2[45]:\d\d/);
  });

  it("offers your weak objectives from recent results", async () => {
    const past = { kind: "custom", finishedAt: 1, minutes: 5, scaled: 400, passed: false, correct: 2, total: 5 };
    localStorage.setItem(
      KEY,
      JSON.stringify({ current: null, history: [{ ...past, byObjective: { requirements: { correct: 0, total: 3 }, hooks: { correct: 2, total: 2 } } }] }),
    );
    render(<MockExamPanel onDomain={jest.fn()} />);
    const builder = screen.getByRole("region", { name: "Custom test" });
    await userEvent.click(within(builder).getByRole("button", { name: "My weak objectives (1)" }));
    expect(within(builder).getByRole("checkbox", { name: /^Understanding Requirements/ })).toBeChecked();
    expect(within(builder).getByRole("checkbox", { name: /^Claude Hooks/ })).not.toBeChecked();
    expect(within(builder).getByText(/across 1 objective,/)).toBeInTheDocument();
    // Past results say which kind of test each was.
    expect(screen.getByLabelText("Past results")).toHaveTextContent("Custom test");
  });

  it("retries just the missed questions, untimed and out of the history", async () => {
    render(<MockExamPanel onDomain={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Start the mock exam/ }));
    await answerCurrent(true);
    await userEvent.click(screen.getByRole("button", { name: "Finish exam" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Finish" }));
    const missed = saved().current.items.length - 1;
    await userEvent.click(screen.getByRole("button", { name: `↻ Retry the ${missed} I missed` }));
    expect(screen.getByRole("heading", { name: `Question 1 of ${missed}` })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check answers" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Finish" }));
    expect(screen.getByRole("heading", { name: `0/${missed} right this time` })).toBeInTheDocument();
    expect(saved().history).toHaveLength(1);
  });

  it("ends the exam by itself when time runs out, even after a reload", async () => {
    const started = Date.now() - (MOCK_EXAM.minutes + 1) * 60_000;
    act(() => examActions.start(123, started));
    render(<MockExamPanel onDomain={jest.fn()} />);
    expect(await screen.findByText(/estimated/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(saved().history[0].minutes).toBe(MOCK_EXAM.minutes);
  });

  it("keeps your place across a reload", async () => {
    const { unmount } = render(<MockExamPanel onDomain={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Start the mock exam/ }));
    await answerCurrent(true);
    unmount();
    render(<MockExamPanel onDomain={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Question 1, answered" })).toBeInTheDocument();
  });
});

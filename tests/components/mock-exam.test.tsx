/** @jest-environment jsdom */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockExamPanel } from "@/components/MockExamPanel";
import { optionOrder } from "@/components/QuizPanel";
import { examActions } from "@/lib/exam-store";
import { findQuestion, MOCK_EXAM } from "@/lib/mock-exam";

const KEY = "claude-code-playground:mock-exam:v1";
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
    expect(screen.getByLabelText("Percent correct by domain")).toBeInTheDocument();
    // Review starts on what you missed, with explanations and sources.
    expect(screen.getByRole("button", { name: `Missed (${total - 1})` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("link", { name: /Source:/ }).length).toBe(total - 1);
    await userEvent.click(screen.getByRole("button", { name: "Flagged (1)" }));
    expect(screen.getAllByText(/⚑ flagged/)).toHaveLength(1);
    expect(screen.getByText("Correct.")).toBeInTheDocument();

    expect(saved().history).toHaveLength(1);
    expect(saved().history[0]).toMatchObject({ correct: 1, total, passed: false });
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

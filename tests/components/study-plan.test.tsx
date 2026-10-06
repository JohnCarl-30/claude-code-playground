/** @jest-environment jsdom */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudyPlanPanel } from "@/components/StudyPlanPanel";
import { addDays, dateKey } from "@/lib/study-plan";

const none = { tried: new Set<string>(), passed: new Set<string>(), quizzes: new Set<string>() };
const today = dateKey(new Date());

beforeEach(() => localStorage.clear());

describe("StudyPlanPanel", () => {
  it("builds a plan from your exam date and shows today's tasks", async () => {
    const onOpen = jest.fn();
    render(<StudyPlanPanel progress={none} onOpen={onOpen} />);
    const date = screen.getByLabelText("Exam date");
    await userEvent.clear(date);
    await userEvent.type(date, addDays(today, 14));
    await userEvent.selectOptions(screen.getByLabelText("Time per day"), "90");
    await userEvent.click(screen.getByRole("button", { name: "Build my plan" }));

    expect(screen.getByText(/14 days to your exam/)).toBeInTheDocument();
    const todayCard = screen.getByRole("region", { name: "Today" });
    await userEvent.click(within(todayCard).getByRole("button", { name: /Baseline mock exam/ }));
    expect(onOpen).toHaveBeenCalledWith("cert:exam");
    expect(screen.getByText(/90 min a day/)).toBeInTheDocument();
  });

  it("ticks tasks off from your progress, and by hand", async () => {
    const { rerender } = render(<StudyPlanPanel progress={none} onOpen={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Build my plan" }));
    const coming = screen.getByRole("region", { name: "Coming up" });
    const firstBox = within(coming).getAllByRole("checkbox")[0];
    const label = firstBox.getAttribute("aria-label")!;
    expect(firstBox).not.toBeChecked();
    await userEvent.click(firstBox);
    expect(screen.getByRole("checkbox", { name: label })).toBeChecked();

    // Passing a planned challenge checks it without a click.
    const plan = JSON.parse(localStorage.getItem("claude-code-playground:study-plan:v1")!).plan as { days: { tasks: { kind: string; ref: string; label: string }[] }[] };
    const challenge = plan.days.flatMap((d) => d.tasks).find((t) => t.kind === "challenge")!;
    expect(challenge).toBeDefined();
    const showAll = screen.queryByRole("button", { name: /Show all/ });
    if (showAll) await userEvent.click(showAll);
    const box = () => screen.getByRole("checkbox", { name: `Done: ${challenge.label}` });
    expect(box()).not.toBeChecked();
    rerender(<StudyPlanPanel progress={{ ...none, passed: new Set([challenge.ref]) }} onOpen={jest.fn()} />);
    expect(box()).toBeChecked();
  });

  it("won't build for a date that isn't after today", async () => {
    render(<StudyPlanPanel progress={none} onOpen={jest.fn()} />);
    const date = screen.getByLabelText("Exam date");
    await userEvent.clear(date);
    await userEvent.type(date, today);
    expect(screen.getByRole("button", { name: "Build my plan" })).toBeDisabled();
    expect(screen.getByText("Pick a date after today.")).toBeInTheDocument();
  });

  it("keeps the plan across reloads", async () => {
    const { unmount } = render(<StudyPlanPanel progress={none} onOpen={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Build my plan" }));
    unmount();
    act(() => void render(<StudyPlanPanel progress={none} onOpen={jest.fn()} />));
    expect(screen.getByText(/days to your exam/)).toBeInTheDocument();
  });
});

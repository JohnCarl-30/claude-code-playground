/** @jest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CertificationPanel } from "@/components/CertificationPanel";
import { QuizPanel, optionOrder } from "@/components/QuizPanel";
import { DOMAINS } from "@/lib/certification";
import { QUIZZES } from "@/lib/quizzes";

const none = { tried: new Set<string>(), passed: new Set<string>(), quizzes: new Set<string>() };
const evalDomain = DOMAINS.find((d) => d.id === "eval")!;

beforeEach(() => localStorage.clear());

/** Click the options for these answers, wherever the shuffle put them. */
async function answer(pick: (q: (typeof QUIZZES)["eval"][number]) => number[]) {
  const groups = screen.getAllByRole("group");
  for (const [n, q] of QUIZZES.eval.entries()) {
    for (const i of pick(q)) {
      const shownAt = optionOrder(q.id, q.options.length).indexOf(i);
      const inputs = within(groups[n]).getAllByRole(q.answer.length > 1 ? "checkbox" : "radio");
      await userEvent.click(inputs[shownAt]);
    }
  }
}

describe("QuizPanel", () => {
  it("passes with the right answers and remembers it", async () => {
    render(<QuizPanel domain={evalDomain} passedBefore={false} />);
    await answer((q) => q.answer);
    await userEvent.click(screen.getByRole("button", { name: /Check answers/ }));
    expect(screen.getByRole("status")).toHaveTextContent(`${QUIZZES.eval.length}/${QUIZZES.eval.length} correct`);
    expect(screen.getByRole("status")).toHaveTextContent(/Passed/);
    expect(JSON.parse(localStorage.getItem("claude-code-playground:quizzes-passed:v1") ?? "[]")).toEqual(["eval"]);
  });

  it("explains wrong answers with a link to the source, and doesn't pass", async () => {
    render(<QuizPanel domain={evalDomain} passedBefore={false} />);
    // Pick one wrong option everywhere (and for "choose 2", the right count of wrong ones).
    await answer((q) => q.options.map((_, i) => i).filter((i) => !q.answer.includes(i)).slice(0, q.answer.length));
    await userEvent.click(screen.getByRole("button", { name: /Check answers/ }));
    expect(screen.getByRole("status")).toHaveTextContent(`0/${QUIZZES.eval.length} correct`);
    expect(screen.getAllByText("Not quite.")).toHaveLength(QUIZZES.eval.length);
    const source = screen.getAllByRole("link", { name: /Source: API errors/ })[0];
    expect(source).toHaveAttribute("href", "https://platform.claude.com/docs/en/api/errors");
    expect(localStorage.getItem("claude-code-playground:quizzes-passed:v1")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("CertificationPanel", () => {
  it("shows every domain with its weight and 0% readiness to start", async () => {
    const onDomain = jest.fn();
    render(<CertificationPanel progress={none} onOpen={jest.fn()} onDomain={onDomain} />);
    expect(screen.getByLabelText("Readiness")).toHaveTextContent("0%");
    const list = screen.getByRole("list");
    for (const d of DOMAINS) expect(within(list).getByText(d.name)).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(DOMAINS.length);
    expect(screen.getByRole("link", { name: /official exam guide/ })).toHaveAttribute("href", expect.stringContaining("Exam+Guide.pdf"));
    // The biggest gap is the heaviest domain.
    await userEvent.click(within(screen.getByLabelText("Readiness")).getByRole("button", { name: "Applications and Integration" }));
    expect(onDomain).toHaveBeenCalledWith("apps");
  });

  it("shows a domain's skills and practice, and opens what you click", async () => {
    const onOpen = jest.fn();
    const tools = DOMAINS.find((d) => d.id === "tools")!;
    render(<CertificationPanel domain={tools} progress={{ ...none, passed: new Set(["mcp-resources"]) }} onOpen={onOpen} onDomain={jest.fn()} />);
    expect(screen.getByRole("heading", { name: "Domain 8: Tools and MCPs" })).toBeInTheDocument();
    for (const s of tools.skills) expect(screen.getByRole("heading", { name: s.name })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resources and prompts/ })).toHaveTextContent("🏆");
    await userEvent.click(screen.getByRole("button", { name: /The tool-use loop/ }));
    expect(onOpen).toHaveBeenCalledWith({ kind: "challenge", id: "api-tool-loop" });
    expect(screen.getByRole("region", { name: "Knowledge check" })).toBeInTheDocument();
  });
});

/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChallengePanel } from "@/components/ChallengePanel";
import { CHALLENGES } from "@/lib/challenges";

const challenge = CHALLENGES.find((c) => c.id === "config-command")!;
let reply: unknown;

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn(async () => ({ json: async () => reply })) as unknown as typeof fetch;
});

describe("ChallengePanel", () => {
  it("shows which requirements pass and why others fail", async () => {
    reply = {
      results: [
        { id: "file", pass: true },
        { id: "description", pass: true },
        { id: "arguments", pass: false, detail: "Use $ARGUMENTS in the prompt where the route should go." },
        { id: "nodetest", pass: true },
      ],
    };
    render(<ChallengePanel challenge={challenge} passedBefore={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Check my work/ }));
    expect(await screen.findByText("3/4 met")).toBeInTheDocument();
    expect(screen.getByText(/Use \$ARGUMENTS in the prompt/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("met")).toHaveLength(3);
    expect(screen.getByLabelText("not met")).toBeInTheDocument();
    expect(screen.queryByText(/Challenge complete/)).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/challenges/config-command/check", expect.objectContaining({ method: "POST" }));
  });

  it("celebrates and remembers a passed challenge", async () => {
    reply = { results: challenge.requirements.map((r) => ({ id: r.id, pass: true })) };
    render(<ChallengePanel challenge={challenge} passedBefore={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Check my work/ }));
    expect(await screen.findByText(/Challenge complete/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("claude-code-playground:challenges-passed:v1") ?? "[]")).toEqual(["config-command"]);
  });

  it("shows server-side problems, like the wrong starter", async () => {
    reply = { error: "This challenge needs the rest-api starter in your workspace. Switch starters first." };
    render(<ChallengePanel challenge={challenge} passedBefore={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Check my work/ }));
    expect(await screen.findByText(/needs the rest-api starter/)).toBeInTheDocument();
  });

  it("reveals hints one at a time, with code formatted", async () => {
    render(<ChallengePanel challenge={challenge} passedBefore={false} />);
    expect(screen.queryByText(/You can write it yourself/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Show a hint/ }));
    expect(screen.getByText(/You can write it yourself/)).toBeInTheDocument();
    expect(screen.queryByText(/Frontmatter is the/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Another hint/ }));
    expect(screen.getByText(/Frontmatter is the/)).toBeInTheDocument();
    expect(screen.getByText("---").tagName).toBe("CODE"); // backticks become code, not raw text
  });
});

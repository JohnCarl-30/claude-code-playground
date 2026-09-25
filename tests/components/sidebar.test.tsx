/** @jest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/Sidebar";
import { EXAMPLES } from "@/lib/examples";

const none = { tried: new Set<string>(), passed: new Set<string>(), quizzes: new Set<string>() };

beforeEach(() => localStorage.clear());

function setup(selectedId = "blank") {
  const onSelect = jest.fn();
  const view = render(<Sidebar selectedId={selectedId} onSelect={onSelect} progress={none} />);
  return { onSelect, ...view };
}

describe("Sidebar", () => {
  it("opens the certification track and challenges, and only the example group you're in", () => {
    const mcp = EXAMPLES.find((e) => e.group === "MCP")!;
    setup(mcp.id);
    expect(screen.getByRole("button", { name: /Certification/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Challenges\s*\d/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^MCP\s*\d/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Claude Code config\s*\d/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: mcp.title })).toBeInTheDocument();
  });

  it("remembers sections you open or close", async () => {
    const { unmount } = setup();
    await userEvent.click(screen.getByRole("button", { name: /^Challenges\s*\d/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Agent SDK\s*\d/ }));
    unmount();
    setup();
    expect(screen.getByRole("button", { name: /^Challenges\s*\d/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^Agent SDK\s*\d/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("groups challenges by area", () => {
    setup();
    for (const area of ["REST API", "MCP", "Claude API", "Security", "Prompting"]) expect(screen.getAllByText(area).length).toBeGreaterThan(0);
  });

  it("marks the domain to focus on", () => {
    setup();
    const apps = screen.getByRole("button", { name: /Applications and Integration/ });
    expect(within(apps).getByText("focus")).toBeInTheDocument();
  });

  it("searches across the track, challenges and examples, and Enter opens the first match", async () => {
    const { onSelect } = setup();
    const search = screen.getByRole("searchbox", { name: /Search/ });
    await userEvent.type(search, "batch");
    const results = screen.getByRole("region", { name: "Search results" });
    expect(within(results).getByRole("button", { name: /An overnight batch/ })).toBeInTheDocument();
    await userEvent.type(search, "{Enter}");
    expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/batch/));
    expect(search).toHaveValue("");

    await userEvent.type(search, "zzzz-nothing");
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
    await userEvent.type(search, "{Escape}");
    expect(search).toHaveValue("");
  });
});

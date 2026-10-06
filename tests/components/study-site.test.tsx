/** @jest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Playground } from "@/components/Playground";
import { Sidebar } from "@/components/Sidebar";
import { SiteHeader } from "@/components/SiteHeader";
import { DOMAINS, readiness } from "@/lib/certification";
import { practiceQueue } from "@/lib/study-plan";

// The study-only edition (NEXT_PUBLIC_STUDY_ONLY=1): the certification track as a
// static site, with no examples, challenges, workspace or Claude.

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
// The full app's Runner renders Claude's Markdown; the study site never shows it.
jest.mock("@/components/ClaudeText", () => ({ ClaudeText: ({ text }: { text: string }) => <p>{text}</p> }));

const none = { tried: new Set<string>(), passed: new Set<string>(), quizzes: new Set<string>() };

beforeEach(() => {
  process.env.NEXT_PUBLIC_STUDY_ONLY = "1";
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_STUDY_ONLY;
});

describe("study site", () => {
  it("lists only the certification track in the sidebar", () => {
    render(<Sidebar selectedId="cert:overview" onSelect={jest.fn()} progress={none} />);
    const nav = screen.getByRole("navigation", { name: "Study" });
    expect(within(nav).getByRole("button", { name: /Practice tests/ })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: /Mistakes deck/ })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Challenges/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Blank/ })).not.toBeInTheDocument();
  });

  it("measures readiness by knowledge checks, and plans only what the site has", () => {
    expect(readiness({ ...none, quizzes: new Set(DOMAINS.map((d) => d.id)) })).toBeCloseTo(1);
    const queue = practiceQueue(none);
    expect(queue).toHaveLength(DOMAINS.length);
    expect(queue.every((t) => t.kind === "quiz")).toBe(true);
  });

  it("opens on the exam blueprint and keeps the address in step as you move around", async () => {
    render(<Playground />);
    expect(screen.getByRole("heading", { level: 1, name: /Claude Certified Developer/ })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("navigation", { name: "Study" })).getByRole("button", { name: /Practice tests/ }));
    expect(window.location.search).toBe("?cert=exam");
    expect(screen.getByRole("heading", { level: 1, name: "Practice tests" })).toBeInTheDocument();
  });

  it("follows a link to a domain, with no examples or challenges to open", () => {
    window.history.replaceState(null, "", "/?cert=apps");
    render(<Playground />);
    expect(screen.getByRole("heading", { level: 1, name: /Applications and Integration/ })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^(Example|Challenge):/ })).toEqual([]);
  });

  it("falls back to the blueprint for links to things only the full app has", () => {
    window.history.replaceState(null, "", "/?challenge=api-todos");
    render(<Playground />);
    expect(screen.getByRole("heading", { level: 1, name: /Claude Certified Developer/ })).toBeInTheDocument();
  });

  it("shows the site's name and never checks for a Claude connection", () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /CCDV-F Study Lab/ })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/** @jest-environment jsdom */
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "@/components/AccountMenu";

// A stand-in for the Supabase client: who's signed in, and the calls the menu makes.
let session: { user: { id: string; email: string; user_metadata: { user_name: string } } } | null = null;
const signInWithOAuth = jest.fn().mockResolvedValue({ error: null });
const signOut = jest.fn().mockResolvedValue({ error: null });
const rpc = jest.fn().mockResolvedValue({ error: null });
const fakeClient = {
  auth: {
    onAuthStateChange: (cb: (event: string, s: typeof session) => void) => {
      queueMicrotask(() => cb("INITIAL_SESSION", session));
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    signInWithOAuth,
    signOut,
  },
  rpc,
};
const saved: unknown[] = [];
let secure = true;

jest.mock("@/lib/cloud", () => ({
  cloudEnabled: () => !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  cloud: async () => fakeClient,
  secureContext: () => secure,
  returnUrl: () => "https://example.test/study/",
  progressTable: () => ({
    load: async () => null,
    save: async (_user: string, data: unknown) => {
      saved.push(data);
      return "v1";
    },
  }),
}));

beforeEach(() => {
  localStorage.clear();
  session = null;
  secure = true;
  saved.length = 0;
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});

describe("AccountMenu", () => {
  it("shows nothing when the build has no Supabase project", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { container } = render(<AccountMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains what signing in stores, then signs in with GitHub back to the site", async () => {
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign in to sync" }));
    const dialog = screen.getByRole("dialog", { name: "Your account" });
    expect(dialog).toHaveTextContent(/GitHub username, email address and study progress/);
    expect(dialog).toHaveTextContent(/delete them at any time/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue with GitHub" }));
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: "github", options: { redirectTo: "https://example.test/study/" } });
  });

  it("won't start sign-in over a plain http connection", async () => {
    secure = false;
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign in to sync" }));
    expect(screen.queryByRole("button", { name: "Continue with GitHub" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/secure \(https\) connection/);
  });

  it("syncs once signed in, and can delete the account after confirming", async () => {
    localStorage.setItem("claude-code-playground:quizzes-passed:v1", JSON.stringify(["apps"]));
    session = { user: { id: "u1", email: "o@example.test", user_metadata: { user_name: "octocat" } } };
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole("button", { name: /octocat/ }));
    expect(await screen.findByText(/Progress synced at/)).toBeInTheDocument();
    expect(saved).toEqual([{ "claude-code-playground:quizzes-passed:v1": ["apps"] }]);

    await userEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
    expect(screen.getByText(/deletes your account and the progress saved online/)).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    });
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    expect(signOut).toHaveBeenCalled();
    expect(screen.getByText(/progress stays in this browser/)).toBeInTheDocument();
    expect(localStorage.getItem("claude-code-playground:sync:v1")).toBeNull();
  });
});

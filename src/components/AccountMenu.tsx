"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloud, cloudEnabled, progressTable, returnUrl, secureContext } from "@/lib/cloud";
import { forgetSync, startSync, type SyncStatus } from "@/lib/progress-sync";

// Sign in with GitHub to keep your progress across devices. Only shown when the
// build has a Supabase project (see src/lib/cloud.ts).

const displayName = (u: User) => (u.user_metadata?.user_name as string | undefined) ?? u.email ?? "your account";

function statusLine(status: SyncStatus | null) {
  if (!status || status.state === "syncing") return "Syncing your progress…";
  if (status.state === "error") return `Couldn't sync (${status.error}). It will try again.`;
  return `Progress synced at ${new Date(status.at!).toLocaleTimeString()}.`;
}

function Account() {
  // undefined while we find out, null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState("");
  const [sync, setSync] = useState<ReturnType<typeof startSync> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Who's signed in, kept current (including right after GitHub sends you back).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    cloud()
      .then((sb) => {
        if (cancelled) return;
        const { data } = sb.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() => setUser(null));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // While signed in, keep this browser's progress and the saved copy in step.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let running: ReturnType<typeof startSync> | null = null;
    cloud().then((sb) => {
      if (cancelled) return;
      running = startSync({ userId, store: progressTable(sb), onStatus: setStatus });
      setSync(running);
    });
    return () => {
      cancelled = true;
      running?.stop();
    };
  }, [userId]);

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (user === undefined) return null;

  async function signIn() {
    const sb = await cloud();
    const { error } = await sb.auth.signInWithOAuth({ provider: "github", options: { redirectTo: returnUrl() } });
    if (error) setNote(`Couldn't start sign-in: ${error.message}`);
  }
  async function signOut() {
    sync?.stop();
    await (await cloud()).auth.signOut();
    forgetSync();
    setStatus(null);
    setNote("Signed out. Your progress stays in this browser.");
  }
  async function deleteAccount() {
    const sb = await cloud();
    const { error } = await sb.rpc("delete_my_account");
    if (error) return setNote(`Couldn't delete your account: ${error.message}`);
    sync?.stop();
    await sb.auth.signOut();
    forgetSync();
    setConfirmDelete(false);
    setStatus(null);
    setNote("Your account and the progress saved online are deleted. Your progress stays in this browser.");
  }

  const dot = !user ? "" : status?.state === "error" ? "bg-danger" : status?.state === "synced" ? "bg-ok" : "bg-muted";
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm hover:bg-surface-2"
      >
        {user ? (
          <>
            <span aria-hidden className={`size-2 rounded-full ${dot}`} />
            <span className="max-w-32 truncate">{displayName(user)}</span>
          </>
        ) : (
          "Sign in to sync"
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Your account" className="absolute right-0 top-10 z-30 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-lg">
          {user ? (
            <>
              <p>
                Signed in as <strong>{displayName(user)}</strong>.
              </p>
              <p role="status" className={status?.state === "error" ? "text-danger" : "text-muted"}>
                {statusLine(status)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => sync?.syncNow()} className="h-8 rounded-lg border border-line px-3 font-medium hover:bg-surface-2">
                  Sync now
                </button>
                <button onClick={signOut} className="h-8 rounded-lg border border-line px-3 font-medium hover:bg-surface-2">
                  Sign out
                </button>
              </div>
              {confirmDelete ? (
                <div className="space-y-2 rounded-lg bg-danger-soft p-3 text-danger">
                  <p>This deletes your account and the progress saved online. Your progress stays in this browser.</p>
                  <div className="flex gap-2">
                    <button onClick={deleteAccount} className="h-8 rounded-lg bg-danger px-3 font-medium text-white">
                      Delete
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="h-8 rounded-lg border border-line bg-surface px-3 font-medium text-ink">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="text-xs text-danger hover:underline">
                  Delete my account and synced progress…
                </button>
              )}
            </>
          ) : (
            <>
              <p className="font-medium">Keep your progress on every device</p>
              <p className="text-xs text-muted">
                Signing in with GitHub stores your GitHub username, email address and study progress in this site&apos;s database, only to sync your
                progress. You can delete them at any time from this menu. Without signing in, your progress stays in this browser.
              </p>
              {secureContext() ? (
                <button onClick={signIn} className="h-9 w-full rounded-lg bg-accent px-3 font-medium text-white hover:opacity-90">
                  Continue with GitHub
                </button>
              ) : (
                <p role="note" className="rounded-lg bg-surface-2 p-2 text-xs">
                  Sign-in is switched off here because this page isn&apos;t on a secure (https) connection.
                </p>
              )}
            </>
          )}
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
      )}
    </div>
  );
}

/** The account button: nothing at all unless this build can sign people in. */
export function AccountMenu() {
  return cloudEnabled() ? <Account /> : null;
}

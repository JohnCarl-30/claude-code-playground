"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressStore, Snapshot } from "./progress-sync";

// Sign-in and progress sync through a Supabase project (see supabase/ and the
// README). It's switched on only when the build has the project's address and
// publishable key; both are public by design: the database's row-level
// security is what keeps each user to their own progress.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Whether this build can sign people in. Read at call time so tests can switch it. */
export const cloudEnabled = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

let client: Promise<SupabaseClient> | null = null;

/** The Supabase client, loaded only when it's first needed so the library stays out of the page otherwise. */
export function cloud(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(URL, KEY, {
      // PKCE: the sign-in redirect carries a one-time code, exchanged using a secret kept in this browser.
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  return client;
}

/**
 * Sign-in sends a one-time code back in the address, so it's only allowed over HTTPS
 * (or on this computer, for local development).
 */
export function secureContext() {
  return window.location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

/** Where GitHub sends you back after signing in: the site's home, under its sub-path if it has one. */
export const returnUrl = () => `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;

/** Your progress row in the `progress` table (supabase/migrations). */
export function progressTable(sb: SupabaseClient): ProgressStore {
  return {
    async load(userId) {
      const { data, error } = await sb.from("progress").select("data, updated_at").eq("user_id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { data: (data.data ?? {}) as Snapshot, updatedAt: String(data.updated_at) } : null;
    },
    async save(userId, data) {
      const { data: row, error } = await sb.from("progress").upsert({ user_id: userId, data }).select("updated_at").single();
      if (error) throw new Error(error.message);
      return String(row.updated_at);
    },
  };
}

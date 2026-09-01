/**
 * Auth helper utilities for handling Supabase sessions,
 * both online and offline (with persisted localStorage sessions).
 *
 * ARCHITECTURE:
 * - Initial login REQUIRES real Supabase authentication (online)
 * - Supabase client persists the session to localStorage (persistSession: true)
 * - After login, getSession() can work offline using the cached session
 * - We do not create fake sessions or bypass Supabase authentication
 * - RLS policies protect data at the database level
 */

import { supabase } from "./client";

/**
 * Get the current session, with graceful offline fallback.
 *
 * 1. First tries to get a fresh session from Supabase (online flow)
 * 2. If that fails (offline), returns null gracefully instead of throwing
 * 3. The Supabase client auto-loads persisted sessions from localStorage on init
 *    and the session data is preserved in the returned object
 *
 * This allows authenticated users to continue working offline without redirect.
 */
export async function getSessionSafely() {
  try {
    // Try to get the current session from Supabase
    // This includes both fresh sessions (online) and cached sessions (from localStorage)
    const { data, error } = await supabase.auth.getSession();

    if (!error && data?.session) {
      return data.session;
    }

    // If no session available, return null (don't throw)
    return null;
  } catch (error) {
    // Network error or other issue; return null instead of throwing
    // This prevents redirects when offline
    return null;
  }
}

/**
 * Get the current user, with graceful offline fallback.
 */
export async function getCurrentUserSafely() {
  const session = await getSessionSafely();
  return session?.user ?? null;
}

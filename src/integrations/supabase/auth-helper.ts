/**
 * Auth helper utilities for handling Supabase sessions safely.
 *
 * We validate the session with the auth server, reject stale/expired sessions,
 * and only then allow the app to continue. This prevents SSR/client auth drift
 * from creating a bypass and ensures invalid sessions are signed out promptly.
 */

import { supabase } from "./client";

export async function getValidatedSession() {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      return null;
    }

    const session = sessionData.session;
    
    // Attempt to verify user, but do not sign out on network error.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    // Only invalidate if the auth server says the user is unauthorized/missing
    if (userError || !userData?.user || session.user.id !== userData.user.id) {
       // Check if it's a 401 Unauthorized (invalid session)
       if (userError && (userError as any).status === 401) {
         await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
       }
       return null;
    }

    return { session, user: userData.user };
  } catch (error) {
    console.warn("Session validation encountered an error:", error);
    return null;
  }
}

export async function getSessionSafely() {
  return (await getValidatedSession())?.session ?? null;
}

export async function getCurrentUserSafely() {
  return (await getValidatedSession())?.user ?? null;
}

export async function getUserRoles(userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);

  if (error) throw error;
  return (data ?? []).map((row) => String(row.role));
}

export async function userHasAnyRole(userId: string, roles: readonly string[]) {
  const userRoles = await getUserRoles(userId);
  return roles.some((role) => userRoles.includes(role));
}

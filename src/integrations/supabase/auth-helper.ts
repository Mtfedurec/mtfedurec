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
    const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] =
      await Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]);

    if (sessionError) {
      throw sessionError;
    }

    if (userError) {
      throw userError;
    }

    const session = sessionData.session;
    const user = userData.user;

    if (!session || !user) {
      await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
      return null;
    }

    if (session.user.id !== user.id) {
      await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
      return null;
    }

    return { session, user };
  } catch (error) {
    console.warn("Invalid or expired Supabase session detected; clearing session.", error);
    await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
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

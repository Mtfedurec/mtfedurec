import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSessionSafely } from "@/integrations/supabase/auth-helper";
import { SyncProvider } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Use getSessionSafely() which works both online and offline
    // If authenticated user goes offline, they can still access protected routes
    // because the session is cached in memory (loaded from localStorage by Supabase client)
    const session = await getSessionSafely();
    if (!session?.user) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: () => (
    <SyncProvider>
      <Outlet />
    </SyncProvider>
  ),
});
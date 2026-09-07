import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getValidatedSession } from "@/integrations/supabase/auth-helper";
import { SyncProvider } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: () => (
    <SyncProvider>
      <Outlet />
    </SyncProvider>
  ),
});

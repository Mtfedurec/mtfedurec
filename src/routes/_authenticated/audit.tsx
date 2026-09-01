import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useAuditLogs } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { getSessionSafely } from "@/integrations/supabase/auth-helper";

export const Route = createFileRoute("/_authenticated/audit")({
  beforeLoad: async () => {
    const session = await getSessionSafely();
    if (!session?.user) throw redirect({ to: "/auth" });

    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    if (error) throw error;

    const isAdmin = (roles ?? []).some((row) => row.role === "admin");
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Audit log — MayDan EduRecord" },
      {
        name: "description",
        content: "Append-only history of record changes, submissions and approval decisions.",
      },
      { property: "og:title", content: "Audit log — MayDan EduRecord" },
      { property: "og:description", content: "Traceable history of academic record activity." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { data: logs = [] } = useAuditLogs();

  return (
    <AppShell title="Audit log" description="Most recent 100 actions">
      <div className="surface-card divide-y divide-border">
        {logs.map((l) => {
          const log = l as {
            id: string;
            action: string;
            target: string | null;
            details: string | null;
            created_at: string;
            profiles?: { full_name: string } | null;
          };
          return (
            <div key={log.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{log.action}</p>
                <p className="text-xs text-muted-foreground">
                  {log.profiles?.full_name ?? "System"}
                  {log.details ? ` · ${log.details}` : ""}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </p>
            </div>
          );
        })}
        {logs.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No activity recorded yet.</p>
        )}
      </div>
    </AppShell>
  );
}

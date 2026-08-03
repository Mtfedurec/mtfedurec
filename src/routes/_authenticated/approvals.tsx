import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { logAudit, useCorrections, useProfile } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — MayDan EduRecord" },
      {
        name: "description",
        content: "Review and decide on correction requests raised by teachers for locked records.",
      },
      { property: "og:title", content: "Approvals — MayDan EduRecord" },
      { property: "og:description", content: "Correction request review queue." },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { data: requests = [] } = useCorrections();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const canDecide = Boolean(
    profile?.roles.some((role) => role === "admin" || role === "head_teacher"),
  );

  async function decide(id: string, status: "approved" | "rejected") {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("correction_requests")
      .update({
        status,
        decided_by: auth.user?.id ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Request ${status}`);
    void logAudit(`correction.${status}`, id);
    void queryClient.invalidateQueries({ queryKey: ["corrections"] });
  }

  return (
    <AppShell title="Approvals" description="Correction requests from teaching staff">
      {!canDecide && (
        <div className="rounded-xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
          You can follow the status of requests here. Only administrators and the head teacher can
          approve or reject them.
        </div>
      )}
      <div className="space-y-3">
        {requests.map((r) => {
          const req = r as {
            id: string;
            field_label: string;
            original_value: string | null;
            requested_value: string | null;
            reason: string | null;
            status: string;
            created_at: string;
            students?: { full_name: string } | null;
            subjects?: { name: string } | null;
          };
          return (
            <div key={req.id} className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {req.students?.full_name ?? "Student"} · {req.field_label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {req.subjects?.name ? `${req.subjects.name} · ` : ""}
                    {new Date(req.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold capitalize",
                    req.status === "pending"
                      ? "bg-warning/15 text-warning-foreground"
                      : req.status === "approved"
                        ? "bg-success/15 text-success"
                        : "bg-destructive/10 text-destructive",
                  )}
                >
                  {req.status}
                </span>
              </div>
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">Change </span>
                <span className="font-medium">{req.original_value ?? "—"}</span>
                <span className="text-muted-foreground"> to </span>
                <span className="font-medium">{req.requested_value ?? "—"}</span>
              </p>
              {req.reason && <p className="mt-1 text-sm text-muted-foreground">{req.reason}</p>}
              {canDecide && req.status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => void decide(req.id, "approved")}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void decide(req.id, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {requests.length === 0 && (
          <p className="surface-card p-4 text-sm text-muted-foreground">
            No correction requests yet.
          </p>
        )}
      </div>
    </AppShell>
  );
}
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock3, Loader2, Lock, Pause, Play, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getValidatedSession, userHasAnyRole } from "@/integrations/supabase/auth-helper";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { logAudit, useAssessmentControls, useSetAssessmentControl, useTerms } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assessment-controls")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });

    if (!(await userHasAnyRole(session.user.id, ["admin"]))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Assessment Controls — MayDan EduRecord" },
      {
        name: "description",
        content: "Control whether teachers can enter or edit assessment scores.",
      },
      { property: "og:title", content: "Assessment Controls — MayDan EduRecord" },
      {
        property: "og:description",
        content: "Open, pause or lock assessment entry by term.",
      },
    ],
  }),
  component: AssessmentControlsPage,
});

type ControlStatus = "open" | "paused" | "locked";

type ControlRow = {
  id: string;
  term_id: string;
  status: ControlStatus;
  deadline_at: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
  created_at: string;
  updated_at: string;
  terms?: {
    name: string;
    academic_sessions?: { name: string } | null;
  } | null;
};

function AssessmentControlsPage() {
  const { data: controls = [], isLoading } = useAssessmentControls();
  const setControl = useSetAssessmentControl();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState("");
  const [status, setStatus] = useState<ControlStatus>("open");
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  function getStatusIcon(currentStatus: ControlStatus) {
    switch (currentStatus) {
      case "open":
        return <CheckCircle2 className="size-4 text-success" />;
      case "paused":
        return <Pause className="size-4 text-warning" />;
      case "locked":
        return <Lock className="size-4 text-destructive" />;
    }
  }

  function getStatusBadgeVariant(currentStatus: ControlStatus) {
    switch (currentStatus) {
      case "open":
        return "default";
      case "paused":
        return "secondary";
      case "locked":
        return "destructive";
    }
  }

  function getStatusLabel(currentStatus: ControlStatus) {
    switch (currentStatus) {
      case "open":
        return "OPEN";
      case "paused":
        return "PAUSED";
      case "locked":
        return "LOCKED";
    }
  }

  async function handleSetStatus() {
    if (!selectedTermId) {
      toast.error("Select a term.");
      return;
    }

    setSaving(true);

    try {
      await setControl.mutateAsync({
        term_id: selectedTermId,
        status,
        deadline_at: deadline || null,
        reason: reason || null,
      });

      toast.success(`Assessment status changed to ${status.toUpperCase()}`);
      void logAudit("assessment_control.changed", selectedTermId, `Status changed to ${status}`);
      setDialogOpen(false);
      setSelectedTermId("");
      setStatus("open");
      setDeadline("");
      setReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update assessment control");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-NG", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <AppShell title="Assessment Controls" description="Manage score entry permissions by term">
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Current status</h2>
            <p className="text-sm text-muted-foreground">
              Teachers can enter and edit assessment scores only when the status is OPEN.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Play className="mr-2 size-4" />
                Change status
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Change assessment status</DialogTitle>
                <DialogDescription>
                  Select a term and set whether teachers can enter or edit scores.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="control-term">Term</Label>
                  <TermSelector
                    value={selectedTermId}
                    onChange={setSelectedTermId}
                    excludeIds={controls.map((c) => c.term_id)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="control-status">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ControlStatus)}>
                    <SelectTrigger id="control-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="control-deadline">Deadline (optional)</Label>
                  <Input
                    id="control-deadline"
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="control-reason">Reason (optional)</Label>
                  <Textarea
                    id="control-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why the status is being changed..."
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={() => void handleSetStatus()} disabled={saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Update status
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="surface-card flex items-center justify-center gap-3 p-10">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading assessment controls...</span>
          </div>
        )}

        {!isLoading && controls.length === 0 && (
          <div className="surface-card p-10 text-center">
            <CheckCircle2 className="mx-auto size-10 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No controls configured</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              All terms default to OPEN. Use the button above to change a term's status.
            </p>
          </div>
        )}

        {controls.map((row) => (
          <div key={row.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">
                    {row.terms?.name ?? "Unknown term"}
                    {row.terms?.academic_sessions?.name
                      ? ` · ${row.terms.academic_sessions.name}`
                      : ""}
                  </h3>

                  <Badge variant={getStatusBadgeVariant(row.status)} className="gap-1.5">
                    {getStatusIcon(row.status)}
                    {getStatusLabel(row.status)}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Changed: {formatDate(row.changed_at)}</span>
                  {row.deadline_at && <span>Deadline: {formatDate(row.deadline_at)}</span>}
                  {row.reason && <span>Reason: {row.reason}</span>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function TermSelector({
  value,
  onChange,
  excludeIds,
}: {
  value: string;
  onChange: (id: string) => void;
  excludeIds: string[];
}) {
  const { data: terms = [] } = useTerms();

  const available = terms.filter((t) => !excludeIds.includes(t.id));

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select term" />
      </SelectTrigger>
      <SelectContent>
        {available.length === 0 && (
          <SelectItem value="__none" disabled>
            All terms already have controls
          </SelectItem>
        )}
        {available.map((term) => (
          <SelectItem key={term.id} value={term.id}>
            {term.name}
            {term.academic_sessions?.name ? ` · ${term.academic_sessions.name}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

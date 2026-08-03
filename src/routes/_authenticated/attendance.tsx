import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAttendance, useClasses, useStudents, logAudit } from "@/lib/data";
import { useSync } from "@/lib/offline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance — MayDan EduRecord" },
      {
        name: "description",
        content: "Mark daily class attendance as present, absent or late, even without internet.",
      },
      { property: "og:title", content: "Attendance — MayDan EduRecord" },
      { property: "og:description", content: "Offline-capable daily attendance register." },
    ],
  }),
  component: AttendancePage,
});

type Status = "present" | "absent" | "late";
const STATUSES: Status[] = ["present", "absent", "late"];

function AttendancePage() {
  const { data: classes = [] } = useClasses();
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: students = [] } = useStudents(classId || undefined);
  const { data: existing = [] } = useAttendance(classId || undefined, date);
  const { save } = useSync();
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (classes.length > 0 && !classId) setClassId((classes[0] as { id: string }).id);
  }, [classes, classId]);

  useEffect(() => {
    const next: Record<string, Status> = {};
    for (const row of existing as { student_id: string; status: Status }[]) {
      next[row.student_id] = row.status;
    }
    setMarks(next);
  }, [existing]);

  const summary = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((v) => v === "present").length,
      absent: values.filter((v) => v === "absent").length,
      late: values.filter((v) => v === "late").length,
      unmarked: students.length - values.length,
    };
  }, [marks, students.length]);

  function markAll(status: Status) {
    const next: Record<string, Status> = {};
    for (const student of students as { id: string }[]) next[student.id] = status;
    setMarks(next);
  }

  async function submit() {
    if (!classId) return;
    const entries = Object.entries(marks);
    if (entries.length === 0) {
      toast.error("Mark at least one student first.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const rows = entries.map(([student_id, status]) => ({
      student_id,
      class_id: classId,
      attendance_date: date,
      status,
      state: "submitted",
      recorded_by: auth.user?.id ?? null,
    }));
    const result = await save({
      table: "attendance",
      rows,
      onConflict: "student_id,attendance_date",
      label: `Attendance ${date}`,
    });
    setSaving(false);
    if (result === "synced") {
      toast.success("Attendance saved");
      void logAudit("attendance.submitted", classId, `${rows.length} records for ${date}`);
      void queryClient.invalidateQueries({ queryKey: ["attendance"] });
    }
  }

  return (
    <AppShell title="Attendance" description="Daily register — works offline">
      <div className="surface-card grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cls">Class</Label>
          <select
            id="cls"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {classes.map((c) => {
              const cls = c as { id: string; name: string };
              return (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              );
            })}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => markAll("present")}>
          Mark all present
        </Button>
        <Button size="sm" variant="outline" onClick={() => setMarks({})}>
          Clear
        </Button>
        <span className="text-xs text-muted-foreground">
          {summary.present} present · {summary.absent} absent · {summary.late} late ·{" "}
          {summary.unmarked} unmarked
        </span>
      </div>

      <div className="surface-card divide-y divide-border">
        {students.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No active students in this class.</p>
        )}
        {students.map((s) => {
          const student = s as { id: string; full_name: string; admission_number: string };
          return (
            <div
              key={student.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{student.full_name}</p>
                <p className="text-xs text-muted-foreground">{student.admission_number}</p>
              </div>
              <div className="flex gap-1">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setMarks((m) => ({ ...m, [student.id]: status }))}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                      marks[student.id] === status
                        ? status === "present"
                          ? "border-success bg-success text-success-foreground"
                          : status === "late"
                            ? "border-warning bg-warning text-warning-foreground"
                            : "border-destructive bg-destructive text-destructive-foreground"
                        : "border-input bg-background text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={() => void submit()} disabled={saving || students.length === 0}>
        Save attendance
      </Button>
    </AppShell>
  );
}
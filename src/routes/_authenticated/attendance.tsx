import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO, subDays } from "date-fns";
import { Calendar, Clock, Lock, RefreshCw, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getValidatedSession } from "@/integrations/supabase/auth-helper";
import { AppShell, StatCard } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  useAttendance,
  useAttendanceHistory,
  useClasses,
  useStudents,
  logAudit,
  type AttendanceHistoryRow,
} from "@/lib/data";

import { useSync } from "@/lib/offline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/attendance")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      {
        title: "Attendance — MayDan EduRecord",
      },
      {
        name: "description",
        content:
          "Mark daily class attendance as present, absent or late, even without internet. View historical attendance by class and date range.",
      },
      {
        property: "og:title",
        content: "Attendance — MayDan EduRecord",
      },
      {
        property: "og:description",
        content: "Offline-capable daily attendance register with history.",
      },
    ],
  }),
  component: AttendancePage,
});

type Status = "present" | "absent" | "late";

const STATUSES: Status[] = ["present", "absent", "late"];

type ClassItem = {
  id: string;
  name: string;
};

type StudentItem = {
  id: string;
  full_name: string;
  admission_number: string;
};

type AttendanceRow = {
  student_id: string;
  status: Status;
};

type AttendanceSummary = {
  present: number;
  late: number;
  absent: number;
  recorded: number;
  percentage: number | null;
};

/*
 * Calendar-date helpers.
 *
 * `attendance_date` is a DATE column (calendar date, not a timestamp),
 * so all comparisons use plain "yyyy-MM-dd" strings. This avoids the
 * UTC-shifting bug that `new Date("yyyy-MM-dd")` / toISOString would
 * introduce for a school in the Africa/Lagos timezone.
 */
function useToday(): string {
  return useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
}

function summarizeAttendance(rows: AttendanceHistoryRow[]): AttendanceSummary {
  const present = rows.filter((r) => r.status === "present").length;
  const late = rows.filter((r) => r.status === "late").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const recorded = present + late + absent;

  if (recorded === 0) {
    return { present, late, absent, recorded, percentage: null };
  }

  // present counts fully, late counts as 0.5 present, absent counts 0.
  const percentage = ((present + 0.5 * late) / recorded) * 100;

  return { present, late, absent, recorded, percentage };
}

function statusVariant(status: Status): "default" | "secondary" | "destructive" {
  if (status === "present") return "default";
  if (status === "late") return "secondary";
  return "destructive";
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge
      variant={statusVariant(status)}
      className={cn(
        "capitalize",
        status === "present" && "border-success bg-success text-success-foreground",
        status === "late" && "border-warning bg-warning text-warning-foreground",
        status === "absent" && "border-destructive bg-destructive text-destructive-foreground",
      )}
    >
      {status}
    </Badge>
  );
}

/* =========================================================
 * DAILY REGISTER TAB
 * ========================================================= */

function DailyRegister() {
  /* ---------------------------------------------------------
   * DATA
   * --------------------------------------------------------- */

  const { data: classes = [] } = useClasses();

  const [classId, setClassId] = useState("");

  const today = useToday();

  const [date, setDate] = useState(today);

  const { data: students = [] } = useStudents(classId || undefined);

  const { data: existing = [] } = useAttendance(classId || undefined, date);

  const { save } = useSync();

  const queryClient = useQueryClient();

  const [marks, setMarks] = useState<Record<string, Status>>({});

  const [saving, setSaving] = useState(false);

  /* ---------------------------------------------------------
   * INITIAL CLASS
   * --------------------------------------------------------- */

  useEffect(() => {
    if (classes.length > 0 && !classId) {
      setClassId((classes[0] as ClassItem).id);
    }
  }, [classes, classId]);

  /* ---------------------------------------------------------
   * LOCK STATE
   * --------------------------------------------------------- */

  const isToday = date === today;
  const isPast = Boolean(date) && date < today;
  const isFuture = Boolean(date) && date > today;

  /*
   * Only the current school day is editable.
   *  - Past dates are permanently locked (read-only).
   *  - Future dates cannot be recorded at all.
   */
  const readOnly = !isToday;

  /* ---------------------------------------------------------
   * LOAD EXISTING ATTENDANCE
   * --------------------------------------------------------- */

  useEffect(() => {
    const next: Record<string, Status> = {};

    for (const row of existing as AttendanceRow[]) {
      next[row.student_id] = row.status;
    }

    setMarks(next);
  }, [existing]);

  /* ---------------------------------------------------------
   * SUMMARY
   * --------------------------------------------------------- */

  const summary = useMemo(() => {
    const values = Object.values(marks);

    return {
      present: values.filter((value) => value === "present").length,
      absent: values.filter((value) => value === "absent").length,
      late: values.filter((value) => value === "late").length,
      unmarked: students.length - values.length,
    };
  }, [marks, students.length]);

  /* ---------------------------------------------------------
   * MARK ALL
   * --------------------------------------------------------- */

  function markAll(status: Status) {
    const next: Record<string, Status> = {};

    for (const student of students as StudentItem[]) {
      next[student.id] = status;
    }

    setMarks(next);
  }

  /* ---------------------------------------------------------
   * SUBMIT ATTENDANCE
   * --------------------------------------------------------- */

  async function submit() {
    if (!classId) return;
    if (!date) return;

    /*
     * Defence in depth: the database enforces the date lock via RLS,
     * and the UI disables saving for non-today dates, but we also
     * refuse to attempt a save for a locked or future date here.
     */
    if (readOnly) {
      if (isFuture) {
        toast.error("Attendance cannot be recorded for a future date.");
      } else {
        toast.error("Attendance for previous dates is locked and cannot be edited.");
      }
      return;
    }

    const entries = Object.entries(marks);

    if (entries.length === 0) {
      toast.error("Mark at least one student first.");
      return;
    }

    setSaving(true);

    try {
      /*
       * Read the locally persisted session.
       *
       * This supports offline-capable authentication
       * without forcing a network request, exactly like the
       * original register. `recorded_by` is null only when no
       * session is available at all.
       */
      const session = await getSessionSafely();

      const rows = entries.map(([student_id, status]) => ({
        student_id,
        class_id: classId,
        attendance_date: date,
        status,
        state: "submitted",
        recorded_by: session?.user.id ?? null,
      }));

      const result = await save({
        table: "attendance",
        rows,
        onConflict: "student_id,attendance_date",
        label: `Attendance ${date}`,
      });

      if (result === "synced" || result === "queued") {
        if (result === "synced") {
          toast.success("Attendance saved");
        }

        void logAudit("attendance.submitted", classId, `${rows.length} records for ${date}`);

        void queryClient.invalidateQueries({
          queryKey: ["attendance"],
        });
      }
    } catch (err) {
      console.error("Attendance submission error:", err);
      toast.error("An unexpected error occurred while saving attendance.");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------
   * UI
   * --------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* ==================================================
       * CLASS / DATE
       * ================================================== */}

      <div className="surface-card grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cls">Class</Label>

          <select
            id="cls"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select class</option>

            {classes.map((item) => {
              const cls = item as ClassItem;

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

          <Input
            id="date"
            type="date"
            value={date}
            max={today}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>

      {/* ==================================================
       * LOCK / FUTURE BANNER
       * ================================================== */}

      {isPast && (
        <Alert variant="default" className="border-warning/40 bg-warning/10">
          <Lock className="h-4 w-4 text-warning-foreground" />
          <AlertTitle>Attendance for this date is locked</AlertTitle>
          <AlertDescription>
            Previous attendance records cannot be edited after the day has passed.
          </AlertDescription>
        </Alert>
      )}

      {isFuture && (
        <Alert variant="default" className="border-destructive/40 bg-destructive/10">
          <Clock className="h-4 w-4 text-destructive" />
          <AlertTitle>Attendance cannot be recorded for a future date</AlertTitle>
          <AlertDescription>
            Select today's date to enter attendance. Future dates are not editable.
          </AlertDescription>
        </Alert>
      )}

      {/* ==================================================
       * CONTROLS / SUMMARY
       * ================================================== */}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => markAll("present")}
          disabled={saving || students.length === 0 || readOnly}
        >
          Mark all present
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setMarks({})}
          disabled={saving || readOnly}
        >
          Clear
        </Button>

        <span className="text-xs text-muted-foreground">
          {summary.present} present · {summary.absent} absent · {summary.late} late ·{" "}
          {summary.unmarked} unmarked
        </span>
      </div>

      {/* ==================================================
       * STUDENT REGISTER
       * ================================================== */}

      <div className="surface-card divide-y divide-border">
        {students.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No active students in this class.</p>
        )}

        {students.map((item) => {
          const student = item as StudentItem;

          return (
            <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{student.full_name}</p>

                <p className="text-xs text-muted-foreground">{student.admission_number}</p>
              </div>

              <div className="flex gap-1">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={saving || readOnly}
                    onClick={() =>
                      setMarks((current) => ({
                        ...current,
                        [student.id]: status,
                      }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                      marks[student.id] === status
                        ? status === "present"
                          ? "border-success bg-success text-success-foreground"
                          : status === "late"
                            ? "border-warning bg-warning text-warning-foreground"
                            : "border-destructive bg-destructive text-destructive-foreground"
                        : "border-input bg-background text-muted-foreground hover:bg-secondary",
                      readOnly && "cursor-not-allowed opacity-60",
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

      {/* ==================================================
       * SAVE
       * ================================================== */}

      <Button
        onClick={() => void submit()}
        disabled={saving || students.length === 0 || !classId || !date || !isToday}
      >
        {saving ? "Saving..." : "Save attendance"}
      </Button>
    </div>
  );
}

/* =========================================================
 * HISTORY TAB
 * ========================================================= */

function AttendanceHistory() {
  /* ---------------------------------------------------------
   * DATA
   * --------------------------------------------------------- */

  const { data: classes = [] } = useClasses();

  const [classId, setClassId] = useState("");

  const today = useToday();

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(today);

  const [studentSearch, setStudentSearch] = useState("");

  const {
    data: raw = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useAttendanceHistory(classId || undefined, startDate || undefined, endDate || undefined);

  const rows = (raw as AttendanceHistoryRow[]).filter((row) => {
    const needle = studentSearch.toLowerCase().trim();
    if (!needle) return true;

    const name = (row.students?.full_name ?? "").toLowerCase();
    const admission = (row.students?.admission_number ?? "").toLowerCase();

    return name.includes(needle) || admission.includes(needle);
  });

  /* ---------------------------------------------------------
   * INITIAL CLASS
   * --------------------------------------------------------- */

  useEffect(() => {
    if (classes.length > 0 && !classId) {
      setClassId((classes[0] as ClassItem).id);
    }
  }, [classes, classId]);

  /* ---------------------------------------------------------
   * SUMMARY
   * --------------------------------------------------------- */

  const summary = useMemo(() => summarizeAttendance(rows), [rows]);

  /*
   * When the search uniquely identifies a single student, show that
   * student's compact history summary instead of the aggregate.
   */
  const studentIds = useMemo(() => Array.from(new Set(rows.map((row) => row.student_id))), [rows]);

  const studentSearchActive = studentSearch.trim().length > 0;
  const focusedStudentId = studentSearchActive && studentIds.length === 1 ? studentIds[0] : null;

  const focusedStudent = focusedStudentId
    ? rows.find((row) => row.student_id === focusedStudentId)
    : null;

  /* ---------------------------------------------------------
   * UI
   * --------------------------------------------------------- */

  return (
    <div className="space-y-4">
      {/* ==================================================
       * FILTERS
       * ================================================== */}

      <div className="surface-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="h-class">Class</Label>
          <select
            id="h-class"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Select class</option>
            {classes.map((item) => {
              const cls = item as ClassItem;
              return (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="h-from">From</Label>
          <Input
            id="h-from"
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="h-to">To</Label>
          <Input
            id="h-to"
            type="date"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="h-search">Student search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="h-search"
              placeholder="Name or admission number"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* ==================================================
       * PER- STUDENT COMPACT SUMMARY
       * ================================================== */}

      {focusedStudent && (
        <section className="surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{focusedStudent.students?.full_name ?? "Student"}</p>
              <p className="text-xs text-muted-foreground">
                Admission #: {focusedStudent.students?.admission_number ?? "—"}
              </p>
            </div>
            <Badge variant="secondary">
              <Lock className="mr-1 h-3 w-3" />
              Historical — read only
            </Badge>
          </div>
        </section>
      )}

      {/* ==================================================
       * SUMMARY STATS
       * ================================================== */}

      <div
        className={cn(
          "grid gap-3",
          focusedStudent ? "sm:grid-cols-2 md:grid-cols-4" : "sm:grid-cols-2 md:grid-cols-5",
        )}
      >
        <StatCard
          label="Attendance"
          value={summary.percentage === null ? "—" : `${summary.percentage.toFixed(1)}%`}
        />
        <StatCard label="Present" value={summary.present} />
        <StatCard label="Late" value={summary.late} />
        <StatCard label="Absent" value={summary.absent} />
        <StatCard label="Recorded days" value={summary.recorded} />
      </div>

      {/* ==================================================
       * HISTORY TABLE
       * ================================================== */}

      {isLoading ? (
        <div className="surface-card divide-y divide-border">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-3 p-3">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/5" />
              <Skeleton className="h-4 w-1/5" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load attendance history</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Something went wrong."}
          </AlertDescription>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="mr-2 h-3 w-3" />
              Retry
            </Button>
          </div>
        </Alert>
      ) : rows.length === 0 ? (
        <div className="surface-card p-6 text-center">
          <p className="font-semibold">No attendance records found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {studentSearchActive
              ? "Try a different student name or admission number."
              : "No records match the selected class and date range."}
          </p>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">Admission No.</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Recorded By</th>
                <th className="px-3 py-3">Recorded At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const isLocked = row.attendance_date < today;

                return (
                  <tr key={row.id}>
                    <td className="px-4 py-2 align-middle">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {format(parseISO(row.attendance_date), "PP")}
                        {isLocked && (
                          <Lock
                            className="h-3.5 w-3.5 text-muted-foreground"
                            aria-label="Locked: previous date"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle">{row.students?.full_name ?? "—"}</td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">
                      {row.students?.admission_number ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <StatusBadge status={row.status as Status} />
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">
                      {row.profiles?.full_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 align-middle text-muted-foreground">
                      {row.created_at ? format(parseISO(row.created_at), "PPp") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========================================================
 * PAGE
 * ========================================================= */

function AttendancePage() {
  return (
    <AppShell title="Attendance" description="Daily register & history — works offline">
      <Tabs defaultValue="register" className="w-full">
        <TabsList className="mb-4 grid w-full grid-cols-2 sm:flex">
          <TabsTrigger value="register">Daily Register</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="register">
          <DailyRegister />
        </TabsContent>

        <TabsContent value="history">
          <AttendanceHistory />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

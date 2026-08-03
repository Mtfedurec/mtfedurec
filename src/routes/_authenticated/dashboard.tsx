import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  ClipboardList,
  ShieldCheck,
  Users,
  GraduationCap,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, StatCard } from "@/components/app-shell";
import { useClasses, useProfile, useStudents, useTerms } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MayDan EduRecord" },
      {
        name: "description",
        content: "Daily overview of attendance, assessment progress and pending approvals.",
      },
      { property: "og:title", content: "Dashboard — MayDan EduRecord" },
      { property: "og:description", content: "Daily academic overview for school staff." },
    ],
  }),
  component: Dashboard,
});

const QUICK = [
  { to: "/attendance", label: "Take attendance", icon: CalendarCheck },
  { to: "/assessment", label: "Enter scores", icon: ClipboardList },
  { to: "/reports", label: "Report cards", icon: FileText },
  { to: "/students", label: "Students", icon: Users },
] as const;

function Dashboard() {
  const { data: profile } = useProfile();
  const { data: classes = [] } = useClasses();
  const { data: students = [] } = useStudents();
  const { data: terms = [] } = useTerms();
  const currentTerm = terms.find((t) => (t as { is_current: boolean }).is_current) as
    | { id: string; name: string; academic_sessions?: { name: string } | null }
    | undefined;

  const today = new Date().toISOString().slice(0, 10);

  const { data: todayAttendance = 0 } = useQuery({
    queryKey: ["attendance-count", today],
    queryFn: async () => {
      const { count } = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("attendance_date", today);
      return count ?? 0;
    },
  });

  const { data: pending = 0 } = useQuery({
    queryKey: ["pending-corrections"],
    queryFn: async () => {
      const { count } = await supabase
        .from("correction_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
  });

  const noRole = profile && profile.roles.length === 0;

  return (
    <AppShell
      title={`Good day, ${profile?.fullName.split(" ")[0] ?? "there"}`}
      description={
        currentTerm
          ? `${currentTerm.academic_sessions?.name ?? ""} · ${currentTerm.name}`
          : "No current term set yet"
      }
    >
      {noRole && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          Your account has no role yet. Ask an administrator to assign you a role in Settings before
          recording data.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active students" value={students.length} icon={Users} />
        <StatCard label="Classes" value={classes.length} icon={GraduationCap} />
        <StatCard
          label="Attendance today"
          value={todayAttendance}
          hint="records saved"
          icon={CalendarCheck}
        />
        <StatCard
          label="Pending approvals"
          value={pending}
          hint="correction requests"
          icon={ShieldCheck}
        />
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick actions
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="surface-card flex items-center gap-3 p-4 transition-shadow hover:shadow-raised">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Icon className="size-4" />
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="surface-card p-5">
        <h2 className="text-base font-semibold">Classes</h2>
        {classes.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No classes yet. Create them under Classes &amp; subjects.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {classes.map((cls) => {
              const c = cls as { id: string; name: string; level: string | null };
              const size = students.filter(
                (s) => (s as { class_id: string | null }).class_id === c.id,
              ).length;
              return (
                <li key={c.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{size} students</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
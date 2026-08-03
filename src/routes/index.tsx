import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MayDan EduRecord — Offline-First School Academic Records" },
      {
        name: "description",
        content:
          "Replace paper registers with attendance, assessments, behaviour and report cards that keep working offline and sync automatically.",
      },
      { property: "og:title", content: "MayDan EduRecord" },
      {
        property: "og:description",
        content:
          "Smart. Secure. Offline. Accurate. Academic record management built for teachers and school administrators.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Attendance in seconds",
    body: "Mark a whole class present, absent or late from a phone — no register, no duplicates.",
  },
  {
    icon: ClipboardList,
    title: "Automatic calculations",
    body: "Tests, assignments and exams total themselves and map to your own grade scale.",
  },
  {
    icon: FileText,
    title: "Report cards on demand",
    body: "Grades, remarks, behaviour and comments assembled into a printable report card.",
  },
  {
    icon: WifiOff,
    title: "Works without internet",
    body: "Work is saved locally the moment the network drops and syncs the moment it returns.",
  },
  {
    icon: ShieldCheck,
    title: "Controlled corrections",
    body: "Teachers request changes, administrators approve them, and every action is logged.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="brand-gradient flex size-10 items-center justify-center rounded-xl text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold">MayDan EduRecord</p>
            <p className="text-xs text-muted-foreground">Smart. Secure. Offline. Accurate.</p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to="/auth">Staff sign in</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-8 pb-16 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-foreground">
              Phase One · single school deployment
            </span>
            <h2 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              The academic record room, in every teacher&apos;s pocket.
            </h2>
            <p className="mt-5 max-w-xl text-base text-muted-foreground">
              MayDan EduRecord replaces paper registers, manual score sheets and scattered
              spreadsheets with one secure system for attendance, assessment, behaviour and report
              cards — usable in a classroom with no connection at all.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Open the dashboard</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Create a staff account</Link>
              </Button>
            </div>
          </div>

          <div className="brand-gradient rounded-2xl p-6 text-primary-foreground shadow-raised">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/70">
              Today at a glance
            </p>
            <div className="mt-4 space-y-3">
              {[
                ["Attendance submitted", "3 of 3 classes"],
                ["Scores awaiting submission", "JSS 2A · Mathematics"],
                ["Correction requests", "1 pending approval"],
                ["Synchronization", "All changes synced"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl bg-primary-foreground/10 px-4 py-3 text-sm"
                >
                  <span className="text-primary-foreground/80">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="surface-card p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Icon className="size-4" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        MayDan EduRecord · Academic records management · Version 1.0
      </footer>
    </div>
  );
}

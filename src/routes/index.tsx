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
      {
        title:
          "MTF EduRec | School Records Management Software in Nigeria",
      },
      {
        name: "description",
        content:
          "Simplify school administration with MTF EduRec. Manage student attendance, assessments, academic records and report cards in one digital platform.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:site_name",
        content: "MTF EduRec",
      },
      {
        property: "og:title",
        content:
          "MTF EduRec | Academic Records Management for Schools",
      },
      {
        property: "og:description",
        content:
          "Organize student attendance, assessments and report cards with MTF EduRec, a digital academic records platform for schools.",
      },
      {
        property: "og:url",
        content: "https://mtfedurec.com.ng/",
      },
      {
        name: "twitter:card",
        content: "summary",
      },
      {
        name: "twitter:title",
        content: "MTF EduRec | School Records Management",
      },
      {
        name: "twitter:description",
        content:
          "Manage student attendance, assessments, academic records and report cards with MTF EduRec.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Attendance in seconds",
    body: "Record class attendance digitally and keep student attendance information organized.",
  },
  {
    icon: ClipboardList,
    title: "Automatic calculations",
    body: "Organize tests, assignments and examinations, with scores calculated according to your configured grading scale.",
  },
  {
    icon: FileText,
    title: "Report cards on demand",
    body: "Bring grades, remarks, behaviour assessments and comments together in printable student report cards.",
  },
  {
    icon: WifiOff,
    title: "Designed for offline work",
    body: "Work without a stable internet connection when offline functionality is available and configured for your deployment.",
  },
  {
    icon: ShieldCheck,
    title: "Controlled corrections",
    body: "Support a structured correction process in which teachers request changes and authorized administrators review them.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link
          to="/"
          className="flex items-center gap-3"
          aria-label="MTF EduRec homepage"
        >
          <span className="brand-gradient flex size-10 items-center justify-center rounded-xl text-primary-foreground">
            <GraduationCap className="size-5" />
          </span>

          <div>
            <p className="text-sm font-bold">MTF EduRec</p>
            <p className="text-xs text-muted-foreground">
              Smart. Secure. Offline. Accurate.
            </p>
          </div>
        </Link>

        <Button asChild size="sm">
          <Link to="/auth">Staff sign in</Link>
        </Button>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pt-8 pb-16 lg:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-foreground">
                Digital Academic Records for Schools
              </span>

              <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
                Simplify Academic Records Management with MTF EduRec
              </h1>

              <p className="mt-5 max-w-xl text-base text-muted-foreground">
                MTF EduRec helps schools organize student attendance,
                assessments, behaviour records and report cards in one
                digital platform. Reduce repetitive paperwork and make
                academic information easier to manage.
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

            <div
              className="brand-gradient rounded-2xl p-6 text-primary-foreground shadow-raised"
              aria-label="Academic records dashboard preview"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/70">
                Academic Records Overview
              </p>

              <div className="mt-4 space-y-3">
                {[
                  [
                    "Attendance management",
                    "Organized class records",
                  ],
                  [
                    "Continuous assessment",
                    "Scores and examinations",
                  ],
                  [
                    "Report cards",
                    "Student academic summaries",
                  ],
                  [
                    "Record management",
                    "Structured academic information",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 rounded-xl bg-primary-foreground/10 px-4 py-3 text-sm"
                  >
                    <span className="text-primary-foreground/80">
                      {label}
                    </span>

                    <span className="text-right font-semibold">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section
            className="mt-16"
            aria-labelledby="features-heading"
          >
            <div className="max-w-2xl">
              <h2
                id="features-heading"
                className="text-2xl font-bold sm:text-3xl"
              >
                Tools to Simplify School Academic Records
              </h2>

              <p className="mt-3 text-sm text-muted-foreground">
                Manage essential academic activities through a
                centralized digital platform designed around the
                needs of teachers and school administrators.
              </p>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <article
                  key={title}
                  className="surface-card p-5"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>

                  <h3 className="mt-4 text-base font-semibold">
                    {title}
                  </h3>

                  <p className="mt-2 text-sm text-muted-foreground">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section
            className="mt-16 rounded-2xl border border-border p-6 sm:p-8"
            aria-labelledby="cta-heading"
          >
            <h2
              id="cta-heading"
              className="text-2xl font-bold"
            >
              Bring Your School's Academic Records Together
            </h2>

            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Explore MTF EduRec and discover a more organized
              approach to attendance, assessments and student
              report cards.
            </p>

            <div className="mt-5">
              <Button asChild>
                <Link to="/auth">Get Started</Link>
              </Button>
            </div>
          </section>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground">
        <p>
          © {new Date().getFullYear()} MaytoyGraphix · MTF EduRec
        </p>
        <p className="mt-1">
          Academic Records Management for Schools
        </p>
      </footer>
    </div>
  );
}

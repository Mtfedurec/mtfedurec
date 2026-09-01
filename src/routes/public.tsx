import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/public")({
  component: PublicReportCardsPage,
});

function PublicReportCardsPage() {
  const { data: cards = [], error } = useQuery({
    queryKey: ["public-report-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_cards")
        .select(
          "*, students(full_name, admission_number, classes(name)), terms(name, academic_sessions(name))",
        )
        .eq("published", true)
        .order("published_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        student_id: string;
        term_id: string;
        average: number | null;
        published_at: string | null;
        teacher_comment: string | null;
        head_comment: string | null;
        students?: {
          full_name?: string;
          admission_number?: string;
          classes?: { name?: string } | null;
        } | null;
        terms?: { name?: string; academic_sessions?: { name?: string } | null } | null;
      }>;
    },
  });

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <EyeOff className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Unable to load published report cards</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            There was a problem loading the public report-card list. Please try again in a moment.
          </p>
          <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-900 dark:text-amber-100">
            <p className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4" /> Note
            </p>
            <p className="mt-1">Only records with published = true are shown here.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Public portal
        </p>
        <h1 className="mt-2 text-3xl font-bold">Published report cards</h1>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No published report cards are currently available.
        </div>
      ) : (
        <div className="grid gap-4">
          {cards.map((card) => (
            <article
              key={card.id}
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{card.students?.full_name ?? "Student"}</h2>
                  <p className="text-sm text-muted-foreground">
                    {card.students?.admission_number ?? "Admission number unavailable"} •{" "}
                    {card.students?.classes?.name ?? "Class not set"}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {card.terms?.academic_sessions?.name ?? card.terms?.name ?? "Term"}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Average</p>
                  <p className="text-lg font-semibold">{card.average ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Teacher remark
                  </p>
                  <p className="mt-1 text-sm">{card.teacher_comment ?? "No teacher remark"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Head teacher remark
                  </p>
                  <p className="mt-1 text-sm">{card.head_comment ?? "No head teacher remark"}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

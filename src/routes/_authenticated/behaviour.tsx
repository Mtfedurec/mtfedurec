import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AFFECTIVE_TRAITS, PSYCHOMOTOR_TRAITS, RATING_LABELS } from "@/lib/academic";
import { logAudit, useBehaviour, useClasses, useStudents, useTerms } from "@/lib/data";
import { useSync } from "@/lib/offline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/behaviour")({
  head: () => ({
    meta: [
      { title: "Behaviour assessment — MayDan EduRecord" },
      {
        name: "description",
        content:
          "Rate affective and psychomotor traits for each student to complete the report card.",
      },
      { property: "og:title", content: "Behaviour assessment — MayDan EduRecord" },
      { property: "og:description", content: "Affective and psychomotor trait ratings." },
    ],
  }),
  component: BehaviourPage,
});

const DOMAINS = [
  { key: "affective", label: "Affective domain", traits: AFFECTIVE_TRAITS },
  { key: "psychomotor", label: "Psychomotor domain", traits: PSYCHOMOTOR_TRAITS },
] as const;

function BehaviourPage() {
  const { data: classes = [] } = useClasses();
  const { data: terms = [] } = useTerms();
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [studentId, setStudentId] = useState("");
  const { data: students = [] } = useStudents(classId || undefined);
  const { data: existing = [] } = useBehaviour(studentId || undefined, termId || undefined);
  const { save } = useSync();
  const queryClient = useQueryClient();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (classes.length && !classId) setClassId((classes[0] as { id: string }).id);
    if (!termId) {
      const current = terms.find((t) => (t as { is_current: boolean }).is_current) as
        | { id: string }
        | undefined;
      if (current) setTermId(current.id);
      else if (terms.length) setTermId((terms[0] as { id: string }).id);
    }
  }, [classes, terms, classId, termId]);

  useEffect(() => {
    if (students.length) setStudentId((students[0] as { id: string }).id);
    else setStudentId("");
  }, [students]);

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const row of existing as { domain: string; trait: string; rating: number }[]) {
      next[`${row.domain}:${row.trait}`] = row.rating;
    }
    setRatings(next);
  }, [existing]);

  async function submit() {
    if (!studentId || !termId) return;
    const entries = Object.entries(ratings);
    if (entries.length === 0) {
      toast.error("Rate at least one trait.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const rows = entries.map(([key, rating]) => {
      const [domain, trait] = key.split(":");
      return {
        student_id: studentId,
        term_id: termId,
        domain,
        trait,
        rating,
        recorded_by: auth.user?.id ?? null,
      };
    });
    const result = await save({
      table: "behaviour_assessments",
      rows,
      onConflict: "student_id,term_id,domain,trait",
      label: "Behaviour ratings",
    });
    setSaving(false);
    if (result === "synced") {
      toast.success("Behaviour ratings saved");
      void logAudit("behaviour.saved", studentId, `${rows.length} traits`);
      void queryClient.invalidateQueries({ queryKey: ["behaviour"] });
    }
  }

  return (
    <AppShell title="Behaviour assessment" description="Rate each trait from 1 to 5">
      <div className="surface-card grid gap-4 p-4 sm:grid-cols-3">
        {[
          { label: "Class", value: classId, set: setClassId, options: classes },
          { label: "Term", value: termId, set: setTermId, options: terms },
        ].map(({ label, value, set, options }) => (
          <div key={label} className="space-y-2">
            <Label htmlFor={label}>{label}</Label>
            <select
              id={label}
              value={value}
              onChange={(e) => set(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {options.map((option) => {
                const item = option as { id: string; name: string };
                return (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                );
              })}
            </select>
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="student">Student</Label>
          <select
            id="student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {students.map((option) => {
              const item = option as { id: string; full_name: string };
              return (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {DOMAINS.map((domain) => (
        <section key={domain.key} className="surface-card p-4">
          <h2 className="text-base font-semibold">{domain.label}</h2>
          <div className="mt-3 space-y-3">
            {domain.traits.map((trait) => {
              const key = `${domain.key}:${trait}`;
              return (
                <div key={trait} className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">{trait}</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        title={RATING_LABELS[rating]}
                        onClick={() => setRatings((r) => ({ ...r, [key]: rating }))}
                        className={cn(
                          "size-9 rounded-md border text-xs font-semibold transition-colors",
                          ratings[key] === rating
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <Button disabled={saving || !studentId} onClick={() => void submit()}>
        Save behaviour ratings
      </Button>
    </AppShell>
  );
}
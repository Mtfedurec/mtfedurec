import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  logAudit,
  useClasses,
  useComponents,
  useGradeScale,
  useScores,
  useStudents,
  useSubjects,
  useTerms,
} from "@/lib/data";
import { gradeFor, type GradeBand } from "@/lib/academic";
import { useSync } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/assessment")({
  head: () => ({
    meta: [
      { title: "Assessment scores — MayDan EduRecord" },
      {
        name: "description",
        content:
          "Enter test, assignment and exam scores with automatic totals, grades and remarks.",
      },
      { property: "og:title", content: "Assessment scores — MayDan EduRecord" },
      {
        property: "og:description",
        content: "Score entry with automatic totals, grades and remarks.",
      },
    ],
  }),
  component: AssessmentPage,
});

type Component = { id: string; name: string; max_score: number };

function AssessmentPage() {
  const { data: classes = [] } = useClasses();
  const { data: subjects = [] } = useSubjects();
  const { data: terms = [] } = useTerms();
  const { data: components = [] } = useComponents();
  const { data: bands = [] } = useGradeScale();
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");
  const { data: students = [] } = useStudents(classId || undefined);
  const { data: scores = [] } = useScores(
    classId || undefined,
    subjectId || undefined,
    termId || undefined,
  );
  const { save } = useSync();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (classes.length && !classId) setClassId((classes[0] as { id: string }).id);
    if (subjects.length && !subjectId) setSubjectId((subjects[0] as { id: string }).id);
    if (!termId) {
      const current = terms.find((t) => (t as { is_current: boolean }).is_current) as
        | { id: string }
        | undefined;
      if (current) setTermId(current.id);
      else if (terms.length) setTermId((terms[0] as { id: string }).id);
    }
  }, [classes, subjects, terms, classId, subjectId, termId]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of scores as { student_id: string; component_id: string; score: number }[]) {
      next[`${row.student_id}:${row.component_id}`] = String(row.score);
    }
    setValues(next);
  }, [scores]);

  const comps = components as Component[];
  const maxTotal = useMemo(() => comps.reduce((sum, c) => sum + Number(c.max_score), 0), [comps]);

  function totalFor(studentId: string) {
    return comps.reduce((sum, c) => sum + (Number(values[`${studentId}:${c.id}`]) || 0), 0);
  }

  async function submit(state: "draft" | "submitted") {
    if (!classId || !subjectId || !termId) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const rows = Object.entries(values)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => {
        const [student_id, component_id] = key.split(":");
        return {
          student_id,
          component_id,
          subject_id: subjectId,
          term_id: termId,
          score: Number(value),
          state,
          recorded_by: auth.user?.id ?? null,
        };
      });
    if (rows.length === 0) {
      setSaving(false);
      toast.error("Enter at least one score.");
      return;
    }
    const result = await save({
      table: "assessment_scores",
      rows,
      onConflict: "student_id,subject_id,component_id,term_id",
      label: "Assessment scores",
    });
    setSaving(false);
    if (result === "synced") {
      toast.success(state === "draft" ? "Draft saved" : "Scores submitted");
      void logAudit(`scores.${state}`, subjectId, `${rows.length} scores`);
      void queryClient.invalidateQueries({ queryKey: ["scores"] });
    }
  }

  return (
    <AppShell title="Assessment scores" description={`Totals out of ${maxTotal}`}>
      <div className="surface-card grid gap-4 p-4 sm:grid-cols-3">
        {[
          { label: "Class", value: classId, set: setClassId, options: classes },
          { label: "Subject", value: subjectId, set: setSubjectId, options: subjects },
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
      </div>

      <div className="surface-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Student</th>
              {comps.map((c) => (
                <th key={c.id} className="px-3 py-3">
                  {c.name} ({c.max_score})
                </th>
              ))}
              <th className="px-3 py-3">Total</th>
              <th className="px-3 py-3">Grade</th>
              <th className="px-4 py-3">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((s) => {
              const student = s as { id: string; full_name: string };
              const total = totalFor(student.id);
              const band = gradeFor(total, bands as GradeBand[]);
              return (
                <tr key={student.id}>
                  <td className="px-4 py-2 font-medium">{student.full_name}</td>
                  {comps.map((c) => (
                    <td key={c.id} className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={c.max_score}
                        className="h-9 w-20"
                        value={values[`${student.id}:${c.id}`] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [`${student.id}:${c.id}`]: e.target.value }))
                        }
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 font-semibold">{total}</td>
                  <td className="px-3 py-2 font-semibold">{band?.grade ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{band?.remark ?? "—"}</td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={comps.length + 4}>
                  No active students in this class.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={saving} onClick={() => void submit("draft")}>
          Save draft
        </Button>
        <Button disabled={saving} onClick={() => void submit("submitted")}>
          Submit scores
        </Button>
      </div>
    </AppShell>
  );
}
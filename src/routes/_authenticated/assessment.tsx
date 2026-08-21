import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  useStudents,
  useSubjects,
  useScores,
} from "@/lib/data";

import { useSync } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/assessment")({
  head: () => ({
    meta: [
      {
        title: "Assessment scores — MayDan EduRecord",
      },
      {
        name: "description",
        content:
          "Enter test, assignment and exam scores with automatic totals, grades and remarks.",
      },
      {
        property: "og:title",
        content: "Assessment scores — MayDan EduRecord",
      },
      {
        property: "og:description",
        content:
          "Score entry with automatic totals, grades and remarks.",
      },
    ],
  }),
  component: AssessmentPage,
});

type Component = {
  id: string;
  name: string;
  max_score: number;
  position?: number;
};

type ScoreRow = {
  student_id: string;
  component_id: string;
  score: number;
};

type Term = {
  id: string;
  session_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
};

type GradeBand = {
  id?: string;
  min_score: number;
  max_score: number;
  grade: string;
  remark: string;
};

type SelectItem = {
  id: string;
  name?: string | null;
};

const DEFAULT_GRADE_SCALE: GradeBand[] = [
  {
    min_score: 70,
    max_score: 100,
    grade: "A",
    remark: "Excellent",
  },
  {
    min_score: 60,
    max_score: 69,
    grade: "B",
    remark: "Very Good",
  },
  {
    min_score: 50,
    max_score: 59,
    grade: "C",
    remark: "Good",
  },
  {
    min_score: 45,
    max_score: 49,
    grade: "D",
    remark: "Fair",
  },
  {
    min_score: 40,
    max_score: 44,
    grade: "E",
    remark: "Pass",
  },
  {
    min_score: 0,
    max_score: 39,
    grade: "F",
    remark: "Fail",
  },
];

function findGrade(
  total: number,
  bands: GradeBand[],
): GradeBand | null {
  const numericTotal = Number(total);

  if (!Number.isFinite(numericTotal)) {
    return null;
  }

  return (
    bands.find((band) => {
      const minimum = Number(band.min_score);
      const maximum = Number(band.max_score);

      return (
        numericTotal >= minimum &&
        numericTotal <= maximum
      );
    }) ?? null
  );
}

function AssessmentPage() {
  /*
   * ---------------------------------------------------------
   * BASIC DATA
   * ---------------------------------------------------------
   */

  const {
    data: classes = [],
    isLoading: classesLoading,
  } = useClasses();

  const {
    data: subjects = [],
    isLoading: subjectsLoading,
  } = useSubjects();

  const {
    data: components = [],
    isLoading: componentsLoading,
  } = useComponents();

  /*
   * ---------------------------------------------------------
   * TERMS
   *
   * IMPORTANT:
   * We intentionally query the terms table directly.
   *
   * We do NOT join academic_sessions here because the
   * assessment page only needs the term columns.
   * ---------------------------------------------------------
   */

  const {
    data: terms = [],
    isLoading: termsLoading,
    isError: termsError,
    error: termsQueryError,
  } = useQuery<Term[], Error>({
    queryKey: ["assessment-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select(
          "id, session_id, name, start_date, end_date, is_current",
        )
        .order("start_date", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return (data ?? []) as Term[];
    },
  });

  /*
   * ---------------------------------------------------------
   * GRADING SCALE
   * ---------------------------------------------------------
   */

  const {
    data: databaseBands = [],
    isLoading: gradeLoading,
    isError: gradeError,
    error: gradeQueryError,
  } = useQuery<GradeBand[], Error>({
    queryKey: ["assessment-grade-scale"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grade_scale")
        .select(
          "id, min_score, max_score, grade, remark",
        )
        .order("min_score", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      return (data ?? []) as GradeBand[];
    },
  });

  /*
   * If the database grading scale is available, use it.
   *
   * If it is temporarily unavailable, use the Nigerian
   * default scale defined above so that grading still works.
   *
   * The database remains the source of truth whenever rows
   * are available.
   */

  const bands =
    databaseBands.length > 0
      ? databaseBands
      : DEFAULT_GRADE_SCALE;

  /*
   * ---------------------------------------------------------
   * SELECTIONS
   * ---------------------------------------------------------
   */

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");

  /*
   * ---------------------------------------------------------
   * STUDENTS
   * ---------------------------------------------------------
   */

  const {
    data: students = [],
  } = useStudents(
    classId || undefined,
  );

  /*
   * ---------------------------------------------------------
   * SAVED SCORES
   * ---------------------------------------------------------
   */

  const {
    data: scores = [],
  } = useScores(
    classId || undefined,
    subjectId || undefined,
    termId || undefined,
  );

  const { save } = useSync();

  const queryClient = useQueryClient();

  /*
   * values stores every score currently displayed/typed.
   *
   * Key format:
   *
   * studentId:componentId
   *
   * Example:
   *
   * abc123:test1
   * ---------------------------------------------------------
   */

  const [values, setValues] =
    useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);

  const comps = components as Component[];

  /*
   * ---------------------------------------------------------
   * INITIAL SELECTIONS
   * ---------------------------------------------------------
   *
   * Automatically select:
   *
   * - first class
   * - first subject
   * - current term
   *
   * The current term in your database is First Term.
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (
      classes.length > 0 &&
      !classId
    ) {
      const firstClass =
        classes[0] as SelectItem;

      setClassId(firstClass.id);
    }

    if (
      subjects.length > 0 &&
      !subjectId
    ) {
      const firstSubject =
        subjects[0] as SelectItem;

      setSubjectId(firstSubject.id);
    }

    if (
      terms.length > 0 &&
      !termId
    ) {
      const currentTerm =
        terms.find(
          (term) => term.is_current === true,
        );

      if (currentTerm) {
        setTermId(currentTerm.id);
      } else {
        setTermId(terms[0].id);
      }
    }
  }, [
    classes,
    subjects,
    terms,
    classId,
    subjectId,
    termId,
  ]);

  /*
   * ---------------------------------------------------------
   * LOAD EXISTING SCORES
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!scores || scores.length === 0) {
      return;
    }

    const databaseValues: Record<
      string,
      string
    > = {};

    for (
      const row of scores as ScoreRow[]
    ) {
      databaseValues[
        `${row.student_id}:${row.component_id}`
      ] = String(row.score);
    }

    setValues((current) => ({
      ...databaseValues,
      ...current,
    }));
  }, [scores]);

  /*
   * ---------------------------------------------------------
   * MAXIMUM TOTAL
   * ---------------------------------------------------------
   *
   * Expected:
   *
   * Test 1       15
   * Test 2       15
   * Assignment   10
   * Exam         60
   *
   * TOTAL        100
   * ---------------------------------------------------------
   */

  const maxTotal = useMemo(() => {
    return comps.reduce(
      (sum, component) =>
        sum +
        Number(component.max_score),
      0,
    );
  }, [comps]);

  /*
   * ---------------------------------------------------------
   * TOTAL CALCULATION
   * ---------------------------------------------------------
   */

  function totalFor(
    studentId: string,
  ): number {
    return comps.reduce(
      (sum, component) => {
        const key =
          `${studentId}:${component.id}`;

        const rawValue = values[key];

        if (
          rawValue === undefined ||
          rawValue === ""
        ) {
          return sum;
        }

        const numberValue =
          Number(rawValue);

        if (
          !Number.isFinite(numberValue)
        ) {
          return sum;
        }

        return sum + numberValue;
      },
      0,
    );
  }

  /*
   * ---------------------------------------------------------
   * SAVE / SUBMIT
   * ---------------------------------------------------------
   */

  async function submit(
    state: "draft" | "submitted",
  ) {
    if (!classId) {
      toast.error(
        "Please select a class.",
      );
      return;
    }

    if (!subjectId) {
      toast.error(
        "Please select a subject.",
      );
      return;
    }

    if (!termId) {
      toast.error(
        "Please select a term.",
      );
      return;
    }

    const enteredRows =
      Object.entries(values).filter(
        ([, value]) =>
          value !== "",
      );

    if (
      enteredRows.length === 0
    ) {
      toast.error(
        "Enter at least one score.",
      );
      return;
    }

    setSaving(true);

    try {
      const {
        data: auth,
        error: authError,
      } =
        await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const rows =
        enteredRows.map(
          ([key, value]) => {
            const [
              student_id,
              component_id,
            ] = key.split(":");

            const numericScore =
              Number(value);

            return {
              student_id,
              component_id,
              subject_id: subjectId,
              term_id: termId,
              score: numericScore,
              state,
              recorded_by:
                auth.user?.id ?? null,
            };
          },
        );

      const result =
        await save({
          table:
            "assessment_scores",
          rows,
          onConflict:
            "student_id,subject_id,component_id,term_id",
          label:
            "Assessment scores",
        });

      if (
        result === "synced"
      ) {
        toast.success(
          state === "draft"
            ? "Draft saved successfully."
            : "Scores submitted successfully.",
        );

        void logAudit(
          `scores.${state}`,
          subjectId,
          `${rows.length} scores`,
        );

        await queryClient.invalidateQueries(
          {
            queryKey: [
              "scores",
            ],
          },
        );
      } else {
        toast.error(
          "The scores could not be saved.",
        );
      }
    } catch (error) {
      console.error(
        "Assessment save error:",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save assessment scores.",
      );
    } finally {
      setSaving(false);
    }
  }

  /*
   * ---------------------------------------------------------
   * PAGE
   * ---------------------------------------------------------
   */

  return (
    <AppShell
      title="Assessment scores"
      description={`Totals out of ${maxTotal}`}
    >
      {/* =====================================================
          CLASS / SUBJECT / TERM
          ===================================================== */}

      <div className="surface-card grid gap-4 p-4 sm:grid-cols-3">
        {/* CLASS */}

        <div className="space-y-2">
          <Label htmlFor="assessment-class">
            Class
          </Label>

          <select
            id="assessment-class"
            value={classId}
            onChange={(event) => {
              setClassId(
                event.target.value,
              );

              setValues({});
            }}
            disabled={classesLoading}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">
              {classesLoading
                ? "Loading classes..."
                : classes.length === 0
                  ? "No classes available"
                  : "Select class"}
            </option>

            {classes.map(
              (option) => {
                const item =
                  option as SelectItem;

                return (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name ??
                      "Unnamed class"}
                  </option>
                );
              },
            )}
          </select>
        </div>

        {/* SUBJECT */}

        <div className="space-y-2">
          <Label htmlFor="assessment-subject">
            Subject
          </Label>

          <select
            id="assessment-subject"
            value={subjectId}
            onChange={(event) => {
              setSubjectId(
                event.target.value,
              );

              setValues({});
            }}
            disabled={
              subjectsLoading
            }
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">
              {subjectsLoading
                ? "Loading subjects..."
                : subjects.length === 0
                  ? "No subjects available"
                  : "Select subject"}
            </option>

            {subjects.map(
              (option) => {
                const item =
                  option as SelectItem;

                return (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name ??
                      "Unnamed subject"}
                  </option>
                );
              },
            )}
          </select>
        </div>

        {/* TERM */}

        <div className="space-y-2">
          <Label htmlFor="assessment-term">
            Term
          </Label>

          <select
            id="assessment-term"
            value={termId}
            onChange={(event) => {
              setTermId(
                event.target.value,
              );

              setValues({});
            }}
            disabled={termsLoading}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">
              {termsLoading
                ? "Loading terms..."
                : terms.length === 0
                  ? "No terms available"
                  : "Select term"}
            </option>

            {terms.map(
              (term) => (
                <option
                  key={term.id}
                  value={term.id}
                >
                  {term.name}
                  {term.is_current
                    ? " (Current)"
                    : ""}
                </option>
              ),
            )}
          </select>

          {termsError && (
            <p className="text-xs text-destructive">
              Failed to load terms:
              {" "}
              {termsQueryError?.message ??
                "Unknown database error"}
            </p>
          )}

          {!termsLoading &&
            !termsError &&
            terms.length === 0 && (
              <p className="text-xs text-destructive">
                No academic terms exist
                in the database.
              </p>
            )}
        </div>
      </div>

      {/* =====================================================
          ASSESSMENT TABLE
          ===================================================== */}

      <div className="surface-card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">
                Student
              </th>

              {comps.map(
                (component) => (
                  <th
                    key={
                      component.id
                    }
                    className="px-3 py-3"
                  >
                    {component.name}
                    {" "}
                    (
                    {
                      component.max_score
                    }
                    )
                  </th>
                ),
              )}

              <th className="px-3 py-3">
                Total
              </th>

              <th className="px-3 py-3">
                Grade
              </th>

              <th className="px-4 py-3">
                Remark
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {students.map(
              (studentRow) => {
                const student =
                  studentRow as {
                    id: string;
                    full_name: string;
                  };

                const total =
                  totalFor(
                    student.id,
                  );

                const grade =
                  findGrade(
                    total,
                    bands,
                  );

                return (
                  <tr
                    key={
                      student.id
                    }
                  >
                    {/* STUDENT */}

                    <td className="px-4 py-2 font-medium">
                      {
                        student.full_name
                      }
                    </td>

                    {/* SCORE INPUTS */}

                    {comps.map(
                      (
                        component,
                      ) => {
                        const key =
                          `${student.id}:${component.id}`;

                        const currentValue =
                          values[
                            key
                          ] ?? "";

                        return (
                          <td
                            key={
                              component.id
                            }
                            className="px-3 py-2"
                          >
                            <Input
                              type="number"
                              min={0}
                              max={
                                Number(
                                  component.max_score,
                                )
                              }
                              step="1"
                              inputMode="numeric"
                              className="h-9 w-20"
                              value={
                                currentValue
                              }
                              onChange={(
                                event,
                              ) => {
                                const inputValue =
                                  event
                                    .target
                                    .value;

                                /*
                                 * Allow clearing
                                 * the field.
                                 */

                                if (
                                  inputValue ===
                                  ""
                                ) {
                                  setValues(
                                    (
                                      current,
                                    ) => ({
                                      ...current,
                                      [key]:
                                        "",
                                    }),
                                  );

                                  return;
                                }

                                const numericValue =
                                  Number(
                                    inputValue,
                                  );

                                /*
                                 * Reject invalid
                                 * numbers.
                                 */

                                if (
                                  !Number.isFinite(
                                    numericValue,
                                  )
                                ) {
                                  return;
                                }

                                /*
                                 * Reject values
                                 * below zero.
                                 */

                                if (
                                  numericValue <
                                  0
                                ) {
                                  return;
                                }

                                /*
                                 * Reject values
                                 * above the
                                 * component max.
                                 */

                                if (
                                  numericValue >
                                  Number(
                                    component.max_score,
                                  )
                                ) {
                                  return;
                                }

                                /*
                                 * Store the value.
                                 *
                                 * This immediately
                                 * causes React to
                                 * recalculate:
                                 *
                                 * TOTAL
                                 * GRADE
                                 * REMARK
                                 */

                                setValues(
                                  (
                                    current,
                                  ) => ({
                                    ...current,
                                    [key]:
                                      inputValue,
                                  }),
                                );
                              }}
                            />
                          </td>
                        );
                      },
                    )}

                    {/* TOTAL */}

                    <td className="px-3 py-2 font-semibold">
                      {total}
                    </td>

                    {/* GRADE */}

                    <td className="px-3 py-2 font-semibold">
                      {grade
                        ? grade.grade
                        : "—"}
                    </td>

                    {/* REMARK */}

                    <td className="px-4 py-2 text-muted-foreground">
                      {grade
                        ? grade.remark
                        : "—"}
                    </td>
                  </tr>
                );
              },
            )}

            {/* NO STUDENTS */}

            {students.length ===
              0 && (
              <tr>
                <td
                  className="px-4 py-4 text-muted-foreground"
                  colSpan={
                    comps.length + 4
                  }
                >
                  {classId
                    ? "No active students in this class."
                    : "Select a class to view students."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* =====================================================
          COMPONENT STATUS
          ===================================================== */}

      {componentsLoading && (
        <p className="text-sm text-muted-foreground">
          Loading assessment
          components...
        </p>
      )}

      {comps.length === 0 &&
        !componentsLoading && (
          <p className="text-sm text-destructive">
            No assessment
            components were
            returned from the
            database.
          </p>
        )}

      {/* =====================================================
          GRADING STATUS
          ===================================================== */}

      {gradeError && (
        <p className="text-sm text-destructive">
          Database grading scale
          could not be loaded:
          {" "}
          {gradeQueryError?.message ??
            "Unknown database error"}
          .
          <br />
          The standard Nigerian
          grading scale is being
          used temporarily.
        </p>
      )}

      {!gradeLoading &&
        !gradeError &&
        databaseBands.length ===
          0 && (
          <p className="text-sm text-muted-foreground">
            No grading rows were
            found in the database.
            The standard Nigerian
            grading scale is being
            used temporarily.
          </p>
        )}

      {/* =====================================================
          SAVE BUTTONS
          ===================================================== */}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={
            saving ||
            !classId ||
            !subjectId ||
            !termId
          }
          onClick={() =>
            void submit("draft")
          }
        >
          {saving
            ? "Saving..."
            : "Save draft"}
        </Button>

        <Button
          disabled={
            saving ||
            !classId ||
            !subjectId ||
            !termId
          }
          onClick={() =>
            void submit(
              "submitted",
            )
          }
        >
          {saving
            ? "Submitting..."
            : "Submit scores"}
        </Button>
      </div>
    </AppShell>
  );
}
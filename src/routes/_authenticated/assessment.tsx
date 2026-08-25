import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  FileClock,
  Loader2,
  RefreshCw,
} from "lucide-react";

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
          "Enter, save and review assessment scores with automatic totals, grades and remarks.",
      },
      {
        property: "og:title",
        content: "Assessment scores — MayDan EduRecord",
      },
      {
        property: "og:description",
        content:
          "Enter, save and review assessment scores with automatic totals, grades and remarks.",
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

type Student = {
  id: string;
  full_name: string;
  class_id?: string | null;
};

type SelectItem = {
  id: string;
  name?: string | null;
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

type AssessmentScore = {
  id?: string;
  student_id: string;
  subject_id: string;
  component_id: string;
  term_id: string;
  score: number;
  state: "draft" | "submitted";
  recorded_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

type AssessmentRecord = {
  key: string;
  classId: string;
  subjectId: string;
  termId: string;
  state: "draft" | "submitted";
  scoreCount: number;
  studentCount: number;
  updatedAt: string | null;
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
    max_score: 69.99,
    grade: "B",
    remark: "Very Good",
  },
  {
    min_score: 50,
    max_score: 59.99,
    grade: "C",
    remark: "Good",
  },
  {
    min_score: 45,
    max_score: 49.99,
    grade: "D",
    remark: "Pass",
  },
  {
    min_score: 40,
    max_score: 44.99,
    grade: "E",
    remark: "Fair",
  },
  {
    min_score: 0,
    max_score: 39.99,
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

function formatDate(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const comps = components as Component[];

  /*
   * ---------------------------------------------------------
   * TERMS
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

  const bands =
    databaseBands.length > 0
      ? databaseBands
      : DEFAULT_GRADE_SCALE;

  /*
   * ---------------------------------------------------------
   * PAGE MODE
   * ---------------------------------------------------------
   *
   * entry = enter/edit scores
   * records = teacher's previous records
   */

  const [pageMode, setPageMode] = useState<
    "entry" | "records"
  >("entry");

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
    data: studentRows = [],
    isLoading: studentsLoading,
  } = useStudents(classId || undefined);

  const students = studentRows as Student[];

  /*
   * ---------------------------------------------------------
   * CURRENT SCORE VALUES
   * ---------------------------------------------------------
   */

  const [values, setValues] =
    useState<Record<string, string>>({});

  const [saving, setSaving] =
    useState(false);

  const { save, online, pending } = useSync();

  const queryClient = useQueryClient();

  /*
   * ---------------------------------------------------------
   * TEACHER ID
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * Use getSession() instead of getUser().
   *
   * getUser() can make a network request.
   * getSession() reads the locally persisted Supabase
   * session and therefore works when the device is offline.
   * This is important for offline score entry.
   */

  const {
    data: currentUser,
    isLoading: userLoading,
  } = useQuery({
    queryKey: ["assessment-current-user"],
    queryFn: async () => {
      const {
        data,
        error,
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      return data.session?.user ?? null;
    },
  });

  /*
   * ---------------------------------------------------------
   * MY ASSESSMENT SCORES
   * ---------------------------------------------------------
   *
   * This retrieves only records created by the logged-in
   * teacher.
   */

  const {
    data: myScores = [],
    isLoading: recordsLoading,
    isError: recordsError,
    error: recordsQueryError,
    refetch: refetchRecords,
  } = useQuery<AssessmentScore[], Error>({
    queryKey: [
      "my-assessment-scores",
      currentUser?.id,
    ],
    enabled: Boolean(currentUser?.id) && online,
    queryFn: async () => {
      if (!currentUser?.id) {
        return [];
      }

      const {
        data,
        error,
      } = await supabase
        .from("assessment_scores")
        .select(
          "id, student_id, subject_id, component_id, term_id, score, state, recorded_by, created_at, updated_at",
        )
        .eq(
          "recorded_by",
          currentUser.id,
        )
        .order("updated_at", {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      return (data ?? []) as AssessmentScore[];
    },
  });

  /*
   * ---------------------------------------------------------
   * INITIAL SELECTIONS
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
          (term) =>
            term.is_current === true,
        );

      if (currentTerm) {
        setTermId(currentTerm.id);
      } else if (terms[0]) {
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
   * LOAD EXISTING SCORES FOR SELECTED RECORD
   * ---------------------------------------------------------
   */

  async function loadRecord(
    record: AssessmentRecord,
  ) {
    setPageMode("entry");

    setClassId(record.classId);
    setSubjectId(record.subjectId);
    setTermId(record.termId);

    setValues({});

    const {
      data,
      error,
    } = await supabase
      .from("assessment_scores")
      .select(
        "student_id, subject_id, component_id, term_id, score, state, recorded_by",
      )
      .eq(
        "recorded_by",
        currentUser?.id ?? "",
      )
      .eq(
        "subject_id",
        record.subjectId,
      )
      .eq(
        "term_id",
        record.termId,
      );

    if (error) {
      toast.error(
        `Could not load this record: ${error.message}`,
      );
      return;
    }

    const loadedValues: Record<
      string,
      string
    > = {};

    for (const row of (data ?? []) as AssessmentScore[]) {
      loadedValues[
        `${row.student_id}:${row.component_id}`
      ] = String(row.score);
    }

    setValues(loadedValues);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  /*
   * ---------------------------------------------------------
   * BUILD RECORD LIST
   * ---------------------------------------------------------
   */

  const records = useMemo<
    AssessmentRecord[]
  >(() => {
    const classMap = new Map(
      classes.map((item) => {
        const value =
          item as SelectItem;

        return [
          value.id,
          value.name ??
            "Unnamed class",
        ];
      }),
    );

    const subjectMap = new Map(
      subjects.map((item) => {
        const value =
          item as SelectItem;

        return [
          value.id,
          value.name ??
            "Unnamed subject",
        ];
      }),
    );

    const termMap = new Map(
      terms.map((term) => [
        term.id,
        term.name,
      ]),
    );

    const grouped =
      new Map<
        string,
        {
          classId: string;
          subjectId: string;
          termId: string;
          states: Set<
            "draft" | "submitted"
          >;
          students: Set<string>;
          count: number;
          updatedAt: string | null;
        }
      >();

    const studentClassMap =
      new Map(
        students.map((student) => [
          student.id,
          student.class_id ?? "",
        ]),
      );

    for (const score of myScores) {
      const resolvedClassId =
        studentClassMap.get(
          score.student_id,
        );

      if (!resolvedClassId) {
        continue;
      }

      const key =
        `${resolvedClassId}:${score.subject_id}:${score.term_id}`;

      const existing =
        grouped.get(key);

      if (existing) {
        existing.count += 1;

        existing.students.add(
          score.student_id,
        );

        existing.states.add(
          score.state,
        );

        if (
          !existing.updatedAt ||
          (score.updated_at &&
            score.updated_at >
              existing.updatedAt)
        ) {
          existing.updatedAt =
            score.updated_at ??
            null;
        }
      } else {
        grouped.set(key, {
          classId: resolvedClassId,
          subjectId:
            score.subject_id,
          termId: score.term_id,
          states: new Set([
            score.state,
          ]),
          students: new Set([
            score.student_id,
          ]),
          count: 1,
          updatedAt:
            score.updated_at ??
            null,
        });
      }
    }

    /*
     * Keep these maps referenced so this memo remains
     * safe when the teacher changes classes, subjects or terms.
     */
    void classMap;
    void subjectMap;
    void termMap;

    return Array.from(
      grouped.values(),
    )
      .map((group): AssessmentRecord => ({
        key: `${group.classId}:${group.subjectId}:${group.termId}`,
        classId: group.classId,
        subjectId:
          group.subjectId,
        termId: group.termId,
        state:
          group.states.has(
            "draft",
          )
            ? "draft"
            : "submitted",
        scoreCount: group.count,
        studentCount:
          group.students.size,
        updatedAt:
          group.updatedAt,
      }))
      .sort((a, b) => {
        const aDate =
          a.updatedAt
            ? new Date(
                a.updatedAt,
              ).getTime()
            : 0;

        const bDate =
          b.updatedAt
            ? new Date(
                b.updatedAt,
              ).getTime()
            : 0;

        return bDate - aDate;
      });
  }, [
    myScores,
    students,
    classes,
    subjects,
    terms,
  ]);

  /*
   * ---------------------------------------------------------
   * COMPLETE RECORD LOOKUP
   * ---------------------------------------------------------
   *
   * This query retrieves the student's class_id directly,
   * allowing My Records to show old records even when that
   * class is not currently selected.
   */

  const {
    data: teacherRecords = [],
    isLoading:
      teacherRecordsLoading,
    refetch:
      refetchTeacherRecords,
  } = useQuery<AssessmentRecord[]>({
    queryKey: [
      "my-assessment-records",
      currentUser?.id,
    ],
    enabled:
      Boolean(currentUser?.id) &&
      online,
    queryFn: async (): Promise<AssessmentRecord[]> => {
      if (!currentUser?.id) {
        return [];
      }

      const {
        data: scoreData,
        error: scoreError,
      } = await supabase
        .from("assessment_scores")
        .select(
          "student_id, subject_id, term_id, state, updated_at",
        )
        .eq(
          "recorded_by",
          currentUser.id,
        );

      if (scoreError) {
        throw scoreError;
      }

      const rows =
        (scoreData ??
          []) as AssessmentScore[];

      if (rows.length === 0) {
        return [];
      }

      const studentIds = Array.from(
        new Set(
          rows.map(
            (row) =>
              row.student_id,
          ),
        ),
      );

      const {
        data: studentData,
        error: studentError,
      } = await supabase
        .from("students")
        .select(
          "id, class_id",
        )
        .in(
          "id",
          studentIds,
        );

      if (studentError) {
        throw studentError;
      }

      const studentMap =
        new Map<string, string>();

      for (const student of studentData ??
        []) {
        if (student.class_id) {
          studentMap.set(
            student.id,
            student.class_id,
          );
        }
      }

      const grouped =
        new Map<
          string,
          {
            classId: string;
            subjectId: string;
            termId: string;
            states: Set<
              "draft" | "submitted"
            >;
            students: Set<string>;
            scoreCount: number;
            updatedAt:
              | string
              | null;
          }
        >();

      for (const row of rows) {
        const resolvedClassId =
          studentMap.get(
            row.student_id,
          );

        if (!resolvedClassId) {
          continue;
        }

        const key =
          `${resolvedClassId}:${row.subject_id}:${row.term_id}`;

        const existing =
          grouped.get(key);

        if (existing) {
          existing.scoreCount +=
            1;

          existing.students.add(
            row.student_id,
          );

          existing.states.add(
            row.state,
          );

          if (
            !existing.updatedAt ||
            (row.updated_at &&
              row.updated_at >
                existing.updatedAt)
          ) {
            existing.updatedAt =
              row.updated_at ??
              null;
          }
        } else {
          grouped.set(key, {
            classId:
              resolvedClassId,
            subjectId:
              row.subject_id,
            termId:
              row.term_id,
            states: new Set([
              row.state,
            ]),
            students: new Set([
              row.student_id,
            ]),
            scoreCount: 1,
            updatedAt:
              row.updated_at ??
              null,
          });
        }
      }

      return Array.from(
        grouped.values(),
      )
        .map((group): AssessmentRecord => ({
          key: `${group.classId}:${group.subjectId}:${group.termId}`,
          classId:
            group.classId,
          subjectId:
            group.subjectId,
          termId:
            group.termId,
          state:
            group.states.has(
              "draft",
            )
              ? "draft"
              : "submitted",
          scoreCount:
            group.scoreCount,
          studentCount:
            group.students.size,
          updatedAt:
            group.updatedAt,
        }))
        .sort((a, b) => {
          const aTime =
            a.updatedAt
              ? new Date(
                  a.updatedAt,
                ).getTime()
              : 0;

          const bTime =
            b.updatedAt
              ? new Date(
                  b.updatedAt,
                ).getTime()
              : 0;

          return bTime - aTime;
        });
    },
  });

  /*
   * ---------------------------------------------------------
   * MAXIMUM TOTAL
   * ---------------------------------------------------------
   */

  const maxTotal = useMemo(() => {
    return comps.reduce(
      (sum, component) =>
        sum +
        Number(
          component.max_score,
        ),
      0,
    );
  }, [comps]);

  /*
   * ---------------------------------------------------------
   * TOTAL
   * ---------------------------------------------------------
   */

  function totalFor(
    studentId: string,
  ): number {
    return comps.reduce(
      (sum, component) => {
        const key =
          `${studentId}:${component.id}`;

        const rawValue =
          values[key];

        if (
          rawValue === undefined ||
          rawValue === ""
        ) {
          return sum;
        }

        const numberValue =
          Number(rawValue);

        if (
          !Number.isFinite(
            numberValue,
          )
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

    for (const [key, value] of enteredRows) {
      const [, componentId] = key.split(":");
      const component = comps.find((item) => item.id === componentId);
      const numericScore = Number(value);
      const maximum = Number(component?.max_score);

      if (!component || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > maximum) {
        toast.error("Each score must be between 0 and its component maximum.");
        return;
      }
    }

    setSaving(true);

    try {
      /*
       * IMPORTANT:
       * Use the locally persisted Supabase session.
       *
       * Do NOT use supabase.auth.getUser() here because
       * getUser() can make a network request and therefore
       * breaks offline score entry.
       */
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const authUser =
        sessionData.session?.user;

      if (!authUser) {
        throw new Error(
          "Your login session has expired. Please sign in again.",
        );
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
              subject_id:
                subjectId,
              term_id: termId,
              score: numericScore,
              state,
              recorded_by:
                authUser.id,
            };
          },
        );

      /*
       * The offline provider decides whether this should:
       *
       * 1. Upload immediately when online, or
       * 2. Save to local storage when offline.
       */
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
      } else {
        toast.success(
          state === "draft"
            ? "Draft saved locally. It will synchronize when internet returns."
            : "Scores saved locally. They will synchronize when internet returns.",
        );
      }

      void logAudit(
        `scores.${state}`,
        subjectId,
        `${rows.length} scores`,
      );

      /*
       * Refresh records only when online.
       *
       * Offline data is held by the SyncProvider queue
       * until synchronization is possible.
       */
      if (online) {
        await queryClient.invalidateQueries(
          {
            queryKey: [
              "my-assessment-scores",
            ],
          },
        );

        await queryClient.invalidateQueries(
          {
            queryKey: [
              "my-assessment-records",
            ],
          },
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
   * RECORD LABEL HELPERS
   * ---------------------------------------------------------
   */

  function className(
    id: string,
  ) {
    const found =
      classes.find(
        (item) =>
          (item as SelectItem)
            .id === id,
      ) as SelectItem | undefined;

    return (
      found?.name ??
      "Unknown class"
    );
  }

  function subjectName(
    id: string,
  ) {
    const found =
      subjects.find(
        (item) =>
          (item as SelectItem)
            .id === id,
      ) as SelectItem | undefined;

    return (
      found?.name ??
      "Unknown subject"
    );
  }

  function termName(
    id: string,
  ) {
    const found =
      terms.find(
        (term) =>
          term.id === id,
      );

    return (
      found?.name ??
      "Unknown term"
    );
  }

  /*
   * ---------------------------------------------------------
   * RECORDS REFRESH
   * ---------------------------------------------------------
   */

  async function refreshRecords() {
    if (!online) {
      toast.info(
        "You are offline. Records will be available again when you are online.",
      );
      return;
    }

    await Promise.all([
      refetchRecords(),
      refetchTeacherRecords(),
    ]);

    toast.success(
      "Assessment records refreshed.",
    );
  }

  /*
   * ---------------------------------------------------------
   * RECORDS VIEW
   * ---------------------------------------------------------
   */

  if (pageMode === "records") {
    return (
      <AppShell
        title="My Assessment Records"
        description="Review assessment scores you have previously saved or submitted."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Your assessment history
            </h2>

            <p className="text-sm text-muted-foreground">
              Select a record to open the complete score sheet.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void refreshRecords()
              }
              disabled={
                teacherRecordsLoading ||
                !online
              }
            >
              {teacherRecordsLoading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}

              Refresh
            </Button>

            <Button
              onClick={() =>
                setPageMode("entry")
              }
            >
              <ClipboardList className="mr-2 size-4" />
              Enter Scores
            </Button>
          </div>
        </div>

        {!online && (
          <div className="surface-card border-warning/40 bg-warning/10 p-4">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 size-5 text-warning-foreground" />

              <div>
                <p className="font-semibold">
                  You are offline
                </p>

                <p className="text-sm text-muted-foreground">
                  Previously synchronized records remain available.
                  New offline changes will appear here after synchronization.
                </p>

                {pending.length > 0 && (
                  <p className="mt-1 text-xs font-medium">
                    {pending.length} change(s) waiting to synchronize.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {recordsError && online && (
          <div className="surface-card border-destructive/40 bg-destructive/5 p-4">
            <p className="font-semibold text-destructive">
              Could not load your assessment records.
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              {recordsQueryError?.message ??
                "Unknown database error"}
            </p>
          </div>
        )}

        {userLoading ||
        teacherRecordsLoading ? (
          <div className="surface-card flex items-center justify-center gap-3 p-10">
            <Loader2 className="size-5 animate-spin" />

            <span className="text-sm text-muted-foreground">
              Loading your assessment records...
            </span>
          </div>
        ) : teacherRecords.length ===
          0 ? (
          <div className="surface-card p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary">
              <FileClock className="size-6 text-muted-foreground" />
            </div>

            <h3 className="mt-4 font-semibold">
              No assessment records yet
            </h3>

            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Once you save or submit assessment scores,
              they will appear here so you can return to them later.
            </p>

            <Button
              className="mt-5"
              onClick={() =>
                setPageMode("entry")
              }
            >
              Enter your first scores
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {teacherRecords.map(
              (record) => {
                const submitted =
                  record.state ===
                  "submitted";

                return (
                  <div
                    key={record.key}
                    className="surface-card p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">
                            {className(
                              record.classId,
                            )}
                          </h3>

                          <span className="text-muted-foreground">
                            •
                          </span>

                          <span className="text-sm">
                            {subjectName(
                              record.subjectId,
                            )}
                          </span>

                          <span className="text-muted-foreground">
                            •
                          </span>

                          <span className="text-sm">
                            {termName(
                              record.termId,
                            )}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                          <span>
                            {record.studentCount} student
                            {record.studentCount ===
                            1
                              ? ""
                              : "s"}
                          </span>

                          <span>
                            {record.scoreCount} score
                            {record.scoreCount ===
                            1
                              ? ""
                              : "s"}
                          </span>

                          <span>
                            Last saved:{" "}
                            {formatDate(
                              record.updatedAt,
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={
                            submitted
                              ? "inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-medium text-success"
                              : "inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning-foreground"
                          }
                        >
                          {submitted ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : (
                            <Clock3 className="size-3.5" />
                          )}

                          {submitted
                            ? "Submitted"
                            : "Draft"}
                        </span>

                        <Button
                          variant="outline"
                          onClick={() =>
                            void loadRecord(
                              record,
                            )
                          }
                          disabled={!online}
                        >
                          <Eye className="mr-2 size-4" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </AppShell>
    );
  }

  /*
   * ---------------------------------------------------------
   * ENTRY VIEW
   * ---------------------------------------------------------
   */

  return (
    <AppShell
      title="Assessment scores"
      description={`Totals out of ${maxTotal}`}
      actions={
        <Button
          variant="outline"
          onClick={() =>
            setPageMode("records")
          }
        >
          <FileClock className="mr-2 size-4" />
          My Records
        </Button>
      }
    >
      {/* TOP ACTION BAR */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            Enter assessment scores
          </h2>

          <p className="text-sm text-muted-foreground">
            Select a class, subject and term, then enter the scores.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            setPageMode("records")
          }
        >
          <FileClock className="mr-2 size-4" />
          View My Records
        </Button>
      </div>

      {/* OFFLINE NOTICE */}

      {!online && (
        <div className="surface-card border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 size-5 text-warning-foreground" />

            <div>
              <p className="font-semibold">
                Offline mode
              </p>

              <p className="text-sm text-muted-foreground">
                You can continue entering scores.
                Your changes will be saved locally and synchronized automatically when internet returns.
              </p>

              {pending.length > 0 && (
                <p className="mt-1 text-xs font-medium">
                  {pending.length} change(s) saved locally and waiting to synchronize.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLASS / SUBJECT / TERM */}

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
            disabled={
              classesLoading
            }
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
            disabled={
              termsLoading
            }
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
              Failed to load terms:{" "}
              {termsQueryError?.message ??
                "Unknown database error"}
            </p>
          )}

          {!termsLoading &&
            !termsError &&
            terms.length ===
              0 && (
              <p className="text-xs text-destructive">
                No academic terms exist in the database.
              </p>
            )}
        </div>
      </div>

      {/* ASSESSMENT TABLE */}

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
                    {component.name} (
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
              (student) => {
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
                    <td className="px-4 py-2 font-medium">
                      {
                        student.full_name
                      }
                    </td>

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
                              max={Number(
                                component.max_score,
                              )}
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

                                if (
                                  !Number.isFinite(
                                    numericValue,
                                  )
                                ) {
                                  return;
                                }

                                if (
                                  numericValue <
                                  0
                                ) {
                                  return;
                                }

                                if (
                                  numericValue >
                                  Number(
                                    component.max_score,
                                  )
                                ) {
                                  return;
                                }

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

                    <td className="px-3 py-2 font-semibold">
                      {total}
                    </td>

                    <td className="px-3 py-2 font-semibold">
                      {grade
                        ? grade.grade
                        : "—"}
                    </td>

                    <td className="px-4 py-2 text-muted-foreground">
                      {grade
                        ? grade.remark
                        : "—"}
                    </td>
                  </tr>
                );
              },
            )}

            {students.length ===
              0 && (
              <tr>
                <td
                  className="px-4 py-4 text-muted-foreground"
                  colSpan={
                    comps.length + 4
                  }
                >
                  {studentsLoading
                    ? "Loading students..."
                    : classId
                      ? "No active students in this class."
                      : "Select a class to view students."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* COMPONENT STATUS */}

      {componentsLoading && (
        <p className="text-sm text-muted-foreground">
          Loading assessment components...
        </p>
      )}

      {comps.length ===
        0 &&
        !componentsLoading && (
          <p className="text-sm text-destructive">
            No assessment components were returned from the database.
          </p>
        )}

      {/* GRADING STATUS */}

      {gradeError && (
        <p className="text-sm text-destructive">
          Database grading scale could not be loaded:{" "}
          {gradeQueryError?.message ??
            "Unknown database error"}
          .
          <br />
          The standard Nigerian grading scale is being used temporarily.
        </p>
      )}

      {!gradeLoading &&
        !gradeError &&
        databaseBands.length ===
          0 && (
          <p className="text-sm text-muted-foreground">
            No grading rows were found in the database.
            The standard Nigerian grading scale is being used temporarily.
          </p>
        )}

      {/* SAVE BUTTONS */}

      <div className="flex flex-wrap items-center gap-2">
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
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Clock3 className="mr-2 size-4" />
          )}

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
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 size-4" />
          )}

          {saving
            ? "Submitting..."
            : "Submit scores"}
        </Button>

        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() =>
            setPageMode("records")
          }
        >
          <Eye className="mr-2 size-4" />
          See Previous Records
        </Button>
      </div>
    </AppShell>
  );
}
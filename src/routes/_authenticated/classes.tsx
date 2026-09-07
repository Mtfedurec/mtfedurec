import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getValidatedSession, userHasAnyRole } from "@/integrations/supabase/auth-helper";
import { logAudit, useClasses, useSubjects, useStaff, useStudents } from "@/lib/data";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/classes")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });

    if (!(await userHasAnyRole(session.user.id, ["admin"]))) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Classes & Academic Setup — MayDan EduRecord" },
      {
        name: "description",
        content: "Manage school classes, subjects, class teachers and subject teachers.",
      },
    ],
  }),
  component: ClassesPage,
});

type ClassRow = {
  id: string;
  name: string;
  level: string | null;
  section: string | null;
  class_teacher_id: string | null;
};

type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
};

type StaffRow = {
  id: string;
  full_name: string;
  email: string | null;
  roles: string[];
};

type StudentRow = {
  id: string;
  class_id: string | null;
  status: string;
};

type ClassSubjectRow = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
};

function ClassesPage() {
  const queryClient = useQueryClient();

  const { data: classes = [], isLoading: classesLoading } = useClasses();
  const { data: subjects = [], isLoading: subjectsLoading } = useSubjects();
  const { data: staff = [] } = useStaff();
  const { data: students = [] } = useStudents();

  const [classForm, setClassForm] = useState({
    name: "",
    level: "",
    section: "",
  });

  const [subjectForm, setSubjectForm] = useState({
    name: "",
    code: "",
  });

  const [classTeacher, setClassTeacher] = useState({
    teacherId: "",
    classId: "",
  });

  const [subjectTeacher, setSubjectTeacher] = useState({
    teacherId: "",
    classId: "",
    subjectId: "",
  });

  const [savingClass, setSavingClass] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [assigningClassTeacher, setAssigningClassTeacher] = useState(false);
  const [assigningSubjectTeacher, setAssigningSubjectTeacher] = useState(false);

  const typedClasses = classes as ClassRow[];
  const typedSubjects = subjects as SubjectRow[];
  const typedStaff = staff as StaffRow[];
  const typedStudents = students as StudentRow[];

  /*
   * Only active teachers should appear in allocation dropdowns.
   */
  const teachers = useMemo(
    () =>
      typedStaff.filter(
        (member) => member.roles?.includes("teacher") || member.roles?.includes("head_teacher"),
      ),
    [typedStaff],
  );

  /*
   * Student count for each class.
   */
  const studentCountByClass = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const student of typedStudents) {
      if (!student.class_id) continue;

      counts[student.class_id] = (counts[student.class_id] ?? 0) + 1;
    }

    return counts;
  }, [typedStudents]);

  function teacherName(teacherId: string | null) {
    if (!teacherId) return "Not assigned";

    const teacher = typedStaff.find((member) => member.id === teacherId);

    return teacher?.full_name ?? "Unknown teacher";
  }

  async function addClass(event: React.FormEvent) {
    event.preventDefault();

    if (!classForm.name.trim()) {
      toast.error("Enter a class name.");
      return;
    }

    setSavingClass(true);

    try {
      const { error } = await supabase.from("classes").insert({
        name: classForm.name.trim(),
        level: classForm.level.trim() || null,
        section: classForm.section.trim() || null,
      });

      if (error) throw error;

      toast.success("Class created successfully.");

      await logAudit("class.created", classForm.name.trim());

      setClassForm({
        name: "",
        level: "",
        section: "",
      });

      await queryClient.invalidateQueries({
        queryKey: ["classes"],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create class.");
    } finally {
      setSavingClass(false);
    }
  }

  async function addSubject(event: React.FormEvent) {
    event.preventDefault();

    if (!subjectForm.name.trim()) {
      toast.error("Enter a subject name.");
      return;
    }

    setSavingSubject(true);

    try {
      const { error } = await supabase.from("subjects").insert({
        name: subjectForm.name.trim(),
        code: subjectForm.code.trim() || null,
      });

      if (error) throw error;

      toast.success("Subject created successfully.");

      await logAudit("subject.created", subjectForm.name.trim());

      setSubjectForm({
        name: "",
        code: "",
      });

      await queryClient.invalidateQueries({
        queryKey: ["subjects"],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create subject.");
    } finally {
      setSavingSubject(false);
    }
  }

  async function assignClassTeacher(event: React.FormEvent) {
    event.preventDefault();

    if (!classTeacher.teacherId || !classTeacher.classId) {
      toast.error("Select both a teacher and a class.");
      return;
    }

    setAssigningClassTeacher(true);

    try {
      const { error } = await supabase.rpc("assign_class_teacher", {
        p_teacher_id: classTeacher.teacherId,
        p_class_id: classTeacher.classId,
      });

      if (error) throw error;

      const selectedTeacher = teachers.find((teacher) => teacher.id === classTeacher.teacherId);

      const selectedClass = typedClasses.find((item) => item.id === classTeacher.classId);

      toast.success(
        `${selectedTeacher?.full_name ?? "Teacher"} assigned to ${selectedClass?.name ?? "class"}.`,
      );

      await logAudit(
        "class.teacher_assigned",
        selectedClass?.name ?? classTeacher.classId,
        `Teacher: ${selectedTeacher?.full_name ?? classTeacher.teacherId}`,
      );

      setClassTeacher({
        teacherId: "",
        classId: "",
      });

      await queryClient.invalidateQueries({
        queryKey: ["classes"],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign class teacher.");
    } finally {
      setAssigningClassTeacher(false);
    }
  }

  async function assignSubjectTeacher(event: React.FormEvent) {
    event.preventDefault();

    if (!subjectTeacher.teacherId || !subjectTeacher.classId || !subjectTeacher.subjectId) {
      toast.error("Select a teacher, class and subject.");
      return;
    }

    setAssigningSubjectTeacher(true);

    try {
      const { error } = await supabase.rpc("assign_teacher_subject", {
        p_teacher_id: subjectTeacher.teacherId,
        p_class_id: subjectTeacher.classId,
        p_subject_id: subjectTeacher.subjectId,
      });

      if (error) throw error;

      const selectedTeacher = teachers.find((teacher) => teacher.id === subjectTeacher.teacherId);

      const selectedClass = typedClasses.find((item) => item.id === subjectTeacher.classId);

      const selectedSubject = typedSubjects.find(
        (subject) => subject.id === subjectTeacher.subjectId,
      );

      toast.success(
        `${selectedSubject?.name ?? "Subject"} assigned to ${
          selectedTeacher?.full_name ?? "teacher"
        } for ${selectedClass?.name ?? "class"}.`,
      );

      await logAudit(
        "subject.teacher_assigned",
        selectedSubject?.name ?? subjectTeacher.subjectId,
        `Teacher: ${
          selectedTeacher?.full_name ?? subjectTeacher.teacherId
        }; Class: ${selectedClass?.name ?? subjectTeacher.classId}`,
      );

      setSubjectTeacher({
        teacherId: "",
        classId: "",
        subjectId: "",
      });

      await queryClient.invalidateQueries({
        queryKey: ["classes"],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign subject teacher.");
    } finally {
      setAssigningSubjectTeacher(false);
    }
  }

  return (
    <AppShell
      title="Classes & Academic Setup"
      description="Manage classes, subjects and teacher allocations."
    >
      <div className="space-y-8">
        {/* ============================================================
            SECTION 1 — CLASSES AND SUBJECTS
           ============================================================ */}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* CLASSES */}

          <section className="surface-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">School Classes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create and manage the school's class structure.
                </p>
              </div>

              <span className="rounded-full bg-muted px-3 py-1 text-xs">
                {typedClasses.length} classes
              </span>
            </div>

            <form onSubmit={addClass} className="mt-5 grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="class-name">Class name</Label>

                <Input
                  id="class-name"
                  required
                  placeholder="JSS 1A"
                  value={classForm.name}
                  onChange={(event) =>
                    setClassForm({
                      ...classForm,
                      name: event.target.value,
                    })
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="class-level">Level</Label>

                  <Input
                    id="class-level"
                    placeholder="JSS 1"
                    value={classForm.level}
                    onChange={(event) =>
                      setClassForm({
                        ...classForm,
                        level: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="class-section">Section</Label>

                  <Input
                    id="class-section"
                    placeholder="A"
                    value={classForm.section}
                    onChange={(event) =>
                      setClassForm({
                        ...classForm,
                        section: event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <Button type="submit" disabled={savingClass}>
                {savingClass ? "Creating..." : "Add class"}
              </Button>
            </form>

            <div className="mt-6 space-y-2">
              {classesLoading && (
                <p className="text-sm text-muted-foreground">Loading classes...</p>
              )}

              {!classesLoading && typedClasses.length === 0 && (
                <p className="text-sm text-muted-foreground">No classes have been created yet.</p>
              )}

              {typedClasses.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{item.name}</p>

                      <p className="text-xs text-muted-foreground">
                        {item.level ?? "No level"}
                        {item.section ? ` • Section ${item.section}` : ""}
                      </p>
                    </div>

                    <span className="text-xs text-muted-foreground">
                      {studentCountByClass[item.id] ?? 0} students
                    </span>
                  </div>

                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Class teacher: </span>

                    <span className="font-medium">{teacherName(item.class_teacher_id)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* SUBJECTS */}

          <section className="surface-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">School Subjects</h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Maintain the subjects offered by the school.
                </p>
              </div>

              <span className="rounded-full bg-muted px-3 py-1 text-xs">
                {typedSubjects.length} subjects
              </span>
            </div>

            <form onSubmit={addSubject} className="mt-5 grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="subject-name">Subject name</Label>

                <Input
                  id="subject-name"
                  required
                  placeholder="Mathematics"
                  value={subjectForm.name}
                  onChange={(event) =>
                    setSubjectForm({
                      ...subjectForm,
                      name: event.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject-code">Subject code</Label>

                <Input
                  id="subject-code"
                  placeholder="MTH"
                  value={subjectForm.code}
                  onChange={(event) =>
                    setSubjectForm({
                      ...subjectForm,
                      code: event.target.value,
                    })
                  }
                />
              </div>

              <Button type="submit" disabled={savingSubject}>
                {savingSubject ? "Creating..." : "Add subject"}
              </Button>
            </form>

            <div className="mt-6 space-y-2">
              {subjectsLoading && (
                <p className="text-sm text-muted-foreground">Loading subjects...</p>
              )}

              {!subjectsLoading && typedSubjects.length === 0 && (
                <p className="text-sm text-muted-foreground">No subjects have been created yet.</p>
              )}

              {typedSubjects.map((subject) => (
                <div
                  key={subject.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <span className="font-medium">{subject.name}</span>

                  <span className="text-xs text-muted-foreground">{subject.code ?? "No code"}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ============================================================
            SECTION 2 — CLASS TEACHER ALLOCATION
           ============================================================ */}

        <section className="surface-card p-5">
          <div>
            <h2 className="text-base font-semibold">Class Teacher Allocation</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Assign an approved teacher to become the class teacher for a particular class.
            </p>
          </div>

          <form onSubmit={assignClassTeacher} className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="class-teacher">Teacher</Label>

              <select
                id="class-teacher"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={classTeacher.teacherId}
                onChange={(event) =>
                  setClassTeacher({
                    ...classTeacher,
                    teacherId: event.target.value,
                  })
                }
              >
                <option value="">Select teacher</option>

                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="class-to-assign">Class</Label>

              <select
                id="class-to-assign"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={classTeacher.classId}
                onChange={(event) =>
                  setClassTeacher({
                    ...classTeacher,
                    classId: event.target.value,
                  })
                }
              >
                <option value="">Select class</option>

                {typedClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={assigningClassTeacher}>
                {assigningClassTeacher ? "Assigning..." : "Assign class teacher"}
              </Button>
            </div>
          </form>
        </section>

        {/* ============================================================
            SECTION 3 — SUBJECT TEACHER ALLOCATION
           ============================================================ */}

        <section className="surface-card p-5">
          <div>
            <h2 className="text-base font-semibold">Subject Teacher Allocation</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Assign a teacher to teach a specific subject in a specific class.
            </p>
          </div>

          <form onSubmit={assignSubjectTeacher} className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="subject-teacher">Teacher</Label>

              <select
                id="subject-teacher"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={subjectTeacher.teacherId}
                onChange={(event) =>
                  setSubjectTeacher({
                    ...subjectTeacher,
                    teacherId: event.target.value,
                  })
                }
              >
                <option value="">Select teacher</option>

                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject-class">Class</Label>

              <select
                id="subject-class"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={subjectTeacher.classId}
                onChange={(event) =>
                  setSubjectTeacher({
                    ...subjectTeacher,
                    classId: event.target.value,
                  })
                }
              >
                <option value="">Select class</option>

                {typedClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>

              <select
                id="subject"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={subjectTeacher.subjectId}
                onChange={(event) =>
                  setSubjectTeacher({
                    ...subjectTeacher,
                    subjectId: event.target.value,
                  })
                }
              >
                <option value="">Select subject</option>

                {typedSubjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={assigningSubjectTeacher}>
                {assigningSubjectTeacher ? "Assigning..." : "Assign subject teacher"}
              </Button>
            </div>
          </form>
        </section>

        {/* ============================================================
            SECTION 4 — ADMIN WORKFLOW EXPLANATION
           ============================================================ */}

        <section className="rounded-xl border border-border bg-muted/30 p-5">
          <h2 className="text-sm font-semibold">School administration workflow</h2>

          <div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
            <div>
              <strong className="text-foreground">1. Admin</strong>
              <p>Create classes and subjects.</p>
            </div>

            <div>
              <strong className="text-foreground">2. Admin</strong>
              <p>Approve teachers and allocate them.</p>
            </div>

            <div>
              <strong className="text-foreground">3. Admin</strong>
              <p>Admit students and place them in classes.</p>
            </div>

            <div>
              <strong className="text-foreground">4. Teacher</strong>
              <p>Records academic and attendance data only for assigned classes.</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

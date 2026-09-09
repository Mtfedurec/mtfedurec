import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getValidatedSession } from "@/integrations/supabase/auth-helper";
import { supabase } from "@/integrations/supabase/client";
import { Printer, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { gradeFor, type GradeBand } from "@/lib/academic";
import { sendParentResultNotification } from "@/lib/result-email";
import {
  logAudit,
  useClasses,
  useComponents,
  useGradeScale,
  useProfile,
  useSchool,
  useStudents,
  useSubjects,
  useTerms,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/reports")({
  beforeLoad: async () => {
    const session = await getValidatedSession();
    if (!session?.user) throw redirect({ to: "/auth" });

    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    if (!error && roles && roles.length === 0) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Report cards — MayDan EduRecord" },
      {
        name: "description",
        content: "Generate, comment on, publish and print termly student report cards.",
      },
      { property: "og:title", content: "Report cards — MayDan EduRecord" },
      { property: "og:description", content: "Termly report card generation and publishing." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { data: profile } = useProfile();
  const { data: classes = [] } = useClasses();
  const { data: terms = [] } = useTerms();
  const { data: subjects = [] } = useSubjects();
  const { data: components = [] } = useComponents();
  const { data: bands = [] } = useGradeScale();
  const { data: school } = useSchool();
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [studentId, setStudentId] = useState("");
  const { data: students = [] } = useStudents(classId || undefined);
  const queryClient = useQueryClient();
  const [teacherComment, setTeacherComment] = useState("");
  const [headComment, setHeadComment] = useState("");
  const roles = profile?.roles ?? [];
  const isManager = roles.includes("admin") || roles.includes("head_teacher");

  // Class publishing state
  const [showClassPublishDialog, setShowClassPublishDialog] = useState(false);
  const [classPublishBusy, setClassPublishBusy] = useState(false);
  const [notifyParents, setNotifyParents] = useState(false);

  // Individual email state
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [parentEmail, setParentEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    if (classes.length && !classId) setClassId((classes[0] as { id: string }).id);
    if (!termId) {
      const current = terms.find((t) => (t as { is_current: boolean }).is_current) as
        { id: string } | undefined;
      if (current) setTermId(current.id);
      else if (terms.length) setTermId((terms[0] as { id: string }).id);
    }
  }, [classes, terms, classId, termId]);

  useEffect(() => {
    setStudentId(students.length ? (students[0] as { id: string }).id : "");
  }, [students]);

  const { data: scores = [] } = useQuery({
    enabled: Boolean(studentId && termId),
    queryKey: ["report-scores", studentId, termId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_scores")
        .select("subject_id, component_id, score")
        .eq("student_id", studentId)
        .eq("term_id", termId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: card } = useQuery({
    enabled: Boolean(studentId && termId),
    queryKey: ["report-card", studentId, termId],
    queryFn: async () => {
      const { data } = await supabase
        .from("report_cards")
        .select("*")
        .eq("student_id", studentId)
        .eq("term_id", termId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    setTeacherComment((card as { teacher_comment?: string } | null)?.teacher_comment ?? "");
    setHeadComment((card as { head_comment?: string } | null)?.head_comment ?? "");
  }, [card]);

  const rows = useMemo(() => {
    const maxTotal = (components as { max_score: number }[]).reduce(
      (sum, c) => sum + Number(c.max_score),
      0,
    );
    return (subjects as { id: string; name: string }[])
      .map((subject) => {
        const total = (scores as { subject_id: string; score: number }[])
          .filter((s) => s.subject_id === subject.id)
          .reduce((sum, s) => sum + Number(s.score), 0);
        const band = gradeFor(total, bands as GradeBand[]);
        return { subject: subject.name, total, maxTotal, band };
      })
      .filter((row) => row.total > 0);
  }, [subjects, scores, bands, components]);

  const average = rows.length
    ? Math.round((rows.reduce((sum, r) => sum + r.total, 0) / rows.length) * 10) / 10
    : 0;
  const student = students.find((s) => (s as { id: string }).id === studentId) as
    { full_name: string; admission_number: string; classes?: { name: string } | null } | undefined;
  const published = Boolean((card as { published?: boolean } | null)?.published);
  const canEditTeacherRemark = !published && !isManager;
  const canEditHeadRemark = !published && isManager;
  const canPublish = isManager && !published && Boolean(studentId && termId);

  async function saveCard(publish: boolean) {
    if (!studentId || !termId) {
      toast.error("Please select a student and term first.");
      return;
    }

    if (publish && !isManager) {
      toast.error("Only administrators and head teachers can publish report cards.");
      return;
    }

    if (published && !publish) {
      toast.error("Published report cards are locked and cannot be edited.");
      return;
    }

    const session = await getValidatedSession();
    const { error } = await supabase.from("report_cards").upsert(
      {
        student_id: studentId,
        term_id: termId,
        average,
        teacher_comment:
          canEditTeacherRemark || !isManager
            ? teacherComment || null
            : (card?.teacher_comment ?? null),
        head_comment:
          canEditHeadRemark || isManager ? headComment || null : (card?.head_comment ?? null),
        published: publish,
        published_at: publish ? new Date().toISOString() : null,
        published_by: publish ? (session?.user.id ?? null) : null,
        snapshot: { rows, average },
      },
      { onConflict: "student_id,term_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(publish ? "Report card published" : "Report card saved");
    void logAudit(publish ? "report.published" : "report.saved", studentId);
    void queryClient.invalidateQueries({ queryKey: ["report-card"] });
  }

  async function publishClassResults() {
    if (!classId || !termId || !isManager) {
      toast.error("Select a class and term. Only managers can publish class results.");
      return;
    }

    try {
      setClassPublishBusy(true);
      const session = await getValidatedSession();
      const classStudents = (students as { id: string; guardian_email?: string | null }[]) || [];

      const { data: existingCards, error: fetchError } = await supabase
        .from("report_cards")
        .select("id, student_id, published, guardian_email:students(guardian_email)")
        .eq("term_id", termId)
        .in(
          "student_id",
          classStudents.map((s) => s.id),
        );

      if (fetchError) throw fetchError;

      const cardsToPublish = (existingCards ?? [])
        .filter((card) => !(card as { published?: boolean }).published)
        .map((card) => ({
          student_id: (card as { student_id: string }).student_id,
          term_id: termId,
          published: true,
          published_at: new Date().toISOString(),
          published_by: session?.user.id ?? null,
        }));

      if (!cardsToPublish.length) {
        toast.info("All results in this class are already published.");
        setShowClassPublishDialog(false);
        return;
      }

      // Publish all results
      const { error: publishError } = await supabase
        .from("report_cards")
        .upsert(cardsToPublish, { onConflict: "student_id,term_id" });

      if (publishError) throw publishError;

      // Send parent emails if requested
      let emailsSent = 0;
      if (notifyParents) {
        const term = (terms as { id: string; name: string }[]).find(
          (t) => (t as { id: string }).id === termId,
        ) as { name: string } | undefined;

        for (const student of classStudents) {
          const guardianEmail = student.guardian_email;
          if (!guardianEmail) continue;

          const result = await sendParentResultNotification({
            to: guardianEmail,
            student_name: (student as { full_name?: string }).full_name || "Student",
            class_name: (
              classes.find((c) => (c as { id: string }).id === classId) as {
                name?: string;
              } | undefined
            )?.name || "Class",
            term: term?.name || "Term",
            session: (
              (
                terms.find((t) => (t as { id: string }).id === termId) as {
                  academic_sessions?: { name?: string } | null;
                }
              )?.academic_sessions?.name || "Session"
            ).toString(),
            school_name: (school as { name?: string })?.name || "MayDan Academy",
            portal_link: `${typeof window !== "undefined" ? window.location.origin : ""}`,
          });

          if (result.status === "sent") emailsSent += 1;
        }
      }

      toast.success(
        `Published ${cardsToPublish.length} results${notifyParents ? ` and sent ${emailsSent} notifications` : ""}`,
      );
      void logAudit("class_results.published", classId, String(cardsToPublish.length));
      void queryClient.invalidateQueries({ queryKey: ["report-card"] });
      setShowClassPublishDialog(false);
      setNotifyParents(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to publish class results. Check that results are ready.",
      );
    } finally {
      setClassPublishBusy(false);
    }
  }

  async function sendResultEmail() {
    if (!student || !published || !parentEmail.trim()) {
      toast.error("Select a published result and enter parent email.");
      return;
    }

    try {
      setEmailBusy(true);
      const term = (terms as { id: string; name: string }[]).find(
        (t) => (t as { id: string }).id === termId,
      ) as { name: string } | undefined;

      const result = await sendParentResultNotification({
        to: parentEmail.trim(),
        student_name: student.full_name,
        class_name: student.classes?.name || "Class",
        term: term?.name || "Term",
        session: (
          (
            terms.find((t) => (t as { id: string }).id === termId) as {
              academic_sessions?: { name?: string } | null;
            }
          )?.academic_sessions?.name || "Session"
        ).toString(),
        school_name: (school as { name?: string })?.name || "MayDan Academy",
        portal_link: `${typeof window !== "undefined" ? window.location.origin : ""}`,
      });

      if (result.status === "sent") {
        toast.success("Result notification queued for delivery");
        setShowEmailDialog(false);
        setParentEmail("");
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send email notification.");
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <AppShell
      title="Report cards"
      description={published ? "Published — locked from edits" : "Draft"}
      actions={
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 size-4" /> Print
        </Button>
      }
    >
      <div className="surface-card grid gap-4 p-4 print:hidden sm:grid-cols-3">
        {[
          { label: "Class", value: classId, set: setClassId, options: classes, key: "name" },
          { label: "Term", value: termId, set: setTermId, options: terms, key: "name" },
          {
            label: "Student",
            value: studentId,
            set: setStudentId,
            options: students,
            key: "full_name",
          },
        ].map(({ label, value, set, options, key }) => (
          <div key={label} className="space-y-2">
            <Label htmlFor={label}>{label}</Label>
            <select
              id={label}
              value={value}
              onChange={(e) => set(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {options.map((option) => {
                const item = option as Record<string, string>;
                return (
                  <option key={item["id"]} value={item["id"]}>
                    {item[key]}
                  </option>
                );
              })}
            </select>
          </div>
        ))}
      </div>

      <article className="surface-card p-6">
        <header className="border-b border-border pb-4 text-center">
          <h2 className="text-lg font-bold">{school?.name ?? "MayDan Academy"}</h2>
          <p className="text-xs text-muted-foreground">
            {school?.motto ?? "Knowledge and character"}
          </p>
          <p className="mt-2 text-sm font-semibold">Termly report card</p>
        </header>

        <div className="grid gap-2 py-4 text-sm sm:grid-cols-3">
          <p>
            <span className="text-muted-foreground">Student: </span>
            <span className="font-medium">{student?.full_name ?? "—"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Admission no.: </span>
            <span className="font-medium">{student?.admission_number ?? "—"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Class: </span>
            <span className="font-medium">{student?.classes?.name ?? "—"}</span>
          </p>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.subject}>
                <td className="px-3 py-2 font-medium">{row.subject}</td>
                <td className="px-3 py-2">
                  {row.total} / {row.maxTotal}
                </td>
                <td className="px-3 py-2 font-semibold">{row.band?.grade ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.band?.remark ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-muted-foreground">
                  No submitted scores for this student and term yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <p className="mt-4 text-sm font-semibold">Average: {average}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tc">Teacher remark</Label>
            <Textarea
              id="tc"
              rows={3}
              disabled={published || !canEditTeacherRemark}
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hc">Head teacher remark</Label>
            <Textarea
              id="hc"
              rows={3}
              disabled={published || !canEditHeadRemark}
              value={headComment}
              onChange={(e) => setHeadComment(e.target.value)}
            />
          </div>
        </div>
      </article>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button
          variant="outline"
          disabled={published || !studentId || !termId || (!isManager && !canEditTeacherRemark)}
          onClick={() => void saveCard(false)}
        >
          {isManager ? "Save review" : "Submit teacher review"}
        </Button>
        <Button disabled={!canPublish} onClick={() => void saveCard(true)}>
          Publish report card
        </Button>
        {isManager && (
          <>
            <Button
              variant="outline"
              disabled={!classId || !termId}
              onClick={() => setShowClassPublishDialog(true)}
            >
              Publish class results
            </Button>
            {published && (
              <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
                <Mail className="mr-2 size-4" /> Send result email
              </Button>
            )}
          </>
        )}
      </div>

      {/* Class Publish Dialog */}
      <AlertDialog open={showClassPublishDialog} onOpenChange={setShowClassPublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish class results</AlertDialogTitle>
            <AlertDialogDescription>
              This will publish all unpublished results for this class and term.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              <input
                type="checkbox"
                id="notify-parents"
                checked={notifyParents}
                onChange={(e) => setNotifyParents(e.target.checked)}
                className="h-4 w-4 rounded border border-input"
              />
              <label htmlFor="notify-parents" className="text-sm font-medium cursor-pointer">
                Send parent notifications
              </label>
            </div>
            {notifyParents && (
              <p className="text-xs text-muted-foreground">
                Emails will be sent to parents with email addresses on file. This requires email
                configuration.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void publishClassResults()}
              disabled={classPublishBusy}
            >
              {classPublishBusy ? "Publishing..." : "Publish"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Notification Dialog */}
      <AlertDialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send result email</AlertDialogTitle>
            <AlertDialogDescription>
              Send a result notification to {student?.full_name}'s parent or guardian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="parent-email">Parent email address</Label>
              <Input
                id="parent-email"
                type="email"
                placeholder="parent@example.com"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                disabled={emailBusy}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The email will notify the parent that their child's result is available on the
              portal. They must log in to view full details.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void sendResultEmail()}
              disabled={!parentEmail.trim() || emailBusy}
            >
              <Send className="mr-2 size-4" />
              {emailBusy ? "Sending..." : "Send email"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

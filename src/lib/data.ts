import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSessionSafely } from "@/integrations/supabase/auth-helper";

async function rows<T>(promise: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await promise;
  if (error) throw error;
  return data ?? [];
}

export function useProfile() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      // Use getSessionSafely() to work both online and offline
      const session = await getSessionSafely();
      const user = session?.user;
      if (!user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      return {
        id: user.id,
        email: user.email ?? "",
        fullName: profile?.full_name || user.email || "Staff member",
        roles: (roles ?? []).map((r) => r.role as string),
      };
    },
  });
}

export function useSchool() {
  return useQuery({
    queryKey: ["school"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: () => rows(supabase.from("classes").select("*").order("name")),
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: ["subjects"],
    queryFn: () => rows(supabase.from("subjects").select("*").order("name")),
  });
}

export function useTerms() {
  return useQuery({
    queryKey: ["terms"],
    queryFn: () =>
      rows(
        supabase
          .from("terms")
          .select("*, academic_sessions(name)")
          .order("start_date", { ascending: true }),
      ),
  });
}

export function useComponents() {
  return useQuery({
    queryKey: ["components"],
    queryFn: () => rows(supabase.from("assessment_components").select("*").order("position")),
  });
}

export function useGradeScale() {
  return useQuery({
    queryKey: ["grade_scale"],
    queryFn: () =>
      rows(supabase.from("grade_scale").select("*").order("min_score", { ascending: false })),
  });
}

export function useStudents(classId?: string) {
  return useQuery({
    queryKey: ["students", classId ?? "all"],
    queryFn: () => {
      let query = supabase
        .from("students")
        .select("*, classes(name)")
        .eq("status", "active")
        .order("full_name");
      if (classId) query = query.eq("class_id", classId);
      return rows(query);
    },
  });
}

export function useAttendance(classId?: string, date?: string) {
  return useQuery({
    enabled: Boolean(classId && date),
    queryKey: ["attendance", classId, date],
    queryFn: () =>
      rows(
        supabase
          .from("attendance")
          .select("*")
          .eq("class_id", classId!)
          .eq("attendance_date", date!),
      ),
  });
}

export type AttendanceHistoryRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  attendance_date: string;
  status: "present" | "absent" | "late";
  state: "draft" | "submitted" | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  students: { full_name: string; admission_number: string } | null;
  profiles: { full_name: string } | null;
};

/*
 * History query.
 *
 * The `profiles` relationship uses the explicit foreign-key name
 * `attendance_recorded_by_fkey` (verified from the generated Supabase
 * types). `students` is embedded with the only foreign key the
 * attendance table has to students.
 *
 * `studentId` is optional: when provided, the query is narrowed to a
 * single student server-side. The History UI additionally filters the
 * returned rows by name/admission number client-side.
 *
 * The `attendance_date` is a calendar DATE and is compared with the
 * supplied range directly on the database, so no full-table scan is
 * performed.
 */
export function useAttendanceHistory(
  classId?: string,
  startDate?: string,
  endDate?: string,
  studentId?: string,
) {
  return useQuery({
    enabled: Boolean(classId && startDate && endDate),
    queryKey: ["attendance-history", classId, startDate, endDate, studentId],
    queryFn: async () => {
      let query = supabase
        .from("attendance")
        .select(
          "*, students(full_name, admission_number), profiles!attendance_recorded_by_fkey(full_name)",
        )
        .eq("class_id", classId!)
        .gte("attendance_date", startDate!)
        .lte("attendance_date", endDate!)
        .order("attendance_date", { ascending: false })
        .order("student_id", { ascending: true });

      if (studentId) query = query.eq("student_id", studentId);

      return (await rows(query)) as AttendanceHistoryRow[];
    },
  });
}

export function useScores(classId?: string, subjectId?: string, termId?: string) {
  return useQuery({
    enabled: Boolean(classId && subjectId && termId),
    queryKey: ["scores", classId, subjectId, termId],
    queryFn: async () => {
      const students = await rows(
        supabase.from("students").select("id").eq("class_id", classId!).eq("status", "active"),
      );
      const ids = students.map((s) => (s as { id: string }).id);
      if (ids.length === 0) return [];
      return rows(
        supabase
          .from("assessment_scores")
          .select("*")
          .eq("subject_id", subjectId!)
          .eq("term_id", termId!)
          .in("student_id", ids),
      );
    },
  });
}

export function useBehaviour(studentId?: string, termId?: string) {
  return useQuery({
    enabled: Boolean(studentId && termId),
    queryKey: ["behaviour", studentId, termId],
    queryFn: () =>
      rows(
        supabase
          .from("behaviour_assessments")
          .select("*")
          .eq("student_id", studentId!)
          .eq("term_id", termId!),
      ),
  });
}

export function useCorrections() {
  return useQuery({
    queryKey: ["corrections"],
    queryFn: () =>
      rows(
        supabase
          .from("correction_requests")
          .select(
            "*, students(full_name), subjects(name), profiles!correction_requests_requested_by_fkey(full_name)",
          )
          .order("created_at", { ascending: false }),
      ),
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () =>
      rows(
        supabase
          .from("audit_logs")
          .select("*, profiles(full_name)")
          .order("created_at", { ascending: false })
          .limit(100),
      ),
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        rows(supabase.from("profiles").select("*").order("full_name")),
        rows(supabase.from("user_roles").select("user_id, role")),
      ]);
      return (profiles as { id: string; full_name: string; email: string | null }[]).map((p) => ({
        ...p,
        roles: (roles as { user_id: string; role: string }[])
          .filter((r) => r.user_id === p.id)
          .map((r) => r.role),
      }));
    },
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: () =>
      rows(
        supabase
          .from("announcements")
          .select("*, announcement_reads(count)")
          .order("published_at", { ascending: false }),
      ),
  });
}

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  priority: "normal" | "important" | "urgent";
  published_at: string;
  expires_at: string | null;
  announcement_reads?: { seen_at: string | null; cleared_at: string | null }[] | null;
};

export function useTeacherNotifications() {
  return useQuery({
    queryKey: ["teacher-notifications"],
    queryFn: async () => {
      const session = await getSessionSafely();
      const userId = session?.user?.id;
      if (!userId) return [];

      const { data, error } = await supabase
        .from("announcements")
        .select("*, announcement_reads!left(seen_at, cleared_at)")
        .eq("is_published", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("published_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

export function useUnreadNotificationCount() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["unread-notification-count"],
    queryFn: async () => {
      const session = await getSessionSafely();
      const userId = session?.user?.id;
      if (!userId) return 0;

      const [activeResult, readResult] = await Promise.all([
        supabase
          .from("announcements")
          .select("id", { count: "exact", head: true })
          .eq("is_published", true)
          .or("expires_at.is.null,expires_at.gt." + new Date().toISOString()),
        supabase
          .from("announcement_reads")
          .select("announcement_id", { count: "exact", head: true })
          .eq("user_id", userId)
          .not("seen_at", "is", null),
      ]);

      if (activeResult.error) throw activeResult.error;
      if (readResult.error) throw readResult.error;

      const activeCount = activeResult.count ?? 0;
      const readCount = readResult.count ?? 0;

      return Math.max(0, activeCount - readCount);
    },
  });
}

export function useAssessmentControls() {
  return useQuery({
    queryKey: ["assessment-controls"],
    queryFn: () =>
      rows(
        supabase
          .from("assessment_controls")
          .select("*, terms(name, academic_sessions(name))")
          .order("changed_at", { ascending: false }),
      ),
  });
}

export function useAssessmentControl(termId?: string) {
  return useQuery({
    enabled: Boolean(termId),
    queryKey: ["assessment-control", termId],
    queryFn: async () => {
      if (!termId) return null;
      const { data, error } = await supabase
        .from("assessment_controls")
        .select("*")
        .eq("term_id", termId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      title: string;
      message: string;
      priority: "normal" | "important" | "urgent";
      is_published?: boolean;
      expires_at?: string | null;
    }) => {
      const session = await getSessionSafely();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("announcements")
        .insert({
          title: input.title,
          message: input.message,
          priority: input.priority,
          is_published: input.is_published ?? true,
          expires_at: input.expires_at ?? null,
          published_by: userId,
          published_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      title?: string;
      message?: string;
      priority?: "normal" | "important" | "urgent";
      is_published?: boolean;
      expires_at?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("announcements")
        .update(input)
        .eq("id", id)
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}

export function useMarkAnnouncementSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (announcementId: string) => {
      const session = await getSessionSafely();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { error } = await supabase.from("announcement_reads").upsert({
        announcement_id: announcementId,
        user_id: userId,
        seen_at: new Date().toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}

export function useClearSeenNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const session = await getSessionSafely();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data: seenRows, error: selectError } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("user_id", userId)
        .not("seen_at", "is", null)
        .is("cleared_at", null);

      if (selectError) throw selectError;

      const ids = (seenRows ?? []).map((r) => r.announcement_id);
      if (ids.length === 0) return;

      const { error } = await supabase
        .from("announcement_reads")
        .update({ cleared_at: new Date().toISOString() })
        .eq("user_id", userId)
        .in("announcement_id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}

export function useMarkAllNotificationsSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const session = await getSessionSafely();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data: activeAnnouncements, error: selectError } = await supabase
        .from("announcements")
        .select("id")
        .eq("is_published", true)
        .is("expires_at", null);

      if (selectError) throw selectError;

      const announcementIds = (activeAnnouncements ?? []).map((a) => a.id);
      if (announcementIds.length === 0) return;

      const rowsToUpsert = announcementIds.map((announcementId) => ({
        announcement_id: announcementId,
        user_id: userId,
        seen_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("announcement_reads")
        .upsert(rowsToUpsert, { onConflict: "announcement_id,user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher-notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
  });
}

export function useSetAssessmentControl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      term_id: string;
      status: "open" | "paused" | "locked";
      deadline_at?: string | null;
      reason?: string | null;
    }) => {
      const session = await getSessionSafely();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("assessment_controls")
        .upsert(
          {
            term_id: input.term_id,
            status: input.status,
            deadline_at: input.deadline_at ?? null,
            reason: input.reason ?? null,
            changed_by: userId,
            changed_at: new Date().toISOString(),
          },
          { onConflict: "term_id" },
        )
        .select("*")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assessment-controls"] });
      void queryClient.invalidateQueries({ queryKey: ["assessment-control"] });
    },
  });
}

export async function logAudit(action: string, target?: string, details?: string) {
  const session = await getSessionSafely();
  if (!session?.user) return;
  await supabase.from("audit_logs").insert({
    actor_id: session.user.id,
    action,
    target: target ?? null,
    details: details ?? null,
  });
}

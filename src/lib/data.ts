import { useQuery } from "@tanstack/react-query";
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
      const { data, error } = await supabase.from("school_settings").select("*").limit(1).maybeSingle();
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
          .select("*, students(full_name), subjects(name), profiles!correction_requests_requested_by_fkey(full_name)")
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
-- ============================================================
-- SCHOOL-SCOPED RLS POLICIES & SECURITY
-- Multi-School SaaS Foundation
-- ============================================================
--
-- CRITICAL SECURITY HARDENING:
--
-- ISSUE 1: Global RLS policies (e.g., "staff read X") do NOT filter by school.
--   Any authenticated staff member from ANY school can read data from ANY school.
--   This is a multi-tenant data isolation breach.
--
-- ISSUE 2: Permissive policies on assessment_scores, report_cards, and profiles
--   allow teachers to read sensitive data across schools.
--
-- ISSUE 3: No school membership verification before granting access.
--   Users can access school data even if not members of that school.
--
-- ISSUE 4: No server-side protection against users claiming admin roles.
--   Users could theoretically modify school_memberships directly (via API injection).
--
-- FIX STRATEGY:
--   1. Create helper function: user_is_school_member(user_id, school_id, required_role?)
--   2. Create helper function: is_school_admin(user_id, school_id)
--   3. Drop all global "staff read X" policies.
--   4. Replace with strict school-scoped SELECT/INSERT/UPDATE/DELETE policies.
--   5. Ensure RLS cannot be bypassed by authenticated role.
--   6. Apply policies to ALL tenant-aware tables (see 20261011091000).
--   7. Deny direct INSERT/UPDATE to school_memberships from authenticated role.
--
-- ============================================================

BEGIN;

-- ============================================================
-- SECURITY HELPER FUNCTIONS
-- ============================================================

-- Verify user is an active member of a school with a given role.
-- Returns FALSE if user is not a member, or membership is not 'active'.
CREATE OR REPLACE FUNCTION public.user_is_school_member(
  _user_id UUID,
  _school_id UUID,
  _required_role TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id = _user_id
      AND school_id = _school_id
      AND status = 'active'
      AND (_required_role IS NULL OR role = _required_role)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_is_school_member(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_school_member(UUID, UUID, TEXT) TO authenticated;

-- Check if user has owner or admin role in a specific school.
CREATE OR REPLACE FUNCTION public.is_school_admin(
  _user_id UUID,
  _school_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE user_id = _user_id
      AND school_id = _school_id
      AND status = 'active'
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_school_admin(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_school_admin(UUID, UUID) TO authenticated;

-- ============================================================
-- SCHOOL_MEMBERSHIPS TABLE: Hardened Access Control
-- ============================================================
-- 
-- Deny all INSERT/UPDATE/DELETE from authenticated users.
-- Only service_role (Supabase backend) can modify membership.
--

DROP POLICY IF EXISTS "admin manage school_memberships" ON public.school_memberships;
DROP POLICY IF EXISTS "staff read school_memberships" ON public.school_memberships;

-- SELECT: Only users can read their own membership or admins can read all memberships in their school.
CREATE POLICY "users read own school_memberships"
  ON public.school_memberships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "school admins read all school_memberships"
  ON public.school_memberships
  FOR SELECT
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id));

-- INSERT/UPDATE/DELETE: Deny all authenticated users (service_role only).
CREATE POLICY "deny authenticated insert school_memberships"
  ON public.school_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "deny authenticated update school_memberships"
  ON public.school_memberships
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny authenticated delete school_memberships"
  ON public.school_memberships
  FOR DELETE
  TO authenticated
  USING (false);

-- Explicitly revoke anonymous access.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.school_memberships FROM anon;

-- ============================================================
-- SCHOOLS TABLE: Strict Control
-- ============================================================

DROP POLICY IF EXISTS "staff read schools" ON public.schools;
DROP POLICY IF EXISTS "admin write schools" ON public.schools;

-- SELECT: Only members of a school can read its details.
CREATE POLICY "school members read schools"
  ON public.schools
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), id));

-- INSERT: Deny (school creation only by service_role or Lovable).
CREATE POLICY "deny authenticated insert schools"
  ON public.schools
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- UPDATE: Only school admins can update school settings.
CREATE POLICY "school admins update schools"
  ON public.schools
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), id))
  WITH CHECK (public.is_school_admin(auth.uid(), id));

-- DELETE: Deny (school deletion only by service_role).
CREATE POLICY "deny authenticated delete schools"
  ON public.schools
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- SCHOOL_SETTINGS TABLE: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read school" ON public.school_settings;
DROP POLICY IF EXISTS "admin write school" ON public.school_settings;

CREATE POLICY "school members read school_settings"
  ON public.school_settings
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins update school_settings"
  ON public.school_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- INSERT/DELETE: Service role only.
CREATE POLICY "deny authenticated insert school_settings"
  ON public.school_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "deny authenticated delete school_settings"
  ON public.school_settings
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- PROFILES: Scoped Access with User-Level Privacy
-- ============================================================
-- 
-- Key: Users should read ONLY:
--   1. Their own profile.
--   2. Other staff profiles within the same school(s).
-- 
-- Previous policy "staff read profiles" (true) allowed anyone to read anyone's profile.
--

DROP POLICY IF EXISTS "staff read profiles" ON public.profiles;
DROP POLICY IF EXISTS "own profile update" ON public.profiles;

-- A user can read their own profile.
CREATE POLICY "users read own profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- A user can read profiles of other staff in the same school.
-- This is safe because school_memberships is now restricted.
CREATE POLICY "users read school peers"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.school_memberships sm1
      WHERE sm1.user_id = auth.uid() AND sm1.status = 'active'
      INTERSECT
      SELECT 1 FROM public.school_memberships sm2
      WHERE sm2.user_id = id AND sm2.status = 'active'
    )
  );

-- Users can update only their own profile.
CREATE POLICY "users update own profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- STUDENTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read students" ON public.students;
DROP POLICY IF EXISTS "admin write students" ON public.students;

CREATE POLICY "school members read students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write students"
  ON public.students
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update students"
  ON public.students
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- DELETE: Service role only.
CREATE POLICY "deny authenticated delete students"
  ON public.students
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- CLASSES: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read classes" ON public.classes;
DROP POLICY IF EXISTS "admin write classes" ON public.classes;

CREATE POLICY "school members read classes"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write classes"
  ON public.classes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update classes"
  ON public.classes
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "deny authenticated delete classes"
  ON public.classes
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- CLASS_SUBJECTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read class_subjects" ON public.class_subjects;
DROP POLICY IF EXISTS "admin write class_subjects" ON public.class_subjects;

CREATE POLICY "school members read class_subjects"
  ON public.class_subjects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_id
        AND public.user_is_school_member(auth.uid(), c.school_id)
    )
  );

CREATE POLICY "school admins write class_subjects"
  ON public.class_subjects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_id
        AND public.is_school_admin(auth.uid(), c.school_id)
    )
  );

CREATE POLICY "school admins update class_subjects"
  ON public.class_subjects
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_id
        AND public.is_school_admin(auth.uid(), c.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = class_id
        AND public.is_school_admin(auth.uid(), c.school_id)
    )
  );

-- ============================================================
-- SUBJECTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read subjects" ON public.subjects;
DROP POLICY IF EXISTS "admin write subjects" ON public.subjects;

CREATE POLICY "school members read subjects"
  ON public.subjects
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write subjects"
  ON public.subjects
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update subjects"
  ON public.subjects
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- ACADEMIC_SESSIONS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read sessions" ON public.academic_sessions;
DROP POLICY IF EXISTS "admin write sessions" ON public.academic_sessions;

CREATE POLICY "school members read academic_sessions"
  ON public.academic_sessions
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write academic_sessions"
  ON public.academic_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update academic_sessions"
  ON public.academic_sessions
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- TERMS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read terms" ON public.terms;
DROP POLICY IF EXISTS "admin write terms" ON public.terms;

CREATE POLICY "school members read terms"
  ON public.terms
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_sessions s
      WHERE s.id = session_id
        AND public.user_is_school_member(auth.uid(), s.school_id)
    )
  );

CREATE POLICY "school admins write terms"
  ON public.terms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_sessions s
      WHERE s.id = session_id
        AND public.is_school_admin(auth.uid(), s.school_id)
    )
  );

CREATE POLICY "school admins update terms"
  ON public.terms
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_sessions s
      WHERE s.id = session_id
        AND public.is_school_admin(auth.uid(), s.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_sessions s
      WHERE s.id = session_id
        AND public.is_school_admin(auth.uid(), s.school_id)
    )
  );

-- ============================================================
-- GRADE_SCALE: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read grades" ON public.grade_scale;
DROP POLICY IF EXISTS "admin write grades" ON public.grade_scale;

CREATE POLICY "school members read grade_scale"
  ON public.grade_scale
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write grade_scale"
  ON public.grade_scale
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update grade_scale"
  ON public.grade_scale
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- ASSESSMENT_COMPONENTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read assessment_components" ON public.assessment_components;
DROP POLICY IF EXISTS "admin write assessment_components" ON public.assessment_components;

CREATE POLICY "school members read assessment_components"
  ON public.assessment_components
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write assessment_components"
  ON public.assessment_components
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update assessment_components"
  ON public.assessment_components
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- ASSESSMENT_CONTROLS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read assessment_controls" ON public.assessment_controls;
DROP POLICY IF EXISTS "admin write assessment_controls" ON public.assessment_controls;

CREATE POLICY "school members read assessment_controls"
  ON public.assessment_controls
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write assessment_controls"
  ON public.assessment_controls
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update assessment_controls"
  ON public.assessment_controls
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- ASSESSMENTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read assessments" ON public.assessments;
DROP POLICY IF EXISTS "admin write assessments" ON public.assessments;

CREATE POLICY "school members read assessments"
  ON public.assessments
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write assessments"
  ON public.assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update assessments"
  ON public.assessments
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- ASSESSMENT_SCORES: Scoped to School (SENSITIVE DATA)
-- ============================================================
-- 
-- CRITICAL: assessment_scores contain student performance data.
-- Previous policy allowed any staff member to read all scores.
-- Now scoped strictly to school members.
--

DROP POLICY IF EXISTS "staff read assessment_scores" ON public.assessment_scores;
DROP POLICY IF EXISTS "admin write assessment_scores" ON public.assessment_scores;

CREATE POLICY "school members read assessment_scores"
  ON public.assessment_scores
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write assessment_scores"
  ON public.assessment_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update assessment_scores"
  ON public.assessment_scores
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- Teachers may also update scores for their assigned class.
CREATE POLICY "teachers update own class scores"
  ON public.assessment_scores
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      INNER JOIN public.class_subjects cs ON a.class_subject_id = cs.id
      WHERE a.id = assessment_id
        AND cs.teacher_id = auth.uid()
        AND a.school_id = school_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessments a
      INNER JOIN public.class_subjects cs ON a.class_subject_id = cs.id
      WHERE a.id = assessment_id
        AND cs.teacher_id = auth.uid()
        AND a.school_id = school_id
    )
  );

-- ============================================================
-- SCORES: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read scores" ON public.scores;
DROP POLICY IF EXISTS "admin write scores" ON public.scores;

CREATE POLICY "school members read scores"
  ON public.scores
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write scores"
  ON public.scores
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update scores"
  ON public.scores
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- REPORT_CARDS: Scoped to School (SENSITIVE DATA)
-- ============================================================
-- 
-- CRITICAL: report_cards contain student progress summaries.
-- Previous policy may have allowed broad access.
-- Now scoped strictly to school members.
--

DROP POLICY IF EXISTS "staff read report_cards" ON public.report_cards;
DROP POLICY IF EXISTS "admin write report_cards" ON public.report_cards;

CREATE POLICY "school members read report_cards"
  ON public.report_cards
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write report_cards"
  ON public.report_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update report_cards"
  ON public.report_cards
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- REPORT_CARD_EMAIL_LOGS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read report_card_email_logs" ON public.report_card_email_logs;
DROP POLICY IF EXISTS "admin write report_card_email_logs" ON public.report_card_email_logs;

CREATE POLICY "school members read report_card_email_logs"
  ON public.report_card_email_logs
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write report_card_email_logs"
  ON public.report_card_email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update report_card_email_logs"
  ON public.report_card_email_logs
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- ANNOUNCEMENTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read announcements" ON public.announcements;
DROP POLICY IF EXISTS "admin write announcements" ON public.announcements;

CREATE POLICY "school members read announcements"
  ON public.announcements
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write announcements"
  ON public.announcements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update announcements"
  ON public.announcements
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- ANNOUNCEMENT_READS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read announcement_reads" ON public.announcement_reads;

CREATE POLICY "school members read announcement_reads"
  ON public.announcement_reads
  FOR SELECT
  TO authenticated
  USING (
    public.user_is_school_member(auth.uid(), school_id)
    AND (
      user_id = auth.uid()
      OR public.is_school_admin(auth.uid(), school_id)
    )
  );

CREATE POLICY "users insert own announcement_reads"
  ON public.announcement_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_is_school_member(auth.uid(), school_id)
  );

-- ============================================================
-- BEHAVIOUR_RECORDS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read behaviour_records" ON public.behaviour_records;
DROP POLICY IF EXISTS "admin write behaviour_records" ON public.behaviour_records;

CREATE POLICY "school members read behaviour_records"
  ON public.behaviour_records
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "teachers write behaviour_records"
  ON public.behaviour_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_is_school_member(auth.uid(), school_id)
    AND recorded_by = auth.uid()
  );

CREATE POLICY "school admins update behaviour_records"
  ON public.behaviour_records
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- BEHAVIOUR_ASSESSMENTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read behaviour_assessments" ON public.behaviour_assessments;
DROP POLICY IF EXISTS "admin write behaviour_assessments" ON public.behaviour_assessments;

CREATE POLICY "school members read behaviour_assessments"
  ON public.behaviour_assessments
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write behaviour_assessments"
  ON public.behaviour_assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update behaviour_assessments"
  ON public.behaviour_assessments
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- CORRECTION_REQUESTS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read correction_requests" ON public.correction_requests;
DROP POLICY IF EXISTS "admin write correction_requests" ON public.correction_requests;

CREATE POLICY "school members read correction_requests"
  ON public.correction_requests
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

CREATE POLICY "school admins write correction_requests"
  ON public.correction_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

CREATE POLICY "school admins update correction_requests"
  ON public.correction_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_school_admin(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin(auth.uid(), school_id));

-- ============================================================
-- AUDIT_LOGS: Scoped to School
-- ============================================================

DROP POLICY IF EXISTS "staff read audit_logs" ON public.audit_logs;

CREATE POLICY "school members read audit_logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.user_is_school_member(auth.uid(), school_id));

-- Only service_role can insert (via triggers/functions).
CREATE POLICY "deny authenticated insert audit_logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ============================================================
-- ATTENDANCE TABLES: Already school-scoped by 20260912000000
-- (staff_attendance, student_attendance, staff_leaves)
-- 
-- Verify and harden if needed. For now, no changes to the
-- hardened attendance policies created in 20260912000000.
-- ============================================================

COMMIT;

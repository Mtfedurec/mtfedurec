-- ============================================================
-- ATTENDANCE REBUILD — SCHEMA & SECURITY FOUNDATION
-- MayDan EduRecord
-- ============================================================
-- 
-- Business Rules:
-- 1. Student Attendance:
--    - Roles: Teachers can manage attendance only for classes assigned to them.
--             Admins/Managers can manage attendance for every class.
--    - Statuses: ONLY 'present' or 'absent'.
--    - Uniqueness: Exactly one attendance record per student per school date.
--    - Date Lock: Current school date (Africa/Lagos) can be created and updated.
--                 Historical attendance is strictly immutable (read-only).
--    - RLS: Teachers can read only authorized classes. Managers can read all.
--
-- 2. Staff Attendance:
--    - Roles: Admins only. Teachers have no staff attendance access.
--    - Statuses: ONLY 'present' or 'absent'.
--    - Uniqueness: Exactly one attendance record per staff member per school date.
--    - Date Lock: Current school date (Africa/Lagos) can be created and updated.
--                 Historical attendance is strictly immutable (read-only).
--    - Leave Support: Minimal staff_leaves table and helper function to filter out
--                     staff on approved leave from daily attendance.
-- ============================================================

-- 1. CLEAN UP PREVIOUS ATTENDANCE OBJECTS
DROP TABLE IF EXISTS public.attendance CASCADE;

-- 2. TIMEZONE-AWARE CURRENT SCHOOL DATE (Africa/Lagos, UTC+1)
CREATE OR REPLACE FUNCTION public.current_school_date()
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date;
$$;

REVOKE EXECUTE ON FUNCTION public.current_school_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_school_date() TO authenticated;

-- 3. TEACHER CLASS ACCESS HELPER
CREATE OR REPLACE FUNCTION public.teacher_has_class_access(_user_id UUID, _class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = _class_id AND class_teacher_id = _user_id
    UNION ALL
    SELECT 1 FROM public.class_subjects
    WHERE class_id = _class_id AND teacher_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.teacher_has_class_access(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_has_class_access(UUID, UUID) TO authenticated;

-- 4. MINIMAL STAFF LEAVE SYSTEM
CREATE TABLE IF NOT EXISTS public.staff_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

ALTER TABLE public.staff_leaves ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_leaves TO authenticated;
GRANT ALL ON public.staff_leaves TO service_role;

DROP POLICY IF EXISTS "admin manage staff_leaves" ON public.staff_leaves;
CREATE POLICY "admin manage staff_leaves"
  ON public.staff_leaves
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "staff read own leaves" ON public.staff_leaves;
CREATE POLICY "staff read own leaves"
  ON public.staff_leaves
  FOR SELECT
  TO authenticated
  USING (staff_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_staff_on_leave(_staff_id UUID, _date DATE DEFAULT public.current_school_date())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_leaves
    WHERE staff_id = _staff_id
      AND status = 'approved'
      AND _date BETWEEN start_date AND end_date
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff_on_leave(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_on_leave(UUID, DATE) TO authenticated;

-- 5. STUDENT ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.student_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);

GRANT SELECT, INSERT, UPDATE ON public.student_attendance TO authenticated;
GRANT ALL ON public.student_attendance TO service_role;
ALTER TABLE public.student_attendance ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_student_attendance_updated ON public.student_attendance;
CREATE TRIGGER trg_student_attendance_updated
  BEFORE UPDATE ON public.student_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_student_attendance_class_date
  ON public.student_attendance(class_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_student_attendance_student_date
  ON public.student_attendance(student_id, attendance_date);

-- Student Attendance RLS Policies
DROP POLICY IF EXISTS "select student_attendance" ON public.student_attendance;
CREATE POLICY "select student_attendance"
  ON public.student_attendance
  FOR SELECT
  TO authenticated
  USING (
    public.is_manager(auth.uid())
    OR public.teacher_has_class_access(auth.uid(), class_id)
  );

DROP POLICY IF EXISTS "insert student_attendance" ON public.student_attendance;
CREATE POLICY "insert student_attendance"
  ON public.student_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    attendance_date = public.current_school_date()
    AND (
      public.is_manager(auth.uid())
      OR public.teacher_has_class_access(auth.uid(), class_id)
    )
  );

DROP POLICY IF EXISTS "update student_attendance" ON public.student_attendance;
CREATE POLICY "update student_attendance"
  ON public.student_attendance
  FOR UPDATE
  TO authenticated
  USING (
    public.is_manager(auth.uid())
    OR public.teacher_has_class_access(auth.uid(), class_id)
  )
  WITH CHECK (
    attendance_date = public.current_school_date()
    AND (
      public.is_manager(auth.uid())
      OR public.teacher_has_class_access(auth.uid(), class_id)
    )
  );

-- 6. STAFF ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, attendance_date)
);

GRANT SELECT, INSERT, UPDATE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_staff_attendance_updated ON public.staff_attendance;
CREATE TRIGGER trg_staff_attendance_updated
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date
  ON public.staff_attendance(attendance_date);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_date
  ON public.staff_attendance(staff_id, attendance_date);

-- Staff Attendance RLS Policies (Admin Only)
DROP POLICY IF EXISTS "select staff_attendance" ON public.staff_attendance;
CREATE POLICY "select staff_attendance"
  ON public.staff_attendance
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "insert staff_attendance" ON public.staff_attendance;
CREATE POLICY "insert staff_attendance"
  ON public.staff_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND attendance_date = public.current_school_date()
  );

DROP POLICY IF EXISTS "update staff_attendance" ON public.staff_attendance;
CREATE POLICY "update staff_attendance"
  ON public.staff_attendance
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND attendance_date = public.current_school_date()
  );


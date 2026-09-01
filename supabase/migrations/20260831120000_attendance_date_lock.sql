-- ============================================================
-- ATTENDANCE PERMANENT DAILY LOCK
-- MayDan EduRecord
-- ============================================================
--
-- Business rule:
--   Attendance for a calendar date may only be created or edited
--   ON that same calendar date. Once the school day has passed, the
--   attendance for that date becomes PERMANENTLY read-only for every
--   role (admin, head teacher and teacher alike).
--
-- This is enforced at the database level through RLS policies that
-- call a timezone-aware school-date helper, so that direct API
-- requests (and queued offline upserts) cannot modify historical
-- attendance.
--
-- Timezone: MayDan Academy is in Lagos, Nigeria (Africa/Lagos,
-- UTC+1). `now()` returns UTC, so the helper converts to the
-- school's local calendar date. We deliberately avoid
-- `current_date`, which uses the session timezone and can drift.
-- ============================================================

-- 1) Helper: the school's current local calendar date.
--
-- STABLE within a transaction, so policy evaluation is consistent
-- for all rows in a single statement (important for batch upserts).
CREATE OR REPLACE FUNCTION public.current_school_date()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date;
$$;

-- The authenticated role must be able to execute the helper when
-- the helper is referenced from a row-level-security policy.
-- Follows the same grant pattern used by has_role / is_staff /
-- is_manager (see migration 20260803204550).
REVOKE EXECUTE ON FUNCTION public.current_school_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_school_date() TO authenticated;

-- 2) INSERT policy: staff may insert attendance ONLY for today.
--
--   attendance_date = current_school_date()
--
-- Past   -> denied (WITH CHECK rejects)
-- Today  -> allowed
-- Future -> denied (WITH CHECK rejects)
DROP POLICY IF EXISTS "staff insert attendance" ON public.attendance;

CREATE POLICY "staff insert attendance (today only)"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND NEW.attendance_date = public.current_school_date()
  );

-- 3) UPDATE policy: staff may update attendance ONLY for today.
--
-- The date gate lives in WITH CHECK (evaluated against NEW), NOT in
-- USING. This is deliberate:
--
--   * USING controls which rows the role can *see* for update.
--     Keeping USING as `is_staff` alone means staff can still
--     *select* historical rows for viewing/updates queries, but...
--   * WITH CHECK is evaluated against the proposed NEW row and
--     RAISES a policy violation when attendance_date is not today.
--
-- Using WITH CHECK (rather than only USING) is what guarantees an
-- error is returned for an upsert that targets an existing
-- non-today row, instead of silently affecting zero rows.
--
-- Past   -> denied
-- Today  -> allowed
-- Future -> denied
DROP POLICY IF EXISTS "staff update attendance" ON public.attendance;

CREATE POLICY "staff update attendance (today only)"
  ON public.attendance
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (
    public.is_staff(auth.uid())
    AND NEW.attendance_date = public.current_school_date()
  );

-- 4) SELECT (history) policy is intentionally UNCHANGED.
--
--   "staff read attendance" -> is_staff(auth.uid())
--
-- Both Admin and Teacher must be able to view historical attendance,
-- so read access is not date-restricted. Only write operations are
-- locked.

-- 5) DELETE policy is intentionally UNCHANGED.
--
--   "admin delete attendance" -> has_role(auth.uid(),'admin')
--
-- Delete behaviour is preserved exactly as the existing security
-- model requires: admin-only, no new teacher permissions granted,
-- no existing admin permissions removed. The date-lock requirement
-- targets create/update; delete remains the existing admin action.

-- 6) Index to support the common history query
--    (class_id + attendance_date range) and class selection lookups.
CREATE INDEX IF NOT EXISTS idx_attendance_class_date
  ON public.attendance(class_id, attendance_date);

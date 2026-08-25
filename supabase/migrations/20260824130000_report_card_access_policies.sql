-- Required migration for the report-card workflow.
-- This is intentionally not applied here; it must be run in Supabase by an administrator.

-- 1) Public report cards must be readable only when the database itself marks them published.
CREATE POLICY "public read published reports"
ON public.report_cards FOR SELECT TO anon
USING (published = true);

CREATE POLICY "public read published reports (authenticated)"
ON public.report_cards FOR SELECT TO authenticated
USING (published = true OR public.is_staff(auth.uid()));

-- 2) Teachers should be able to submit/complete draft report-card data but not publish.
--    The draft update should not allow a teacher to flip published=true.
CREATE POLICY "teacher manage draft reports"
ON public.report_cards FOR UPDATE TO authenticated
USING (
  public.is_staff(auth.uid())
  AND NOT public.is_manager(auth.uid())
  AND published = false
)
WITH CHECK (
  public.is_staff(auth.uid())
  AND NOT public.is_manager(auth.uid())
  AND published = false
);

-- 3) Managers (admin / head_teacher) may finalize and publish, but only as an authorized server-side transition.
CREATE POLICY "manager review and publish reports"
ON public.report_cards FOR UPDATE TO authenticated
USING (public.is_manager(auth.uid()))
WITH CHECK (public.is_manager(auth.uid()));

-- 4) Keep the published-card lock in place so an already published record cannot be edited.
--    If the trigger already exists, keep it; do not duplicate it.
--    The database should reject any UPDATE that attempts to alter a published row.

-- 5) If the app needs distinct teacher vs head teacher remark fields in the future,
--    prefer explicit columns rather than overloading one generic comment field.
--    Example pattern:
--    ALTER TABLE public.report_cards
--      ADD COLUMN IF NOT EXISTS teacher_remark TEXT,
--      ADD COLUMN IF NOT EXISTS head_teacher_remark TEXT;

-- Use this migration as the authoritative source for the public published access and role split.

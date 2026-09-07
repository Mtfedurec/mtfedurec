-- ============================================================
-- AUTHORIZATION HARDENING: Assessment Controls Access
-- MayDan EduRecord
-- ============================================================
--
-- This migration ensures that assessment_controls are properly
-- protected and only accessible to administrators.
--
-- The assessment_controls table contains critical settings for
-- when teachers can enter assessment scores for specific terms.
-- This is sensitive configuration that should not be readable by
-- all staff.
--
-- Prior behavior: All staff could read assessment controls
-- New behavior: Only admins can read/modify assessment controls
--
-- ============================================================

-- UPDATE the existing policies to be more restrictive
-- Staff should not see assessment control settings at all
DROP POLICY IF EXISTS "staff read assessment controls" ON public.assessment_controls;

-- Only admin can read assessment control settings
CREATE POLICY "admin read assessment controls"
  ON public.assessment_controls
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admin can modify assessment control settings (UPDATE/INSERT)
-- The original "admin manage assessment controls" policy handles this,
-- but we verify it exists and is correct
DROP POLICY IF EXISTS "admin manage assessment controls" ON public.assessment_controls;

CREATE POLICY "admin manage assessment controls"
  ON public.assessment_controls
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Ensure RLS is enabled
ALTER TABLE public.assessment_controls ENABLE ROW LEVEL SECURITY;

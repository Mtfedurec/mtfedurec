
BEGIN;

-- Add nullable tenant references first.
-- Do not enforce NOT NULL until application writes and
-- tenant-scoped security policies are ready.

ALTER TABLE public.academic_sessions ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.announcement_reads ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.assessment_components ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.assessment_controls ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.assessment_scores ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.behaviour_assessments ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.behaviour_records ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.class_subjects ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.correction_requests ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.grade_scale ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.report_card_email_logs ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.report_cards ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.staff_attendance ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.staff_leaves ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.student_attendance ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.terms ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);

-- Abort rather than guess if the original tenant is ambiguous.
DO $$
DECLARE
  v_school_id uuid;
  v_school_count integer;
BEGIN
  SELECT count(DISTINCT school_id), min(school_id)
  INTO v_school_count, v_school_id
  FROM public.school_settings
  WHERE school_id IS NOT NULL;

  IF v_school_count <> 1 OR v_school_id IS NULL THEN
    RAISE EXCEPTION
      'Expected exactly one initial school in school_settings; found %',
      v_school_count;
  END IF;

  UPDATE public.academic_sessions SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.announcement_reads SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.announcements SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.assessment_components SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.assessment_controls SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.assessment_scores SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.assessments SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.audit_logs SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.behaviour_assessments SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.behaviour_records SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.class_subjects SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.classes SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.correction_requests SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.grade_scale SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.report_card_email_logs SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.report_cards SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.scores SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.staff_attendance SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.staff_leaves SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.student_attendance SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.students SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.subjects SET school_id = v_school_id WHERE school_id IS NULL;
  UPDATE public.terms SET school_id = v_school_id WHERE school_id IS NULL;
END
$$;

COMMIT;

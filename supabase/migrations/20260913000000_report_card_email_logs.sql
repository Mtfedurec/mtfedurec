-- ============================================================
-- REPORT CARD EMAIL LOGS & AUDIT SCHEMA
-- MayDan EduRecord
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_card_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_card_id UUID REFERENCES public.report_cards(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  sent_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.report_card_email_logs TO authenticated;
GRANT ALL ON public.report_card_email_logs TO service_role;
ALTER TABLE public.report_card_email_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_report_card_email_logs_student
  ON public.report_card_email_logs(student_id);

CREATE INDEX IF NOT EXISTS idx_report_card_email_logs_report_card
  ON public.report_card_email_logs(report_card_id);

-- RLS Policies: Managers (Admin & Head Teacher) only
DROP POLICY IF EXISTS "managers read email logs" ON public.report_card_email_logs;
CREATE POLICY "managers read email logs"
  ON public.report_card_email_logs
  FOR SELECT
  TO authenticated
  USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "managers insert email logs" ON public.report_card_email_logs;
CREATE POLICY "managers insert email logs"
  ON public.report_card_email_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager(auth.uid()));

-- ============================================================
-- ANNOUNCEMENTS + ASSESSMENT CONTROLS
-- MayDan EduRecord
-- ============================================================

-- ============================================================
-- 1. ANNOUNCEMENTS
-- ============================================================

CREATE TYPE public.announcement_priority AS ENUM (
  'normal',
  'important',
  'urgent'
);

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title TEXT NOT NULL,
  message TEXT NOT NULL,

  priority public.announcement_priority NOT NULL DEFAULT 'normal',

  published_by UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  expires_at TIMESTAMPTZ,

  is_published BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT announcements_expiry_check
    CHECK (
      expires_at IS NULL
      OR expires_at > published_at
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.announcements
TO authenticated;

GRANT ALL
ON public.announcements
TO service_role;

ALTER TABLE public.announcements
ENABLE ROW LEVEL SECURITY;


-- Teachers and managers can see published announcements.
CREATE POLICY "staff read published announcements"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid())
  AND is_published = true
  AND (
    expires_at IS NULL
    OR expires_at > now()
  )
);


-- Admins can manage announcements.
CREATE POLICY "admin manage announcements"
ON public.announcements
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);


CREATE TRIGGER trg_announcements_updated
BEFORE UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE INDEX idx_announcements_published
ON public.announcements(published_at DESC);

CREATE INDEX idx_announcements_expires
ON public.announcements(expires_at);


-- ============================================================
-- 2. TEACHER ANNOUNCEMENT STATUS
-- ============================================================

CREATE TABLE public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  announcement_id UUID NOT NULL
    REFERENCES public.announcements(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,

  seen_at TIMESTAMPTZ,

  cleared_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (announcement_id, user_id)
);

GRANT SELECT, INSERT, UPDATE
ON public.announcement_reads
TO authenticated;

GRANT ALL
ON public.announcement_reads
TO service_role;

ALTER TABLE public.announcement_reads
ENABLE ROW LEVEL SECURITY;


-- A staff member can see their own notification status.
CREATE POLICY "users read own announcement status"
ON public.announcement_reads
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);


-- A staff member can create their own status.
CREATE POLICY "users create own announcement status"
ON public.announcement_reads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_staff(auth.uid())
);


-- A staff member can update their own status.
CREATE POLICY "users update own announcement status"
ON public.announcement_reads
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);


-- Admins can inspect announcement read statistics.
CREATE POLICY "admin read announcement statuses"
ON public.announcement_reads
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
);


CREATE INDEX idx_announcement_reads_user
ON public.announcement_reads(user_id);

CREATE INDEX idx_announcement_reads_announcement
ON public.announcement_reads(announcement_id);


-- ============================================================
-- 3. ASSESSMENT CONTROL
-- ============================================================

CREATE TYPE public.assessment_control_status AS ENUM (
  'open',
  'paused',
  'locked'
);


CREATE TABLE public.assessment_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  term_id UUID NOT NULL
    REFERENCES public.terms(id)
    ON DELETE CASCADE,

  status public.assessment_control_status NOT NULL DEFAULT 'open',

  deadline_at TIMESTAMPTZ,

  reason TEXT,

  changed_by UUID
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (term_id)
);

GRANT SELECT
ON public.assessment_controls
TO authenticated;

GRANT INSERT, UPDATE, DELETE
ON public.assessment_controls
TO authenticated;

GRANT ALL
ON public.assessment_controls
TO service_role;

ALTER TABLE public.assessment_controls
ENABLE ROW LEVEL SECURITY;


-- Staff can see the current assessment control.
CREATE POLICY "staff read assessment controls"
ON public.assessment_controls
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid())
);


-- Only administrators can create/change assessment controls.
CREATE POLICY "admin manage assessment controls"
ON public.assessment_controls
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
);


CREATE TRIGGER trg_assessment_controls_updated
BEFORE UPDATE ON public.assessment_controls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


CREATE INDEX idx_assessment_controls_term
ON public.assessment_controls(term_id);


-- ============================================================
-- 4. AUTOMATIC ASSESSMENT CONTROL RECORD FOR EXISTING TERMS
-- ============================================================

INSERT INTO public.assessment_controls (
  term_id,
  status
)
SELECT
  id,
  'open'
FROM public.terms
ON CONFLICT (term_id) DO NOTHING;


-- ============================================================
-- 5. CHECK WHETHER ASSESSMENT ENTRY IS CURRENTLY ALLOWED
-- ============================================================

CREATE OR REPLACE FUNCTION public.assessment_entry_allowed(
  _term_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR
    EXISTS (
      SELECT 1
      FROM public.assessment_controls ac
      WHERE ac.term_id = _term_id
        AND ac.status = 'open'
        AND (
          ac.deadline_at IS NULL
          OR ac.deadline_at > now()
        )
    );
$$;


-- ============================================================
-- 6. PROTECT ASSESSMENT INSERTS
-- ============================================================

DROP POLICY IF EXISTS "staff insert scores"
ON public.assessment_scores;

CREATE POLICY "staff insert scores"
ON public.assessment_scores
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff(auth.uid())
  AND public.assessment_entry_allowed(term_id)
);


-- ============================================================
-- 7. PROTECT ASSESSMENT UPDATES
-- ============================================================

DROP POLICY IF EXISTS "staff update scores"
ON public.assessment_scores;

CREATE POLICY "staff update scores"
ON public.assessment_scores
FOR UPDATE
TO authenticated
USING (
  public.is_staff(auth.uid())
  AND public.assessment_entry_allowed(term_id)
)
WITH CHECK (
  public.is_staff(auth.uid())
  AND public.assessment_entry_allowed(term_id)
);


-- ============================================================
-- 8. AUDIT ASSESSMENT CONTROL CHANGES
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_assessment_control_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target,
    details
  )
  VALUES (
    NEW.changed_by,
    'assessment_control_changed',
    NEW.term_id::TEXT,
    'Assessment status changed to '
      || NEW.status::TEXT
      || CASE
           WHEN NEW.deadline_at IS NOT NULL
           THEN ' with deadline ' || NEW.deadline_at::TEXT
           ELSE ''
         END
  );

  RETURN NEW;

END;
$$;


CREATE TRIGGER trg_audit_assessment_control
AFTER INSERT OR UPDATE
ON public.assessment_controls
FOR EACH ROW
EXECUTE FUNCTION public.audit_assessment_control_change();


-- ============================================================
-- END
-- ============================================================
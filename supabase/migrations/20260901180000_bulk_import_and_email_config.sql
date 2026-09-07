ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS guardian_email TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_email TEXT,
  ADD COLUMN IF NOT EXISTS result_email_subject TEXT DEFAULT 'Academic result update',
  ADD COLUMN IF NOT EXISTS result_email_template TEXT DEFAULT 'Dear Parent/Guardian,

Your child''s academic result for {{term}} {{session}} is now available on the MayDan EduRecord portal.

Please log in to view the result.

Student: {{student_name}}
Class: {{class}}

View Result:
{{portal_link}}

Thank you,
{{school_name}}';

CREATE INDEX IF NOT EXISTS idx_students_guardian_email ON public.students(guardian_email);

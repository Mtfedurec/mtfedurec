-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'head_teacher', 'teacher');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late');
CREATE TYPE public.record_state AS ENUM ('draft', 'submitted');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  staff_number TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','head_teacher'))
$$;

CREATE POLICY "staff read roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_staff(auth.uid()) OR user_id = auth.uid());

-- new user -> profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'teacher'))
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SCHOOL
CREATE TABLE public.school_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'MayDan Academy',
  motto TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_settings TO authenticated;
GRANT ALL ON public.school_settings TO service_role;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read school" ON public.school_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write school" ON public.school_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_sessions TO authenticated;
GRANT ALL ON public.academic_sessions TO service_role;
ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read sessions" ON public.academic_sessions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write sessions" ON public.academic_sessions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (session_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terms TO authenticated;
GRANT ALL ON public.terms TO service_role;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read terms" ON public.terms FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write terms" ON public.terms FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  level TEXT,
  section TEXT,
  class_teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read classes" ON public.classes FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write classes" ON public.classes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read subjects" ON public.subjects FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write subjects" ON public.subjects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (class_id, subject_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_subjects TO authenticated;
GRANT ALL ON public.class_subjects TO service_role;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read class_subjects" ON public.class_subjects FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write class_subjects" ON public.class_subjects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  gender TEXT,
  date_of_birth DATE,
  guardian_name TEXT,
  guardian_phone TEXT,
  photo_url TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_on DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read students" ON public.students FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write students" ON public.students FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_students_class ON public.students(class_id);

CREATE TABLE public.grade_scale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL,
  grade TEXT NOT NULL,
  remark TEXT NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grade_scale TO authenticated;
GRANT ALL ON public.grade_scale TO service_role;
ALTER TABLE public.grade_scale ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read grades" ON public.grade_scale FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write grades" ON public.grade_scale FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.assessment_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  max_score NUMERIC NOT NULL DEFAULT 100,
  position INT NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_components TO authenticated;
GRANT ALL ON public.assessment_components TO service_role;
ALTER TABLE public.assessment_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read components" ON public.assessment_components FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write components" ON public.assessment_components FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL,
  status public.attendance_status NOT NULL,
  state public.record_state NOT NULL DEFAULT 'submitted',
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, attendance_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read attendance" ON public.attendance FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update attendance" ON public.attendance FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "admin delete attendance" ON public.attendance FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_attendance_date ON public.attendance(attendance_date);

CREATE TABLE public.assessment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.assessment_components(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL DEFAULT 0,
  state public.record_state NOT NULL DEFAULT 'draft',
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, component_id, term_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_scores TO authenticated;
GRANT ALL ON public.assessment_scores TO service_role;
ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read scores" ON public.assessment_scores FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert scores" ON public.assessment_scores FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update scores" ON public.assessment_scores FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "admin delete scores" ON public.assessment_scores FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_scores_updated BEFORE UPDATE ON public.assessment_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.behaviour_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  trait TEXT NOT NULL,
  rating INT NOT NULL DEFAULT 3,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id, domain, trait)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.behaviour_assessments TO authenticated;
GRANT ALL ON public.behaviour_assessments TO service_role;
ALTER TABLE public.behaviour_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read behaviour" ON public.behaviour_assessments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert behaviour" ON public.behaviour_assessments FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff update behaviour" ON public.behaviour_assessments FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_behaviour_updated BEFORE UPDATE ON public.behaviour_assessments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  average NUMERIC,
  position INT,
  teacher_comment TEXT,
  head_comment TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_cards TO authenticated;
GRANT ALL ON public.report_cards TO service_role;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read reports" ON public.report_cards FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert reports" ON public.report_cards FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "manager update reports" ON public.report_cards FOR UPDATE TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.protect_published_report()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.published THEN
    RAISE EXCEPTION 'Published report cards cannot be edited';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_protect_report BEFORE UPDATE ON public.report_cards FOR EACH ROW EXECUTE FUNCTION public.protect_published_report();

CREATE TABLE public.correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  term_id UUID REFERENCES public.terms(id) ON DELETE SET NULL,
  field_label TEXT NOT NULL,
  original_value TEXT,
  requested_value TEXT,
  reason TEXT NOT NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correction_requests TO authenticated;
GRANT ALL ON public.correction_requests TO service_role;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read corrections" ON public.correction_requests FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff create corrections" ON public.correction_requests FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid() AND public.is_staff(auth.uid()));
CREATE POLICY "manager decide corrections" ON public.correction_requests FOR UPDATE TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- SEED
INSERT INTO public.school_settings (name, motto, address, phone, email)
VALUES ('MayDan Academy', 'Smart. Secure. Offline. Accurate.', '14 Ring Road, Ikeja, Lagos', '+234 800 000 0000', 'office@maydanacademy.ng');

INSERT INTO public.academic_sessions (id, name, start_date, end_date, is_current) VALUES
('11111111-1111-1111-1111-111111111111', '2025/2026', '2025-09-08', '2026-07-24', true);
INSERT INTO public.terms (id, session_id, name, start_date, end_date, is_current) VALUES
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'First Term', '2025-09-08', '2025-12-12', false),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Second Term', '2026-01-12', '2026-04-03', false),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'Third Term', '2026-04-20', '2026-07-24', true);

INSERT INTO public.grade_scale (min_score, max_score, grade, remark) VALUES
(70, 100, 'A', 'Excellent'),
(60, 69.99, 'B', 'Very Good'),
(50, 59.99, 'C', 'Good'),
(45, 49.99, 'D', 'Pass'),
(40, 44.99, 'E', 'Fair'),
(0, 39.99, 'F', 'Fail');

INSERT INTO public.assessment_components (name, max_score, position) VALUES
('Test 1', 15, 1), ('Test 2', 15, 2), ('Assignment', 10, 3), ('Exam', 60, 4);

INSERT INTO public.subjects (id, name, code) VALUES
('33333333-3333-3333-3333-333333333301', 'Mathematics', 'MTH'),
('33333333-3333-3333-3333-333333333302', 'English Language', 'ENG'),
('33333333-3333-3333-3333-333333333303', 'Basic Science', 'BSC'),
('33333333-3333-3333-3333-333333333304', 'Social Studies', 'SOS');

INSERT INTO public.classes (id, name, level, section) VALUES
('44444444-4444-4444-4444-444444444401', 'JSS 1A', 'JSS 1', 'A'),
('44444444-4444-4444-4444-444444444402', 'JSS 1B', 'JSS 1', 'B'),
('44444444-4444-4444-4444-444444444403', 'JSS 2A', 'JSS 2', 'A');

INSERT INTO public.class_subjects (class_id, subject_id) VALUES
('44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333301'),
('44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333302'),
('44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333303'),
('44444444-4444-4444-4444-444444444401','33333333-3333-3333-3333-333333333304'),
('44444444-4444-4444-4444-444444444402','33333333-3333-3333-3333-333333333301'),
('44444444-4444-4444-4444-444444444402','33333333-3333-3333-3333-333333333302'),
('44444444-4444-4444-4444-444444444403','33333333-3333-3333-3333-333333333301'),
('44444444-4444-4444-4444-444444444403','33333333-3333-3333-3333-333333333303');

INSERT INTO public.students (admission_number, full_name, gender, date_of_birth, guardian_name, guardian_phone, class_id) VALUES
('MDA/2025/001','Adaeze Okonkwo','Female','2013-04-11','Mrs. Ngozi Okonkwo','+234 803 111 2201','44444444-4444-4444-4444-444444444401'),
('MDA/2025/002','Ibrahim Bello','Male','2013-01-22','Mr. Musa Bello','+234 803 111 2202','44444444-4444-4444-4444-444444444401'),
('MDA/2025/003','Chiamaka Eze','Female','2012-11-03','Mr. Peter Eze','+234 803 111 2203','44444444-4444-4444-4444-444444444401'),
('MDA/2025/004','Tunde Adeyemi','Male','2013-06-30','Mrs. Bisi Adeyemi','+234 803 111 2204','44444444-4444-4444-4444-444444444401'),
('MDA/2025/005','Grace Danjuma','Female','2013-02-14','Mr. John Danjuma','+234 803 111 2205','44444444-4444-4444-4444-444444444402'),
('MDA/2025/006','Samuel Ojo','Male','2012-12-09','Mrs. Ruth Ojo','+234 803 111 2206','44444444-4444-4444-4444-444444444402'),
('MDA/2025/007','Halima Yusuf','Female','2012-08-19','Mr. Sani Yusuf','+234 803 111 2207','44444444-4444-4444-4444-444444444403'),
('MDA/2025/008','Emeka Nwosu','Male','2012-05-27','Mrs. Amaka Nwosu','+234 803 111 2208','44444444-4444-4444-4444-444444444403');
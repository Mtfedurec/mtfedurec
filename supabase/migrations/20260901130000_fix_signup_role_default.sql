-- ============================================================
-- AUTHORIZATION HARDENING: Force safe default role on signup
-- MayDan EduRecord
-- ============================================================
--
-- SECURITY ISSUE:
--   The `handle_new_user()` trigger previously trusted
--   `auth.users.raw_user_meta_data->>'role'` during registration.
--   An untrusted user could submit metadata claiming an admin or
--   head_teacher role and obtain elevated privileges when the trigger
--   inserted a row into `public.user_roles`.
--
-- FIX:
--   Ignore any user-supplied role metadata during signup and always
--   assign the safe default role `teacher`.
--
--   Legitimate role elevation must only occur through an explicit
--   admin-controlled workflow guarded by RLS and admin-only access.
--
-- RLS STATUS:
--   Unchanged: `user_roles` remains protected by RLS and does not grant
--   INSERT/UPDATE/DELETE to `authenticated`.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Never trust client-supplied signup metadata for sensitive roles.
  -- All self-registration must default to the least-privileged staff role.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'teacher')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- AUTHORIZATION HARDENING: Restrict user_roles visibility
-- MayDan EduRecord
-- ============================================================
--
-- ISSUE:
--   The previous policy allowed any authenticated staff member to read
--   the full user_roles table. That leaks role assignments and admin
--   status across the application even though a user only needs to read
--   their own role set or an administrator's full roster.
--
-- FIX:
--   Restrict SELECT access so that:
--     1. A user can read only their own role rows.
--     2. Administrators can read the full role map for management.
--
-- This preserves operational access for admin role management while
-- preventing privilege disclosure to ordinary staff.
-- ============================================================

DROP POLICY IF EXISTS "staff read roles" ON public.user_roles;

CREATE POLICY "users read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "admins read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Explicitly deny anonymous access to role metadata.
REVOKE SELECT ON public.user_roles FROM anon;
REVOKE INSERT ON public.user_roles FROM anon;
REVOKE UPDATE ON public.user_roles FROM anon;
REVOKE DELETE ON public.user_roles FROM anon;

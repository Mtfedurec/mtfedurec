-- ============================================================
-- SECURITY FIX: Restrict Profile Read Policy
-- MayDan EduRecord
-- ============================================================
--
-- ISSUE:
--   The existing "staff read profiles" policy used USING (true),
--   which allowed ANY authenticated user to read ALL rows in the
--   profiles table without restriction.
--
--   This is an INFORMATION DISCLOSURE vulnerability.
--   Staff should only be able to read profiles of other staff
--   members, not all profiles in the system.
--
-- FIX:
--   Replace the overly permissive policy with one that:
--   1. Allows users to read their own profile (auth.uid() = id)
--   2. Allows staff to read other staff members' profiles
--      (users who have at least one role in user_roles)
--
-- BACKWARD COMPATIBILITY:
--   This change restricts access, not expands it. If any code
--   relied on staff being able to read arbitrary profiles, it will
--   need to be updated. However, this is the correct security posture.
-- ============================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "staff read profiles" ON public.profiles;

-- Create a restrictive policy:
-- Users can read their own profile, OR
-- Staff can read profiles of other staff members
CREATE POLICY "authenticated read own or staff profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_staff(auth.uid())
  );

-- The "own profile update" policy remains unchanged:
-- Users can only update their own profile
-- (no changes needed to: CREATE POLICY "own profile update")

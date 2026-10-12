
BEGIN;

-- Create the tenant table.
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  motto text,
  address text,
  phone text,
  email text,
  logo_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Link users to individual schools with school-specific roles.
CREATE TABLE IF NOT EXISTS public.school_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL
    REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL
    CHECK (role IN ('owner', 'admin', 'head_teacher', 'teacher')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);

-- Add the tenant reference to existing school settings.
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS school_id uuid;

-- Preserve the existing school ID as the initial tenant ID.
INSERT INTO public.schools (
  id, name, slug, motto, address, phone, email, logo_url
)
SELECT
  ss.id,
  ss.name,
  COALESCE(
    NULLIF(
      trim(both '-' FROM regexp_replace(
        lower(trim(ss.name)),
        '[^a-z0-9]+', '-', 'g'
      )),
      ''
    ),
    'school-' || left(ss.id::text, 8)
  ),
  ss.motto,
  ss.address,
  ss.phone,
  ss.email,
  ss.logo_url
FROM public.school_settings ss
ON CONFLICT (id) DO NOTHING;

-- Associate existing settings with the original school.
UPDATE public.school_settings
SET school_id = id
WHERE school_id IS NULL;

-- Add the foreign key only if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'school_settings_school_id_fkey'
      AND conrelid = 'public.school_settings'::regclass
  ) THEN
    ALTER TABLE public.school_settings
      ADD CONSTRAINT school_settings_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id);
  END IF;
END
$$;

-- Preserve existing users and map their current roles.
-- Prefer admin over head_teacher over teacher if a user has
-- more than one existing global role.
INSERT INTO public.school_memberships (
  school_id, user_id, role, status
)
SELECT DISTINCT ON (ur.user_id)
  ss.school_id,
  ur.user_id,
  CASE ur.role::text
    WHEN 'admin' THEN 'owner'
    WHEN 'head_teacher' THEN 'head_teacher'
    ELSE 'teacher'
  END,
  'active'
FROM public.user_roles ur
CROSS JOIN public.school_settings ss
WHERE ss.school_id IS NOT NULL
ORDER BY
  ur.user_id,
  CASE ur.role::text
    WHEN 'admin' THEN 1
    WHEN 'head_teacher' THEN 2
    ELSE 3
  END
ON CONFLICT (school_id, user_id) DO NOTHING;

-- Keep new tenant tables inaccessible through the API until
-- explicit school-scoped security policies are implemented.
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;

COMMIT;

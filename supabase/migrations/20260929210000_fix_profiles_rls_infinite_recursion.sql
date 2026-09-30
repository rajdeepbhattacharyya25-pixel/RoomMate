-- ============================================================================
-- Migration: Fix Profiles RLS Infinite Recursion (Code 42P17) & Add INSERT Policy
-- Target: public.profiles
-- Context: Remediates infinite recursion in "Users or SuperAdmin can update profiles"
--          caused by self-referencing subqueries (SELECT p.role FROM profiles p)
--          inside the WITH CHECK clause. Enforces role & suspension security via
--          hardened trigger trg_prevent_role_escalation.
-- ============================================================================

-- 1. Harden prevent_unauthorized_role_escalation trigger function
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Prevent modifying user role
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
        RETURN NEW;
      END IF;

      IF COALESCE(current_setting('request.superadmin_role_change', true), '') <> 'true' THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: User roles can only be updated via the authorized superadmin_update_user_role procedure.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Prevent modifying account suspension status
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
        RETURN NEW;
      END IF;

      IF COALESCE(current_setting('request.superadmin_suspension_change', true), '') <> 'true' THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Suspension status can only be modified via authorized superadmin procedures.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Drop and Recreate UPDATE Policy without recursive subquery on public.profiles
DROP POLICY IF EXISTS "Users or SuperAdmin can update profiles" ON public.profiles;

CREATE POLICY "Users or SuperAdmin can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  (id = (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
)
WITH CHECK (
  (id = (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- 3. Add explicit INSERT Policy for authenticated users (ensures self-profile upsert is permitted)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  (id = (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- 4. Automatically reconcile affected onboarding profile for hanacandy37@gmail.com
UPDATE public.profiles
SET name = 'Apurv',
    phone = '+91 62021 32597',
    onboarding_completed = true,
    updated_at = timezone('utc'::text, now())
WHERE email = 'hanacandy37@gmail.com'
  AND (phone IS NULL OR onboarding_completed = false);

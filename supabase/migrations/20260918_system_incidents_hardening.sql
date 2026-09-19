-- Migration: 20260918_system_incidents_hardening.sql
-- Description: Hardens system_incidents table, adds duration_seconds, and fixes RLS policy to match canonical SUPER_ADMIN role.

-- 1. Add duration_seconds if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_incidents'
      AND column_name = 'duration_seconds'
  ) THEN
    ALTER TABLE public.system_incidents ADD COLUMN duration_seconds INT;
  END IF;
END $$;

-- 2. Drop existing Superadmin policies to correct role check
DROP POLICY IF EXISTS "Superadmins can view all system incidents" ON public.system_incidents;
DROP POLICY IF EXISTS "Superadmins can update system incidents" ON public.system_incidents;
DROP POLICY IF EXISTS "Superadmins can insert system incidents" ON public.system_incidents;

-- 3. Recreate SELECT policy with canonical SUPER_ADMIN check
CREATE POLICY "Superadmins can view all system incidents"
  ON public.system_incidents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('SUPER_ADMIN', 'SUPERADMIN')
    )
  );

-- 4. Recreate UPDATE policy with canonical SUPER_ADMIN check
CREATE POLICY "Superadmins can update system incidents"
  ON public.system_incidents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('SUPER_ADMIN', 'SUPERADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('SUPER_ADMIN', 'SUPERADMIN')
    )
  );

-- 5. Add INSERT policy for Superadmins (e.g. manual operational maintenance logs or tests)
CREATE POLICY "Superadmins can insert system incidents"
  ON public.system_incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('SUPER_ADMIN', 'SUPERADMIN')
    )
  );

-- Migration: 20260918_system_incidents.sql
-- Description: System incidents table for infrastructure anomalies, Crashlytics velocity alerts, and PostHog alerts

CREATE TABLE IF NOT EXISTS public.system_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  error TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'INVESTIGATING' CHECK (status IN ('OPERATIONAL', 'INVESTIGATING', 'MONITORING', 'RESOLVED')),
  occurrences INT NOT NULL DEFAULT 1,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Index on status and service for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_system_incidents_status ON public.system_incidents(status);
CREATE INDEX IF NOT EXISTS idx_system_incidents_service ON public.system_incidents(service);
CREATE INDEX IF NOT EXISTS idx_system_incidents_created_at ON public.system_incidents(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;

-- Superadmins can view all system incidents
CREATE POLICY "Superadmins can view all system incidents"
  ON public.system_incidents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'SUPERADMIN'
    )
  );

-- Superadmins can update system incidents (e.g. resolve or investigate)
CREATE POLICY "Superadmins can update system incidents"
  ON public.system_incidents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'SUPERADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'SUPERADMIN'
    )
  );

-- Service role has full access (for Edge Functions and Webhook Receivers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'system_incidents'
      AND policyname = 'Service role has full access to system incidents'
  ) THEN
    CREATE POLICY "Service role has full access to system incidents"
      ON public.system_incidents
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Enable Realtime publication for system incidents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'system_incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_incidents;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL; -- Publication does not exist in local dev environments
END $$;

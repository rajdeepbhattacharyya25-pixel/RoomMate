-- ==============================================================================
-- ROOMMATE BUG REPORTS & FEEDBACK SYSTEM
-- Migration: 20260914_bug_reports.sql
-- Description: Creates bug_reports table with RLS, indexes, and realtime replication.
-- ==============================================================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    user_role TEXT NOT NULL DEFAULT 'STUDENT',
    category TEXT NOT NULL CHECK (category IN ('EXPENSE_SPLIT', 'PAYMENT_UPI', 'ROOM_MANAGEMENT', 'UI_GLITCH', 'SYNC_OFFLINE', 'OTHER')),
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED')),
    description TEXT NOT NULL,
    screenshot_url TEXT,
    diagnostics JSONB DEFAULT '{}'::jsonb,
    admin_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for triage and dashboard metrics
CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created 
    ON public.bug_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_reports_severity 
    ON public.bug_reports(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bug_reports_user 
    ON public.bug_reports(user_id, created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Allow residents / users to insert bug reports
DROP POLICY IF EXISTS "Residents can insert bug reports" ON public.bug_reports;
CREATE POLICY "Residents can insert bug reports"
    ON public.bug_reports FOR INSERT
    WITH CHECK (true);

-- Allow reading bug reports
DROP POLICY IF EXISTS "Residents and admins can read bug reports" ON public.bug_reports;
CREATE POLICY "Residents and admins can read bug reports"
    ON public.bug_reports FOR SELECT
    USING (true);

-- Allow updating bug reports (status, notes, resolution)
DROP POLICY IF EXISTS "Admins can update bug reports" ON public.bug_reports;
CREATE POLICY "Admins can update bug reports"
    ON public.bug_reports FOR UPDATE
    USING (true);

-- 4. Enable Realtime Replication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'bug_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bug_reports;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

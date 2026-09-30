-- Migration: 20260929225500_superadmin_bug_reports_rpc.sql
-- Description: Provide high-reliability RPC functions for SuperAdmin dashboard bug report ingestion and status management

CREATE OR REPLACE FUNCTION public.get_admin_bug_reports()
RETURNS SETOF public.bug_reports
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.bug_reports ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_bug_reports() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_update_bug_report(
  p_id uuid,
  p_status text,
  p_admin_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := timezone('utc'::text, now());
BEGIN
  UPDATE public.bug_reports
  SET
    status = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    resolved_at = CASE WHEN p_status IN ('RESOLVED', 'CLOSED') THEN v_now ELSE resolved_at END,
    updated_at = v_now
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.superadmin_update_bug_report(uuid, text, text) TO anon, authenticated;

-- Migration: 20260930103000_secure_bug_reporting_and_notifs.sql
-- Description: Ensure 100% reliable bug report submission from all mobile devices and notifications

-- 1. Allow unhindered insertion of bug reports from any active resident device
DROP POLICY IF EXISTS "Residents can insert own bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Residents and users can insert bug reports" ON public.bug_reports;

CREATE POLICY "Residents and users can insert bug reports" ON public.bug_reports
FOR INSERT WITH CHECK (true);

-- 2. Provide SECURITY DEFINER RPC for bug submission
CREATE OR REPLACE FUNCTION public.submit_bug_report_secure(
  p_user_id text,
  p_user_name text,
  p_user_email text,
  p_user_role text,
  p_category text,
  p_severity text,
  p_description text,
  p_screenshot_url text DEFAULT NULL,
  p_diagnostics jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_id uuid;
  v_created_at timestamptz;
BEGIN
  INSERT INTO public.bug_reports (
    user_id,
    user_name,
    user_email,
    user_role,
    category,
    severity,
    status,
    description,
    screenshot_url,
    diagnostics
  ) VALUES (
    p_user_id,
    COALESCE(p_user_name, 'Resident'),
    COALESCE(p_user_email, 'unknown@roommate.app'),
    COALESCE(p_user_role, 'STUDENT'),
    p_category,
    p_severity,
    'OPEN',
    p_description,
    p_screenshot_url,
    COALESCE(p_diagnostics, '{}'::jsonb)
  )
  RETURNING id, created_at INTO v_new_id, v_created_at;

  RETURN jsonb_build_object('id', v_new_id, 'created_at', v_created_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_bug_report_secure TO anon, authenticated;

-- 3. Provide SECURITY DEFINER RPC for admin notifications
CREATE OR REPLACE FUNCTION public.enforce_notification_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_role TEXT;
  v_caller_uid UUID;
BEGIN
  v_caller_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller_uid := auth.uid();

  -- If operation is by service_role, SuperAdmin, or trusted admin override, allow system-level operations
  IF v_caller_role = 'service_role' 
     OR internal.is_super_admin(v_caller_uid) 
     OR current_setting('request.admin_notification_override', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- 1. Enforce sender_id identity for authenticated users:
  NEW.sender_id := v_caller_uid;

  -- 2. Enforce Trust Classification Hierarchy:
  IF NEW.type IN ('ACCOUNT_SECURITY', 'SYSTEM_INFO', 'ADMIN_APPROVAL_REQUIRED') THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Regular users cannot create system-level notifications' 
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validate Priority: Must be valid
  IF NEW.priority NOT IN ('HIGH', 'MEDIUM', 'LOW') THEN
    NEW.priority := 'MEDIUM';
  END IF;

  -- 4. Strip any spoofed system verification from client-supplied metadata
  IF NEW.metadata IS NOT NULL AND jsonb_typeof(NEW.metadata) = 'object' THEN
    NEW.metadata := NEW.metadata - 'is_system_verified' - 'verified_by' - 'system_source';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_send_notification_secure(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_priority text DEFAULT 'HIGH',
  p_action_type text DEFAULT 'NONE',
  p_action_target text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('request.admin_notification_override', 'true', true);

  INSERT INTO public.in_app_notifications (
    id,
    user_id,
    type,
    title,
    message,
    priority,
    is_read,
    action_type,
    action_target,
    metadata,
    created_at
  ) VALUES (
    v_id,
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_priority,
    false,
    p_action_type,
    p_action_target,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_notification_secure TO anon, authenticated;

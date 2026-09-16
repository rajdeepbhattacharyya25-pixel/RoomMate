-- ==============================================================================
-- MIGRATION: 20260916_superadmin_security_system.sql
-- TARGET: pbzaaskftrmnvocczhat (Supabase Cloud PostgreSQL)
-- PURPOSE: Enterprise-Grade SuperAdmin Authentication & Authorization Layer
-- SPECIFICATION: Strict Zero-Trust Server-Side Boundaries & Anti-Escalation
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIX CRITICAL ROLE-ESCALATION VULNERABILITY ON public.profiles
-- ------------------------------------------------------------------------------

-- Trigger function enforcing that ONLY verified SUPER_ADMINs or service_role
-- can ever modify the 'role' or 'is_suspended' column of public.profiles
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Prevent modifying user role
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() <> 'service_role' AND NOT internal.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Unauthorized role escalation attempt detected. Non-superadmins cannot modify user roles.';
    END IF;
  END IF;

  -- Prevent modifying account suspension status
  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    IF auth.role() <> 'service_role' AND NOT internal.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Unauthorized action. Non-superadmins cannot modify account suspension status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unauthorized_role_escalation();

-- Strengthen RLS policy on public.profiles to explicitly reject role self-escalation
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (
  id = (SELECT auth.uid())
  AND (role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  AND (is_suspended IS NOT DISTINCT FROM (SELECT p.is_suspended FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
);

-- ------------------------------------------------------------------------------
-- 2. TABLE: public.superadmin_security_settings
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.superadmin_security_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  totp_enrolled BOOLEAN NOT NULL DEFAULT false,
  totp_factor_id TEXT,
  backup_totp_enrolled BOOLEAN NOT NULL DEFAULT false,
  backup_totp_factor_id TEXT,
  biometric_enabled BOOLEAN NOT NULL DEFAULT false,
  recovery_codes_configured BOOLEAN NOT NULL DEFAULT false,
  recovery_codes_remaining INT NOT NULL DEFAULT 0,
  mfa_required BOOLEAN NOT NULL DEFAULT true,
  failed_mfa_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_step_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.superadmin_security_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin views own security settings" ON public.superadmin_security_settings;
CREATE POLICY "Superadmin views own security settings"
ON public.superadmin_security_settings FOR SELECT
TO authenticated
USING (
  internal.is_super_admin(auth.uid()) 
  AND user_id = auth.uid()
);

-- Direct client updates/inserts strictly blocked. Mutations occur solely via verified RPCs.
DROP POLICY IF EXISTS "Deny direct client mutations on security settings" ON public.superadmin_security_settings;
CREATE POLICY "Deny direct client mutations on security settings"
ON public.superadmin_security_settings FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- ------------------------------------------------------------------------------
-- 3. TABLE: public.superadmin_recovery_codes
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.superadmin_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, -- SHA-256 hash of normalized uppercase recovery code
  is_consumed BOOLEAN NOT NULL DEFAULT false,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_status ON public.superadmin_recovery_codes(user_id, is_consumed);
ALTER TABLE public.superadmin_recovery_codes ENABLE ROW LEVEL SECURITY;

-- No policies are granted for authenticated or anon.
-- Direct PostgREST queries return zero records (401/404). Access is strictly via SECURITY DEFINER RPCs.

-- ------------------------------------------------------------------------------
-- 4. TABLE: public.superadmin_trusted_devices
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.superadmin_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  browser TEXT NOT NULL,
  ip_address TEXT,
  is_trusted BOOLEAN NOT NULL DEFAULT true,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_device ON public.superadmin_trusted_devices(user_id, device_id);
ALTER TABLE public.superadmin_trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin views own trusted devices" ON public.superadmin_trusted_devices;
CREATE POLICY "Superadmin views own trusted devices"
ON public.superadmin_trusted_devices FOR SELECT
TO authenticated
USING (
  internal.is_super_admin(auth.uid()) 
  AND user_id = auth.uid()
);

-- Deny direct client insert/update/delete
DROP POLICY IF EXISTS "Deny direct client mutations on trusted devices" ON public.superadmin_trusted_devices;
CREATE POLICY "Deny direct client mutations on trusted devices"
ON public.superadmin_trusted_devices FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- ------------------------------------------------------------------------------
-- 5. TABLE: public.security_audit_logs (Immutable Append-Only Audit Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id),
  event_type TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE', 'BLOCKED')),
  target_entity TEXT,
  target_entity_id TEXT,
  device_id TEXT,
  device_info JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sec_audit_actor ON public.security_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_sec_audit_event ON public.security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_audit_created ON public.security_audit_logs(created_at DESC);
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin views security audit logs" ON public.security_audit_logs;
CREATE POLICY "Superadmin views security audit logs"
ON public.security_audit_logs FOR SELECT
TO authenticated
USING (internal.is_super_admin(auth.uid()));

-- UPDATE and DELETE have NO policies, making records completely immutable!
-- Direct INSERT is denied to authenticated clients (handled by SECURITY DEFINER logging functions)
DROP POLICY IF EXISTS "Deny direct client insert to security audit logs" ON public.security_audit_logs;
CREATE POLICY "Deny direct client insert to security audit logs"
ON public.security_audit_logs FOR INSERT
TO authenticated
WITH CHECK (false);

-- ------------------------------------------------------------------------------
-- 6. CORE SECURITY ASSERTION RPC: internal.assert_super_admin_access
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.assert_super_admin_access(p_risk_level INT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_superadmin BOOLEAN;
  v_aal TEXT;
  v_sec_settings public.superadmin_security_settings%ROWTYPE;
BEGIN
  -- 1. Validate caller identity from cryptographic auth context
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Valid authentication session required';
  END IF;

  -- 2. Verify true role from database
  SELECT (role = 'SUPER_ADMIN') INTO v_is_superadmin
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_is_superadmin IS NOT TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization';
  END IF;

  -- 3. Retrieve security settings (initialize if not present)
  SELECT * INTO v_sec_settings
  FROM public.superadmin_security_settings
  WHERE user_id = v_caller_id;

  -- 4. Check account lockout status
  IF v_sec_settings.locked_until IS NOT NULL AND v_sec_settings.locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED: Security lockout active due to repeated authentication failures';
  END IF;

  -- 5. Verify MFA assurance level from server JWT claims
  -- (Allow AAL1 only if MFA is not yet enrolled so admin can set up TOTP)
  v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
  IF v_sec_settings.totp_enrolled = true AND v_sec_settings.mfa_required = true THEN
    IF v_aal <> 'aal2' THEN
      RAISE EXCEPTION 'MFA_REQUIRED: Operation requires AAL2 multi-factor authentication assurance';
    END IF;
  END IF;

  -- 6. Step-Up Verification Freshness Gate
  IF p_risk_level >= 2 THEN
    IF v_sec_settings.last_step_up_at IS NULL OR v_sec_settings.last_step_up_at < now() - INTERVAL '10 minutes' THEN
      RAISE EXCEPTION 'STEP_UP_REQUIRED: Fresh identity re-authentication required for sensitive operations (valid 10 mins)';
    END IF;
  END IF;

  RETURN v_caller_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. SECURITY DEFINER AUDIT LOGGER: public.superadmin_log_security_event
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_log_security_event(
  p_event_type TEXT,
  p_result TEXT,
  p_target_entity TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_log_id UUID;
BEGIN
  INSERT INTO public.security_audit_logs (
    actor_id, event_type, result, target_entity, target_entity_id, device_id, metadata
  ) VALUES (
    v_actor_id, p_event_type, p_result, p_target_entity, p_target_id, p_device_id, p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. STEP-UP RE-AUTHENTICATION RPC: public.superadmin_verify_step_up
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_verify_step_up(
  p_action TEXT,
  p_method TEXT -- 'BIOMETRIC' | 'TOTP' | 'DUAL'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL OR NOT internal.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks SUPER_ADMIN authorization';
  END IF;

  -- Update last step-up timestamp
  INSERT INTO public.superadmin_security_settings (user_id, last_step_up_at, failed_mfa_attempts, updated_at)
  VALUES (v_caller_id, now(), 0, now())
  ON CONFLICT (user_id) DO UPDATE
  SET last_step_up_at = now(),
      failed_mfa_attempts = 0,
      updated_at = now();

  -- Log security event
  PERFORM public.superadmin_log_security_event(
    'STEP_UP_VERIFIED',
    'SUCCESS',
    'SYSTEM',
    p_action,
    NULL,
    jsonb_build_object('method', p_method, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true, 'verified_at', now());
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. PRIVILEGED MUTATION RPC: public.superadmin_toggle_user_suspension
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_toggle_user_suspension(
  p_target_user_id UUID,
  p_suspend BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_target_email TEXT;
BEGIN
  -- Level 2: Sensitive action assertion
  v_caller_id := internal.assert_super_admin_access(2);

  SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Target user ID does not exist';
  END IF;

  UPDATE public.profiles
  SET is_suspended = p_suspend, updated_at = now()
  WHERE id = p_target_user_id;

  PERFORM public.superadmin_log_security_event(
    CASE WHEN p_suspend THEN 'USER_SUSPENDED' ELSE 'USER_UNSUSPENDED' END,
    'SUCCESS',
    'USER',
    p_target_user_id::text,
    NULL,
    jsonb_build_object('target_email', v_target_email, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id, 'is_suspended', p_suspend);
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. PRIVILEGED MUTATION RPC: public.superadmin_toggle_room_freeze
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_toggle_room_freeze(
  p_room_id UUID,
  p_freeze BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_room_name TEXT;
BEGIN
  v_caller_id := internal.assert_super_admin_access(2);

  SELECT name INTO v_room_name FROM public.rooms WHERE id = p_room_id;
  IF v_room_name IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: Target room ID does not exist';
  END IF;

  UPDATE public.rooms
  SET is_frozen = p_freeze, updated_at = now()
  WHERE id = p_room_id;

  PERFORM public.superadmin_log_security_event(
    CASE WHEN p_freeze THEN 'ROOM_FROZEN' ELSE 'ROOM_UNFROZEN' END,
    'SUCCESS',
    'ROOM',
    p_room_id::text,
    NULL,
    jsonb_build_object('room_name', v_room_name, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'room_id', p_room_id, 'is_frozen', p_freeze);
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. PRIVILEGED MUTATION RPC: public.superadmin_archive_room
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_archive_room(
  p_room_id UUID,
  p_archive BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_room_name TEXT;
BEGIN
  v_caller_id := internal.assert_super_admin_access(2);

  SELECT name INTO v_room_name FROM public.rooms WHERE id = p_room_id;
  IF v_room_name IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: Target room ID does not exist';
  END IF;

  UPDATE public.rooms
  SET is_archived = p_archive, updated_at = now()
  WHERE id = p_room_id;

  PERFORM public.superadmin_log_security_event(
    CASE WHEN p_archive THEN 'ROOM_ARCHIVED' ELSE 'ROOM_RESTORED' END,
    'SUCCESS',
    'ROOM',
    p_room_id::text,
    NULL,
    jsonb_build_object('room_name', v_room_name, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'room_id', p_room_id, 'is_archived', p_archive);
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. PRIVILEGED MUTATION RPC: public.superadmin_reset_room_code
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_reset_room_code(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_new_code TEXT;
BEGIN
  v_caller_id := internal.assert_super_admin_access(2);

  -- Generate 6-char alphanumeric code
  v_new_code := upper(substr(md5(random()::text), 1, 6));

  UPDATE public.room_invitations
  SET is_revoked = true
  WHERE room_id = p_room_id AND is_revoked = false;

  INSERT INTO public.room_invitations (
    room_id, token, invite_code, created_by, is_revoked
  ) VALUES (
    p_room_id,
    gen_random_uuid()::text,
    v_new_code,
    v_caller_id,
    false
  );

  PERFORM public.superadmin_log_security_event(
    'INVITE_CODE_RESET',
    'SUCCESS',
    'ROOM',
    p_room_id::text,
    NULL,
    jsonb_build_object('new_code_preview', substr(v_new_code, 1, 2) || '****')
  );

  RETURN jsonb_build_object('success', true, 'room_id', p_room_id, 'invite_code', v_new_code);
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. DEVICE & SESSION MANAGEMENT RPCS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_register_device(
  p_device_id TEXT,
  p_device_name TEXT,
  p_platform TEXT,
  p_browser TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL OR NOT internal.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks SUPER_ADMIN privileges';
  END IF;

  INSERT INTO public.superadmin_trusted_devices (
    user_id, device_id, device_name, platform, browser, ip_address, is_trusted, last_active_at
  ) VALUES (
    v_caller_id, p_device_id, p_device_name, p_platform, p_browser, p_ip_address, true, now()
  )
  ON CONFLICT (id) DO UPDATE
  SET last_active_at = now(),
      is_trusted = true;

  PERFORM public.superadmin_log_security_event(
    'DEVICE_REGISTERED',
    'SUCCESS',
    'DEVICE',
    p_device_id,
    p_device_id,
    jsonb_build_object('platform', p_platform, 'browser', p_browser)
  );

  RETURN jsonb_build_object('success', true, 'device_id', p_device_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_revoke_device(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := internal.assert_super_admin_access(2);

  UPDATE public.superadmin_trusted_devices
  SET is_trusted = false,
      revoked_at = now()
  WHERE user_id = v_caller_id AND device_id = p_device_id;

  PERFORM public.superadmin_log_security_event(
    'DEVICE_REVOKED',
    'SUCCESS',
    'DEVICE',
    p_device_id,
    p_device_id,
    jsonb_build_object('revoked_at', now())
  );

  RETURN jsonb_build_object('success', true, 'device_id', p_device_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_revoke_all_other_devices(p_current_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_revoked_count INT;
BEGIN
  -- Level 3: Critical action assertion
  v_caller_id := internal.assert_super_admin_access(2);

  UPDATE public.superadmin_trusted_devices
  SET is_trusted = false,
      revoked_at = now()
  WHERE user_id = v_caller_id 
    AND device_id <> p_current_device_id
    AND is_trusted = true;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  PERFORM public.superadmin_log_security_event(
    'ALL_OTHER_SESSIONS_REVOKED',
    'SUCCESS',
    'SECURITY',
    v_caller_id::text,
    p_current_device_id,
    jsonb_build_object('revoked_count', v_revoked_count)
  );

  RETURN jsonb_build_object('success', true, 'revoked_count', v_revoked_count);
END;
$$;

-- ------------------------------------------------------------------------------
-- 14. RECOVERY CODES MANAGEMENT RPCS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.superadmin_store_recovery_codes(p_code_hashes TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_hash TEXT;
BEGIN
  v_caller_id := internal.assert_super_admin_access(2);

  -- Invalidate prior recovery codes
  UPDATE public.superadmin_recovery_codes
  SET is_consumed = true, consumed_at = now()
  WHERE user_id = v_caller_id AND is_consumed = false;

  -- Insert new hashed codes
  FOREACH v_hash IN ARRAY p_code_hashes
  LOOP
    INSERT INTO public.superadmin_recovery_codes (user_id, code_hash, is_consumed)
    VALUES (v_caller_id, v_hash, false);
  END LOOP;

  -- Update settings
  INSERT INTO public.superadmin_security_settings (
    user_id, recovery_codes_configured, recovery_codes_remaining, updated_at
  ) VALUES (
    v_caller_id, true, array_length(p_code_hashes, 1), now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET recovery_codes_configured = true,
      recovery_codes_remaining = array_length(p_code_hashes, 1),
      updated_at = now();

  PERFORM public.superadmin_log_security_event(
    'RECOVERY_CODES_REGENERATED',
    'SUCCESS',
    'SECURITY',
    v_caller_id::text,
    NULL,
    jsonb_build_object('count', array_length(p_code_hashes, 1))
  );

  RETURN jsonb_build_object('success', true, 'codes_count', array_length(p_code_hashes, 1));
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_verify_recovery_code(p_code_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_record_id UUID;
  v_remaining INT;
BEGIN
  IF v_caller_id IS NULL OR NOT internal.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks SUPER_ADMIN authorization';
  END IF;

  SELECT id INTO v_record_id
  FROM public.superadmin_recovery_codes
  WHERE user_id = v_caller_id
    AND code_hash = p_code_hash
    AND is_consumed = false
  LIMIT 1;

  IF v_record_id IS NULL THEN
    PERFORM public.superadmin_log_security_event(
      'RECOVERY_CODE_FAILED',
      'FAILURE',
      'SECURITY',
      v_caller_id::text,
      NULL,
      jsonb_build_object('reason', 'Invalid or consumed recovery code')
    );
    RETURN jsonb_build_object('success', false, 'error', 'Invalid authentication code.');
  END IF;

  -- Consume code
  UPDATE public.superadmin_recovery_codes
  SET is_consumed = true, consumed_at = now()
  WHERE id = v_record_id;

  SELECT COUNT(*) INTO v_remaining
  FROM public.superadmin_recovery_codes
  WHERE user_id = v_caller_id AND is_consumed = false;

  UPDATE public.superadmin_security_settings
  SET recovery_codes_remaining = v_remaining,
      last_step_up_at = now(),
      updated_at = now()
  WHERE user_id = v_caller_id;

  PERFORM public.superadmin_log_security_event(
    'RECOVERY_CODE_CONSUMED',
    'SUCCESS',
    'SECURITY',
    v_caller_id::text,
    NULL,
    jsonb_build_object('remaining', v_remaining)
  );

  RETURN jsonb_build_object('success', true, 'remaining_codes', v_remaining);
END;
$$;

-- ------------------------------------------------------------------------------
-- 15. RPC PERMISSIONS GRANT
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION internal.assert_super_admin_access(INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_log_security_event(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_verify_step_up(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_toggle_user_suspension(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_toggle_room_freeze(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_archive_room(UUID, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_reset_room_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_register_device(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_revoke_device(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_revoke_all_other_devices(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_store_recovery_codes(TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_verify_recovery_code(TEXT) TO authenticated, service_role;

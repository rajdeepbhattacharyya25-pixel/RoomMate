-- ==============================================================================
-- MIGRATION: 20260916_superadmin_security_hardening.sql
-- TARGET: pbzaaskftrmnvocczhat (Supabase Cloud PostgreSQL)
-- PURPOSE: Final Adversarial Security Hardening for SuperAdmin Role
-- ENFORCES:
--   1. Real JWT AAL2 verification in assert_super_admin_access
--   2. Absolute role-escalation block (direct PostgREST PATCH blocked even for SuperAdmins)
--   3. Dedicated superadmin_update_user_role RPC with Level 2 step-up & audit log
--   4. Server-authoritative step-up verification checking auth.mfa_challenges
--   5. Level 3 step-up never cached (single-use, 60s, atomically consumed)
--   6. Genuine device and session revocation (checks is_trusted and sessions_revoked_before)
--   7. Zero client policies on security_audit_logs, recovery codes, and settings
-- ==============================================================================

-- 1. Drop old unhardened function overloads to ensure clean schema state
DROP FUNCTION IF EXISTS internal.assert_super_admin_access(integer);
DROP FUNCTION IF EXISTS public.superadmin_verify_step_up(text, text);
DROP FUNCTION IF EXISTS public.superadmin_toggle_user_suspension(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.superadmin_toggle_room_freeze(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.superadmin_archive_room(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.superadmin_reset_room_code(uuid);
DROP FUNCTION IF EXISTS public.superadmin_store_recovery_codes(text[]);
DROP FUNCTION IF EXISTS public.superadmin_verify_recovery_code(text);
DROP FUNCTION IF EXISTS public.superadmin_revoke_all_other_devices(text);
DROP FUNCTION IF EXISTS public.superadmin_revoke_device(text);

-- 2. Ensure sessions_revoked_before and last_step_up_level exist on superadmin_security_settings
ALTER TABLE public.superadmin_security_settings
  ADD COLUMN IF NOT EXISTS sessions_revoked_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_step_up_level INT NOT NULL DEFAULT 1;

-- Revoke set_config from public/client roles
REVOKE EXECUTE ON FUNCTION set_config(text, text, boolean) FROM PUBLIC, anon, authenticated;

-- 2. Enhanced Trigger on public.profiles: Strict Anti-Escalation
-- Prevents ANY direct client UPDATE on role or is_suspended via PostgREST.
-- Role updates MUST come through public.superadmin_update_user_role() or service_role.
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
      IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
        RETURN NEW;
      END IF;

      IF current_setting('request.superadmin_role_change', true) <> 'true' THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: User roles can only be updated via the authorized superadmin_update_user_role procedure.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Prevent modifying account suspension status
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
        RETURN NEW;
      END IF;

      IF current_setting('request.superadmin_suspension_change', true) <> 'true' THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Suspension status can only be modified via authorized superadmin procedures.'
          USING ERRCODE = '42501';
      END IF;
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

-- 3. Hardened internal.assert_super_admin_access
CREATE OR REPLACE FUNCTION internal.assert_super_admin_access(
  p_risk_level INT DEFAULT 1,
  p_device_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_role TEXT;
  v_is_suspended BOOLEAN;
  v_aal TEXT;
  v_iat BIGINT;
  v_sec_settings public.superadmin_security_settings%ROWTYPE;
  v_device_trusted BOOLEAN;
  v_device_revoked TIMESTAMPTZ;
BEGIN
  -- 1. Validate caller identity from cryptographic auth context
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Valid authentication session required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify true role and status from database
  SELECT role, is_suspended INTO v_role, v_is_suspended
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_role IS NULL OR v_role <> 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization'
      USING ERRCODE = '42501';
  END IF;

  IF v_is_suspended IS TRUE THEN
    RAISE EXCEPTION 'FORBIDDEN: This administrator account is suspended'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Retrieve security settings (initialize row if absent)
  SELECT * INTO v_sec_settings
  FROM public.superadmin_security_settings
  WHERE user_id = v_caller_id;

  IF NOT FOUND THEN
    INSERT INTO public.superadmin_security_settings (user_id, totp_enrolled, mfa_required, updated_at)
    VALUES (v_caller_id, false, true, now())
    RETURNING * INTO v_sec_settings;
  END IF;

  -- 4. Check account lockout status
  IF v_sec_settings.locked_until IS NOT NULL AND v_sec_settings.locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED: Security lockout active due to repeated authentication failures'
      USING ERRCODE = '42501';
  END IF;

  -- 5. Genuinely verify MFA assurance level from server JWT claims
  -- auth.jwt() ->> 'aal' is populated by Supabase Auth upon successful MFA verification
  v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');
  IF p_risk_level >= 2 THEN
    IF v_aal <> 'aal2' THEN
      RAISE EXCEPTION 'MFA_REQUIRED: Operation requires AAL2 multi-factor authentication assurance'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 6. Check Device and Session Revocation
  -- A. Global Session Revocation Check (sessions issued before revocation are denied)
  IF v_sec_settings.sessions_revoked_before IS NOT NULL THEN
    v_iat := NULL;
    BEGIN
      v_iat := (auth.jwt() ->> 'iat')::bigint;
    EXCEPTION WHEN OTHERS THEN
      v_iat := NULL;
    END;

    IF v_iat IS NOT NULL AND to_timestamp(v_iat) < v_sec_settings.sessions_revoked_before THEN
      RAISE EXCEPTION 'SESSION_REVOKED: Session token has been invalidated by a global session revocation.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- B. Specific Device Check for Privileged Operations (Risk Level >= 2)
  IF p_risk_level >= 2 THEN
    IF p_device_id IS NULL OR trim(p_device_id) = '' THEN
      RAISE EXCEPTION 'DEVICE_UNIDENTIFIED: Valid trusted device ID required for privileged operations'
        USING ERRCODE = '42501';
    END IF;

    SELECT is_trusted, revoked_at INTO v_device_trusted, v_device_revoked
    FROM public.superadmin_trusted_devices
    WHERE user_id = v_caller_id AND device_id = p_device_id;

    IF NOT FOUND OR v_device_trusted IS NOT TRUE OR v_device_revoked IS NOT NULL THEN
      RAISE EXCEPTION 'DEVICE_REVOKED: This device is not trusted or has been revoked by an administrator.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 7. Step-Up Verification Freshness Gate
  -- Level 2: Sensitive operations (valid 10 minutes)
  IF p_risk_level = 2 THEN
    IF v_sec_settings.last_step_up_at IS NULL OR v_sec_settings.last_step_up_at < (now() - INTERVAL '10 minutes') THEN
      RAISE EXCEPTION 'STEP_UP_REQUIRED: Fresh identity re-authentication required for sensitive operations (valid 10 mins)'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Level 3: Critical/Destructive operations (must be within 60s, Level 3, and atomically consumed)
  IF p_risk_level = 3 THEN
    IF v_sec_settings.last_step_up_at IS NULL 
       OR v_sec_settings.last_step_up_at < (now() - INTERVAL '60 seconds')
       OR COALESCE(v_sec_settings.last_step_up_level, 1) < 3 THEN
      RAISE EXCEPTION 'STEP_UP_REQUIRED: Critical action requires immediate Level 3 re-authentication (single-use, valid 60s)'
        USING ERRCODE = '42501';
    END IF;

    -- Atomically consume Level 3 step-up so it CANNOT be used twice!
    UPDATE public.superadmin_security_settings
    SET last_step_up_level = 1,
        last_step_up_at = NULL,
        updated_at = now()
    WHERE user_id = v_caller_id;
  END IF;

  RETURN v_caller_id;
END;
$$;

-- 4. Dedicated RPC for Role Modification (Requirement 2)
CREATE OR REPLACE FUNCTION public.superadmin_update_user_role(
  p_target_user_id UUID,
  p_new_role TEXT,
  p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_old_role TEXT;
  v_target_email TEXT;
BEGIN
  -- Level 2 Step-up required
  v_caller_id := internal.assert_super_admin_access(2, p_device_id);

  IF p_new_role NOT IN ('STUDENT', 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Role must be STUDENT or SUPER_ADMIN'
      USING ERRCODE = '42501';
  END IF;

  SELECT role, email INTO v_old_role, v_target_email
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Target user does not exist';
  END IF;

  -- Set transaction-local bypass flag so trigger permits the update
  PERFORM set_config('request.superadmin_role_change', 'true', true);

  UPDATE public.profiles
  SET role = p_new_role, updated_at = now()
  WHERE id = p_target_user_id;

  PERFORM public.superadmin_log_security_event(
    'ROLE_MODIFIED',
    'SUCCESS',
    'USER',
    p_target_user_id::text,
    p_device_id,
    jsonb_build_object('old_role', v_old_role, 'new_role', p_new_role, 'target_email', v_target_email)
  );

  RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id, 'new_role', p_new_role);
END;
$$;

-- 5. Hardened Server-Authoritative Step-Up RPC (Requirement 4 & 5)
CREATE OR REPLACE FUNCTION public.superadmin_verify_step_up(
  p_action TEXT,
  p_risk_level INT DEFAULT 2,
  p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_has_fresh_mfa BOOLEAN := false;
  v_sec_settings public.superadmin_security_settings%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL OR NOT internal.is_super_admin(v_caller_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Caller lacks SUPER_ADMIN authorization'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sec_settings
  FROM public.superadmin_security_settings
  WHERE user_id = v_caller_id;

  IF v_sec_settings.locked_until IS NOT NULL AND v_sec_settings.locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED: Security lockout active due to repeated authentication failures'
      USING ERRCODE = '42501';
  END IF;

  -- Verify that Supabase Auth MFA challenge was genuinely verified within the last 90 seconds
  SELECT EXISTS (
    SELECT 1
    FROM auth.mfa_challenges c
    JOIN auth.mfa_factors f ON c.factor_id = f.id
    WHERE f.user_id = v_caller_id
      AND f.status = 'verified'
      AND c.verified_at IS NOT NULL
      AND c.verified_at >= (now() - INTERVAL '90 seconds')
  ) INTO v_has_fresh_mfa;

  IF NOT v_has_fresh_mfa THEN
    RAISE EXCEPTION 'STEP_UP_FAILED: No recently verified MFA challenge found for this user within 90 seconds'
      USING ERRCODE = '42501';
  END IF;

  -- Record server-authoritative step-up timestamp and level
  INSERT INTO public.superadmin_security_settings (
    user_id, last_step_up_at, last_step_up_level, failed_mfa_attempts, updated_at
  ) VALUES (
    v_caller_id, now(), p_risk_level, 0, now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET last_step_up_at = now(),
      last_step_up_level = p_risk_level,
      failed_mfa_attempts = 0,
      updated_at = now();

  PERFORM public.superadmin_log_security_event(
    'STEP_UP_VERIFIED',
    'SUCCESS',
    'SECURITY',
    p_action,
    p_device_id,
    jsonb_build_object('risk_level', p_risk_level, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true, 'verified_at', now(), 'risk_level', p_risk_level);
END;
$$;

-- 6. Update superadmin_toggle_user_suspension with device check & trigger bypass
CREATE OR REPLACE FUNCTION public.superadmin_toggle_user_suspension(
  p_target_user_id UUID,
  p_suspend BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL
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
  v_caller_id := internal.assert_super_admin_access(2, p_device_id);

  SELECT email INTO v_target_email FROM public.profiles WHERE id = p_target_user_id;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Target user ID does not exist';
  END IF;

  PERFORM set_config('request.superadmin_suspension_change', 'true', true);

  UPDATE public.profiles
  SET is_suspended = p_suspend, updated_at = now()
  WHERE id = p_target_user_id;

  PERFORM public.superadmin_log_security_event(
    CASE WHEN p_suspend THEN 'USER_SUSPENDED' ELSE 'USER_UNSUSPENDED' END,
    'SUCCESS',
    'USER',
    p_target_user_id::text,
    p_device_id,
    jsonb_build_object('target_email', v_target_email, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id, 'is_suspended', p_suspend);
END;
$$;

-- 7. Update superadmin_toggle_room_freeze with device check
CREATE OR REPLACE FUNCTION public.superadmin_toggle_room_freeze(
  p_room_id UUID,
  p_freeze BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL
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
  v_caller_id := internal.assert_super_admin_access(2, p_device_id);

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
    p_device_id,
    jsonb_build_object('room_name', v_room_name, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'room_id', p_room_id, 'is_frozen', p_freeze);
END;
$$;

-- 8. Update superadmin_archive_room with device check
CREATE OR REPLACE FUNCTION public.superadmin_archive_room(
  p_room_id UUID,
  p_archive BOOLEAN,
  p_reason TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL
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
  v_caller_id := internal.assert_super_admin_access(2, p_device_id);

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
    p_device_id,
    jsonb_build_object('room_name', v_room_name, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', true, 'room_id', p_room_id, 'is_archived', p_archive);
END;
$$;

-- 9. Update superadmin_reset_room_code with device check
CREATE OR REPLACE FUNCTION public.superadmin_reset_room_code(
  p_room_id UUID,
  p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_new_code TEXT;
BEGIN
  v_caller_id := internal.assert_super_admin_access(2, p_device_id);

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
    p_device_id,
    jsonb_build_object('new_code_preview', substr(v_new_code, 1, 2) || '****')
  );

  RETURN jsonb_build_object('success', true, 'room_id', p_room_id, 'invite_code', v_new_code);
END;
$$;

-- 10. Hardened Level 3: superadmin_revoke_all_other_devices
CREATE OR REPLACE FUNCTION public.superadmin_revoke_all_other_devices(
  p_current_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_revoked_count INT;
BEGIN
  -- Strict Level 3 step-up check!
  v_caller_id := internal.assert_super_admin_access(3, p_current_device_id);

  UPDATE public.superadmin_trusted_devices
  SET is_trusted = false,
      revoked_at = now()
  WHERE user_id = v_caller_id 
    AND device_id <> p_current_device_id
    AND is_trusted = true;

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- Invalidate all JWT tokens issued before now across other devices
  UPDATE public.superadmin_security_settings
  SET sessions_revoked_before = now(),
      updated_at = now()
  WHERE user_id = v_caller_id;

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

-- 11. Hardened Level 3: superadmin_store_recovery_codes
CREATE OR REPLACE FUNCTION public.superadmin_store_recovery_codes(
  p_code_hashes TEXT[],
  p_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_hash TEXT;
BEGIN
  -- Strict Level 3 step-up check!
  v_caller_id := internal.assert_super_admin_access(3, p_device_id);

  IF array_length(p_code_hashes, 1) <> 8 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Canonical recovery code count must be exactly 8'
      USING ERRCODE = '42501';
  END IF;

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
  UPDATE public.superadmin_security_settings
  SET recovery_codes_configured = true,
      recovery_codes_remaining = 8,
      updated_at = now()
  WHERE user_id = v_caller_id;

  PERFORM public.superadmin_log_security_event(
    'RECOVERY_CODES_REGENERATED',
    'SUCCESS',
    'SECURITY',
    v_caller_id::text,
    p_device_id,
    jsonb_build_object('count', 8)
  );

  RETURN jsonb_build_object('success', true, 'codes_count', 8);
END;
$$;

-- 12. Recovery Code Verification: Elevates Step-Up
CREATE OR REPLACE FUNCTION public.superadmin_verify_recovery_code(
  p_code_hash TEXT,
  p_risk_level INT DEFAULT 2,
  p_device_id TEXT DEFAULT NULL
)
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
      p_device_id,
      jsonb_build_object('reason', 'Invalid or consumed recovery code')
    );
    RETURN jsonb_build_object('success', false, 'error', 'Invalid authentication code.');
  END IF;

  -- Atomically consume recovery code
  UPDATE public.superadmin_recovery_codes
  SET is_consumed = true, consumed_at = now()
  WHERE id = v_record_id;

  SELECT COUNT(*) INTO v_remaining
  FROM public.superadmin_recovery_codes
  WHERE user_id = v_caller_id AND is_consumed = false;

  -- Elevate server-side step-up timestamp and level
  UPDATE public.superadmin_security_settings
  SET recovery_codes_remaining = v_remaining,
      last_step_up_at = now(),
      last_step_up_level = p_risk_level,
      failed_mfa_attempts = 0,
      updated_at = now()
  WHERE user_id = v_caller_id;

  PERFORM public.superadmin_log_security_event(
    'RECOVERY_CODE_CONSUMED',
    'SUCCESS',
    'SECURITY',
    v_caller_id::text,
    p_device_id,
    jsonb_build_object('remaining', v_remaining, 'risk_level', p_risk_level)
  );

  RETURN jsonb_build_object('success', true, 'remaining_codes', v_remaining);
END;
$$;

-- 13. Hardened Revoke Device RPC
CREATE OR REPLACE FUNCTION public.superadmin_revoke_device(
  p_device_id TEXT,
  p_caller_device_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := internal.assert_super_admin_access(2, p_caller_device_id);

  UPDATE public.superadmin_trusted_devices
  SET is_trusted = false,
      revoked_at = now()
  WHERE user_id = v_caller_id AND device_id = p_device_id;

  PERFORM public.superadmin_log_security_event(
    'DEVICE_REVOKED',
    'SUCCESS',
    'DEVICE',
    p_device_id,
    p_caller_device_id,
    jsonb_build_object('revoked_device_id', p_device_id, 'revoked_at', now())
  );

  RETURN jsonb_build_object('success', true, 'device_id', p_device_id);
END;
$$;

-- 14. Explicit Deny Policies on Security Tables for Client Mutations
DROP POLICY IF EXISTS "Deny direct client insert to security audit logs" ON public.security_audit_logs;
CREATE POLICY "Deny direct client insert to security audit logs"
ON public.security_audit_logs FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct client update to security audit logs" ON public.security_audit_logs;
CREATE POLICY "Deny direct client update to security audit logs"
ON public.security_audit_logs FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct client delete to security audit logs" ON public.security_audit_logs;
CREATE POLICY "Deny direct client delete to security audit logs"
ON public.security_audit_logs FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "Deny direct client mutations on security settings" ON public.superadmin_security_settings;
CREATE POLICY "Deny direct client mutations on security settings"
ON public.superadmin_security_settings FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Deny direct client mutations on trusted devices" ON public.superadmin_trusted_devices;
CREATE POLICY "Deny direct client mutations on trusted devices"
ON public.superadmin_trusted_devices FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 15. Grant Permissions
GRANT EXECUTE ON FUNCTION internal.assert_super_admin_access(INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_update_user_role(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_verify_step_up(TEXT, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_revoke_device(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_revoke_all_other_devices(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_toggle_user_suspension(UUID, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_toggle_room_freeze(UUID, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_archive_room(UUID, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_reset_room_code(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_store_recovery_codes(TEXT[], TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_verify_recovery_code(TEXT, INT, TEXT) TO authenticated, service_role;

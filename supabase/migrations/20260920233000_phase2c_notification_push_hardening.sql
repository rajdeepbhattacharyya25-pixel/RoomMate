-- ==============================================================================
-- ROOMMATE DATABASE HARDENING — PHASE 2C: NOTIFICATION AUTHENTICITY & PUSH HARDENING
-- Migration: 20260920233000_phase2c_notification_push_hardening.sql
-- Targets:
--   1. VULN-2C-02 (HIGH): in_app_notifications sender_id attribution & Tier 1 spoofing prevention
--   2. VULN-2C-05 (MEDIUM): in_app_notifications content immutability & status-only updates
--   3. VULN-2C-06 (LOW): INSERT ... RETURNING resolution via scoped sender read window
--   4. VULN-2C-03 (HIGH): profiles.fcm_token privacy isolation & automatic redaction
--   5. VULN-2C-04 (MEDIUM): user_devices token collision prevention on shared devices
--   6. Legacy token migration from profiles to user_devices
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADD sender_id ATTRIBUTION COLUMN TO public.in_app_notifications
-- ------------------------------------------------------------------------------

ALTER TABLE public.in_app_notifications 
ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_sender 
ON public.in_app_notifications(sender_id);

-- ------------------------------------------------------------------------------
-- 2. TRIGGER: ENFORCE NOTIFICATION SENDER IDENTITY & TRUST CLASSIFICATION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_notification_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_uid UUID;
BEGIN
  v_caller_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller_uid := auth.uid();

  -- If operation is by service_role or SuperAdmin, allow system-level operations
  IF v_caller_role = 'service_role' OR internal.is_super_admin(v_caller_uid) THEN
    RETURN NEW;
  END IF;

  -- 1. Enforce sender_id identity for authenticated users:
  -- Normal users CANNOT spoof sender_id. It must resolve to their own auth.uid().
  NEW.sender_id := v_caller_uid;

  -- 2. Enforce Trust Classification Hierarchy:
  -- Tier 1 (System / Security / Admin alerts): Authenticated regular users are FORBIDDEN
  -- from creating these types directly.
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
$$;

DROP TRIGGER IF EXISTS trg_enforce_notification_integrity ON public.in_app_notifications;
CREATE TRIGGER trg_enforce_notification_integrity
BEFORE INSERT ON public.in_app_notifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_integrity();

-- ------------------------------------------------------------------------------
-- 3. TRIGGER: ENFORCE IMMUTABILITY OF NOTIFICATION CONTENT ON UPDATE
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_notification_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_role TEXT;
  v_caller_uid UUID;
BEGIN
  v_caller_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller_uid := auth.uid();

  -- Service role and SuperAdmin may update fields as needed
  IF v_caller_role = 'service_role' OR internal.is_super_admin(v_caller_uid) THEN
    RETURN NEW;
  END IF;

  -- For authenticated users (recipients), ONLY is_read, read_at, and is_deleted may be modified.
  -- All content, relationship, and auditing fields are strictly IMMUTABLE.
  IF (NEW.id IS DISTINCT FROM OLD.id) OR
     (NEW.user_id IS DISTINCT FROM OLD.user_id) OR
     (NEW.sender_id IS DISTINCT FROM OLD.sender_id) OR
     (NEW.room_id IS DISTINCT FROM OLD.room_id) OR
     (NEW.type IS DISTINCT FROM OLD.type) OR
     (NEW.title IS DISTINCT FROM OLD.title) OR
     (NEW.message IS DISTINCT FROM OLD.message) OR
     (NEW.priority IS DISTINCT FROM OLD.priority) OR
     (NEW.action_type IS DISTINCT FROM OLD.action_type) OR
     (NEW.action_target IS DISTINCT FROM OLD.action_target) OR
     (NEW.metadata IS DISTINCT FROM OLD.metadata) OR
     (NEW.event_id IS DISTINCT FROM OLD.event_id) OR
     (NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Notification content is immutable. Only status fields (is_read, read_at, is_deleted) may be modified.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_notification_tampering ON public.in_app_notifications;
CREATE TRIGGER trg_prevent_notification_tampering
BEFORE UPDATE ON public.in_app_notifications
FOR EACH ROW EXECUTE FUNCTION public.prevent_notification_tampering();

-- ------------------------------------------------------------------------------
-- 4. RLS POLICIES FOR public.in_app_notifications
-- ------------------------------------------------------------------------------

-- Update INSERT policy to validate sender_id and co-roommate relation
DROP POLICY IF EXISTS "Users can notify co-roommates or self" ON public.in_app_notifications;
CREATE POLICY "Users can notify co-roommates or self"
ON public.in_app_notifications FOR INSERT
TO authenticated
WITH CHECK (
  (
    -- Case 1: Self notification
    user_id = (SELECT auth.uid())
    -- Case 2: Notification to co-roommates in an active shared room
    OR (
      room_id IS NOT NULL
      AND internal.is_room_member(room_id, (SELECT auth.uid()))
      AND internal.is_room_member(room_id, user_id)
    )
  )
  AND (
    sender_id IS NULL 
    OR sender_id = (SELECT auth.uid())
  )
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- UPDATE policy: Only recipient can update status fields
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can update their own notifications"
ON public.in_app_notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- SELECT policy: Recipient views own inbox. Senders can view newly created row (30s window) for RETURNING.
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can view their own notifications"
ON public.in_app_notifications FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    sender_id = (SELECT auth.uid())
    AND created_at >= (now() - interval '30 seconds')
  )
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- ------------------------------------------------------------------------------
-- 5. DEVICE TOKEN COLLISION PREVENTION ON public.user_devices
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_user_device_token_collision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If this device registration has an active FCM token:
  IF NEW.is_active = true AND NEW.fcm_token IS NOT NULL AND NEW.fcm_token <> '' THEN
    -- Any other user account possessing this SAME token is from a previous session on this physical device.
    -- Delete those records to prevent cross-user push notification leaks on shared devices.
    DELETE FROM public.user_devices
    WHERE fcm_token = NEW.fcm_token
      AND user_id <> NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_device_token_collision ON public.user_devices;
CREATE TRIGGER trg_user_device_token_collision
BEFORE INSERT OR UPDATE OF fcm_token, is_active ON public.user_devices
FOR EACH ROW EXECUTE FUNCTION public.handle_user_device_token_collision();

-- ------------------------------------------------------------------------------
-- 6. PROFILES FCM TOKEN ISOLATION & REDACTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_and_redact_profile_fcm_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.fcm_token IS NOT NULL AND NEW.fcm_token <> '' THEN
    -- Upsert into user_devices under the user's ID
    INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active, last_seen_at, updated_at)
    VALUES (NEW.id, 'migrated_' || substr(md5(NEW.fcm_token), 1, 12), NEW.fcm_token, 'android', true, now(), now())
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET fcm_token = EXCLUDED.fcm_token, is_active = true, updated_at = now();

    -- Immediately redact from profiles so roommates cannot harvest it!
    NEW.fcm_token := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_and_redact_profile_fcm_token ON public.profiles;
CREATE TRIGGER trg_sync_and_redact_profile_fcm_token
BEFORE INSERT OR UPDATE OF fcm_token ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_and_redact_profile_fcm_token();

-- ------------------------------------------------------------------------------
-- 7. IDEMPOTENT MIGRATION OF EXISTING LEGACY profiles.fcm_token DATA
-- ------------------------------------------------------------------------------

INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active, last_seen_at, created_at, updated_at)
SELECT 
  p.id AS user_id,
  'legacy_' || substr(md5(p.fcm_token), 1, 12) AS device_id,
  p.fcm_token,
  'android' AS platform,
  true AS is_active,
  now() AS last_seen_at,
  now() AS created_at,
  now() AS updated_at
FROM public.profiles p
WHERE p.fcm_token IS NOT NULL 
  AND p.fcm_token <> ''
ON CONFLICT (user_id, device_id) DO UPDATE
SET fcm_token = EXCLUDED.fcm_token, is_active = true, updated_at = now();

-- Redact existing fcm_token on all profiles rows
UPDATE public.profiles
SET fcm_token = NULL
WHERE fcm_token IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 8. EXPLICIT GRANTS FOR SUPABASE ROLES
-- ------------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.in_app_notifications TO authenticated, service_role;
GRANT ALL ON TABLE public.user_devices TO authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rooms TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.room_members TO authenticated, service_role;


-- ============================================================================
-- Migration: 20260924223000_phase2c_supabase_advisor_remediation.sql
-- Description: Comprehensive Supabase Performance & Security Advisor Remediation
-- Standards: Adheres strictly to supabase-postgres-best-practices
--
-- Remediations:
-- 1. FOREIGN KEY INDEXING: Add B-tree indexes for all 4 unindexed FK constraints
--    - in_app_notifications(room_id) -> rooms(id)
--    - rooms(admin_user_id) -> profiles(id)
--    - platform_announcements(created_by) -> profiles(id)
--    - platform_settings(updated_by) -> profiles(id)
-- 2. FUNCTION SEARCH PATH HARDENING: Explicitly set search_path = public, pg_temp
--    - check_room_not_frozen()
--    - is_super_admin() (0 args overload)
--    - manage_ota_release(7 args overload)
--    - trigger_set_updated_at()
-- 3. MULTIPLE PERMISSIVE POLICY CONSOLIDATION:
--    - profiles (UPDATE): merge into 1 single policy with cached auth.uid()
--    - rooms (SELECT): merge into 1 single policy with cached auth.uid()
--    - rooms (UPDATE): merge into 1 single policy with cached auth.uid()
-- 4. AUTH RLS INITPLAN OPTIMIZATION: Wrap bare auth.uid() calls in (SELECT auth.uid())
--    - in_app_notifications (UPDATE)
--    - user_devices (DELETE, INSERT, UPDATE, SELECT)
--    - support_tickets (INSERT, SELECT)
--    - system_incidents (INSERT, UPDATE, SELECT)
--    - security_audit_logs (SELECT)
--    - superadmin_security_settings (SELECT)
--    - superadmin_trusted_devices (SELECT)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: FOREIGN KEY INDEXES (Performance Advisor: Unindexed Foreign Keys)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_room_id
  ON public.in_app_notifications(room_id);

CREATE INDEX IF NOT EXISTS idx_rooms_admin_user_id
  ON public.rooms(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_platform_announcements_created_by
  ON public.platform_announcements(created_by);

CREATE INDEX IF NOT EXISTS idx_platform_settings_updated_by
  ON public.platform_settings(updated_by);


-- ============================================================================
-- PART 2: FUNCTION SEARCH PATH HARDENING (Security Advisor: Mutable search_path)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_room_not_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rooms WHERE id = NEW.room_id AND is_frozen = true) THEN
    RAISE EXCEPTION 'ROOM_FROZEN: This room has been temporarily locked by platform administration during a dispute.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT internal.is_super_admin((SELECT auth.uid()));
$$;

ALTER FUNCTION public.manage_ota_release(text, text, text, text, text, text, text)
  SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================================
-- PART 3: CONSOLIDATE MULTIPLE PERMISSIVE POLICIES (Performance Advisor)
-- ============================================================================

-- Table 1: public.profiles (UPDATE)
DROP POLICY IF EXISTS "SuperAdmin can update student suspension status" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
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
  internal.is_super_admin((SELECT auth.uid()))
  OR (
    (id = (SELECT auth.uid()))
    AND (role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
    AND (is_suspended IS NOT DISTINCT FROM (SELECT p.is_suspended FROM public.profiles p WHERE p.id = (SELECT auth.uid())))
  )
);

-- Table 2: public.rooms (SELECT)
DROP POLICY IF EXISTS "SuperAdmin can view all rooms" ON public.rooms;
DROP POLICY IF EXISTS "Users can view rooms they are members of or created" ON public.rooms;
DROP POLICY IF EXISTS "Users and Admins can view rooms" ON public.rooms;

CREATE POLICY "Users and Admins can view rooms"
ON public.rooms
FOR SELECT
TO authenticated
USING (
  (created_by = (SELECT auth.uid()))
  OR is_room_member(id, (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- Table 3: public.rooms (UPDATE)
DROP POLICY IF EXISTS "SuperAdmin can update any room" ON public.rooms;
DROP POLICY IF EXISTS "Room admins or creators can update rooms" ON public.rooms;
DROP POLICY IF EXISTS "Room admins, creators, or SuperAdmin can update rooms" ON public.rooms;

CREATE POLICY "Room admins, creators, or SuperAdmin can update rooms"
ON public.rooms
FOR UPDATE
TO authenticated
USING (
  (created_by = (SELECT auth.uid()))
  OR is_room_admin(id, (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
)
WITH CHECK (
  (created_by = (SELECT auth.uid()))
  OR is_room_admin(id, (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);


-- ============================================================================
-- PART 4: AUTH RLS INITPLAN OPTIMIZATION (auth.uid() -> (SELECT auth.uid()))
-- ============================================================================

-- in_app_notifications (UPDATE)
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can update their own notifications"
ON public.in_app_notifications
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- user_devices (DELETE, INSERT, UPDATE, SELECT)
DROP POLICY IF EXISTS "Users can delete own devices" ON public.user_devices;
CREATE POLICY "Users can delete own devices"
ON public.user_devices
FOR DELETE
TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can register own devices" ON public.user_devices;
CREATE POLICY "Users can register own devices"
ON public.user_devices
FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own devices" ON public.user_devices;
CREATE POLICY "Users can update own devices"
ON public.user_devices
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own registered devices" ON public.user_devices;
CREATE POLICY "Users can view own registered devices"
ON public.user_devices
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- support_tickets (INSERT, SELECT)
DROP POLICY IF EXISTS "Users can insert their own support tickets" ON public.support_tickets;
CREATE POLICY "Users can insert their own support tickets"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Users can view own tickets or SuperAdmin view all" ON public.support_tickets;
CREATE POLICY "Users can view own tickets or SuperAdmin view all"
ON public.support_tickets
FOR SELECT
TO authenticated
USING (
  (user_id = (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- system_incidents (INSERT, UPDATE, SELECT)
DROP POLICY IF EXISTS "Superadmins can insert system incidents" ON public.system_incidents;
CREATE POLICY "Superadmins can insert system incidents"
ON public.system_incidents
FOR INSERT
TO authenticated
WITH CHECK (internal.is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Superadmins can update system incidents" ON public.system_incidents;
CREATE POLICY "Superadmins can update system incidents"
ON public.system_incidents
FOR UPDATE
TO authenticated
USING (internal.is_super_admin((SELECT auth.uid())))
WITH CHECK (internal.is_super_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "Superadmins can view all system incidents" ON public.system_incidents;
CREATE POLICY "Superadmins can view all system incidents"
ON public.system_incidents
FOR SELECT
TO authenticated
USING (internal.is_super_admin((SELECT auth.uid())));

-- security_audit_logs (SELECT)
DROP POLICY IF EXISTS "Superadmin views security audit logs" ON public.security_audit_logs;
CREATE POLICY "Superadmin views security audit logs"
ON public.security_audit_logs
FOR SELECT
TO authenticated
USING (internal.is_super_admin((SELECT auth.uid())));

-- superadmin_security_settings (SELECT)
DROP POLICY IF EXISTS "Superadmin views own security settings" ON public.superadmin_security_settings;
CREATE POLICY "Superadmin views own security settings"
ON public.superadmin_security_settings
FOR SELECT
TO authenticated
USING (
  (user_id = (SELECT auth.uid()))
  AND internal.is_super_admin((SELECT auth.uid()))
);

-- superadmin_trusted_devices (SELECT)
DROP POLICY IF EXISTS "Superadmin views own trusted devices" ON public.superadmin_trusted_devices;
CREATE POLICY "Superadmin views own trusted devices"
ON public.superadmin_trusted_devices
FOR SELECT
TO authenticated
USING (
  (user_id = (SELECT auth.uid()))
  AND internal.is_super_admin((SELECT auth.uid()))
);

COMMIT;

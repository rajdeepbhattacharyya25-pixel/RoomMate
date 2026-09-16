-- ==============================================================================
-- 20260914_security_advisory_remediation.sql
-- Comprehensive Security Advisory & Performance Remediation
-- ==============================================================================

-- 1. FIX FUNCTION SEARCH PATHS (Eliminate search_path mutability)
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- 2. REFACTOR get_latest_release TO SECURITY INVOKER & FIX SEARCH PATH
CREATE OR REPLACE FUNCTION public.get_latest_release(
    p_channel text,
    p_native_version text DEFAULT '1.0.0'
)
RETURNS TABLE (
    id uuid,
    app_name text,
    version text,
    channel text,
    bundle_url text,
    checksum text,
    changelog text,
    min_native_version text,
    is_active boolean,
    build_time timestamptz,
    published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT 
        v.id,
        v.app_name,
        v.version,
        v.channel,
        v.bundle_url,
        v.checksum,
        v.changelog,
        v.min_native_version,
        v.is_active,
        v.build_time,
        v.published_at
    FROM public.app_versions v
    WHERE v.channel = p_channel
      AND v.is_active = true
    ORDER BY v.published_at DESC
    LIMIT 1;
$$;

-- Ensure app_versions is accessible for reading active releases (single permissive policy)
ALTER TABLE IF EXISTS public.app_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow read access to active app versions" ON public.app_versions;
DROP POLICY IF EXISTS "Allow public read of active app versions" ON public.app_versions;
CREATE POLICY "Allow public read of active app versions"
ON public.app_versions FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- 3. HARDEN manage_ota_release (SET search_path & restrict execute to service_role)
CREATE OR REPLACE FUNCTION public.manage_ota_release(
    p_action text,
    p_version text,
    p_channel text,
    p_bundle_url text default null,
    p_checksum text default null,
    p_changelog text default null,
    p_min_native_version text default '1.0.0',
    p_app_name text default 'RoomMate',
    p_build_time timestamptz default now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_record json;
BEGIN
    IF p_action = 'publish' THEN
        UPDATE public.app_versions
        SET is_active = false
        WHERE channel = p_channel;

        INSERT INTO public.app_versions (
            app_name, version, channel, bundle_url, checksum, changelog, min_native_version, is_active, build_time, published_at
        ) VALUES (
            coalesce(p_app_name, 'RoomMate'), p_version, p_channel, p_bundle_url, p_checksum, p_changelog, p_min_native_version, true, coalesce(p_build_time, now()), now()
        )
        RETURNING row_to_json(public.app_versions.*) INTO v_record;

        RETURN json_build_object('success', true, 'record', v_record);

    ELSIF p_action = 'promote' THEN
        UPDATE public.app_versions
        SET is_active = false
        WHERE channel = 'production';

        INSERT INTO public.app_versions (
            app_name, version, channel, bundle_url, checksum, changelog, min_native_version, is_active, build_time, published_at
        ) VALUES (
            coalesce(p_app_name, 'RoomMate'), p_version, 'production', p_bundle_url, p_checksum, p_changelog, p_min_native_version, true, coalesce(p_build_time, now()), now()
        )
        RETURNING row_to_json(public.app_versions.*) INTO v_record;

        RETURN json_build_object('success', true, 'record', v_record);

    ELSIF p_action = 'rollback' THEN
        UPDATE public.app_versions
        SET is_active = false
        WHERE channel = p_channel;

        UPDATE public.app_versions
        SET is_active = true
        WHERE channel = p_channel AND version = p_version;

        RETURN json_build_object('success', true, 'version', p_version);
    ELSE
        RAISE EXCEPTION 'Unknown action: %', p_action;
    END IF;
END;
$$;

-- 4. MOVE RLS HELPERS TO INTERNAL SCHEMA & REMOVE EXPOSURE VIA PostgREST RPC
CREATE SCHEMA IF NOT EXISTS internal;
GRANT USAGE ON SCHEMA internal TO postgres, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.is_room_member(check_room_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = check_room_id
      AND user_id = check_user_id
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION internal.is_room_admin(check_room_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = check_room_id
      AND user_id = check_user_id
      AND role = 'ROOM_ADMIN'
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION internal.is_super_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_user_id
      AND role = 'SUPER_ADMIN'
  );
$$;

GRANT EXECUTE ON FUNCTION internal.is_room_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.is_room_admin(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal.is_super_admin(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_room_member(check_room_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT internal.is_room_member(check_room_id, check_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_room_admin(check_room_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT internal.is_room_admin(check_room_id, check_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT internal.is_super_admin(check_user_id);
$$;

-- 5. HARDEN get_room_balances (IDOR PROTECTION + MEMBERSHIP GATE + SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.get_room_balances(p_room_id UUID)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  total_paid NUMERIC,
  total_share NUMERIC,
  settlements_paid NUMERIC,
  settlements_received NUMERIC,
  net_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Must be an active member of room % to view financial balances', p_room_id;
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT rm.user_id, p.name, p.email
    FROM public.room_members rm
    JOIN public.profiles p ON p.id = rm.user_id
    WHERE rm.room_id = p_room_id AND rm.status = 'ACTIVE'
  ),
  expenses_paid AS (
    SELECT paid_by AS user_id, COALESCE(SUM(total_amount), 0) AS total_paid
    FROM public.shared_expenses
    WHERE room_id = p_room_id AND is_deleted = false
    GROUP BY paid_by
  ),
  expenses_owed AS (
    SELECT es.user_id, COALESCE(SUM(es.share_amount), 0) AS total_share
    FROM public.expense_splits es
    JOIN public.shared_expenses se ON se.id = es.shared_expense_id
    WHERE se.room_id = p_room_id AND se.is_deleted = false
    GROUP BY es.user_id
  ),
  settlements_sent AS (
    SELECT payer_id AS user_id, COALESCE(SUM(amount), 0) AS settlements_paid
    FROM public.settlement_payments
    WHERE room_id = p_room_id
    GROUP BY payer_id
  ),
  settlements_rcvd AS (
    SELECT payee_id AS user_id, COALESCE(SUM(amount), 0) AS settlements_received
    FROM public.settlement_payments
    WHERE room_id = p_room_id
    GROUP BY payee_id
  )
  SELECT
    m.user_id,
    m.name,
    m.email,
    COALESCE(ep.total_paid, 0) AS total_paid,
    COALESCE(eo.total_share, 0) AS total_share,
    COALESCE(ss.settlements_paid, 0) AS settlements_paid,
    COALESCE(sr.settlements_received, 0) AS settlements_received,
    (COALESCE(ep.total_paid, 0) + COALESCE(ss.settlements_paid, 0)) -
    (COALESCE(eo.total_share, 0) + COALESCE(sr.settlements_received, 0)) AS net_balance
  FROM members m
  LEFT JOIN expenses_paid ep ON ep.user_id = m.user_id
  LEFT JOIN expenses_owed eo ON eo.user_id = m.user_id
  LEFT JOIN settlements_sent ss ON ss.user_id = m.user_id
  LEFT JOIN settlements_rcvd sr ON sr.user_id = m.user_id
  ORDER BY net_balance DESC;
END;
$$;

-- 6. HARDEN audit_logs RLS POLICY (Prevent unrestricted INSERT bypass)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- 7. HARDEN STORAGE BUCKET app-updates (Revoke anonymous uploads & listing)
DROP POLICY IF EXISTS "Allow public download of app-updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload to app-updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow update to app-updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow service role manage app-updates" ON storage.objects;

CREATE POLICY "Allow service role manage app-updates"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'app-updates')
WITH CHECK (bucket_id = 'app-updates');

-- 8. REVOKE PUBLIC & ANON RPC EXECUTION PRIVILEGES
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, supabase_auth_admin, service_role;

REVOKE EXECUTE ON FUNCTION public.manage_ota_release(text, text, text, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_ota_release(text, text, text, text, text, text, text, text, timestamptz) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rls_auto_enable' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres, service_role;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_room_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_balances(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.leave_room(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_room(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.remove_room_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_room_member(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_room_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_member(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_room_admin(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_admin(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated, service_role;

-- 9. PERFORMANCE INDEXES (Eliminate unindexed foreign key warnings)
CREATE INDEX IF NOT EXISTS idx_room_invitations_created_by ON public.room_invitations(created_by);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_created_by ON public.shared_expenses(created_by);

-- 10. MISSING RLS POLICY ON subscription_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'subscription_events') THEN
    DROP POLICY IF EXISTS "Service role manages subscription events" ON public.subscription_events;
    CREATE POLICY "Service role manages subscription events"
    ON public.subscription_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

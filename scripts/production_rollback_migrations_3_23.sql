-- ==============================================================================
-- ROOMMATE PRODUCTION OPERATIONAL ROLLBACK SCRIPT: MIGRATIONS 3 TO 23
-- Target: Full Reversion of Pending Deployment Chain back to Exact Production Baseline
-- Transaction Safety: Fully atomic within single BEGIN ... COMMIT block
-- Baseline Target: Exactly 18 tables, zero missing-table artifacts, zero orphaned triggers
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- STEP 1: ROLLBACK MIGRATION 23 (Phase 2C.4 Financial Ledger Integrity)
-- ------------------------------------------------------------------------------

-- Drop financial triggers & functions
DROP TRIGGER IF EXISTS trg_expense_splits_integrity ON public.expense_splits;
DROP FUNCTION IF EXISTS public.enforce_expense_splits_integrity();

DROP TRIGGER IF EXISTS trg_shared_expenses_integrity ON public.shared_expenses;
DROP FUNCTION IF EXISTS public.enforce_shared_expenses_integrity();

DROP TRIGGER IF EXISTS trg_settlement_payments_integrity ON public.settlement_payments;
DROP FUNCTION IF EXISTS public.enforce_settlement_payments_integrity();

-- Drop financial constraints
ALTER TABLE public.expense_splits 
  DROP CONSTRAINT IF EXISTS unique_expense_splits_expense_user;

ALTER TABLE public.settlement_payments 
  DROP CONSTRAINT IF EXISTS chk_settlement_payer_not_payee;

-- Drop atomic RPC
DROP FUNCTION IF EXISTS public.create_shared_expense_with_splits(JSONB, JSONB);

-- Grant back client modification permissions to authenticated and anon roles (matching baseline)
GRANT UPDATE, DELETE ON public.expense_splits TO authenticated, anon;
GRANT UPDATE, DELETE ON public.settlement_payments TO authenticated, anon;

-- Revert shared_expenses UPDATE policy to exact baseline
DROP POLICY IF EXISTS "Creators or room admins can update shared expenses" ON public.shared_expenses;
CREATE POLICY "Creators or room admins can update shared expenses"
ON public.shared_expenses FOR UPDATE
TO authenticated
USING (
  ((created_by = (SELECT auth.uid())) OR is_room_admin(room_id, (SELECT auth.uid())))
  AND is_room_member(room_id, (SELECT auth.uid()))
);

-- Revert get_room_balances to exact baseline (Security Invoker, not Security Definer)
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
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.room_members 
        WHERE room_id = p_room_id AND user_id = auth.uid() AND status = 'ACTIVE'
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

REVOKE EXECUTE ON FUNCTION public.get_room_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_balances(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- STEP 2: ROLLBACK MIGRATION 22 (Phase 2C Notification & Push Hardening)
-- ------------------------------------------------------------------------------

-- Drop triggers on user_devices & profiles
DROP TRIGGER IF EXISTS trg_user_device_token_collision ON public.user_devices;
DROP FUNCTION IF EXISTS public.handle_user_device_token_collision();

DROP TRIGGER IF EXISTS trg_sync_and_redact_profile_fcm_token ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_and_redact_profile_fcm_token();

-- Drop triggers on in_app_notifications
DROP TRIGGER IF EXISTS trg_enforce_notification_integrity ON public.in_app_notifications;
DROP FUNCTION IF EXISTS public.enforce_notification_integrity();

DROP TRIGGER IF EXISTS trg_prevent_notification_tampering ON public.in_app_notifications;
DROP FUNCTION IF EXISTS public.prevent_notification_tampering();

-- Drop dependent policies BEFORE dropping sender_id column
DROP POLICY IF EXISTS "Users can notify co-roommates or self" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;

-- Drop index and column
DROP INDEX IF EXISTS public.idx_notifications_sender;
ALTER TABLE public.in_app_notifications DROP COLUMN IF EXISTS sender_id;

-- ------------------------------------------------------------------------------
-- STEP 3: ROLLBACK MIGRATION 21 (Phase 2B Authorization Hardening)
-- ------------------------------------------------------------------------------

-- Revert room_members policies first (policies depend on helper functions)
DROP POLICY IF EXISTS "Admins or creators can insert room members" ON public.room_members;
DROP POLICY IF EXISTS "Admins or self can update member status" ON public.room_members;

-- Drop role escalation trigger on room_members
DROP TRIGGER IF EXISTS trg_prevent_member_role_escalation ON public.room_members;
DROP FUNCTION IF EXISTS public.prevent_member_role_escalation();

-- Drop join RPC
DROP FUNCTION IF EXISTS public.join_room_with_code(TEXT);

-- Drop helper functions
DROP FUNCTION IF EXISTS internal.is_room_creator(UUID, UUID);
DROP FUNCTION IF EXISTS internal.get_member_role(UUID);

-- Revert bug_reports policies to exact baseline
DROP POLICY IF EXISTS "Submitter or superadmin can read bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Only superadmins can update bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Residents can insert own bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Residents and admins can read bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Admins can update bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Residents can insert bug reports" ON public.bug_reports;

CREATE POLICY "Residents and admins can read bug reports"
ON public.bug_reports FOR SELECT
USING (true);

CREATE POLICY "Admins can update bug reports"
ON public.bug_reports FOR UPDATE
USING (true);

CREATE POLICY "Residents can insert bug reports"
ON public.bug_reports FOR INSERT
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- STEP 4: ROLLBACK MIGRATION 20 (user_devices Table)
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS public.user_devices CASCADE;

-- ------------------------------------------------------------------------------
-- STEP 5: ROLLBACK MIGRATIONS 18 & 19 (system_incidents Table & Hardening)
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS public.system_incidents CASCADE;

-- ------------------------------------------------------------------------------
-- STEP 6: ROLLBACK MIGRATION 13 (support_tickets, platform_announcements, platform_settings, RPCs)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.super_admin_get_platform_metrics();
DROP TABLE IF EXISTS public.support_tickets CASCADE;
DROP TABLE IF EXISTS public.platform_announcements CASCADE;
DROP TABLE IF EXISTS public.platform_settings CASCADE;

-- ------------------------------------------------------------------------------
-- STEP 7: ROLLBACK MIGRATION 8 (room_join_requests Table, Columns & Ownership RPCs)
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS public.room_join_requests CASCADE;

DROP FUNCTION IF EXISTS public.transfer_room_ownership(UUID, UUID);
DROP FUNCTION IF EXISTS public.regenerate_room_invite(UUID, INT);

-- Remove columns added to rooms and room_invitations in Migration 8
ALTER TABLE public.rooms 
  DROP COLUMN IF EXISTS admin_user_id,
  DROP COLUMN IF EXISTS join_policy,
  DROP COLUMN IF EXISTS invite_policy;

ALTER TABLE public.room_invitations 
  DROP COLUMN IF EXISTS token;

-- ------------------------------------------------------------------------------
-- STEP 8: ROLLBACK MIGRATION 3 (SuperAdmin Governance & Room Freeze)
-- ------------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_check_room_frozen ON public.shared_expenses;
DROP FUNCTION IF EXISTS public.check_room_not_frozen();

DROP POLICY IF EXISTS "SuperAdmin can update any room" ON public.rooms;
DROP POLICY IF EXISTS "SuperAdmin can view all rooms" ON public.rooms;
DROP POLICY IF EXISTS "SuperAdmin can update student suspension status" ON public.profiles;

DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;

ALTER TABLE public.rooms 
  DROP COLUMN IF EXISTS is_frozen;

-- ------------------------------------------------------------------------------
-- STEP 9: RESTORE PRE-MIGRATION BASELINE RLS POLICIES
-- ------------------------------------------------------------------------------

-- in_app_notifications
DROP POLICY IF EXISTS "Users can notify co-roommates or self" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.in_app_notifications;
CREATE POLICY "Authenticated users can insert notifications"
ON public.in_app_notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can view their own notifications"
ON public.in_app_notifications FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;
CREATE POLICY "Users can update their own notifications"
ON public.in_app_notifications FOR UPDATE
USING (auth.uid() = user_id);

-- room_members
DROP POLICY IF EXISTS "Users can join rooms via valid invitation or creator" ON public.room_members;
CREATE POLICY "Users can join rooms via valid invitation or creator"
ON public.room_members FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = (SELECT auth.uid()))
  OR is_room_admin(room_id, (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Admins or self can update member status" ON public.room_members;
CREATE POLICY "Admins or self can update member status"
ON public.room_members FOR UPDATE
TO authenticated
USING (
  (user_id = (SELECT auth.uid()))
  OR is_room_admin(room_id, (SELECT auth.uid()))
);

-- profiles
DROP POLICY IF EXISTS "Profiles readable by roommates, self, or superadmin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

COMMIT;

-- ==============================================================================
-- ROOMMATE PRODUCTION OPERATIONAL ROLLBACK SCRIPT: MIGRATIONS 21 TO 23
-- Target: Revert Phase 2B, 2C, and 2C.4 Hardening to Pre-Migration State
-- Transaction Safety: Fully atomic within single BEGIN ... COMMIT block
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. ROLLBACK MIGRATION 23 (Phase 2C.4 Financial Ledger Integrity)
-- ------------------------------------------------------------------------------

-- Drop triggers & functions
DROP TRIGGER IF EXISTS trg_expense_splits_integrity ON public.expense_splits;
DROP FUNCTION IF EXISTS public.enforce_expense_splits_integrity();

DROP TRIGGER IF EXISTS trg_shared_expenses_integrity ON public.shared_expenses;
DROP FUNCTION IF EXISTS public.enforce_shared_expenses_integrity();

DROP TRIGGER IF EXISTS trg_settlement_payments_integrity ON public.settlement_payments;
DROP FUNCTION IF EXISTS public.enforce_settlement_payments_integrity();

-- Drop constraints
ALTER TABLE public.expense_splits 
  DROP CONSTRAINT IF EXISTS unique_expense_splits_expense_user;

ALTER TABLE public.settlement_payments 
  DROP CONSTRAINT IF EXISTS chk_settlement_payer_not_payee;

-- Drop atomic RPC
DROP FUNCTION IF EXISTS public.create_shared_expense_with_splits(JSONB, JSONB);

-- Grant back client modification permissions (if needed by legacy clients)
GRANT UPDATE, DELETE ON public.expense_splits TO authenticated;
GRANT UPDATE, DELETE ON public.settlement_payments TO authenticated;

-- Revert shared_expenses UPDATE policy to pre-23 definition
DROP POLICY IF EXISTS "Creators or room admins can update shared expenses" ON public.shared_expenses;
CREATE POLICY "Creators or room admins can update shared expenses"
ON public.shared_expenses FOR UPDATE
TO authenticated
USING (
  created_by = (SELECT auth.uid()) OR 
  internal.is_room_admin(room_id, (SELECT auth.uid()))
);

-- ------------------------------------------------------------------------------
-- 2. ROLLBACK MIGRATION 22 (Phase 2C Notification & Push Hardening)
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

-- CRITICAL: Drop dependent policies BEFORE dropping sender_id column
DROP POLICY IF EXISTS "Users can notify co-roommates or self" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.in_app_notifications;

-- Drop index and column
DROP INDEX IF EXISTS public.idx_notifications_sender;
ALTER TABLE public.in_app_notifications DROP COLUMN IF EXISTS sender_id;

-- Restore pre-22 in_app_notifications policies
CREATE POLICY "Users can view their own notifications"
ON public.in_app_notifications FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can notify co-roommates or self"
ON public.in_app_notifications FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  OR (
    room_id IS NOT NULL 
    AND internal.is_room_member(room_id, (SELECT auth.uid()))
    AND internal.is_room_member(room_id, user_id)
  )
  OR internal.is_super_admin((SELECT auth.uid()))
);

CREATE POLICY "Users can update their own notifications"
ON public.in_app_notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. ROLLBACK MIGRATION 21 (Phase 2B Authorization Hardening)
-- ------------------------------------------------------------------------------

-- Revert room_members policies to baseline first (policies depend on functions!)
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

CREATE POLICY "Users can join rooms via valid invitation or creator"
ON public.room_members FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.id = room_members.room_id AND r.created_by = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.room_invitations inv 
    WHERE inv.room_id = room_members.room_id 
      AND inv.is_revoked = false 
      AND (inv.expires_at IS NULL OR inv.expires_at > now())
  )
  OR internal.is_room_admin(room_id, (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);

CREATE POLICY "Admins or self can update member status"
ON public.room_members FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid()) OR
  internal.is_room_admin(room_id, (SELECT auth.uid())) OR
  internal.is_super_admin((SELECT auth.uid()))
);

-- Revert bug_reports policies
DROP POLICY IF EXISTS "Submitter or superadmin can read bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Only superadmins can update bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Residents can insert own bug reports" ON public.bug_reports;

CREATE POLICY "Submitter or superadmin can read bug reports"
ON public.bug_reports FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  OR internal.is_super_admin((SELECT auth.uid()))
);

CREATE POLICY "Admins can update bug reports"
ON public.bug_reports FOR UPDATE
TO authenticated
USING (internal.is_super_admin((SELECT auth.uid())));

CREATE POLICY "Residents can insert bug reports"
ON public.bug_reports FOR INSERT
TO authenticated
WITH CHECK (true);

-- Revert profiles SELECT policy
DROP POLICY IF EXISTS "Profiles readable by roommates, self, or superadmin" ON public.profiles;
CREATE POLICY "Profiles readable by roommates, self, or superadmin"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = (SELECT auth.uid())
  OR internal.is_super_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.room_members rm1
    JOIN public.room_members rm2 ON rm1.room_id = rm2.room_id
    WHERE rm1.user_id = (SELECT auth.uid())
      AND rm2.user_id = profiles.id
      AND rm1.status = 'ACTIVE'
      AND rm2.status = 'ACTIVE'
  )
);

COMMIT;

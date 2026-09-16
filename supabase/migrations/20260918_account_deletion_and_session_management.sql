-- ==============================================================================
-- Migration: Account Deletion & Session Management RPCs
-- Target: Supabase Project pbzaaskftrmnvocczhat
-- Description:
--   1. Relaxes strict NOT NULL constraints on shared history (settlements, shared_expenses,
--      rooms, invitations) to allow ON DELETE SET NULL so remaining roommates never
--      suffer corrupted ledgers or foreign-key violations when an account is deleted.
--   2. Implements atomic `public.delete_user_account()` RPC with SECURITY DEFINER
--      to hard-delete the caller's auth record, profile, personal vault, and subscriptions
--      while safely transferring or cleaning up room ownership.
-- ==============================================================================

-- 1. Ensure foreign key flexibility on shared ledger history
DO $$
BEGIN
  -- shared_expenses: created_by and paid_by can become NULL on member deletion
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'shared_expenses' AND column_name = 'paid_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.shared_expenses ALTER COLUMN paid_by DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'shared_expenses' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.shared_expenses ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- settlement_payments: payer_id and payee_id can become NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'settlement_payments' AND column_name = 'payer_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.settlement_payments ALTER COLUMN payer_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'settlement_payments' AND column_name = 'payee_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.settlement_payments ALTER COLUMN payee_id DROP NOT NULL;
  END IF;

  -- rooms: created_by can become NULL or be reassigned
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.rooms ALTER COLUMN created_by DROP NOT NULL;
  END IF;

  -- room_invitations: created_by can become NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'room_invitations' AND column_name = 'created_by' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.room_invitations ALTER COLUMN created_by DROP NOT NULL;
  END IF;
END $$;

-- 2. Atomic RPC: Delete User Account
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_deleted_rooms INT := 0;
  v_reassigned_rooms INT := 0;
  v_next_admin UUID;
  v_has_admin_col BOOLEAN := FALSE;
  r RECORD;
BEGIN
  -- Authenticate caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to delete your account';
  END IF;

  -- Retrieve email for logging and bug report cleanup
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;
  END IF;

  -- 1. Clean up bug reports and support tickets
  IF to_regclass('public.bug_reports') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.bug_reports WHERE user_id = $1::text OR (user_email IS NOT NULL AND LOWER(user_email) = LOWER($2))'
    USING v_user_id, COALESCE(v_user_email, '');
  END IF;

  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.support_tickets WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 2. Notifications & Personal Expenses Vault (Private data - hard deleted)
  IF to_regclass('public.in_app_notifications') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.in_app_notifications WHERE user_id = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.personal_expenses') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.personal_expenses WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 3. Room Invitations & Join Requests created/submitted by user
  IF to_regclass('public.room_invitations') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.room_invitations WHERE created_by = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.room_join_requests') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.room_join_requests WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 4. Shared ledger cleanup:
  -- Nullify payer/payee references in settlements to keep financial totals consistent for remaining roommates
  IF to_regclass('public.settlement_payments') IS NOT NULL THEN
    EXECUTE 'UPDATE public.settlement_payments SET payer_id = NULL WHERE payer_id = $1' USING v_user_id;
    EXECUTE 'UPDATE public.settlement_payments SET payee_id = NULL WHERE payee_id = $1' USING v_user_id;
  END IF;

  -- Nullify created_by and paid_by on shared expenses
  IF to_regclass('public.shared_expenses') IS NOT NULL THEN
    EXECUTE 'UPDATE public.shared_expenses SET created_by = NULL WHERE created_by = $1' USING v_user_id;
    EXECUTE 'UPDATE public.shared_expenses SET paid_by = NULL WHERE paid_by = $1' USING v_user_id;
  END IF;

  -- Delete user shares from expense_splits
  IF to_regclass('public.expense_splits') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.expense_splits WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 5. Rooms ownership & membership lifecycle
  IF to_regclass('public.rooms') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'admin_user_id'
    ) INTO v_has_admin_col;

    FOR r IN (
      SELECT DISTINCT r.id 
      FROM public.rooms r
      LEFT JOIN public.room_members rm ON rm.room_id = r.id
      WHERE r.created_by = v_user_id 
         OR (v_has_admin_col AND r.admin_user_id = v_user_id)
         OR (rm.user_id = v_user_id AND rm.role = 'ROOM_ADMIN')
    ) LOOP
      -- Check if room has another active member to promote
      IF to_regclass('public.room_members') IS NOT NULL THEN
        SELECT user_id INTO v_next_admin
        FROM public.room_members
        WHERE room_id = r.id AND user_id <> v_user_id AND status = 'ACTIVE'
        ORDER BY joined_at ASC
        LIMIT 1;
      ELSE
        v_next_admin := NULL;
      END IF;

      IF v_next_admin IS NOT NULL THEN
        -- Reassign room ownership to oldest remaining member
        IF v_has_admin_col THEN
          EXECUTE 'UPDATE public.rooms SET created_by = $1, admin_user_id = $1 WHERE id = $2' 
          USING v_next_admin, r.id;
        ELSE
          EXECUTE 'UPDATE public.rooms SET created_by = $1 WHERE id = $2' 
          USING v_next_admin, r.id;
        END IF;

        UPDATE public.room_members 
        SET role = 'ROOM_ADMIN' 
        WHERE room_id = r.id AND user_id = v_next_admin;

        v_reassigned_rooms := v_reassigned_rooms + 1;
      ELSE
        -- Sole resident in room: safely delete orphaned room
        DELETE FROM public.rooms WHERE id = r.id;
        v_deleted_rooms := v_deleted_rooms + 1;
      END IF;
    END LOOP;

    IF v_has_admin_col THEN
      EXECUTE 'UPDATE public.rooms SET admin_user_id = created_by WHERE admin_user_id = $1' USING v_user_id;
    END IF;
  END IF;

  -- 6. Remove user from room memberships
  IF to_regclass('public.room_members') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.room_members WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 7. Subscriptions & Billing Events
  IF to_regclass('public.subscription_events') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.subscription_events WHERE user_id = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.user_subscriptions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_subscriptions WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 8. Superadmin security settings & trusted devices
  IF to_regclass('public.superadmin_recovery_codes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.superadmin_recovery_codes WHERE user_id = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.superadmin_trusted_devices') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.superadmin_trusted_devices WHERE user_id = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.superadmin_security_settings') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.superadmin_security_settings WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 9. Anonymize audit logs
  IF to_regclass('public.security_audit_logs') IS NOT NULL THEN
    EXECUTE 'UPDATE public.security_audit_logs SET actor_id = NULL WHERE actor_id = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'UPDATE public.audit_logs SET user_id = NULL WHERE user_id = $1' USING v_user_id;
  END IF;

  IF to_regclass('public.platform_announcements') IS NOT NULL THEN
    EXECUTE 'UPDATE public.platform_announcements SET updated_by = NULL WHERE updated_by = $1' USING v_user_id;
    EXECUTE 'DELETE FROM public.platform_announcements WHERE created_by = $1' USING v_user_id;
  END IF;

  -- 10. Delete public profile record
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.profiles WHERE id = $1' USING v_user_id;
  END IF;

  -- 11. Delete from auth.users (Permanent hard delete)
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_user_id', v_user_id,
    'deleted_rooms', v_deleted_rooms,
    'reassigned_rooms', v_reassigned_rooms
  );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

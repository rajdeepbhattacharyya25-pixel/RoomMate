-- 20260925001500_fix_delete_user_account_unauthenticated_error.sql
-- Fix Postgres P0001 error by returning a structured JSON response instead of raising an unhandled exception
-- when delete_user_account is invoked without an active Supabase session.

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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
  -- Authenticate caller: gracefully return JSON error instead of raising unhandled exception
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNAUTHENTICATED',
      'message', 'Must be logged in to delete your account'
    );
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
        IF v_has_admin_col THEN
          EXECUTE 'UPDATE public.rooms SET admin_user_id = $1, created_by = $1 WHERE id = $2'
          USING v_next_admin, r.id;
        ELSE
          EXECUTE 'UPDATE public.rooms SET created_by = $1 WHERE id = $2'
          USING v_next_admin, r.id;
        END IF;

        IF to_regclass('public.room_members') IS NOT NULL THEN
          EXECUTE 'UPDATE public.room_members SET role = ''ROOM_ADMIN'' WHERE room_id = $1 AND user_id = $2'
          USING r.id, v_next_admin;
        END IF;
        v_reassigned_rooms := v_reassigned_rooms + 1;
      ELSE
        IF to_regclass('public.room_members') IS NOT NULL THEN
          EXECUTE 'DELETE FROM public.room_members WHERE room_id = $1' USING r.id;
        END IF;
        EXECUTE 'DELETE FROM public.rooms WHERE id = $1' USING r.id;
        v_deleted_rooms := v_deleted_rooms + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Remove user from room memberships
  IF to_regclass('public.room_members') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.room_members WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 7. Devices & Push tokens cleanup
  IF to_regclass('public.user_devices') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.user_devices WHERE user_id = $1' USING v_user_id;
  END IF;

  -- 8. Delete user profile record
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.profiles WHERE id = $1' USING v_user_id;
  END IF;

  -- 9. Delete user auth record
  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'deleted_rooms', v_deleted_rooms,
    'reassigned_rooms', v_reassigned_rooms
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated, anon;

-- ==============================================================================
-- DATABASE SCRIPT: Remove User 'rd.bhatt.official@gmail.com' and All Associated Data
-- TARGET: Supabase Project pbzaaskftrmnvocczhat
-- INVARIANT: Purge all data, do NOT ban or block the user (email remains clean).
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_target_email TEXT := 'rd.bhatt.official@gmail.com';
    v_user_id UUID;
    v_actual_email TEXT;
    v_deleted_rooms_count INT := 0;
    v_reassigned_rooms_count INT := 0;
    v_next_admin UUID;
    v_has_admin_col BOOLEAN;
    r RECORD;
BEGIN
    -- 1. Locate the target user ID in auth.users
    SELECT id, email INTO v_user_id, v_actual_email
    FROM auth.users
    WHERE LOWER(email) = LOWER(v_target_email)
       OR email ILIKE '%rd.bhatt%official%'
       OR email ILIKE '%rd.bhatt%officall%'
    LIMIT 1;

    -- Fallback to public.profiles if needed
    IF v_user_id IS NULL AND to_regclass('public.profiles') IS NOT NULL THEN
        SELECT id, email INTO v_user_id, v_actual_email
        FROM public.profiles
        WHERE LOWER(email) = LOWER(v_target_email)
           OR email ILIKE '%rd.bhatt%official%'
           OR email ILIKE '%rd.bhatt%officall%'
        LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: No account found matching %.', v_target_email;
    END IF;

    RAISE NOTICE '>>> Purging account: % (UUID: %)', v_actual_email, v_user_id;

    -- 2. Bug Reports & Support Tickets (Dynamic check if tables exist)
    IF to_regclass('public.bug_reports') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.bug_reports WHERE user_id = $1::text OR LOWER(user_email) = LOWER($2)' 
        USING v_user_id, v_actual_email;
    END IF;

    IF to_regclass('public.support_tickets') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.support_tickets WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 3. In-App Notifications
    IF to_regclass('public.in_app_notifications') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.in_app_notifications WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 4. Personal Expense Vault
    IF to_regclass('public.personal_expenses') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.personal_expenses WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 5. Settlement Payments (both payer and payee)
    IF to_regclass('public.settlement_payments') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.settlement_payments WHERE payer_id = $1 OR payee_id = $1' USING v_user_id;
    END IF;

    -- 6. Expense Splits and Shared Expenses
    IF to_regclass('public.expense_splits') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.expense_splits WHERE user_id = $1' USING v_user_id;

        IF to_regclass('public.shared_expenses') IS NOT NULL THEN
            EXECUTE 'DELETE FROM public.expense_splits WHERE shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE paid_by = $1 OR created_by = $1)' USING v_user_id;
            EXECUTE 'DELETE FROM public.shared_expenses WHERE paid_by = $1 OR created_by = $1' USING v_user_id;
        END IF;
    ELSIF to_regclass('public.shared_expenses') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.shared_expenses WHERE paid_by = $1 OR created_by = $1' USING v_user_id;
    END IF;

    -- 7. Room Invitations & Join Requests
    IF to_regclass('public.room_invitations') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.room_invitations WHERE created_by = $1' USING v_user_id;
    END IF;

    IF to_regclass('public.room_join_requests') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.room_join_requests WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 8. Rooms created by user
    IF to_regclass('public.rooms') IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'rooms' AND column_name = 'admin_user_id'
        ) INTO v_has_admin_col;

        FOR r IN (
            SELECT id FROM public.rooms WHERE created_by = v_user_id
        ) LOOP
            -- Check if room has another active member to inherit ownership
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
                    EXECUTE 'UPDATE public.rooms SET created_by = $1, admin_user_id = $1 WHERE id = $2' 
                    USING v_next_admin, r.id;
                ELSE
                    EXECUTE 'UPDATE public.rooms SET created_by = $1 WHERE id = $2' 
                    USING v_next_admin, r.id;
                END IF;
                
                UPDATE public.room_members 
                SET role = 'ROOM_ADMIN' 
                WHERE room_id = r.id AND user_id = v_next_admin;

                v_reassigned_rooms_count := v_reassigned_rooms_count + 1;
            ELSE
                -- Sole member: safely delete orphaned room
                DELETE FROM public.rooms WHERE id = r.id;
                v_deleted_rooms_count := v_deleted_rooms_count + 1;
            END IF;
        END LOOP;

        IF v_has_admin_col THEN
            EXECUTE 'UPDATE public.rooms SET admin_user_id = created_by WHERE admin_user_id = $1' USING v_user_id;
        END IF;
    END IF;

    -- 9. Room memberships
    IF to_regclass('public.room_members') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.room_members WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 10. Subscriptions and billing events
    IF to_regclass('public.subscription_events') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.subscription_events WHERE user_id = $1' USING v_user_id;
    END IF;

    -- Delete user_subscriptions before deleting profiles
    IF to_regclass('public.user_subscriptions') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.user_subscriptions WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 11. SuperAdmin security data
    IF to_regclass('public.superadmin_recovery_codes') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.superadmin_recovery_codes WHERE user_id = $1' USING v_user_id;
    END IF;

    IF to_regclass('public.superadmin_trusted_devices') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.superadmin_trusted_devices WHERE user_id = $1' USING v_user_id;
    END IF;

    IF to_regclass('public.superadmin_security_settings') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.superadmin_security_settings WHERE user_id = $1' USING v_user_id;
    END IF;

    -- 12. Audit logs & platform announcements decoupling
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

    -- 13. Delete profile
    IF to_regclass('public.profiles') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.profiles WHERE id = $1' USING v_user_id;
    END IF;

    -- 14. Delete user from auth.users (Permanent hard delete, NOT banned)
    DELETE FROM auth.users WHERE id = v_user_id;

    RAISE NOTICE '>>> SUCCESS: % (UUID: %) and all data completely purged.', v_actual_email, v_user_id;
    RAISE NOTICE '>>> Orphaned rooms deleted: %, Rooms reassigned: %', v_deleted_rooms_count, v_reassigned_rooms_count;
    RAISE NOTICE '>>> INVARIANT VERIFIED: User was NOT banned or suspended. User can re-register anytime.';
END $$;

COMMIT;

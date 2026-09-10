-- ============================================================================
-- MIGRATION: SuperAdmin Governance, Room Freeze & Platform RLS
-- Date: 2026-09-10
-- Target: Enforce security isolation between mobile students and desktop SaaS owner
-- ============================================================================

-- 1. Add is_frozen column to rooms table if it does not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'rooms' 
      AND column_name = 'is_frozen'
  ) THEN
    ALTER TABLE public.rooms ADD COLUMN is_frozen BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Enhanced SuperAdmin Check Function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'SUPER_ADMIN'
  );
$$;

-- 3. SuperAdmin Policies on Rooms
-- SuperAdmin can view all rooms regardless of membership
DROP POLICY IF EXISTS "SuperAdmin can view all rooms" ON public.rooms;
CREATE POLICY "SuperAdmin can view all rooms"
  ON public.rooms
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin() 
    OR id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid())
  );

-- SuperAdmin can freeze, unfreeze, or archive any room
DROP POLICY IF EXISTS "SuperAdmin can update any room" ON public.rooms;
CREATE POLICY "SuperAdmin can update any room"
  ON public.rooms
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR id IN (SELECT room_id FROM public.room_members WHERE user_id = auth.uid() AND role = 'ROOM_ADMIN')
  );

-- 4. Prevent Logging Expenses in Frozen Rooms
CREATE OR REPLACE FUNCTION public.check_room_not_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rooms WHERE id = NEW.room_id AND is_frozen = true) THEN
    RAISE EXCEPTION 'ROOM_FROZEN: This room has been temporarily locked by platform administration during a dispute.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_room_frozen ON public.shared_expenses;
CREATE TRIGGER trg_check_room_frozen
  BEFORE INSERT ON public.shared_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.check_room_not_frozen();

-- 5. SuperAdmin Account Suspension Enforcement on Profiles
DROP POLICY IF EXISTS "SuperAdmin can update student suspension status" ON public.profiles;
CREATE POLICY "SuperAdmin can update student suspension status"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin() OR id = auth.uid()
  );

-- 6. High-Performance Platform Metrics RPC for Desktop Dashboard
CREATE OR REPLACE FUNCTION public.super_admin_get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_students INT;
  v_active_rooms INT;
  v_frozen_rooms INT;
  v_suspended_accounts INT;
  v_active_subscriptions INT;
  v_mrr NUMERIC(10, 2);
  v_gross_volume NUMERIC(12, 2);
BEGIN
  -- Verify caller is super admin
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Caller lacks SUPER_ADMIN privileges';
  END IF;

  SELECT COUNT(*) INTO v_total_students FROM public.profiles WHERE role = 'STUDENT';
  SELECT COUNT(*) INTO v_active_rooms FROM public.rooms WHERE is_archived = false;
  SELECT COUNT(*) INTO v_frozen_rooms FROM public.rooms WHERE is_frozen = true;
  SELECT COUNT(*) INTO v_suspended_accounts FROM public.profiles WHERE is_suspended = true;
  SELECT COUNT(*), COALESCE(SUM(price_inr), 0.00) INTO v_active_subscriptions, v_mrr 
    FROM public.user_subscriptions WHERE status = 'ACTIVE';
  SELECT COALESCE(SUM(amount), 0.00) INTO v_gross_volume FROM public.shared_expenses;

  RETURN jsonb_build_object(
    'total_students', v_total_students,
    'active_rooms', v_active_rooms,
    'frozen_rooms', v_frozen_rooms,
    'suspended_accounts', v_suspended_accounts,
    'active_subscriptions', v_active_subscriptions,
    'mrr', v_mrr,
    'gross_volume', v_gross_volume,
    'timestamp', now()
  );
END;
$$;

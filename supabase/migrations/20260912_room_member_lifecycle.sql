-- ============================================================================
-- Student Expense App - Room Member Lifecycle & Atomic Exit/Removal RPCs
-- ============================================================================

-- 1. Atomic RPC to Leave Room
-- Handles caller authentication, role succession, and room archival if last member
CREATE OR REPLACE FUNCTION public.leave_room(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_my_role TEXT;
  v_successor_id UUID := NULL;
  v_is_archived BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to leave a room';
  END IF;

  -- 1. Check if caller is an active member
  SELECT role INTO v_my_role
  FROM public.room_members
  WHERE room_id = p_room_id AND user_id = v_user_id AND status = 'ACTIVE';

  IF v_my_role IS NULL THEN
    RAISE EXCEPTION 'NOT_AN_ACTIVE_MEMBER: User is not an active member of room %', p_room_id;
  END IF;

  -- 2. If caller is ROOM_ADMIN, handle role succession or archival
  IF v_my_role = 'ROOM_ADMIN' THEN
    -- Look for oldest active roommate (by joined_at)
    SELECT user_id INTO v_successor_id
    FROM public.room_members
    WHERE room_id = p_room_id AND status = 'ACTIVE' AND user_id != v_user_id
    ORDER BY joined_at ASC
    LIMIT 1;

    IF v_successor_id IS NOT NULL THEN
      -- Promote successor
      UPDATE public.room_members
      SET role = 'ROOM_ADMIN'
      WHERE room_id = p_room_id AND user_id = v_successor_id;
    ELSE
      -- Last remaining member leaving -> archive room (ledger remains intact)
      UPDATE public.rooms
      SET is_archived = TRUE, updated_at = now()
      WHERE id = p_room_id;
      v_is_archived := TRUE;
    END IF;
  END IF;

  -- 3. Mark departing member as LEFT (and relinquish admin role if previously admin)
  UPDATE public.room_members
  SET status = 'LEFT', role = 'MEMBER', left_at = now()
  WHERE room_id = p_room_id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_admin_id', v_successor_id,
    'is_archived', v_is_archived
  );
END;
$$;

-- 2. Atomic RPC to Remove Member
-- Requires caller to be active ROOM_ADMIN. Rejects removing self or other admins.
CREATE OR REPLACE FUNCTION public.remove_room_member(p_room_id UUID, p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_target_role TEXT;
  v_target_status TEXT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to remove a member';
  END IF;

  -- 1. Verify caller is active ROOM_ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_admin_id AND role = 'ROOM_ADMIN' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only an active room admin can remove members';
  END IF;

  -- 2. Prevent removing self (must use leave_room flow)
  IF v_admin_id = p_target_user_id THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_SELF: Room admin cannot remove themselves, use leave flow instead';
  END IF;

  -- 3. Verify target member exists in this room
  SELECT role, status INTO v_target_role, v_target_status
  FROM public.room_members
  WHERE room_id = p_room_id AND user_id = p_target_user_id;

  IF v_target_role IS NULL OR v_target_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'TARGET_NOT_ACTIVE: Target member is not an active member of this room';
  END IF;

  -- 4. Prevent removing another ROOM_ADMIN
  IF v_target_role = 'ROOM_ADMIN' THEN
    RAISE EXCEPTION 'ADMIN_CANNOT_BE_REMOVED: Room admins cannot be removed';
  END IF;

  -- 5. Mark member as REMOVED (financial obligations remain frozen)
  UPDATE public.room_members
  SET status = 'REMOVED', left_at = now()
  WHERE room_id = p_room_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Update Settlement Payments RLS Policies to allow post-departure settlements
DROP POLICY IF EXISTS "Room members can view settlements" ON public.settlement_payments;
CREATE POLICY "Room members can view settlements"
ON public.settlement_payments FOR SELECT
TO authenticated
USING (
  public.is_room_member(room_id, (SELECT auth.uid()))
  OR payer_id = (SELECT auth.uid())
  OR payee_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Payers can record settlements" ON public.settlement_payments;
CREATE POLICY "Payers can record settlements"
ON public.settlement_payments FOR INSERT
TO authenticated
WITH CHECK (
  payer_id = (SELECT auth.uid()) AND (
    public.is_room_member(room_id, (SELECT auth.uid())) OR
    EXISTS (
      SELECT 1 FROM public.room_members
      WHERE room_id = settlement_payments.room_id
        AND user_id = (SELECT auth.uid())
    )
  )
);

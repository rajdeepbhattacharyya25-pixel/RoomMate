-- ============================================================================
-- Student Expense App - Room Invitations, Join Policies & Ownership RPCs
-- ============================================================================

-- 1. Extend rooms table with join_policy and invite_policy
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS admin_user_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED' CHECK (join_policy IN ('APPROVAL_REQUIRED', 'INSTANT')),
ADD COLUMN IF NOT EXISTS invite_policy TEXT NOT NULL DEFAULT 'ALL_MEMBERS' CHECK (invite_policy IN ('ALL_MEMBERS', 'ADMIN_ONLY'));

-- 2. Extend room_invitations table with secure token
ALTER TABLE public.room_invitations
ADD COLUMN IF NOT EXISTS token VARCHAR(64) UNIQUE;

-- Populate token for existing invitations if null
UPDATE public.room_invitations
SET token = 'rm_inv_' || substring(md5(random()::text) from 1 for 24)
WHERE token IS NULL;

-- 3. Room Join Requests Table
CREATE TABLE IF NOT EXISTS public.room_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_room_join_request UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_join_requests_room ON public.room_join_requests(room_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_user ON public.room_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_status ON public.room_join_requests(status);

ALTER TABLE public.room_join_requests ENABLE ROW LEVEL SECURITY;

-- Join requests RLS:
-- Users can view their own requests, and room admins can view requests for their rooms
DROP POLICY IF EXISTS "Users and room admins can view join requests" ON public.room_join_requests;
CREATE POLICY "Users and room admins can view join requests"
ON public.room_join_requests FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid()) OR
  public.is_room_admin(room_id, (SELECT auth.uid()))
);

-- Users can submit join requests
DROP POLICY IF EXISTS "Users can insert join requests" ON public.room_join_requests;
CREATE POLICY "Users can insert join requests"
ON public.room_join_requests FOR INSERT
TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- Only room admins can update join requests (approve / decline)
DROP POLICY IF EXISTS "Admins can update join requests" ON public.room_join_requests;
CREATE POLICY "Admins can update join requests"
ON public.room_join_requests FOR UPDATE
TO authenticated
USING (public.is_room_admin(room_id, (SELECT auth.uid())));

-- 4. Atomic RPC: Transfer Room Ownership
CREATE OR REPLACE FUNCTION public.transfer_room_ownership(p_room_id UUID, p_new_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_target_status TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to transfer room ownership';
  END IF;

  -- 1. Check if caller is active ROOM_ADMIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id AND user_id = v_caller_id AND role = 'ROOM_ADMIN' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only the active room admin can transfer ownership';
  END IF;

  -- 2. Prevent self-transfer
  IF v_caller_id = p_new_admin_id THEN
    RAISE EXCEPTION 'CANNOT_TRANSFER_TO_SELF: Target member is already room admin';
  END IF;

  -- 3. Check if target is an active member of this room
  SELECT status INTO v_target_status
  FROM public.room_members
  WHERE room_id = p_room_id AND user_id = p_new_admin_id;

  IF v_target_status IS NULL OR v_target_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'TARGET_NOT_ACTIVE: Target member must be an active room member';
  END IF;

  -- 4. Demote previous admin to MEMBER
  UPDATE public.room_members
  SET role = 'MEMBER'
  WHERE room_id = p_room_id AND user_id = v_caller_id;

  -- 5. Promote target to ROOM_ADMIN
  UPDATE public.room_members
  SET role = 'ROOM_ADMIN'
  WHERE room_id = p_room_id AND user_id = p_new_admin_id;

  -- 6. Update room metadata
  UPDATE public.rooms
  SET admin_user_id = p_new_admin_id, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'new_admin_id', p_new_admin_id);
END;
$$;

-- 5. Atomic RPC: Regenerate Room Invite
CREATE OR REPLACE FUNCTION public.regenerate_room_invite(p_room_id UUID, p_expires_in_hours INT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_room_invite_policy TEXT;
  v_is_admin BOOLEAN;
  v_is_member BOOLEAN;
  v_new_code TEXT;
  v_new_token TEXT;
  v_expires_at TIMESTAMPTZ := NULL;
  v_inv_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to regenerate invite';
  END IF;

  -- Check membership and role
  SELECT (role = 'ROOM_ADMIN'), (status = 'ACTIVE')
  INTO v_is_admin, v_is_member
  FROM public.room_members
  WHERE room_id = p_room_id AND user_id = v_caller_id;

  IF NOT COALESCE(v_is_member, false) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER: User is not an active member of this room';
  END IF;

  SELECT invite_policy INTO v_room_invite_policy FROM public.rooms WHERE id = p_room_id;

  IF v_room_invite_policy = 'ADMIN_ONLY' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only room admins can regenerate invites';
  END IF;

  -- Revoke existing invites
  UPDATE public.room_invitations
  SET is_revoked = TRUE
  WHERE room_id = p_room_id AND is_revoked = FALSE;

  -- Generate code & token
  v_new_code := upper(substring(md5(random()::text) from 1 for 6));
  v_new_token := 'rm_inv_' || substring(md5(random()::text) from 1 for 24);

  IF p_expires_in_hours IS NOT NULL AND p_expires_in_hours > 0 THEN
    v_expires_at := now() + (p_expires_in_hours || ' hours')::INTERVAL;
  ELSE
    v_expires_at := now() + INTERVAL '365 days';
  END IF;

  INSERT INTO public.room_invitations (room_id, invite_code, token, created_by, expires_at, is_revoked)
  VALUES (p_room_id, v_new_code, v_new_token, v_caller_id, v_expires_at, FALSE)
  RETURNING id INTO v_inv_id;

  RETURN jsonb_build_object(
    'id', v_inv_id,
    'room_id', p_room_id,
    'invite_code', v_new_code,
    'token', v_new_token,
    'expires_at', v_expires_at
  );
END;
$$;

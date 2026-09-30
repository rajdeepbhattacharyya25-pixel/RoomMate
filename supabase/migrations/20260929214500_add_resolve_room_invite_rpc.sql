-- ============================================================================
-- Migration: Add resolve_room_invite RPC & Permit Non-Member Invite Verification
-- Target: public.room_invitations, public.rooms
-- Context: Allows newly registered or non-member users on mobile devices to resolve
--          and preview room invitations (name, admin, member count) before joining,
--          bypassing RLS deadlock where non-members were blocked from reading
--          invitation details of rooms they haven't joined yet.
-- ============================================================================

-- 1. Create SECURITY DEFINER RPC to safely resolve room invitations
CREATE OR REPLACE FUNCTION public.resolve_room_invite(p_token_or_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean TEXT;
  v_clean_upper TEXT;
  v_invitation RECORD;
  v_room RECORD;
  v_member_count INT;
  v_admin_name TEXT := 'Room Admin';
BEGIN
  -- Require authenticated user
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to resolve a room invitation' USING ERRCODE = '42501';
  END IF;

  v_clean := TRIM(p_token_or_code);
  v_clean_upper := UPPER(v_clean);

  IF v_clean IS NULL OR LENGTH(v_clean) < 3 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: A valid room invite code or token is required' USING ERRCODE = '22023';
  END IF;

  -- 2. Resolve invitation record
  SELECT id, room_id, invite_code, token, created_by, expires_at, is_revoked, created_at
  INTO v_invitation
  FROM public.room_invitations
  WHERE (UPPER(invite_code) = v_clean_upper OR token = v_clean)
    AND is_revoked = FALSE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'INVITE_UNAVAILABLE: This room invitation is no longer valid or does not exist.' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Check expiration
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED: This room invitation has expired.' USING ERRCODE = '22007';
  END IF;

  -- 4. Fetch room metadata
  SELECT id, name, description, join_policy, invite_policy, is_archived, is_frozen
  INTO v_room
  FROM public.rooms
  WHERE id = v_invitation.room_id;

  IF v_room.id IS NULL OR v_room.is_archived = TRUE THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND: The room associated with this invitation is no longer active.' USING ERRCODE = 'P0002';
  END IF;

  IF v_room.is_frozen = TRUE THEN
    RAISE EXCEPTION 'ROOM_FROZEN: This room is currently frozen by administration.' USING ERRCODE = '42501';
  END IF;

  -- 5. Count active members
  SELECT COUNT(*) INTO v_member_count
  FROM public.room_members
  WHERE room_id = v_room.id AND status = 'ACTIVE';

  -- 6. Fetch room admin display name
  SELECT p.name INTO v_admin_name
  FROM public.room_members rm
  JOIN public.profiles p ON p.id = rm.user_id
  WHERE rm.room_id = v_room.id AND rm.role = 'ROOM_ADMIN' AND rm.status = 'ACTIVE'
  LIMIT 1;

  IF v_admin_name IS NULL OR TRIM(v_admin_name) = '' THEN
    v_admin_name := 'Room Admin';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'room', jsonb_build_object(
      'id', v_room.id,
      'name', v_room.name,
      'description', v_room.description,
      'joinPolicy', COALESCE(v_room.join_policy, 'APPROVAL_REQUIRED'),
      'invitePolicy', COALESCE(v_room.invite_policy, 'ALL_MEMBERS')
    ),
    'memberCount', COALESCE(v_member_count, 1),
    'adminName', v_admin_name,
    'invite', jsonb_build_object(
      'id', v_invitation.id,
      'roomId', v_invitation.room_id,
      'inviteCode', v_invitation.invite_code,
      'token', COALESCE(v_invitation.token, 'tok_' || v_invitation.id::text),
      'createdBy', v_invitation.created_by,
      'expiresAt', v_invitation.expires_at,
      'isRevoked', v_invitation.is_revoked,
      'createdAt', v_invitation.created_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_room_invite(text) TO authenticated;

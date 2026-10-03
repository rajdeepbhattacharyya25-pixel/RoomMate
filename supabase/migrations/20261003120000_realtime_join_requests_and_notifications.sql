-- Migration: 20261003120000_realtime_join_requests_and_notifications.sql
-- Description: Enables real-time publication for room_join_requests and room_members,
--              hardens join_room_with_code RPC to return request_id and dispatch admin notifications,
--              and configures REPLICA IDENTITY FULL for instant live sync.

-- 1. Configure REPLICA IDENTITY FULL for realtime change payloads
ALTER TABLE IF EXISTS public.room_join_requests REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.room_members REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.rooms REPLICA IDENTITY FULL;

-- 2. Add tables to supabase_realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'room_join_requests'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.room_join_requests;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'room_members'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    END IF;
  END IF;
END $$;

-- 3. Enhance join_room_with_code RPC to return request_id and dispatch admin notification
CREATE OR REPLACE FUNCTION public.join_room_with_code(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_clean_code TEXT;
  v_invitation RECORD;
  v_room RECORD;
  v_existing_member RECORD;
  v_request_id UUID;
  v_requester_name TEXT;
BEGIN
  -- 1. Require authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Must be logged in to join a room' USING ERRCODE = '42501';
  END IF;

  -- 2. Normalize input
  v_clean_code := UPPER(TRIM(p_invite_code));
  IF v_clean_code IS NULL OR LENGTH(v_clean_code) < 3 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: A valid room invite code is required' USING ERRCODE = '22023';
  END IF;

  -- 3. Resolve invitation token/code
  SELECT id, room_id, expires_at, is_revoked INTO v_invitation
  FROM public.room_invitations
  WHERE (UPPER(invite_code) = v_clean_code OR token = p_invite_code)
    AND is_revoked = FALSE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVITE_CODE: Invitation code is invalid or does not exist' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Check expiration
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < now() THEN
    RAISE EXCEPTION 'INVITATION_EXPIRED: This room invite code has expired' USING ERRCODE = '22007';
  END IF;

  -- 5. Fetch room and join policy
  SELECT id, name, join_policy, is_archived, is_frozen, created_by INTO v_room
  FROM public.rooms
  WHERE id = v_invitation.room_id;

  IF v_room.id IS NULL OR v_room.is_archived = TRUE THEN
    RAISE EXCEPTION 'ROOM_UNAVAILABLE: This room has been archived or deleted' USING ERRCODE = 'P0002';
  END IF;

  IF v_room.is_frozen = TRUE THEN
    RAISE EXCEPTION 'ROOM_FROZEN: This room is currently frozen by administration' USING ERRCODE = '42501';
  END IF;

  -- 6. Check existing membership
  SELECT id, role, status INTO v_existing_member
  FROM public.room_members
  WHERE room_id = v_room.id AND user_id = v_caller_id;

  IF v_existing_member.id IS NOT NULL AND v_existing_member.status = 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'status', 'ALREADY_MEMBER',
      'room_id', v_room.id,
      'room_name', v_room.name,
      'message', 'You are already an active member of this room'
    );
  END IF;

  -- 7. Handle join policies: INSTANT vs APPROVAL_REQUIRED
  IF v_room.join_policy = 'INSTANT' THEN
    INSERT INTO public.room_members (room_id, user_id, role, status, joined_at, left_at)
    VALUES (v_room.id, v_caller_id, 'MEMBER', 'ACTIVE', now(), NULL)
    ON CONFLICT (room_id, user_id)
    DO UPDATE SET status = 'ACTIVE', role = 'MEMBER', left_at = NULL, joined_at = now();

    RETURN jsonb_build_object(
      'status', 'JOINED',
      'room_id', v_room.id,
      'room_name', v_room.name,
      'message', 'Successfully joined ' || v_room.name
    );
  ELSE
    -- APPROVAL_REQUIRED: Check or create join request and capture UUID
    INSERT INTO public.room_join_requests (room_id, user_id, status)
    VALUES (v_room.id, v_caller_id, 'PENDING')
    ON CONFLICT (room_id, user_id)
    DO UPDATE SET status = 'PENDING', updated_at = now()
    RETURNING id INTO v_request_id;

    -- Fetch requester name for notification context
    SELECT COALESCE(full_name, name, 'A roommate') INTO v_requester_name
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_requester_name IS NULL THEN
      v_requester_name := 'A roommate';
    END IF;

    -- Create In-App Notification for room creator / active admin(s)
    IF v_room.created_by IS NOT NULL THEN
      INSERT INTO public.in_app_notifications (
        user_id,
        room_id,
        type,
        title,
        message,
        priority,
        is_read,
        action_type,
        action_target,
        metadata,
        event_id
      )
      VALUES (
        v_room.created_by,
        v_room.id,
        'ROOM_JOIN_REQUEST',
        '🔔 New Join Request',
        v_requester_name || ' wants to join ' || v_room.name || '. Tap to review.',
        'HIGH',
        FALSE,
        'REVIEW_JOIN_REQUEST',
        v_request_id::TEXT,
        jsonb_build_object(
          'requestId', v_request_id,
          'requesterId', v_caller_id,
          'requesterName', v_requester_name,
          'roomId', v_room.id,
          'roomName', v_room.name
        ),
        'joinreq_' || v_request_id::TEXT || '_' || v_room.created_by::TEXT
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Also notify any additional designated admins in room_members
    INSERT INTO public.in_app_notifications (
      user_id,
      room_id,
      type,
      title,
      message,
      priority,
      is_read,
      action_type,
      action_target,
      metadata,
      event_id
    )
    SELECT 
      rm.user_id,
      v_room.id,
      'ROOM_JOIN_REQUEST',
      '🔔 New Join Request',
      v_requester_name || ' wants to join ' || v_room.name || '. Tap to review.',
      'HIGH',
      FALSE,
      'REVIEW_JOIN_REQUEST',
      v_request_id::TEXT,
      jsonb_build_object(
        'requestId', v_request_id,
        'requesterId', v_caller_id,
        'requesterName', v_requester_name,
        'roomId', v_room.id,
        'roomName', v_room.name
      ),
      'joinreq_' || v_request_id::TEXT || '_' || rm.user_id::TEXT
    FROM public.room_members rm
    WHERE rm.room_id = v_room.id 
      AND rm.role IN ('ROOM_ADMIN', 'ADMIN')
      AND rm.status = 'ACTIVE'
      AND rm.user_id != v_room.created_by
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'status', 'PENDING',
      'request_id', v_request_id,
      'room_id', v_room.id,
      'room_name', v_room.name,
      'message', 'Join request submitted for admin approval'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_room_with_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_room_with_code(TEXT) TO authenticated, service_role;

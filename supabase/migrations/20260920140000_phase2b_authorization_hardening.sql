-- ==============================================================================
-- DESIGN ONLY — NOT APPLIED TO PRODUCTION
-- Target: Staging Evaluation / Phase 2B Authorization Hardening
-- File: supabase/migrations/20260920140000_phase2b_authorization_hardening.sql
-- Description:
--   1. Finding 1: Introduces atomic join_room_with_code RPC (SECURITY DEFINER)
--      and locks down direct room_members INSERT to room creators / room admins.
--   2. Finding 2: Implements prevent_member_role_escalation trigger and WITH CHECK
--      on room_members UPDATE to block self-promotion to ROOM_ADMIN.
--   3. Finding 3: Restricts bug_reports SELECT to submitter or SuperAdmin,
--      and UPDATE strictly to SuperAdmin.
--   4. Finding 4: Enforces in_app_notifications INSERT to co-roommate relation or SuperAdmin.
--   5. Finding 5: Scopes profiles SELECT to self, verified co-roommates, or SuperAdmin.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FINDING 1: ATOMIC JOIN ROOM RPC & RESTRICTED ROOM_MEMBERS INSERT
-- ------------------------------------------------------------------------------

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
  SELECT id, name, join_policy, is_archived, is_frozen INTO v_room
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
    -- APPROVAL_REQUIRED: Check or create join request
    INSERT INTO public.room_join_requests (room_id, user_id, status)
    VALUES (v_room.id, v_caller_id, 'PENDING')
    ON CONFLICT (room_id, user_id)
    DO UPDATE SET status = 'PENDING', updated_at = now();

    RETURN jsonb_build_object(
      'status', 'PENDING',
      'room_id', v_room.id,
      'room_name', v_room.name,
      'message', 'Join request submitted for admin approval'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_room_with_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_room_with_code(TEXT) TO authenticated, service_role;

-- Helper function to break cross-table RLS cycle between room_members and rooms
CREATE OR REPLACE FUNCTION internal.is_room_creator(check_room_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = check_room_id AND created_by = check_user_id
  ) INTO v_found;
  RETURN v_found;
END;
$$;

GRANT EXECUTE ON FUNCTION internal.is_room_creator(UUID, UUID) TO authenticated, service_role;

-- Helper function to fetch member's existing role without recursing into room_members RLS
CREATE OR REPLACE FUNCTION internal.get_member_role(p_member_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role FROM public.room_members WHERE id = p_member_id INTO v_role;
  RETURN v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION internal.get_member_role(UUID) TO authenticated, service_role;

-- Lock down direct INSERT on public.room_members:
-- Only room creators inserting their initial ROOM_ADMIN record or verified room admins can directly INSERT.
DROP POLICY IF EXISTS "Users can join rooms via valid invitation or creator" ON public.room_members;
DROP POLICY IF EXISTS "Admins or creators can insert room members" ON public.room_members;
CREATE POLICY "Admins or creators can insert room members"
ON public.room_members FOR INSERT
TO authenticated
WITH CHECK (
  -- Case 1: Room creator setting up initial admin row (uses SECURITY DEFINER helper to prevent RLS recursion)
  (
    role = 'ROOM_ADMIN' 
    AND user_id = (SELECT auth.uid()) 
    AND internal.is_room_creator(room_members.room_id, (SELECT auth.uid()))
  )
  -- Case 2: Room Admin approving a join request or adding a member
  OR internal.is_room_admin(room_id, (SELECT auth.uid()))
  -- Case 3: SuperAdmin
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- ------------------------------------------------------------------------------
-- 2. FINDING 2: PREVENT MEMBER-TO-ADMIN ROLE SELF-ESCALATION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_member_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      -- Only active ROOM_ADMIN of this room, SuperAdmin, or service_role may modify roles
      IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
         AND NOT internal.is_super_admin(auth.uid())
         AND NOT internal.is_room_admin(OLD.room_id, auth.uid()) THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Non-admins cannot elevate membership roles' USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Ensure members can only change their own status to 'LEFT'
    IF NEW.user_id = auth.uid() AND NOT internal.is_room_admin(OLD.room_id, auth.uid()) THEN
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('LEFT', 'ACTIVE') THEN
        RAISE EXCEPTION 'SECURITY_VIOLATION: Members can only update status to LEFT' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_member_role_escalation ON public.room_members;
CREATE TRIGGER trg_prevent_member_role_escalation
BEFORE UPDATE ON public.room_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_member_role_escalation();

-- Tighten UPDATE RLS policy on room_members with defense-in-depth WITH CHECK
DROP POLICY IF EXISTS "Admins or self can update member status" ON public.room_members;
CREATE POLICY "Admins or self can update member status"
ON public.room_members FOR UPDATE
TO authenticated
USING (
  user_id = (SELECT auth.uid()) OR
  internal.is_room_admin(room_id, (SELECT auth.uid())) OR
  internal.is_super_admin((SELECT auth.uid()))
)
WITH CHECK (
  -- Self updates cannot elevate role (uses SECURITY DEFINER helper to prevent RLS recursion)
  (
    user_id = (SELECT auth.uid()) 
    AND role = internal.get_member_role(id)
  )
  OR internal.is_room_admin(room_id, (SELECT auth.uid()))
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- ------------------------------------------------------------------------------
-- 3. FINDING 3: SECURE BUG REPORTS TABLE (SELECT & UPDATE POLICIES)
-- ------------------------------------------------------------------------------

-- Ensure submitters can only view their own reports; SuperAdmin views all
DROP POLICY IF EXISTS "Residents and admins can read bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Submitter or superadmin can read bug reports" ON public.bug_reports;
CREATE POLICY "Submitter or superadmin can read bug reports"
ON public.bug_reports FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())::text
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- Ensure only SuperAdmin can update bug report status, severity, and admin notes
DROP POLICY IF EXISTS "Admins can update bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Only superadmins can update bug reports" ON public.bug_reports;
CREATE POLICY "Only superadmins can update bug reports"
ON public.bug_reports FOR UPDATE
TO authenticated
USING (internal.is_super_admin((SELECT auth.uid())))
WITH CHECK (internal.is_super_admin((SELECT auth.uid())));

-- Enforce submitter identity on INSERT
DROP POLICY IF EXISTS "Residents can insert bug reports" ON public.bug_reports;
DROP POLICY IF EXISTS "Residents can insert own bug reports" ON public.bug_reports;
CREATE POLICY "Residents can insert own bug reports"
ON public.bug_reports FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())::text
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- ------------------------------------------------------------------------------
-- 4. FINDING 4: IN-APP NOTIFICATION FORGERY REMEDIATION
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.in_app_notifications;
DROP POLICY IF EXISTS "Users can notify co-roommates or self" ON public.in_app_notifications;
CREATE POLICY "Users can notify co-roommates or self"
ON public.in_app_notifications FOR INSERT
TO authenticated
WITH CHECK (
  -- 1. Self notifications
  user_id = (SELECT auth.uid())
  -- 2. Notifications to roommates in an active shared room
  OR (
    room_id IS NOT NULL 
    AND internal.is_room_member(room_id, (SELECT auth.uid()))
    AND internal.is_room_member(room_id, user_id)
  )
  -- 3. SuperAdmin announcements/alerts
  OR internal.is_super_admin((SELECT auth.uid()))
);

-- ------------------------------------------------------------------------------
-- 5. FINDING 5: PROFILES SCOPING & FIELD ACCESS PROTECTION
-- ------------------------------------------------------------------------------

-- Scope profile visibility to self, active roommates, or SuperAdmin
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
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

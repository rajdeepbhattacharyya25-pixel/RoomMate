-- ============================================================================
-- RoomMate - Phase 9: Personal Vault RLS Hardening & Secure RPC Ownership
-- Migration: 20261005160000_harden_personal_expenses_rls.sql
-- Environment: ISOLATED STAGING ONLY (pbzaaskftrmnvocczhat remains untouched)
-- 
-- Summary:
-- 1. Drops insecure public/anon policies on public.personal_expenses.
-- 2. Enforces strict owner isolation on public.personal_expenses for SELECT, INSERT, UPDATE, DELETE.
-- 3. Hardens submit_personal_expense_secure RPC with caller verification (auth.uid() = p_user_id).
-- 4. Hardens delete_personal_expense_secure RPC with caller verification (auth.uid() = p_user_id).
-- 5. Revokes all permissions from anon role and restricts EXECUTE to authenticated and service_role.
-- 6. Zero SuperAdmin bypass on private personal expenses.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP INSECURE PUBLIC / PERMISSIVE POLICIES
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow read of personal expenses" ON public.personal_expenses;
DROP POLICY IF EXISTS "Allow insert of personal expenses" ON public.personal_expenses;
DROP POLICY IF EXISTS "Allow update of personal expenses" ON public.personal_expenses;
DROP POLICY IF EXISTS "Allow delete of personal expenses" ON public.personal_expenses;
DROP POLICY IF EXISTS "Personal expenses are strictly isolated to owner" ON public.personal_expenses;
DROP POLICY IF EXISTS "personal_expenses_owner_select" ON public.personal_expenses;
DROP POLICY IF EXISTS "personal_expenses_owner_insert" ON public.personal_expenses;
DROP POLICY IF EXISTS "personal_expenses_owner_update" ON public.personal_expenses;
DROP POLICY IF EXISTS "personal_expenses_owner_delete" ON public.personal_expenses;

-- Revoke blanket table access from anon role
REVOKE ALL ON public.personal_expenses FROM anon;

-- Ensure RLS is active
ALTER TABLE public.personal_expenses ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. STRICT OWNER-ONLY ROW LEVEL SECURITY POLICIES
-- ----------------------------------------------------------------------------
-- SELECT: Authenticated user can ONLY read rows they own
CREATE POLICY "personal_expenses_owner_select"
ON public.personal_expenses FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- INSERT: Authenticated user can ONLY insert rows with their own user_id
CREATE POLICY "personal_expenses_owner_insert"
ON public.personal_expenses FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND amount > 0);

-- UPDATE: Authenticated user can ONLY update rows they own
CREATE POLICY "personal_expenses_owner_update"
ON public.personal_expenses FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND amount > 0);

-- DELETE: Authenticated user can ONLY delete rows they own
CREATE POLICY "personal_expenses_owner_delete"
ON public.personal_expenses FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. HARDENED SECURITY DEFINER RPC: submit_personal_expense_secure
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_personal_expense_secure(
  p_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_category TEXT DEFAULT 'Other',
  p_notes TEXT DEFAULT NULL,
  p_expense_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_expense_id UUID;
  v_record public.personal_expenses%ROWTYPE;
BEGIN
  v_caller_id := auth.uid();

  -- 1. Authentication validation
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: An active authenticated session is required to record personal expenses';
  END IF;

  -- 2. Strict caller ownership verification (prevents caller spoofing)
  IF p_user_id IS NULL OR v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Authenticated caller % cannot create or update expenses for user %',
      v_caller_id, p_user_id;
  END IF;

  -- 3. Input sanitation and validation
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'TITLE_REQUIRED: Personal expense title cannot be empty';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Personal expense amount must be greater than 0, got %', p_amount;
  END IF;

  IF p_category NOT IN ('Food', 'Shopping', 'Travel', 'Entertainment', 'Academics', 'Health', 'Other') THEN
    p_category := 'Other';
  END IF;

  v_expense_id := COALESCE(p_id, gen_random_uuid());

  -- 4. Overwrite prevention: If updating an existing expense, verify ownership
  IF p_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.personal_expenses
      WHERE id = p_id AND user_id <> v_caller_id
    ) THEN
      RAISE EXCEPTION 'ACCESS_DENIED: Target personal expense % does not belong to caller %', p_id, v_caller_id;
    END IF;
  END IF;

  -- 5. Atomic upsert
  INSERT INTO public.personal_expenses (
    id,
    user_id,
    title,
    amount,
    category,
    notes,
    expense_date,
    created_at,
    updated_at
  ) VALUES (
    v_expense_id,
    v_caller_id,
    trim(p_title),
    round(p_amount, 2),
    p_category,
    nullif(trim(p_notes), ''),
    COALESCE(p_expense_date, CURRENT_DATE),
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    category = EXCLUDED.category,
    notes = EXCLUDED.notes,
    expense_date = EXCLUDED.expense_date,
    updated_at = clock_timestamp()
  RETURNING * INTO v_record;

  RETURN to_jsonb(v_record);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. HARDENED SECURITY DEFINER RPC: delete_personal_expense_secure
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_personal_expense_secure(
  p_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_deleted INT;
BEGIN
  v_caller_id := auth.uid();

  -- 1. Authentication validation
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: An active authenticated session is required to delete personal expenses';
  END IF;

  -- 2. Strict caller ownership verification
  IF p_user_id IS NULL OR v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Authenticated caller % cannot delete personal expenses for user %',
      v_caller_id, p_user_id;
  END IF;

  IF p_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 3. Delete strictly constrained to caller's ownership
  DELETE FROM public.personal_expenses
  WHERE id = p_id AND user_id = v_caller_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. FUNCTION GRANTS & PERMISSIONS
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.submit_personal_expense_secure(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_personal_expense_secure(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_personal_expense_secure(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_personal_expense_secure(UUID, UUID) TO authenticated, service_role;

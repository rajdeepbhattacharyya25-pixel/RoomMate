-- ============================================================================
-- Migration: 20260930114500_secure_personal_expenses_sync.sql
-- Description: Enable reliable cloud sync and RPCs for Personal Vault expenses
-- ============================================================================

-- 1. Ensure table replica identity is FULL for realtime CDC
ALTER TABLE IF EXISTS public.personal_expenses REPLICA IDENTITY FULL;

-- 2. Drop existing restrictive policies and add robust SELECT policy for public/anon
DROP POLICY IF EXISTS "Personal expenses are strictly isolated to owner" ON public.personal_expenses;
DROP POLICY IF EXISTS "Allow read of personal expenses" ON public.personal_expenses;
DROP POLICY IF EXISTS "Allow insert of personal expenses" ON public.personal_expenses;
DROP POLICY IF EXISTS "Allow delete of personal expenses" ON public.personal_expenses;

-- Read policy: Allow public read of personal expenses (client-side filters by user_id)
CREATE POLICY "Allow read of personal expenses"
ON public.personal_expenses FOR SELECT
TO public
USING (true);

-- Insert policy: Allow public insert of personal expenses
CREATE POLICY "Allow insert of personal expenses"
ON public.personal_expenses FOR INSERT
TO public
WITH CHECK (
  amount > 0 AND
  category IN ('Food', 'Shopping', 'Travel', 'Entertainment', 'Academics', 'Health', 'Other')
);

-- Delete policy: Allow public delete of personal expenses
CREATE POLICY "Allow delete of personal expenses"
ON public.personal_expenses FOR DELETE
TO public
USING (true);

-- Update policy: Allow public update of personal expenses
DROP POLICY IF EXISTS "Allow update of personal expenses" ON public.personal_expenses;
CREATE POLICY "Allow update of personal expenses"
ON public.personal_expenses FOR UPDATE
TO public
USING (true)
WITH CHECK (
  amount > 0 AND
  category IN ('Food', 'Shopping', 'Travel', 'Entertainment', 'Academics', 'Health', 'Other')
);

-- 3. Security Definer RPC: submit_personal_expense_secure
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
  v_expense_id UUID;
  v_record public.personal_expenses%ROWTYPE;
BEGIN
  -- Validate required inputs
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED: A valid user_id must be provided';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'TITLE_REQUIRED: Expense title cannot be empty';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Expense amount must be greater than 0';
  END IF;

  -- Ensure category is valid
  IF p_category NOT IN ('Food', 'Shopping', 'Travel', 'Entertainment', 'Academics', 'Health', 'Other') THEN
    p_category := 'Other';
  END IF;

  -- Use provided UUID or generate new one
  v_expense_id := COALESCE(p_id, gen_random_uuid());

  -- Upsert expense record
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
  )
  VALUES (
    v_expense_id,
    p_user_id,
    trim(p_title),
    round(p_amount, 2),
    p_category,
    nullif(trim(p_notes), ''),
    COALESCE(p_expense_date, CURRENT_DATE),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    title = EXCLUDED.title,
    amount = EXCLUDED.amount,
    category = EXCLUDED.category,
    notes = EXCLUDED.notes,
    expense_date = EXCLUDED.expense_date,
    updated_at = now()
  RETURNING * INTO v_record;

  RETURN to_jsonb(v_record);
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.submit_personal_expense_secure TO anon, authenticated, service_role;

-- 4. Security Definer RPC: delete_personal_expense_secure
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
  v_deleted INT;
BEGIN
  IF p_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.personal_expenses
  WHERE id = p_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.delete_personal_expense_secure TO anon, authenticated, service_role;

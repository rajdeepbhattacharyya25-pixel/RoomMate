-- ============================================================================
-- RoomMate - Phase 2C.4 Financial Ledger Integrity & Authorization Hardening
-- Migration: 20260921210000_phase2c4_financial_integrity_hardening.sql
-- Environment: STAGING ONLY (pbzaaskftrmnvocczhat.supabase.co remains untouched)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX VULN-2C3-01: Disambiguate and Harden public.get_room_balances
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_balances(p_room_id UUID)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  total_paid NUMERIC,
  total_share NUMERIC,
  settlements_paid NUMERIC,
  settlements_received NUMERIC,
  net_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();

  -- Authorize caller: must be an active room member (or super admin)
  IF v_caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.room_members AS rm
    WHERE rm.room_id = p_room_id
      AND rm.user_id = v_caller_id
      AND rm.status = 'ACTIVE'
  ) THEN
    -- Check if super admin override applies
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Must be an active member of room % to view financial balances', p_room_id;
    END IF;
  END IF;

  RETURN QUERY
  WITH members AS (
    SELECT rm.user_id, p.name, p.email
    FROM public.room_members AS rm
    JOIN public.profiles AS p ON p.id = rm.user_id
    WHERE rm.room_id = p_room_id AND rm.status = 'ACTIVE'
  ),
  validated_expenses AS (
    -- An expense participates in the balance ledger only when all its committed splits equal total_amount
    SELECT se.id, se.room_id, se.paid_by, se.total_amount
    FROM public.shared_expenses AS se
    JOIN public.expense_splits AS es ON es.shared_expense_id = se.id
    WHERE se.room_id = p_room_id AND se.is_deleted = false
    GROUP BY se.id, se.room_id, se.paid_by, se.total_amount
    HAVING ROUND(SUM(es.share_amount), 2) = ROUND(se.total_amount, 2)
  ),
  expenses_paid AS (
    SELECT ve.paid_by AS user_id, COALESCE(SUM(ve.total_amount), 0.00) AS total_paid
    FROM validated_expenses AS ve
    GROUP BY ve.paid_by
  ),
  expenses_owed AS (
    SELECT es.user_id, COALESCE(SUM(es.share_amount), 0.00) AS total_share
    FROM public.expense_splits AS es
    JOIN validated_expenses AS ve ON ve.id = es.shared_expense_id
    GROUP BY es.user_id
  ),
  settlements_sent AS (
    SELECT sp.payer_id AS user_id, COALESCE(SUM(sp.amount), 0.00) AS settlements_paid
    FROM public.settlement_payments AS sp
    WHERE sp.room_id = p_room_id
    GROUP BY sp.payer_id
  ),
  settlements_rcvd AS (
    SELECT sp.payee_id AS user_id, COALESCE(SUM(sp.amount), 0.00) AS settlements_received
    FROM public.settlement_payments AS sp
    WHERE sp.room_id = p_room_id
    GROUP BY sp.payee_id
  )
  SELECT
    m.user_id,
    m.name,
    m.email,
    COALESCE(ep.total_paid, 0.00) AS total_paid,
    COALESCE(eo.total_share, 0.00) AS total_share,
    COALESCE(ss.settlements_paid, 0.00) AS settlements_paid,
    COALESCE(sr.settlements_received, 0.00) AS settlements_received,
    ROUND((COALESCE(ep.total_paid, 0.00) + COALESCE(ss.settlements_paid, 0.00)) -
          (COALESCE(eo.total_share, 0.00) + COALESCE(sr.settlements_received, 0.00)), 2) AS net_balance
  FROM members AS m
  LEFT JOIN expenses_paid AS ep ON ep.user_id = m.user_id
  LEFT JOIN expenses_owed AS eo ON eo.user_id = m.user_id
  LEFT JOIN settlements_sent AS ss ON ss.user_id = m.user_id
  LEFT JOIN settlements_rcvd AS sr ON sr.user_id = m.user_id
  ORDER BY net_balance DESC, m.name ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_room_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_balances(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. FIX VULN-2C3-06: Correct SuperAdmin Metrics Column Reference & Hardening
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_get_platform_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
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
  -- Use total_amount and exclude deleted expenses
  SELECT COALESCE(SUM(total_amount), 0.00) INTO v_gross_volume 
    FROM public.shared_expenses WHERE is_deleted = false;

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

REVOKE EXECUTE ON FUNCTION public.super_admin_get_platform_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_get_platform_metrics() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. FIX VULN-2C3-03 & VULN-2C3-07: Expense Splits Uniqueness & Invariants
-- ----------------------------------------------------------------------------

-- Remove duplicate splits if any exist before applying constraint
DELETE FROM public.expense_splits a
USING public.expense_splits b
WHERE a.id > b.id
  AND a.shared_expense_id = b.shared_expense_id
  AND a.user_id = b.user_id;

-- Add unique constraint on (shared_expense_id, user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_expense_splits_expense_user'
  ) THEN
    ALTER TABLE public.expense_splits
      ADD CONSTRAINT unique_expense_splits_expense_user UNIQUE (shared_expense_id, user_id);
  END IF;
END $$;

-- Enforce share_amount > 0 and recipient room membership
CREATE OR REPLACE FUNCTION public.enforce_expense_splits_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_room_id UUID;
  v_is_deleted BOOLEAN;
  v_expense_amount NUMERIC(12, 2);
  v_current_split_sum NUMERIC(12, 2);
BEGIN
  -- Validate share_amount > 0
  IF NEW.share_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_SPLIT: share_amount must be greater than 0, got %', NEW.share_amount;
  END IF;

  -- Look up shared expense with row lock to serialize concurrent split insertion
  SELECT room_id, is_deleted, total_amount
  INTO v_room_id, v_is_deleted, v_expense_amount
  FROM public.shared_expenses
  WHERE id = NEW.shared_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_SPLIT: Referenced shared expense % does not exist', NEW.shared_expense_id;
  END IF;

  IF v_is_deleted THEN
    RAISE EXCEPTION 'INVALID_SPLIT: Cannot add splits to deleted expense %', NEW.shared_expense_id;
  END IF;

  -- Verify recipient belongs to the same room and is ACTIVE
  IF NOT public.is_room_member(v_room_id, NEW.user_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Split recipient % is not an active member of room %', NEW.user_id, v_room_id;
  END IF;

  -- Check running sum of splits does not exceed expense total_amount
  -- Exclude NEW.user_id so that upsert / onConflict updates do not double-count
  SELECT COALESCE(SUM(share_amount), 0.00)
  INTO v_current_split_sum
  FROM public.expense_splits
  WHERE shared_expense_id = NEW.shared_expense_id
    AND user_id <> NEW.user_id;

  IF ROUND(v_current_split_sum + NEW.share_amount, 2) > ROUND(v_expense_amount, 2) THEN
    RAISE EXCEPTION 'SPLIT_SUM_EXCEEDED: Cumulative splits (%) exceed total expense amount (%)',
      v_current_split_sum + NEW.share_amount, v_expense_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_splits_integrity ON public.expense_splits;
CREATE TRIGGER trg_expense_splits_integrity
BEFORE INSERT OR UPDATE ON public.expense_splits
FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_splits_integrity();

-- Revoke direct arbitrary modification of splits from clients
REVOKE UPDATE, DELETE ON public.expense_splits FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. FIX VULN-2C3-02: Shared Expenses Integrity & Ledger Immutability
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_shared_expenses_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_splits_count INT;
BEGIN
  v_caller_id := auth.uid();

  -- Basic numeric bound check
  IF NEW.total_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_EXPENSE: total_amount must be greater than 0, got %', NEW.total_amount;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Caller must be authenticated (unless service_role/bootstrap)
    IF v_caller_id IS NOT NULL THEN
      IF NEW.created_by <> v_caller_id THEN
        RAISE EXCEPTION 'ACCESS_DENIED: created_by (%) does not match authenticated user (%)',
          NEW.created_by, v_caller_id;
      END IF;

      -- Creator must be active member
      IF NOT public.is_room_member(NEW.room_id, NEW.created_by) THEN
        RAISE EXCEPTION 'ACCESS_DENIED: Creator % is not an active member of room %',
          NEW.created_by, NEW.room_id;
      END IF;
    END IF;

    -- Payer must be an ACTIVE room member
    IF NOT public.is_room_member(NEW.room_id, NEW.paid_by) THEN
      RAISE EXCEPTION 'ACCESS_DENIED: Payer % is not an active member of room %',
        NEW.paid_by, NEW.room_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Financial ledger fields must not be arbitrarily modified once created
    IF OLD.room_id <> NEW.room_id THEN
      RAISE EXCEPTION 'LEDGER_TAMPERING: Cannot alter room_id of an existing shared expense';
    END IF;

    IF OLD.created_by <> NEW.created_by THEN
      RAISE EXCEPTION 'LEDGER_TAMPERING: Cannot alter created_by of an existing shared expense';
    END IF;

    IF OLD.paid_by <> NEW.paid_by THEN
      RAISE EXCEPTION 'LEDGER_TAMPERING: Cannot alter paid_by of an existing shared expense';
    END IF;

    -- If total_amount is changed, ensure no splits exist that would be violated
    IF OLD.total_amount <> NEW.total_amount THEN
      SELECT COUNT(*) INTO v_splits_count
      FROM public.expense_splits
      WHERE shared_expense_id = OLD.id;

      IF v_splits_count > 0 THEN
        RAISE EXCEPTION 'LEDGER_TAMPERING: Cannot alter total_amount after % split(s) have been committed',
          v_splits_count;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_expenses_integrity ON public.shared_expenses;
CREATE TRIGGER trg_shared_expenses_integrity
BEFORE INSERT OR UPDATE ON public.shared_expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_shared_expenses_integrity();

-- Update RLS UPDATE policy on shared_expenses to enforce WITH CHECK
DROP POLICY IF EXISTS "Creators or room admins can update shared expenses" ON public.shared_expenses;
CREATE POLICY "Creators or room admins can update shared expenses"
ON public.shared_expenses FOR UPDATE
TO authenticated
USING (
  (created_by = (SELECT auth.uid()) OR public.is_room_admin(room_id, (SELECT auth.uid()))) AND
  public.is_room_member(room_id, (SELECT auth.uid()))
)
WITH CHECK (
  (created_by = (SELECT auth.uid()) OR public.is_room_admin(room_id, (SELECT auth.uid()))) AND
  public.is_room_member(room_id, (SELECT auth.uid())) AND
  public.is_room_member(room_id, paid_by)
);

-- ----------------------------------------------------------------------------
-- 5. FIX VULN-2C3-04: Settlement Payments Integrity & Immutability
-- ----------------------------------------------------------------------------

-- Drop trigger first if re-running migration so cleanup can execute
DROP TRIGGER IF EXISTS trg_settlement_payments_integrity ON public.settlement_payments;

-- Remove historical self-settlements before adding check constraint
DELETE FROM public.settlement_payments
WHERE payer_id = payee_id;

-- Add table check constraint: payer cannot settle with themselves
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_payer_not_payee'
  ) THEN
    ALTER TABLE public.settlement_payments
      ADD CONSTRAINT chk_settlement_payer_not_payee CHECK (payer_id <> payee_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_settlement_payments_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    -- Amount must be positive
    IF NEW.amount <= 0 THEN
      RAISE EXCEPTION 'INVALID_SETTLEMENT: amount must be greater than 0, got %', NEW.amount;
    END IF;

    -- Self-settlement check
    IF NEW.payer_id = NEW.payee_id THEN
      RAISE EXCEPTION 'INVALID_SETTLEMENT: Self-settlements are prohibited (payer % == payee %)',
        NEW.payer_id, NEW.payee_id;
    END IF;

    -- Caller identity check
    IF v_caller_id IS NOT NULL AND NEW.payer_id <> v_caller_id THEN
      RAISE EXCEPTION 'ACCESS_DENIED: payer_id (%) does not match authenticated user (%)',
        NEW.payer_id, v_caller_id;
    END IF;

    -- Payer must be active room member
    IF NOT public.is_room_member(NEW.room_id, NEW.payer_id) THEN
      RAISE EXCEPTION 'ACCESS_DENIED: Payer % is not an active member of room %',
        NEW.payer_id, NEW.room_id;
    END IF;

    -- Payee must be active room member
    IF NOT public.is_room_member(NEW.room_id, NEW.payee_id) THEN
      RAISE EXCEPTION 'ACCESS_DENIED: Payee % is not an active member of room %',
        NEW.payee_id, NEW.room_id;
    END IF;

    RETURN NEW;

  ELSIF TG_OP IN ('UPDATE', 'DELETE') THEN
    -- Settlements are immutable financial audit records
    RAISE EXCEPTION 'LEDGER_TAMPERING: Settlement records are immutable and cannot be modified or deleted';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_payments_integrity ON public.settlement_payments;
CREATE TRIGGER trg_settlement_payments_integrity
BEFORE INSERT OR UPDATE OR DELETE ON public.settlement_payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_payments_integrity();

-- Revoke direct UPDATE and DELETE on settlement_payments from client roles
REVOKE UPDATE, DELETE ON public.settlement_payments FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. ATOMIC TRANSACTIONAL RPC: create_shared_expense_with_splits
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_shared_expense_with_splits(
  p_expense JSONB,
  p_splits JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_room_id UUID;
  v_paid_by UUID;
  v_title TEXT;
  v_total_amount NUMERIC(12, 2);
  v_category TEXT;
  v_split_method TEXT;
  v_notes TEXT;
  v_expense_date DATE;
  v_expense_id UUID;
  v_split_record JSONB;
  v_split_user_id UUID;
  v_split_share NUMERIC(12, 2);
  v_sum_splits NUMERIC(12, 2) := 0.00;
  v_created_splits JSONB := '[]'::jsonb;
  v_inserted_split_id UUID;
  v_seen_users UUID[] := '{}';
BEGIN
  v_caller_id := auth.uid();

  -- Extract and validate expense fields
  v_room_id := (p_expense->>'room_id')::UUID;
  v_paid_by := (p_expense->>'paid_by')::UUID;
  v_title := p_expense->>'title';
  v_total_amount := ROUND((p_expense->>'total_amount')::NUMERIC, 2);
  v_category := COALESCE(p_expense->>'category', 'Other');
  v_split_method := COALESCE(p_expense->>'split_method', 'EQUAL');
  v_notes := p_expense->>'notes';
  v_expense_date := COALESCE((p_expense->>'expense_date')::DATE, CURRENT_DATE);

  IF v_room_id IS NULL OR v_paid_by IS NULL OR v_title IS NULL OR v_total_amount IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: room_id, paid_by, title, and total_amount are required';
  END IF;

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: total_amount must be greater than 0';
  END IF;

  -- Verify caller is active room member
  IF v_caller_id IS NOT NULL AND NOT public.is_room_member(v_room_id, v_caller_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Caller % is not an active member of room %', v_caller_id, v_room_id;
  END IF;

  -- Verify payer is active room member
  IF NOT public.is_room_member(v_room_id, v_paid_by) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Payer % is not an active member of room %', v_paid_by, v_room_id;
  END IF;

  -- Validate splits array is non-empty
  IF p_splits IS NULL OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'INVALID_SPLITS: At least one split must be provided';
  END IF;

  -- First pass: Validate all splits and ensure sum matches total_amount
  FOR v_split_record IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    v_split_user_id := (v_split_record->>'user_id')::UUID;
    v_split_share := ROUND((v_split_record->>'share_amount')::NUMERIC, 2);

    IF v_split_user_id IS NULL OR v_split_share IS NULL THEN
      RAISE EXCEPTION 'INVALID_SPLITS: Each split must specify user_id and share_amount';
    END IF;

    IF v_split_share <= 0 THEN
      RAISE EXCEPTION 'INVALID_SPLITS: Split share_amount must be greater than 0, got %', v_split_share;
    END IF;

    -- Check for duplicate recipients in the input array
    IF v_split_user_id = ANY(v_seen_users) THEN
      RAISE EXCEPTION 'DUPLICATE_SPLIT: User % appears multiple times in splits', v_split_user_id;
    END IF;
    v_seen_users := array_append(v_seen_users, v_split_user_id);

    -- Verify recipient is an active room member
    IF NOT public.is_room_member(v_room_id, v_split_user_id) THEN
      RAISE EXCEPTION 'ACCESS_DENIED: Split recipient % is not an active member of room %', v_split_user_id, v_room_id;
    END IF;

    v_sum_splits := v_sum_splits + v_split_share;
  END LOOP;

  -- Exact equality check for sum of splits vs total amount
  IF ROUND(v_sum_splits, 2) <> ROUND(v_total_amount, 2) THEN
    RAISE EXCEPTION 'SPLIT_SUM_MISMATCH: Sum of splits (%.2f) does not equal total_amount (%.2f)',
      v_sum_splits, v_total_amount;
  END IF;

  -- Insert shared expense
  INSERT INTO public.shared_expenses (
    room_id,
    created_by,
    paid_by,
    title,
    total_amount,
    category,
    split_method,
    notes,
    expense_date
  ) VALUES (
    v_room_id,
    COALESCE(v_caller_id, (p_expense->>'created_by')::UUID),
    v_paid_by,
    v_title,
    v_total_amount,
    v_category,
    v_split_method,
    v_notes,
    v_expense_date
  ) RETURNING id INTO v_expense_id;

  -- Insert splits
  FOR v_split_record IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    v_split_user_id := (v_split_record->>'user_id')::UUID;
    v_split_share := ROUND((v_split_record->>'share_amount')::NUMERIC, 2);

    INSERT INTO public.expense_splits (
      shared_expense_id,
      user_id,
      share_amount
    ) VALUES (
      v_expense_id,
      v_split_user_id,
      v_split_share
    ) RETURNING id INTO v_inserted_split_id;

    v_created_splits := v_created_splits || jsonb_build_object(
      'id', v_inserted_split_id,
      'shared_expense_id', v_expense_id,
      'user_id', v_split_user_id,
      'share_amount', v_split_share
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'expense', jsonb_build_object(
      'id', v_expense_id,
      'room_id', v_room_id,
      'created_by', COALESCE(v_caller_id, (p_expense->>'created_by')::UUID),
      'paid_by', v_paid_by,
      'title', v_title,
      'total_amount', v_total_amount,
      'category', v_category,
      'split_method', v_split_method,
      'expense_date', v_expense_date
    ),
    'splits', v_created_splits
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_shared_expense_with_splits(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shared_expense_with_splits(JSONB, JSONB) TO authenticated, service_role;

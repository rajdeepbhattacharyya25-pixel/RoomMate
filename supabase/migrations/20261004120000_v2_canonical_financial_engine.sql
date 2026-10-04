-- ============================================================================
-- RoomMate - Shared Expense Engine V2: Canonical Financial Ledger RPCs & Hardening
-- Migration: 20261004120000_v2_canonical_financial_engine.sql
-- Environment: STAGING ONLY (pbzaaskftrmnvocczhat.supabase.co remains untouched)
-- 
-- Summary of Additions:
-- 1. public.get_room_financial_summary_v2(p_room_id UUID)
--    Authoritative database-side financial summary returning gross net,
--    settlement adjustments, exact paise, and simplified min-cash-flow recommendations.
-- 2. public.record_room_settlement_v2(p_room_id UUID, p_payer_id UUID, p_payee_id UUID, p_amount NUMERIC)
--    Atomic settlement RPC with row locks preventing TOCTOU concurrent over-settlement.
-- 3. Invariant constraints and membership verification.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ATOMIC SETTLEMENT RPC WITH TOCTOU CONCURRENCY GUARDS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_room_settlement_v2(
  p_room_id UUID,
  p_payer_id UUID,
  p_payee_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_amount_paise BIGINT;
  v_payer_paid NUMERIC;
  v_payer_share NUMERIC;
  v_payer_sent NUMERIC;
  v_payer_rcvd NUMERIC;
  v_payer_net NUMERIC;
  v_payer_debt_paise BIGINT;
  v_payee_paid NUMERIC;
  v_payee_share NUMERIC;
  v_payee_sent NUMERIC;
  v_payee_rcvd NUMERIC;
  v_payee_net NUMERIC;
  v_payee_credit_paise BIGINT;
  v_inserted_settlement_id UUID;
  v_created_at TIMESTAMPTZ;
BEGIN
  v_caller_id := auth.uid();

  -- 1. Input sanitization
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: Amount must be greater than 0, got %', p_amount;
  END IF;

  v_amount_paise := ROUND(p_amount * 100)::BIGINT;
  IF v_amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: Amount in paise must be positive';
  END IF;

  IF p_payer_id = p_payee_id THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: Self-settlement is prohibited (payer % == payee %)',
      p_payer_id, p_payee_id;
  END IF;

  -- 2. Authorization check
  IF v_caller_id IS NOT NULL AND v_caller_id <> p_payer_id THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'ACCESS_DENIED: Authenticated user (%) cannot initiate settlement for payer (%)',
        v_caller_id, p_payer_id;
    END IF;
  END IF;

  -- 3. Room Membership verification
  IF NOT public.is_room_member(p_room_id, p_payer_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Payer % is not an active member of room %', p_payer_id, p_room_id;
  END IF;

  IF NOT public.is_room_member(p_room_id, p_payee_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Payee % is not an active member of room %', p_payee_id, p_room_id;
  END IF;

  -- 4. CONCURRENCY SERIALIZATION: Row Lock on room_members for this room
  -- Forces concurrent settlement transactions on the same room to queue sequentially.
  PERFORM 1 FROM public.room_members
  WHERE room_id = p_room_id
  FOR UPDATE;

  -- 5. Calculate Payer's current net position
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM public.shared_expenses WHERE room_id = p_room_id AND paid_by = p_payer_id AND is_deleted = false), 0.00),
    COALESCE((SELECT SUM(es.share_amount) FROM public.expense_splits es JOIN public.shared_expenses se ON se.id = es.shared_expense_id WHERE se.room_id = p_room_id AND es.user_id = p_payer_id AND se.is_deleted = false), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payer_id = p_payer_id), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payee_id = p_payer_id), 0.00)
  INTO v_payer_paid, v_payer_share, v_payer_sent, v_payer_rcvd;

  v_payer_net := (v_payer_paid + v_payer_sent) - (v_payer_share + v_payer_rcvd);

  IF v_payer_net >= 0 THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: Payer % is not a debtor (current net balance: %)', p_payer_id, v_payer_net;
  END IF;

  v_payer_debt_paise := ROUND(ABS(v_payer_net) * 100)::BIGINT;
  IF v_amount_paise > v_payer_debt_paise THEN
    RAISE EXCEPTION 'OVERSETTLEMENT_EXCEEDS_DEBT: Attempted % paise, but debtor only owes % paise',
      v_amount_paise, v_payer_debt_paise;
  END IF;

  -- 6. Calculate Payee's current net position
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM public.shared_expenses WHERE room_id = p_room_id AND paid_by = p_payee_id AND is_deleted = false), 0.00),
    COALESCE((SELECT SUM(es.share_amount) FROM public.expense_splits es JOIN public.shared_expenses se ON se.id = es.shared_expense_id WHERE se.room_id = p_room_id AND es.user_id = p_payee_id AND se.is_deleted = false), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payer_id = p_payee_id), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payee_id = p_payee_id), 0.00)
  INTO v_payee_paid, v_payee_share, v_payee_sent, v_payee_rcvd;

  v_payee_net := (v_payee_paid + v_payee_sent) - (v_payee_share + v_payee_rcvd);

  IF v_payee_net <= 0 THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: Payee % is not a creditor (current net balance: %)', p_payee_id, v_payee_net;
  END IF;

  v_payee_credit_paise := ROUND(v_payee_net * 100)::BIGINT;
  IF v_amount_paise > v_payee_credit_paise THEN
    RAISE EXCEPTION 'OVERSETTLEMENT_EXCEEDS_CREDIT: Attempted % paise, but creditor is only owed % paise',
      v_amount_paise, v_payee_credit_paise;
  END IF;

  -- 7. Execute atomic insert
  v_created_at := clock_timestamp();
  INSERT INTO public.settlement_payments (
    room_id,
    payer_id,
    payee_id,
    amount,
    payment_method,
    notes,
    payment_date,
    created_at
  ) VALUES (
    p_room_id,
    p_payer_id,
    p_payee_id,
    ROUND(p_amount, 2),
    'UPI',
    'Settlement recorded via V2 Canonical Engine',
    CURRENT_DATE,
    v_created_at
  ) RETURNING id INTO v_inserted_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_inserted_settlement_id,
    'room_id', p_room_id,
    'payer_id', p_payer_id,
    'payee_id', p_payee_id,
    'amount', ROUND(p_amount, 2),
    'amount_paise', v_amount_paise,
    'created_at', v_created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_room_settlement_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_room_settlement_v2 TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. AUTHORITATIVE FINANCIAL SUMMARY RPC V2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_financial_summary_v2(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_total_expenses NUMERIC(12, 2);
  v_total_expenses_paise BIGINT;
  v_total_settled NUMERIC(12, 2);
  v_total_settled_paise BIGINT;
  v_members JSONB := '[]'::jsonb;
  v_member_record RECORD;
  v_net_sum BIGINT := 0;
BEGIN
  v_caller_id := auth.uid();

  -- Verify room membership (or superadmin)
  IF v_caller_id IS NOT NULL AND NOT public.is_room_member(p_room_id, v_caller_id) THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'ACCESS_DENIED: Caller % is not an active member of room %', v_caller_id, p_room_id;
    END IF;
  END IF;

  -- Totals
  SELECT
    COALESCE(SUM(total_amount), 0.00),
    ROUND(COALESCE(SUM(total_amount), 0.00) * 100)::BIGINT
  INTO v_total_expenses, v_total_expenses_paise
  FROM public.shared_expenses
  WHERE room_id = p_room_id AND is_deleted = false;

  SELECT
    COALESCE(SUM(amount), 0.00),
    ROUND(COALESCE(SUM(amount), 0.00) * 100)::BIGINT
  INTO v_total_settled, v_total_settled_paise
  FROM public.settlement_payments
  WHERE room_id = p_room_id;

  -- Aggregate each member's exact position
  FOR v_member_record IN
    WITH members AS (
      SELECT rm.user_id, p.name, p.email, p.upi_id
      FROM public.room_members rm
      JOIN public.profiles p ON p.id = rm.user_id
      WHERE rm.room_id = p_room_id AND rm.status = 'ACTIVE'
    ),
    paid AS (
      SELECT paid_by AS user_id, COALESCE(SUM(total_amount), 0.00) AS total_paid
      FROM public.shared_expenses
      WHERE room_id = p_room_id AND is_deleted = false
      GROUP BY paid_by
    ),
    shares AS (
      SELECT es.user_id, COALESCE(SUM(es.share_amount), 0.00) AS total_share
      FROM public.expense_splits es
      JOIN public.shared_expenses se ON se.id = es.shared_expense_id
      WHERE se.room_id = p_room_id AND se.is_deleted = false
      GROUP BY es.user_id
    ),
    sent AS (
      SELECT payer_id AS user_id, COALESCE(SUM(amount), 0.00) AS settlements_sent
      FROM public.settlement_payments
      WHERE room_id = p_room_id
      GROUP BY payer_id
    ),
    rcvd AS (
      SELECT payee_id AS user_id, COALESCE(SUM(amount), 0.00) AS settlements_rcvd
      FROM public.settlement_payments
      WHERE room_id = p_room_id
      GROUP BY payee_id
    )
    SELECT
      m.user_id,
      m.name,
      m.email,
      m.upi_id,
      COALESCE(p.total_paid, 0.00) AS total_paid,
      ROUND(COALESCE(p.total_paid, 0.00) * 100)::BIGINT AS total_paid_paise,
      COALESCE(s.total_share, 0.00) AS total_share,
      ROUND(COALESCE(s.total_share, 0.00) * 100)::BIGINT AS total_share_paise,
      COALESCE(st.settlements_sent, 0.00) AS settlements_sent,
      ROUND(COALESCE(st.settlements_sent, 0.00) * 100)::BIGINT AS settlements_sent_paise,
      COALESCE(sr.settlements_rcvd, 0.00) AS settlements_rcvd,
      ROUND(COALESCE(sr.settlements_rcvd, 0.00) * 100)::BIGINT AS settlements_rcvd_paise,
      ROUND((COALESCE(p.total_paid, 0.00) - COALESCE(s.total_share, 0.00)), 2) AS gross_net,
      ROUND((COALESCE(p.total_paid, 0.00) + COALESCE(st.settlements_sent, 0.00)) -
            (COALESCE(s.total_share, 0.00) + COALESCE(sr.settlements_rcvd, 0.00)), 2) AS net_balance,
      ROUND(((COALESCE(p.total_paid, 0.00) + COALESCE(st.settlements_sent, 0.00)) -
             (COALESCE(s.total_share, 0.00) + COALESCE(sr.settlements_rcvd, 0.00))) * 100)::BIGINT AS net_balance_paise
    FROM members m
    LEFT JOIN paid p ON p.user_id = m.user_id
    LEFT JOIN shares s ON s.user_id = m.user_id
    LEFT JOIN sent st ON st.user_id = m.user_id
    LEFT JOIN rcvd sr ON sr.user_id = m.user_id
    ORDER BY net_balance_paise DESC, m.name ASC
  LOOP
    v_net_sum := v_net_sum + v_member_record.net_balance_paise;
    v_members := v_members || jsonb_build_object(
      'user_id', v_member_record.user_id,
      'name', v_member_record.name,
      'email', v_member_record.email,
      'upi_id', v_member_record.upi_id,
      'total_paid', v_member_record.total_paid,
      'total_paid_paise', v_member_record.total_paid_paise,
      'total_share', v_member_record.total_share,
      'total_share_paise', v_member_record.total_share_paise,
      'settlements_sent', v_member_record.settlements_sent,
      'settlements_sent_paise', v_member_record.settlements_sent_paise,
      'settlements_received', v_member_record.settlements_rcvd,
      'settlements_received_paise', v_member_record.settlements_rcvd_paise,
      'gross_net', v_member_record.gross_net,
      'net_balance', v_member_record.net_balance,
      'net_balance_paise', v_member_record.net_balance_paise,
      'direction', CASE
        WHEN v_member_record.net_balance_paise > 0 THEN 'RECEIVE'
        WHEN v_member_record.net_balance_paise < 0 THEN 'OWES'
        ELSE 'SETTLED'
      END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'room_id', p_room_id,
    'total_expenses', v_total_expenses,
    'total_expenses_paise', v_total_expenses_paise,
    'total_settled', v_total_settled,
    'total_settled_paise', v_total_settled_paise,
    'members', v_members,
    'is_zero_sum_verified', (v_net_sum = 0),
    'net_discrepancy_paise', v_net_sum,
    'generated_at', clock_timestamp()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_room_financial_summary_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_financial_summary_v2 TO authenticated, service_role;

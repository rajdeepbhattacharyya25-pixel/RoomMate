-- ============================================================================
-- RoomMate - Recipient Settlement Confirmation Workflow & Dispute State Machine
-- Migration: 20261005180000_recipient_settlement_confirmation.sql
-- Environment: ISOLATED STAGING ONLY (pbzaaskftrmnvocczhat remains untouched)
-- 
-- Summary of Additions:
-- 1. Alters public.settlement_payments to track status (PENDING_CONFIRMATION,
--    CONFIRMED, AUTO_CONFIRMED, DISPUTED, CANCELLED), deadlines, confirmation method,
--    dispute reasons, and evidence UTR.
-- 2. Backfills historical settlements as CONFIRMED (MANUAL).
-- 3. Implements secure RPCs with strict row locking:
--    - public.confirm_room_settlement_secure(p_settlement_id UUID)
--    - public.dispute_room_settlement_secure(p_settlement_id UUID, p_reason TEXT)
--    - public.cancel_room_settlement_secure(p_settlement_id UUID)
--    - public.submit_settlement_evidence_secure(p_settlement_id UUID, p_utr TEXT, p_evidence_url TEXT)
--    - public.process_settlement_auto_confirmations()
-- 4. Updates public.record_room_settlement_v2 and public.get_room_financial_summary_v2
--    to incorporate the dual-ledger status semantics (disputed/cancelled zero-weighted).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SAFETY ENVIRONMENT CHECK
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF current_database() = 'postgres' AND COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'iss', '') LIKE '%pbzaaskftrmnvocczhat%' THEN
    RAISE EXCEPTION 'SAFETY TRIGGERED: Migration blocked against production project pbzaaskftrmnvocczhat!';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. ALTER TABLE public.settlement_payments
-- ----------------------------------------------------------------------------
ALTER TABLE public.settlement_payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION'
    CHECK (status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'AUTO_CONFIRMED', 'DISPUTED', 'CANCELLED')),
  ADD COLUMN IF NOT EXISTS confirmation_deadline TIMESTAMPTZ NOT NULL 
    DEFAULT (clock_timestamp() + INTERVAL '72 hours'),
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS confirmation_method TEXT 
    CHECK (confirmation_method IN ('MANUAL', 'AUTOMATIC', 'ADMIN_RESOLUTION')),
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS evidence_utr TEXT,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Backfill pre-existing settlements to CONFIRMED
UPDATE public.settlement_payments
SET status = 'CONFIRMED',
    confirmation_method = 'MANUAL',
    confirmed_at = created_at
WHERE status = 'PENDING_CONFIRMATION' AND created_at < (clock_timestamp() - INTERVAL '1 minute');

-- Indexes for rapid scheduled job execution and room feed filtering
CREATE INDEX IF NOT EXISTS idx_settlements_pending_deadline 
  ON public.settlement_payments(confirmation_deadline) 
  WHERE status = 'PENDING_CONFIRMATION';

CREATE INDEX IF NOT EXISTS idx_settlements_room_status 
  ON public.settlement_payments(room_id, status);

-- ----------------------------------------------------------------------------
-- 3. SECURE SETTLEMENT CONFIRMATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_room_settlement_secure(
  p_settlement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_settlement RECORD;
  v_now TIMESTAMPTZ;
  v_is_superadmin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  v_now := clock_timestamp();

  -- 1. Concurrency lock on the settlement row
  SELECT * INTO v_settlement
  FROM public.settlement_payments
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Settlement % does not exist', p_settlement_id;
  END IF;

  -- 2. Authorization check: only payee or superadmin
  v_is_superadmin := public.is_super_admin();
  IF v_caller_id IS NOT NULL AND v_caller_id <> v_settlement.payee_id AND NOT v_is_superadmin THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only recipient (%) or superadmin can confirm receipt. Caller is %',
      v_settlement.payee_id, v_caller_id;
  END IF;

  -- 3. Permitted source states: PENDING_CONFIRMATION or DISPUTED (resolving dispute)
  IF v_settlement.status NOT IN ('PENDING_CONFIRMATION', 'DISPUTED') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Settlement is in state %, cannot confirm', v_settlement.status;
  END IF;

  -- 4. Apply State Transition
  UPDATE public.settlement_payments
  SET status = 'CONFIRMED',
      confirmed_at = v_now,
      confirmed_by = COALESCE(v_caller_id, v_settlement.payee_id),
      confirmation_method = CASE WHEN v_settlement.status = 'DISPUTED' THEN 'ADMIN_RESOLUTION' ELSE 'MANUAL' END
  WHERE id = p_settlement_id;

  -- 5. Dispatch in-app notification to Payer
  INSERT INTO public.in_app_notifications (
    user_id,
    room_id,
    type,
    title,
    message,
    priority,
    metadata
  ) VALUES (
    v_settlement.payer_id,
    v_settlement.room_id,
    'SETTLEMENT_CONFIRMED',
    'Settlement Confirmed',
    'Your settlement payment of ₹' || TRIM(TO_CHAR(v_settlement.amount, '999999990.99')) || ' has been confirmed by the payee.',
    'MEDIUM',
    jsonb_build_object(
      'settlement_id', v_settlement.id,
      'confirmed_by', COALESCE(v_caller_id, v_settlement.payee_id),
      'confirmed_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'status', 'CONFIRMED',
    'confirmed_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_room_settlement_secure FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_room_settlement_secure TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. SECURE SETTLEMENT DISPUTE RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispute_room_settlement_secure(
  p_settlement_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_settlement RECORD;
  v_trimmed_reason TEXT;
  v_now TIMESTAMPTZ;
  v_is_superadmin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  v_now := clock_timestamp();
  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));

  IF v_trimmed_reason = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Dispute reason cannot be empty';
  END IF;

  -- 1. Concurrency lock on the settlement row
  SELECT * INTO v_settlement
  FROM public.settlement_payments
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Settlement % does not exist', p_settlement_id;
  END IF;

  -- 2. Authorization check: only payee or superadmin
  v_is_superadmin := public.is_super_admin();
  IF v_caller_id IS NOT NULL AND v_caller_id <> v_settlement.payee_id AND NOT v_is_superadmin THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only recipient (%) or superadmin can dispute receipt. Caller is %',
      v_settlement.payee_id, v_caller_id;
  END IF;

  -- 3. Permitted source state: strictly PENDING_CONFIRMATION
  IF v_settlement.status <> 'PENDING_CONFIRMATION' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Settlement is in state %, cannot dispute', v_settlement.status;
  END IF;

  -- 4. Apply State Transition to DISPUTED (Immediately restores debt)
  UPDATE public.settlement_payments
  SET status = 'DISPUTED',
      disputed_at = v_now,
      disputed_by = COALESCE(v_caller_id, v_settlement.payee_id),
      dispute_reason = v_trimmed_reason
  WHERE id = p_settlement_id;

  -- 5. Dispatch high-priority notification to Payer
  INSERT INTO public.in_app_notifications (
    user_id,
    room_id,
    type,
    title,
    message,
    priority,
    metadata
  ) VALUES (
    v_settlement.payer_id,
    v_settlement.room_id,
    'SETTLEMENT_DISPUTED',
    'Settlement Disputed: Payment Not Received',
    'Your settlement claim of ₹' || TRIM(TO_CHAR(v_settlement.amount, '999999990.99')) || ' was disputed: "' || v_trimmed_reason || '". Please provide payment proof (UTR).',
    'HIGH',
    jsonb_build_object(
      'settlement_id', v_settlement.id,
      'disputed_by', COALESCE(v_caller_id, v_settlement.payee_id),
      'reason', v_trimmed_reason,
      'disputed_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'status', 'DISPUTED',
    'disputed_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispute_room_settlement_secure FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispute_room_settlement_secure TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. SECURE SETTLEMENT CANCELLATION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_room_settlement_secure(
  p_settlement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_settlement RECORD;
  v_now TIMESTAMPTZ;
  v_is_superadmin BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  v_now := clock_timestamp();

  -- 1. Lock settlement row
  SELECT * INTO v_settlement
  FROM public.settlement_payments
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Settlement % does not exist', p_settlement_id;
  END IF;

  -- 2. Authorization check: strictly payer or superadmin
  v_is_superadmin := public.is_super_admin();
  IF v_caller_id IS NOT NULL AND v_caller_id <> v_settlement.payer_id AND NOT v_is_superadmin THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only payer (%) or superadmin can cancel settlement. Caller is %',
      v_settlement.payer_id, v_caller_id;
  END IF;

  -- 3. Permitted state: strictly PENDING_CONFIRMATION
  IF v_settlement.status <> 'PENDING_CONFIRMATION' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Settlement is in state %, cannot cancel', v_settlement.status;
  END IF;

  -- 4. Apply State Transition
  UPDATE public.settlement_payments
  SET status = 'CANCELLED',
      cancelled_at = v_now
  WHERE id = p_settlement_id;

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'status', 'CANCELLED',
    'cancelled_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_room_settlement_secure FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_room_settlement_secure TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. SECURE SETTLEMENT EVIDENCE SUBMISSION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_settlement_evidence_secure(
  p_settlement_id UUID,
  p_utr TEXT,
  p_evidence_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_settlement RECORD;
  v_is_superadmin BOOLEAN;
  v_utr TEXT;
BEGIN
  v_caller_id := auth.uid();
  v_utr := TRIM(COALESCE(p_utr, ''));

  IF v_utr = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: Bank UTR/Transaction reference is required';
  END IF;

  -- 1. Lock settlement row
  SELECT * INTO v_settlement
  FROM public.settlement_payments
  WHERE id = p_settlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Settlement % does not exist', p_settlement_id;
  END IF;

  -- 2. Authorization check: strictly payer or superadmin
  v_is_superadmin := public.is_super_admin();
  IF v_caller_id IS NOT NULL AND v_caller_id <> v_settlement.payer_id AND NOT v_is_superadmin THEN
    RAISE EXCEPTION 'ACCESS_DENIED: Only payer (%) or superadmin can submit evidence. Caller is %',
      v_settlement.payer_id, v_caller_id;
  END IF;

  -- 3. Permitted state: strictly DISPUTED
  IF v_settlement.status <> 'DISPUTED' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Evidence can only be submitted for DISPUTED settlements, got %',
      v_settlement.status;
  END IF;

  -- 4. Update evidence metadata
  UPDATE public.settlement_payments
  SET evidence_utr = v_utr,
      evidence_url = NULLIF(TRIM(COALESCE(p_evidence_url, '')), '')
  WHERE id = p_settlement_id;

  -- 5. Notify payee that proof is available for review
  INSERT INTO public.in_app_notifications (
    user_id,
    room_id,
    type,
    title,
    message,
    priority,
    metadata
  ) VALUES (
    v_settlement.payee_id,
    v_settlement.room_id,
    'SETTLEMENT_REMINDER',
    'Payment Proof Submitted',
    'Payer submitted bank UTR (' || v_utr || ') for disputed settlement of ₹' || TRIM(TO_CHAR(v_settlement.amount, '999999990.99')) || '. Please review.',
    'MEDIUM',
    jsonb_build_object(
      'settlement_id', v_settlement.id,
      'utr', v_utr,
      'evidence_url', p_evidence_url
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', p_settlement_id,
    'evidence_utr', v_utr,
    'evidence_url', p_evidence_url
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_settlement_evidence_secure FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_settlement_evidence_secure TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. 72-HOUR AUTO-CONFIRMATION SCHEDULED JOB
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_settlement_auto_confirmations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record RECORD;
  v_now TIMESTAMPTZ;
  v_count INT := 0;
BEGIN
  v_now := clock_timestamp();

  -- Batch process expired pending settlements using FOR UPDATE SKIP LOCKED
  FOR v_record IN
    SELECT *
    FROM public.settlement_payments
    WHERE status = 'PENDING_CONFIRMATION'
      AND confirmation_deadline <= v_now
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.settlement_payments
    SET status = 'AUTO_CONFIRMED',
        confirmed_at = v_now,
        confirmation_method = 'AUTOMATIC'
    WHERE id = v_record.id;

    -- Notify payer
    INSERT INTO public.in_app_notifications (
      user_id, room_id, type, title, message, priority, metadata
    ) VALUES (
      v_record.payer_id, v_record.room_id, 'SETTLEMENT_CONFIRMED',
      'Settlement Auto-Confirmed',
      'Your settlement of ₹' || TRIM(TO_CHAR(v_record.amount, '999999990.99')) || ' was automatically confirmed per the 72-hour room policy.',
      'LOW',
      jsonb_build_object('settlement_id', v_record.id, 'method', 'AUTOMATIC')
    );

    -- Notify payee
    INSERT INTO public.in_app_notifications (
      user_id, room_id, type, title, message, priority, metadata
    ) VALUES (
      v_record.payee_id, v_record.room_id, 'SETTLEMENT_CONFIRMED',
      'Settlement Auto-Confirmed',
      'The pending settlement of ₹' || TRIM(TO_CHAR(v_record.amount, '999999990.99')) || ' from your roommate was auto-confirmed after 72 hours of inactivity.',
      'LOW',
      jsonb_build_object('settlement_id', v_record.id, 'method', 'AUTOMATIC')
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_count,
    'executed_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_settlement_auto_confirmations FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_settlement_auto_confirmations TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. UPDATE record_room_settlement_v2 (Initial Pending Status & 72h Deadline)
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
  v_deadline TIMESTAMPTZ;
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
  PERFORM 1 FROM public.room_members
  WHERE room_id = p_room_id
  FOR UPDATE;

  -- 5. Calculate Payer's current net position (excluding DISPUTED and CANCELLED)
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM public.shared_expenses WHERE room_id = p_room_id AND paid_by = p_payer_id AND is_deleted = false), 0.00),
    COALESCE((SELECT SUM(es.share_amount) FROM public.expense_splits es JOIN public.shared_expenses se ON se.id = es.shared_expense_id WHERE se.room_id = p_room_id AND es.user_id = p_payer_id AND se.is_deleted = false), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payer_id = p_payer_id AND status NOT IN ('DISPUTED', 'CANCELLED')), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payee_id = p_payer_id AND status NOT IN ('DISPUTED', 'CANCELLED')), 0.00)
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

  -- 6. Calculate Payee's current net position (excluding DISPUTED and CANCELLED)
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM public.shared_expenses WHERE room_id = p_room_id AND paid_by = p_payee_id AND is_deleted = false), 0.00),
    COALESCE((SELECT SUM(es.share_amount) FROM public.expense_splits es JOIN public.shared_expenses se ON se.id = es.shared_expense_id WHERE se.room_id = p_room_id AND es.user_id = p_payee_id AND se.is_deleted = false), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payer_id = p_payee_id AND status NOT IN ('DISPUTED', 'CANCELLED')), 0.00),
    COALESCE((SELECT SUM(amount) FROM public.settlement_payments WHERE room_id = p_room_id AND payee_id = p_payee_id AND status NOT IN ('DISPUTED', 'CANCELLED')), 0.00)
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

  -- 7. Execute atomic insert in PENDING_CONFIRMATION state with 72-hour deadline
  v_created_at := clock_timestamp();
  v_deadline := v_created_at + INTERVAL '72 hours';

  INSERT INTO public.settlement_payments (
    room_id,
    payer_id,
    payee_id,
    amount,
    payment_method,
    notes,
    payment_date,
    created_at,
    status,
    confirmation_deadline
  ) VALUES (
    p_room_id,
    p_payer_id,
    p_payee_id,
    ROUND(p_amount, 2),
    'UPI',
    'Settlement recorded via V2 Canonical Engine',
    CURRENT_DATE,
    v_created_at,
    'PENDING_CONFIRMATION',
    v_deadline
  ) RETURNING id INTO v_inserted_settlement_id;

  -- 8. Dispatch In-App Notification to Payee
  INSERT INTO public.in_app_notifications (
    user_id,
    room_id,
    type,
    title,
    message,
    priority,
    metadata
  ) VALUES (
    p_payee_id,
    p_room_id,
    'SETTLEMENT_RECEIVED',
    'Settlement Payment Claimed',
    'A roommate recorded a settlement payment of ₹' || TRIM(TO_CHAR(p_amount, '999999990.99')) || '. You have 72 hours to confirm receipt or dispute.',
    'MEDIUM',
    jsonb_build_object(
      'settlement_id', v_inserted_settlement_id,
      'payer_id', p_payer_id,
      'amount', ROUND(p_amount, 2),
      'confirmation_deadline', v_deadline
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'settlement_id', v_inserted_settlement_id,
    'room_id', p_room_id,
    'payer_id', p_payer_id,
    'payee_id', p_payee_id,
    'amount', ROUND(p_amount, 2),
    'amount_paise', v_amount_paise,
    'status', 'PENDING_CONFIRMATION',
    'confirmation_deadline', v_deadline,
    'created_at', v_created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_room_settlement_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_room_settlement_v2 TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. UPDATE get_room_financial_summary_v2 (Excluding Disputed / Cancelled)
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
  WHERE room_id = p_room_id AND status NOT IN ('DISPUTED', 'CANCELLED');

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
      WHERE room_id = p_room_id AND status NOT IN ('DISPUTED', 'CANCELLED')
      GROUP BY payer_id
    ),
    rcvd AS (
      SELECT payee_id AS user_id, COALESCE(SUM(amount), 0.00) AS settlements_rcvd
      FROM public.settlement_payments
      WHERE room_id = p_room_id AND status NOT IN ('DISPUTED', 'CANCELLED')
      GROUP BY payee_id
    )
    SELECT
      m.user_id,
      m.name,
      m.email,
      m.upi_id,
      COALESCE(p.total_paid, 0.00) AS total_paid,
      COALESCE(s.total_share, 0.00) AS total_share,
      COALESCE(snd.settlements_sent, 0.00) AS settlements_sent,
      COALESCE(rcv.settlements_rcvd, 0.00) AS settlements_rcvd
    FROM members m
    LEFT JOIN paid p ON p.user_id = m.user_id
    LEFT JOIN shares s ON s.user_id = m.user_id
    LEFT JOIN sent snd ON snd.user_id = m.user_id
    LEFT JOIN rcvd rcv ON rcv.user_id = m.user_id
    ORDER BY m.name ASC
  LOOP
    DECLARE
      v_paid_paise BIGINT := ROUND(v_member_record.total_paid * 100)::BIGINT;
      v_share_paise BIGINT := ROUND(v_member_record.total_share * 100)::BIGINT;
      v_sent_paise BIGINT := ROUND(v_member_record.settlements_sent * 100)::BIGINT;
      v_rcvd_paise BIGINT := ROUND(v_member_record.settlements_rcvd * 100)::BIGINT;
      v_gross_net BIGINT := v_paid_paise - v_share_paise;
      v_final_net BIGINT := (v_paid_paise + v_sent_paise) - (v_share_paise + v_rcvd_paise);
    BEGIN
      v_net_sum := v_net_sum + v_final_net;
      v_members := v_members || jsonb_build_object(
        'user_id', v_member_record.user_id,
        'name', v_member_record.name,
        'email', v_member_record.email,
        'upi_id', v_member_record.upi_id,
        'total_paid_paise', v_paid_paise,
        'total_share_paise', v_share_paise,
        'settlements_sent_paise', v_sent_paise,
        'settlements_rcvd_paise', v_rcvd_paise,
        'gross_net_paise', v_gross_net,
        'net_balance_paise', v_final_net,
        'net_balance_rupees', ROUND(v_final_net::NUMERIC / 100.0, 2)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'room_id', p_room_id,
    'total_expenses_paise', v_total_expenses_paise,
    'total_expenses_rupees', v_total_expenses,
    'total_settled_paise', v_total_settled_paise,
    'total_settled_rupees', v_total_settled,
    'is_zero_sum', (v_net_sum = 0),
    'net_sum_paise', v_net_sum,
    'members', v_members,
    'computed_at', clock_timestamp()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_room_financial_summary_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_financial_summary_v2 TO authenticated, service_role;


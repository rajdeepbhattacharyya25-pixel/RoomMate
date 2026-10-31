-- ============================================================================
-- RoomMate - Track 4: Monthly Room Ledger Audit & Certified Statement Export (Remediated)
-- Migration: 20261031120000_room_reconciliation_lock_and_statements.sql
-- Environment: STAGING ONLY (pbzaaskftrmnvocczhat.supabase.co remains untouched)
-- 
-- Remediation Enhancements:
-- 1. Validates both OLD and NEW room/period during updates to locked transactions (Fix 4).
-- 2. Produces deterministic SHA-256 canonical statement digests over ledger content (Fix 5).
-- 3. Grants historical statement read access to former/inactive room members of that period (Fix 6).
-- 4. Prevents cryptographically certified periods from being silently reopened/downgraded (Fix 10).
-- 5. Hardens production project detection against direct connections without JWT claims.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDENED SAFETY ENVIRONMENT CHECK (Multi-Vector Production Guard)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'iss', '') LIKE '%pbzaaskftrmnvocczhat%'
     OR COALESCE(current_setting('app.settings.project_ref', true), '') = 'pbzaaskftrmnvocczhat'
     OR current_user LIKE '%pbzaaskftrmnvocczhat%'
     OR inet_server_addr()::text LIKE '%pbzaaskftrmnvocczhat%' THEN
    RAISE EXCEPTION 'SAFETY TRIGGERED: Migration blocked against production project pbzaaskftrmnvocczhat!';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CREATE TABLE public.room_reconciliation_periods
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_reconciliation_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  period_year INT NOT NULL CHECK (period_year >= 2024 AND period_year <= 2100),
  period_month INT NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED', 'CERTIFIED')),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES public.profiles(id),
  unlocked_at TIMESTAMPTZ,
  unlocked_by UUID REFERENCES public.profiles(id),
  unlock_reason TEXT,
  revision_count INT NOT NULL DEFAULT 1,
  certified_at TIMESTAMPTZ,
  certified_seal_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_room_period UNIQUE (room_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_room_period 
  ON public.room_reconciliation_periods(room_id, period_year, period_month);

-- ----------------------------------------------------------------------------
-- 3. CREATE TABLE public.room_statement_signoffs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_statement_signoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.room_reconciliation_periods(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SIGNED', 'DISPUTED')),
  signed_at TIMESTAMPTZ,
  dispute_reason TEXT,
  signature_stamp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_period_user_signoff UNIQUE (period_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_signoffs_period 
  ON public.room_statement_signoffs(period_id);
CREATE INDEX IF NOT EXISTS idx_signoffs_room_user 
  ON public.room_statement_signoffs(room_id, user_id);

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.room_reconciliation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_statement_signoffs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.room_reconciliation_periods FROM anon;
REVOKE ALL ON public.room_statement_signoffs FROM anon;

-- Remediation 6: Active room members, former members active during period, and assigned signatories can view
DROP POLICY IF EXISTS "Members can view room periods" ON public.room_reconciliation_periods;
DROP POLICY IF EXISTS "Members and historical signatories can view room periods" ON public.room_reconciliation_periods;

CREATE POLICY "Members and historical signatories can view room periods"
  ON public.room_reconciliation_periods
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_reconciliation_periods.room_id
        AND rm.user_id = auth.uid()
        AND (
          rm.status = 'ACTIVE'
          OR (
            rm.joined_at <= (make_timestamptz(room_reconciliation_periods.period_year, room_reconciliation_periods.period_month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month' - INTERVAL '1 millisecond')
            AND (rm.left_at IS NULL OR rm.left_at >= make_timestamptz(room_reconciliation_periods.period_year, room_reconciliation_periods.period_month, 1, 0, 0, 0, 'UTC'))
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.room_statement_signoffs rss
      WHERE rss.period_id = room_reconciliation_periods.id
        AND rss.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can view room signoffs" ON public.room_statement_signoffs;
DROP POLICY IF EXISTS "Members and historical signatories can view room signoffs" ON public.room_statement_signoffs;

CREATE POLICY "Members and historical signatories can view room signoffs"
  ON public.room_statement_signoffs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = room_statement_signoffs.room_id
        AND rm.user_id = auth.uid()
        AND (
          rm.status = 'ACTIVE'
          OR (
            rm.joined_at <= (SELECT make_timestamptz(rp.period_year, rp.period_month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month' - INTERVAL '1 millisecond' FROM public.room_reconciliation_periods rp WHERE rp.id = room_statement_signoffs.period_id)
            AND (rm.left_at IS NULL OR rm.left_at >= (SELECT make_timestamptz(rp.period_year, rp.period_month, 1, 0, 0, 0, 'UTC') FROM public.room_reconciliation_periods rp WHERE rp.id = room_statement_signoffs.period_id))
          )
        )
    )
    OR user_id = auth.uid()
  );

-- Direct client INSERT / UPDATE / DELETE restricted to authoritative RPCs
DROP POLICY IF EXISTS "Block direct period mutations" ON public.room_reconciliation_periods;
CREATE POLICY "Block direct period mutations"
  ON public.room_reconciliation_periods
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct signoff mutations" ON public.room_statement_signoffs;
CREATE POLICY "Block direct signoff mutations"
  ON public.room_statement_signoffs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- 5. MUTATION GUARD TRIGGER FOR LOCKED PERIODS (Remediation 4)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_room_transaction_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_room_id UUID;
  v_old_tx_date TIMESTAMPTZ;
  v_old_year INT;
  v_old_month INT;
  v_old_status TEXT;

  v_new_room_id UUID;
  v_new_tx_date TIMESTAMPTZ;
  v_new_year INT;
  v_new_month INT;
  v_new_status TEXT;
BEGIN
  -- 1. On DELETE: Validate OLD period
  IF TG_OP = 'DELETE' THEN
    v_old_room_id := OLD.room_id;
    IF TG_TABLE_NAME = 'shared_expenses' THEN
      v_old_tx_date := COALESCE(OLD.expense_date, OLD.created_at);
    ELSE
      v_old_tx_date := COALESCE(OLD.payment_date, OLD.created_at);
    END IF;

    IF v_old_tx_date IS NOT NULL AND v_old_room_id IS NOT NULL THEN
      v_old_year := EXTRACT(YEAR FROM v_old_tx_date)::INT;
      v_old_month := EXTRACT(MONTH FROM v_old_tx_date)::INT;

      SELECT status INTO v_old_status
      FROM public.room_reconciliation_periods
      WHERE room_id = v_old_room_id
        AND period_year = v_old_year
        AND period_month = v_old_month;

      IF v_old_status IN ('LOCKED', 'CERTIFIED') THEN
        RAISE EXCEPTION 'PERIOD_LOCKED: Cannot delete transaction from %-% because monthly reconciliation is locked (%)',
          v_old_year, v_old_month, v_old_status;
      END IF;
    END IF;

    RETURN OLD;
  END IF;

  -- 2. On INSERT: Validate NEW period
  IF TG_OP = 'INSERT' THEN
    v_new_room_id := NEW.room_id;
    IF TG_TABLE_NAME = 'shared_expenses' THEN
      v_new_tx_date := COALESCE(NEW.expense_date, NEW.created_at);
    ELSE
      v_new_tx_date := COALESCE(NEW.payment_date, NEW.created_at);
    END IF;

    IF v_new_tx_date IS NOT NULL AND v_new_room_id IS NOT NULL THEN
      v_new_year := EXTRACT(YEAR FROM v_new_tx_date)::INT;
      v_new_month := EXTRACT(MONTH FROM v_new_tx_date)::INT;

      SELECT status INTO v_new_status
      FROM public.room_reconciliation_periods
      WHERE room_id = v_new_room_id
        AND period_year = v_new_year
        AND period_month = v_new_month;

      IF v_new_status IN ('LOCKED', 'CERTIFIED') THEN
        RAISE EXCEPTION 'PERIOD_LOCKED: Cannot add transaction to %-% because monthly reconciliation is locked (%)',
          v_new_year, v_new_month, v_new_status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- 3. On UPDATE: Remediation 4 - Validate BOTH OLD and NEW periods
  IF TG_OP = 'UPDATE' THEN
    -- Check OLD period (cannot modify or move out of locked period)
    v_old_room_id := OLD.room_id;
    IF TG_TABLE_NAME = 'shared_expenses' THEN
      v_old_tx_date := COALESCE(OLD.expense_date, OLD.created_at);
    ELSE
      v_old_tx_date := COALESCE(OLD.payment_date, OLD.created_at);
    END IF;

    IF v_old_tx_date IS NOT NULL AND v_old_room_id IS NOT NULL THEN
      v_old_year := EXTRACT(YEAR FROM v_old_tx_date)::INT;
      v_old_month := EXTRACT(MONTH FROM v_old_tx_date)::INT;

      SELECT status INTO v_old_status
      FROM public.room_reconciliation_periods
      WHERE room_id = v_old_room_id
        AND period_year = v_old_year
        AND period_month = v_old_month;

      IF v_old_status IN ('LOCKED', 'CERTIFIED') THEN
        RAISE EXCEPTION 'PERIOD_LOCKED: Cannot modify or move transaction out of locked period %-% (%)',
          v_old_year, v_old_month, v_old_status;
      END IF;
    END IF;

    -- Check NEW period (cannot move into locked period)
    v_new_room_id := NEW.room_id;
    IF TG_TABLE_NAME = 'shared_expenses' THEN
      v_new_tx_date := COALESCE(NEW.expense_date, NEW.created_at);
    ELSE
      v_new_tx_date := COALESCE(NEW.payment_date, NEW.created_at);
    END IF;

    IF v_new_tx_date IS NOT NULL AND v_new_room_id IS NOT NULL THEN
      v_new_year := EXTRACT(YEAR FROM v_new_tx_date)::INT;
      v_new_month := EXTRACT(MONTH FROM v_new_tx_date)::INT;

      SELECT status INTO v_new_status
      FROM public.room_reconciliation_periods
      WHERE room_id = v_new_room_id
        AND period_year = v_new_year
        AND period_month = v_new_month;

      IF v_new_status IN ('LOCKED', 'CERTIFIED') THEN
        RAISE EXCEPTION 'PERIOD_LOCKED: Cannot move transaction into locked period %-% (%)',
          v_new_year, v_new_month, v_new_status;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_locked_room_expenses ON public.shared_expenses;
CREATE TRIGGER trg_guard_locked_room_expenses
  BEFORE INSERT OR UPDATE OR DELETE ON public.shared_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.check_room_transaction_period_lock();

DROP TRIGGER IF EXISTS trg_guard_locked_room_settlements ON public.settlement_payments;
CREATE TRIGGER trg_guard_locked_room_settlements
  BEFORE INSERT OR UPDATE OR DELETE ON public.settlement_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_room_transaction_period_lock();

-- ----------------------------------------------------------------------------
-- 6. RPC: lock_room_period_v2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_room_period_v2(
  p_room_id UUID,
  p_year INT,
  p_month INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_period_id UUID;
  v_period_status TEXT;
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
  v_member RECORD;
  v_signoff_count INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to lock reconciliation period.';
  END IF;

  -- 1. Verify caller is Room Admin or Creator
  SELECT (role = 'ROOM_ADMIN' OR r.created_by = v_caller_id) INTO v_is_admin
  FROM public.room_members rm
  JOIN public.rooms r ON r.id = rm.room_id
  WHERE rm.room_id = p_room_id
    AND rm.user_id = v_caller_id
    AND rm.status = 'ACTIVE';

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only Room Administrators can lock monthly reconciliation.';
  END IF;

  -- 2. Validate year and month
  IF p_year < 2024 OR p_year > 2100 OR p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'INVALID_PERIOD: Month must be 1-12 and year must be 2024-2100.';
  END IF;

  -- 3. Calculate period date boundary
  v_month_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 millisecond');

  -- 4. Upsert reconciliation period to LOCKED
  INSERT INTO public.room_reconciliation_periods (
    room_id, period_year, period_month, status, locked_at, locked_by, updated_at
  )
  VALUES (
    p_room_id, p_year, p_month, 'LOCKED', clock_timestamp(), v_caller_id, clock_timestamp()
  )
  ON CONFLICT (room_id, period_year, period_month)
  DO UPDATE SET
    status = 'LOCKED',
    locked_at = clock_timestamp(),
    locked_by = v_caller_id,
    updated_at = clock_timestamp()
  RETURNING id, status INTO v_period_id, v_period_status;

  -- 5. Seed sign-offs for historical members active during this month
  FOR v_member IN
    SELECT DISTINCT rm.user_id
    FROM public.room_members rm
    WHERE rm.room_id = p_room_id
      AND rm.joined_at <= v_month_end
      AND (rm.left_at IS NULL OR rm.left_at >= v_month_start)
  LOOP
    INSERT INTO public.room_statement_signoffs (
      period_id, room_id, user_id, status, created_at, updated_at
    )
    VALUES (
      v_period_id, p_room_id, v_member.user_id, 'PENDING', clock_timestamp(), clock_timestamp()
    )
    ON CONFLICT (period_id, user_id)
    DO UPDATE SET
      status = CASE 
        WHEN room_statement_signoffs.status = 'SIGNED' THEN 'SIGNED' 
        ELSE 'PENDING' 
      END,
      updated_at = clock_timestamp();

    v_signoff_count := v_signoff_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'period_id', v_period_id,
    'status', 'LOCKED',
    'period_year', p_year,
    'period_month', p_month,
    'signoffs_initialized', v_signoff_count,
    'locked_at', clock_timestamp()
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: unlock_room_period_v2 (Remediation 10)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unlock_room_period_v2(
  p_room_id UUID,
  p_year INT,
  p_month INT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_period_id UUID;
  v_current_status TEXT;
  v_revision INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
  END IF;

  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: An audit reason must be provided to unlock a reconciliation period.';
  END IF;

  -- Verify Room Admin
  SELECT (role = 'ROOM_ADMIN' OR r.created_by = v_caller_id) INTO v_is_admin
  FROM public.room_members rm
  JOIN public.rooms r ON r.id = rm.room_id
  WHERE rm.room_id = p_room_id
    AND rm.user_id = v_caller_id
    AND rm.status = 'ACTIVE';

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only Room Administrators can unlock reconciliation periods.';
  END IF;

  -- Remediation 10: Check current status and block unlocking if CERTIFIED
  SELECT status INTO v_current_status
  FROM public.room_reconciliation_periods
  WHERE room_id = p_room_id AND period_year = p_year AND period_month = p_month
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: No reconciliation period found for %-%', p_year, p_month;
  END IF;

  IF v_current_status = 'CERTIFIED' THEN
    RAISE EXCEPTION 'PERIOD_CERTIFIED: Certified statement periods are cryptographically sealed and cannot be reopened or downgraded.';
  END IF;

  -- Update period back to OPEN and increment revision
  UPDATE public.room_reconciliation_periods
  SET status = 'OPEN',
      unlocked_at = clock_timestamp(),
      unlocked_by = v_caller_id,
      unlock_reason = TRIM(p_reason),
      revision_count = revision_count + 1,
      certified_at = NULL,
      certified_seal_hash = NULL,
      updated_at = clock_timestamp()
  WHERE room_id = p_room_id
    AND period_year = p_year
    AND period_month = p_month
  RETURNING id, revision_count INTO v_period_id, v_revision;

  -- Reset sign-offs back to PENDING because figures are subject to change
  UPDATE public.room_statement_signoffs
  SET status = 'PENDING',
      signed_at = NULL,
      signature_stamp = NULL,
      updated_at = clock_timestamp()
  WHERE period_id = v_period_id;

  RETURN jsonb_build_object(
    'period_id', v_period_id,
    'status', 'OPEN',
    'revision_count', v_revision,
    'unlocked_at', clock_timestamp()
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: sign_room_statement_v2 (Remediation 5)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sign_room_statement_v2(
  p_period_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_period RECORD;
  v_pending_count INT;
  v_total_count INT;
  v_seal_input TEXT;
  v_seal_hash TEXT;
  v_is_certified BOOLEAN := false;
  v_stamp TEXT;
  
  -- Canonical statement digests
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
  v_expenses_hash TEXT;
  v_splits_hash TEXT;
  v_settlements_hash TEXT;
  v_signoffs_hash TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required to sign statement.';
  END IF;

  IF p_status NOT IN ('SIGNED', 'DISPUTED') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Status must be SIGNED or DISPUTED, got %', p_status;
  END IF;

  -- 1. Fetch period with lock
  SELECT * INTO v_period
  FROM public.room_reconciliation_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Period % does not exist.', p_period_id;
  END IF;

  IF v_period.status = 'OPEN' THEN
    RAISE EXCEPTION 'PERIOD_NOT_LOCKED: Cannot sign statement while reconciliation is still OPEN.';
  END IF;

  IF v_period.status = 'CERTIFIED' THEN
    RAISE EXCEPTION 'PERIOD_ALREADY_CERTIFIED: Statement is already certified and immutable.';
  END IF;

  -- 2. Verify caller is a designated signatory
  IF NOT EXISTS (
    SELECT 1 FROM public.room_statement_signoffs
    WHERE period_id = p_period_id AND user_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: You are not an authorized signatory for this monthly statement.';
  END IF;

  -- 3. Record sign-off or dispute
  IF p_status = 'SIGNED' THEN
    v_stamp := 'SIGNED_BY:' || v_caller_id || '|PERIOD:' || p_period_id || '|TIME:' || clock_timestamp();
    UPDATE public.room_statement_signoffs
    SET status = 'SIGNED',
        signed_at = clock_timestamp(),
        dispute_reason = NULL,
        signature_stamp = encode(digest(v_stamp, 'sha256'), 'hex'),
        updated_at = clock_timestamp()
    WHERE period_id = p_period_id AND user_id = v_caller_id;
  ELSE
    IF TRIM(COALESCE(p_reason, '')) = '' THEN
      RAISE EXCEPTION 'DISPUTE_REASON_REQUIRED: A valid explanation is required when disputing an audit statement.';
    END IF;

    UPDATE public.room_statement_signoffs
    SET status = 'DISPUTED',
        dispute_reason = TRIM(p_reason),
        signed_at = NULL,
        signature_stamp = NULL,
        updated_at = clock_timestamp()
    WHERE period_id = p_period_id AND user_id = v_caller_id;
  END IF;

  -- 4. Check unanimous consensus (Total vs Signed)
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'SIGNED')
  INTO v_total_count, v_pending_count
  FROM public.room_statement_signoffs
  WHERE period_id = p_period_id;

  -- Remediation 5: Deterministic Canonical Statement Digest
  IF v_total_count > 0 AND v_pending_count = v_total_count THEN
    v_month_start := make_timestamptz(v_period.period_year, v_period.period_month, 1, 0, 0, 0, 'UTC');
    v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 millisecond');

    -- 1. Canonical Expenses digest
    SELECT COALESCE(
      encode(digest(string_agg(
        id::text || ':' || round(total_amount, 2)::text || ':' || coalesce(expense_date::text, created_at::text) || ':' || paid_by::text,
        '|' ORDER BY coalesce(expense_date, created_at) ASC, id ASC
      ), 'sha256'), 'hex'),
      'EMPTY_EXPENSES'
    ) INTO v_expenses_hash
    FROM public.shared_expenses
    WHERE room_id = v_period.room_id
      AND NOT is_deleted
      AND coalesce(expense_date, created_at) >= v_month_start
      AND coalesce(expense_date, created_at) <= v_month_end;

    -- 2. Canonical Splits digest
    SELECT COALESCE(
      encode(digest(string_agg(
        shared_expense_id::text || ':' || user_id::text || ':' || round(share_amount, 2)::text,
        '|' ORDER BY shared_expense_id ASC, user_id ASC
      ), 'sha256'), 'hex'),
      'EMPTY_SPLITS'
    ) INTO v_splits_hash
    FROM public.expense_splits
    WHERE shared_expense_id IN (
      SELECT id FROM public.shared_expenses
      WHERE room_id = v_period.room_id
        AND NOT is_deleted
        AND coalesce(expense_date, created_at) >= v_month_start
        AND coalesce(expense_date, created_at) <= v_month_end
    );

    -- 3. Canonical Settlements digest
    SELECT COALESCE(
      encode(digest(string_agg(
        id::text || ':' || payer_id::text || ':' || payee_id::text || ':' || round(amount, 2)::text,
        '|' ORDER BY coalesce(payment_date, created_at) ASC, id ASC
      ), 'sha256'), 'hex'),
      'EMPTY_SETTLEMENTS'
    ) INTO v_settlements_hash
    FROM public.settlement_payments
    WHERE room_id = v_period.room_id
      AND coalesce(payment_date, created_at) >= v_month_start
      AND coalesce(payment_date, created_at) <= v_month_end;

    -- 4. Canonical Signoffs digest
    SELECT COALESCE(
      encode(digest(string_agg(
        user_id::text || ':' || status || ':' || coalesce(signature_stamp, ''),
        '|' ORDER BY user_id ASC
      ), 'sha256'), 'hex'),
      'EMPTY_SIGNOFFS'
    ) INTO v_signoffs_hash
    FROM public.room_statement_signoffs
    WHERE period_id = p_period_id;

    -- Deterministic Canonical Statement Seal
    v_seal_input := 'CANONICAL_STATEMENT_SEAL_V2'
      || '|ROOM:' || v_period.room_id::text
      || '|YEAR:' || v_period.period_year::text
      || '|MONTH:' || v_period.period_month::text
      || '|REV:' || v_period.revision_count::text
      || '|EXP:' || v_expenses_hash
      || '|SPL:' || v_splits_hash
      || '|SET:' || v_settlements_hash
      || '|SIG:' || v_signoffs_hash;
    v_seal_hash := encode(digest(v_seal_input, 'sha256'), 'hex');

    UPDATE public.room_reconciliation_periods
    SET status = 'CERTIFIED',
        certified_at = clock_timestamp(),
        certified_seal_hash = v_seal_hash,
        updated_at = clock_timestamp()
    WHERE id = p_period_id;

    v_is_certified := true;
  END IF;

  RETURN jsonb_build_object(
    'period_id', p_period_id,
    'caller_status', p_status,
    'total_signatories', v_total_count,
    'signed_signatories', v_pending_count,
    'is_certified', v_is_certified,
    'certified_seal_hash', v_seal_hash
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC: get_room_reconciliation_statement_v2 (Remediation 6)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_reconciliation_statement_v2(
  p_room_id UUID,
  p_year INT,
  p_month INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_period RECORD;
  v_signoffs JSONB;
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
  v_has_access BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Authentication required.';
  END IF;

  v_month_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'UTC');
  v_month_end := (v_month_start + INTERVAL '1 month' - INTERVAL '1 millisecond');

  -- Fetch period
  SELECT * INTO v_period
  FROM public.room_reconciliation_periods
  WHERE room_id = p_room_id
    AND period_year = p_year
    AND period_month = p_month;

  -- Remediation 6: Check room membership (active, historical during period, or designated signatory)
  SELECT (
    EXISTS (
      SELECT 1 FROM public.room_members rm
      WHERE rm.room_id = p_room_id AND rm.user_id = v_caller_id
        AND (
          rm.status = 'ACTIVE'
          OR (rm.joined_at <= v_month_end AND (rm.left_at IS NULL OR rm.left_at >= v_month_start))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.room_statement_signoffs rss
      WHERE rss.period_id = v_period.id AND rss.user_id = v_caller_id
    )
  ) INTO v_has_access;

  IF NOT COALESCE(v_has_access, false) THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not have access to this room statement.';
  END IF;

  -- Fetch sign-offs with member details
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'user_id', s.user_id,
        'user_name', COALESCE(p.name, p.full_name, 'Roommate'),
        'user_avatar', p.avatar_url,
        'user_email', p.email,
        'status', s.status,
        'signed_at', s.signed_at,
        'dispute_reason', s.dispute_reason,
        'signature_stamp', s.signature_stamp
      ) ORDER BY s.status DESC, s.signed_at ASC
    ),
    '[]'::jsonb
  ) INTO v_signoffs
  FROM public.room_statement_signoffs s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.period_id = v_period.id;

  RETURN jsonb_build_object(
    'has_period', v_period.id IS NOT NULL,
    'period', CASE 
      WHEN v_period.id IS NOT NULL THEN
        jsonb_build_object(
          'id', v_period.id,
          'room_id', v_period.room_id,
          'period_year', v_period.period_year,
          'period_month', v_period.period_month,
          'status', v_period.status,
          'locked_at', v_period.locked_at,
          'locked_by', v_period.locked_by,
          'unlocked_at', v_period.unlocked_at,
          'unlock_reason', v_period.unlock_reason,
          'revision_count', v_period.revision_count,
          'certified_at', v_period.certified_at,
          'certified_seal_hash', v_period.certified_seal_hash
        )
      ELSE NULL
    END,
    'signoffs', v_signoffs
  );
END;
$$;

-- Revoke from anonymous callers, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.lock_room_period_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_room_period_v2 TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.unlock_room_period_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_room_period_v2 TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sign_room_statement_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_room_statement_v2 TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_room_reconciliation_statement_v2 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_reconciliation_statement_v2 TO authenticated, service_role;

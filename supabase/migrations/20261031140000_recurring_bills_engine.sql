-- ============================================================================
-- RoomMate - Recurring Bills & Scheduled Expense Engine
-- Migration: 20261031140000_recurring_bills_engine.sql
-- Environment: ISOLATED STAGING ONLY (pbzaaskftrmnvocczhat remains untouched)
-- 
-- Summary:
-- 1. Creates public.recurring_expense_rules with owner-only & room-member RLS.
-- 2. Creates public.recurring_expense_executions with UNIQUE(rule_id, cycle_date)
--    to mathematically guarantee zero duplicate executions.
-- 3. Implements secure RPC execute_recurring_cycle_secure with strict row locking.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SAFETY ENVIRONMENT CHECK (Protects Production Project)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF current_database() = 'postgres' AND COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'iss', '') LIKE '%pbzaaskftrmnvocczhat%' THEN
    RAISE EXCEPTION 'SAFETY TRIGGERED: Migration blocked against production project pbzaaskftrmnvocczhat!';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. ENUM TYPES
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurring_frequency_type') THEN
    CREATE TYPE public.recurring_frequency_type AS ENUM ('MONTHLY', 'WEEKLY', 'CUSTOM_INTERVAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurring_rule_status') THEN
    CREATE TYPE public.recurring_rule_status AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurring_scope_type') THEN
    CREATE TYPE public.recurring_scope_type AS ENUM ('PERSONAL', 'SHARED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurring_execution_status') THEN
    CREATE TYPE public.recurring_execution_status AS ENUM (
      'PENDING_REVIEW',
      'AUTO_LOGGED',
      'MANUALLY_CONFIRMED',
      'SKIPPED'
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. TABLE: recurring_expense_rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_expense_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    scope public.recurring_scope_type NOT NULL DEFAULT 'PERSONAL',
    
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    notes TEXT,
    
    -- Frequency Definition
    frequency public.recurring_frequency_type NOT NULL DEFAULT 'MONTHLY',
    day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 31),
    is_last_day_of_month BOOLEAN NOT NULL DEFAULT false,
    day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
    interval_count INT CHECK (interval_count > 0),
    interval_unit TEXT CHECK (interval_unit IN ('DAYS', 'WEEKS', 'MONTHS')),
    
    -- Schedule Boundaries
    start_date DATE NOT NULL,
    end_date DATE,
    next_execution_date DATE NOT NULL,
    last_executed_at TIMESTAMPTZ,
    
    -- Execution Policy
    auto_log BOOLEAN NOT NULL DEFAULT false,
    status public.recurring_rule_status NOT NULL DEFAULT 'ACTIVE',
    
    -- Shared Room Split Configuration
    split_method TEXT CHECK (split_method IS NULL OR split_method IN ('EQUAL', 'EXACT', 'PERCENTAGE', 'SHARES')),
    split_participant_ids UUID[] DEFAULT '{}',
    custom_split_values JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recurring_rules_user_scope 
  ON public.recurring_expense_rules (user_id, scope, status);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_due_scan 
  ON public.recurring_expense_rules (status, next_execution_date);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_room 
  ON public.recurring_expense_rules (room_id) WHERE room_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. TABLE: recurring_expense_executions (Idempotency Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_expense_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES public.recurring_expense_rules(id) ON DELETE CASCADE,
    cycle_date DATE NOT NULL,
    
    status public.recurring_execution_status NOT NULL DEFAULT 'PENDING_REVIEW',
    amount NUMERIC(12, 2) NOT NULL,
    
    generated_personal_expense_id UUID REFERENCES public.personal_expenses(id) ON DELETE SET NULL,
    generated_shared_expense_id UUID REFERENCES public.shared_expenses(id) ON DELETE SET NULL,
    
    executed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Strict Idempotency: Exactly one execution record per rule per cycle date
    CONSTRAINT uq_recurring_rule_cycle_date UNIQUE (rule_id, cycle_date)
);

CREATE INDEX IF NOT EXISTS idx_recurring_executions_rule_status 
  ON public.recurring_expense_executions (rule_id, status);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.recurring_expense_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expense_executions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.recurring_expense_rules FROM anon;
REVOKE ALL ON public.recurring_expense_executions FROM anon;

-- Recurring Rules: Personal Rules (100% owner-only isolation)
CREATE POLICY "recurring_rules_personal_select"
ON public.recurring_expense_rules FOR SELECT
TO authenticated
USING (
  (scope = 'PERSONAL' AND user_id = auth.uid()) OR
  (scope = 'SHARED' AND room_id IS NOT NULL AND is_room_member(room_id, auth.uid()))
);

CREATE POLICY "recurring_rules_personal_insert"
ON public.recurring_expense_rules FOR INSERT
TO authenticated
WITH CHECK (
  (scope = 'PERSONAL' AND user_id = auth.uid() AND amount > 0) OR
  (scope = 'SHARED' AND room_id IS NOT NULL AND is_room_member(room_id, auth.uid()) AND amount > 0)
);

CREATE POLICY "recurring_rules_personal_update"
ON public.recurring_expense_rules FOR UPDATE
TO authenticated
USING (
  (scope = 'PERSONAL' AND user_id = auth.uid()) OR
  (scope = 'SHARED' AND room_id IS NOT NULL AND (user_id = auth.uid() OR is_room_admin(room_id, auth.uid())))
);

CREATE POLICY "recurring_rules_personal_delete"
ON public.recurring_expense_rules FOR DELETE
TO authenticated
USING (
  (scope = 'PERSONAL' AND user_id = auth.uid()) OR
  (scope = 'SHARED' AND room_id IS NOT NULL AND (user_id = auth.uid() OR is_room_admin(room_id, auth.uid())))
);

-- Executions Table Policies
CREATE POLICY "recurring_executions_select"
ON public.recurring_expense_executions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id
      AND (
        (r.scope = 'PERSONAL' AND r.user_id = auth.uid()) OR
        (r.scope = 'SHARED' AND r.room_id IS NOT NULL AND is_room_member(r.room_id, auth.uid()))
      )
  )
);

CREATE POLICY "recurring_executions_insert"
ON public.recurring_expense_executions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id
      AND (
        (r.scope = 'PERSONAL' AND r.user_id = auth.uid()) OR
        (r.scope = 'SHARED' AND r.room_id IS NOT NULL AND is_room_member(r.room_id, auth.uid()))
      )
  )
);

CREATE POLICY "recurring_executions_update"
ON public.recurring_expense_executions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = rule_id
      AND (
        (r.scope = 'PERSONAL' AND r.user_id = auth.uid()) OR
        (r.scope = 'SHARED' AND r.room_id IS NOT NULL AND is_room_member(r.room_id, auth.uid()))
      )
  )
);

-- ----------------------------------------------------------------------------
-- 6. SECURE IDEMPOTENT EXECUTION RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_recurring_cycle_secure(
    p_rule_id UUID,
    p_cycle_date DATE,
    p_confirmed_amount NUMERIC DEFAULT NULL,
    p_action TEXT DEFAULT 'CONFIRM_LOG' -- 'CONFIRM_LOG' | 'AUTO_LOG' | 'SKIP'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_rule RECORD;
    v_existing_exec RECORD;
    v_final_amount NUMERIC(12, 2);
    v_generated_personal_id UUID := NULL;
    v_generated_shared_id UUID := NULL;
    v_exec_id UUID;
    v_exec_status public.recurring_execution_status;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: User must be signed in to execute recurring bills';
    END IF;

    -- 1. Fetch & lock rule row
    SELECT * INTO v_rule
    FROM public.recurring_expense_rules
    WHERE id = p_rule_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Recurring rule % does not exist', p_rule_id;
    END IF;

    -- 2. Authorization Verification
    IF v_rule.scope = 'PERSONAL' THEN
        IF v_rule.user_id <> v_caller_id THEN
            RAISE EXCEPTION 'FORBIDDEN: You do not own this personal recurring rule';
        END IF;
    ELSIF v_rule.scope = 'SHARED' THEN
        IF NOT is_room_member(v_rule.room_id, v_caller_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: You are not an active member of room %', v_rule.room_id;
        END IF;
    END IF;

    -- 3. Idempotency Check: Verify if cycle date was already processed
    SELECT * INTO v_existing_exec
    FROM public.recurring_expense_executions
    WHERE rule_id = p_rule_id AND cycle_date = p_cycle_date;

    IF FOUND AND v_existing_exec.status IN ('AUTO_LOGGED', 'MANUALLY_CONFIRMED', 'SKIPPED') THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'ALREADY_PROCESSED',
            'execution_id', v_existing_exec.id,
            'cycle_date', p_cycle_date,
            'status', v_existing_exec.status
        );
    END IF;

    -- Determine amount
    v_final_amount := COALESCE(p_confirmed_amount, v_rule.amount);
    IF v_final_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Recurring expense amount must be greater than zero';
    END IF;

    -- 4. Process Action
    IF p_action = 'SKIP' THEN
        v_exec_status := 'SKIPPED';
    ELSIF p_action = 'AUTO_LOG' THEN
        v_exec_status := 'AUTO_LOGGED';
    ELSE
        v_exec_status := 'MANUALLY_CONFIRMED';
    END IF;

    -- 5. Insert Expense Entry (if not skipped)
    IF v_exec_status IN ('AUTO_LOGGED', 'MANUALLY_CONFIRMED') THEN
        IF v_rule.scope = 'PERSONAL' THEN
            INSERT INTO public.personal_expenses (
                user_id,
                title,
                amount,
                category,
                notes,
                expense_date
            ) VALUES (
                v_caller_id,
                v_rule.title,
                v_final_amount,
                v_rule.category,
                COALESCE(v_rule.notes, '') || ' (Auto-scheduled on ' || p_cycle_date::text || ')',
                p_cycle_date
            ) RETURNING id INTO v_generated_personal_id;
        ELSIF v_rule.scope = 'SHARED' THEN
            -- In shared mode, creates shared_expenses entry
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
                v_rule.room_id,
                v_caller_id,
                v_rule.user_id,
                v_rule.title,
                v_final_amount,
                v_rule.category,
                COALESCE(v_rule.split_method, 'EQUAL'),
                COALESCE(v_rule.notes, '') || ' (Recurring flat bill for ' || p_cycle_date::text || ')',
                p_cycle_date
            ) RETURNING id INTO v_generated_shared_id;
        END IF;
    END IF;

    -- 6. Upsert Execution Record
    INSERT INTO public.recurring_expense_executions (
        rule_id,
        cycle_date,
        status,
        amount,
        generated_personal_expense_id,
        generated_shared_expense_id,
        executed_at,
        reviewed_by
    ) VALUES (
        p_rule_id,
        p_cycle_date,
        v_exec_status,
        v_final_amount,
        v_generated_personal_id,
        v_generated_shared_id,
        now(),
        v_caller_id
    )
    ON CONFLICT (rule_id, cycle_date) DO UPDATE
    SET status = EXCLUDED.status,
        amount = EXCLUDED.amount,
        generated_personal_expense_id = EXCLUDED.generated_personal_expense_id,
        generated_shared_expense_id = EXCLUDED.generated_shared_expense_id,
        executed_at = EXCLUDED.executed_at,
        reviewed_by = EXCLUDED.reviewed_by
    RETURNING id INTO v_exec_id;

    -- 7. Update Rule metadata
    UPDATE public.recurring_expense_rules
    SET last_executed_at = now(),
        updated_at = now()
    WHERE id = p_rule_id;

    RETURN jsonb_build_object(
        'success', true,
        'execution_id', v_exec_id,
        'status', v_exec_status,
        'generated_personal_id', v_generated_personal_id,
        'generated_shared_id', v_generated_shared_id,
        'amount', v_final_amount
    );
END;
$$;

-- Revoke from anonymous callers, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.execute_recurring_cycle_secure FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_recurring_cycle_secure TO authenticated, service_role;

-- ============================================================================
-- RoomMate - Recurring Bills & Scheduled Expense Engine (Remediated)
-- Migration: 20261031140000_recurring_bills_engine.sql
-- Environment: ISOLATED STAGING ONLY (pbzaaskftrmnvocczhat remains untouched)
-- 
-- Remediation Enhancements:
-- 1. Enforces user_id = auth.uid() on rule insert across both PERSONAL and SHARED scopes.
-- 2. Strictly validates designated payer status in room at execution time.
-- 3. Hard-checks auto_log = true before permitting AUTO_LOG action in RPC.
-- 4. Revokes direct INSERT/UPDATE/DELETE on recurring_expense_executions (RPC-only writes).
-- 5. Validates rule ACTIVE status, cycle dates, and schedule boundaries server-side.
-- 6. Generates canonical expense_splits with integer-paise reconciliation for shared rules.
-- 7. Preserves execution audit history via ON DELETE SET NULL and rule snapshot fields.
-- 8. Hardens production project detection against direct connections without JWT claims.
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
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 1000000.00),
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
    is_archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    
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
  ON public.recurring_expense_rules (status, next_execution_date) WHERE NOT is_archived;

CREATE INDEX IF NOT EXISTS idx_recurring_rules_room 
  ON public.recurring_expense_rules (room_id) WHERE room_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. TABLE: recurring_expense_executions (Idempotency & Audit Ledger)
-- ----------------------------------------------------------------------------
-- Remediation 9: Use ON DELETE SET NULL and snapshot fields to preserve audit history
CREATE TABLE IF NOT EXISTS public.recurring_expense_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES public.recurring_expense_rules(id) ON DELETE SET NULL,
    rule_title TEXT,
    rule_scope public.recurring_scope_type,
    rule_category TEXT,
    
    cycle_date DATE NOT NULL,
    status public.recurring_execution_status NOT NULL DEFAULT 'PENDING_REVIEW',
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    
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

-- Recurring Rules: Owner & Room Member Visibility
DROP POLICY IF EXISTS "recurring_rules_personal_select" ON public.recurring_expense_rules;
CREATE POLICY "recurring_rules_personal_select"
ON public.recurring_expense_rules FOR SELECT
TO authenticated
USING (
  (scope = 'PERSONAL' AND user_id = auth.uid()) OR
  (scope = 'SHARED' AND room_id IS NOT NULL AND is_room_member(room_id, auth.uid()))
);

-- Remediation 1: Enforce user_id = auth.uid() on INSERT for ALL scopes.
-- A user can only create rules where they are the owner/creator and designated payer.
DROP POLICY IF EXISTS "recurring_rules_personal_insert" ON public.recurring_expense_rules;
CREATE POLICY "recurring_rules_personal_insert"
ON public.recurring_expense_rules FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND amount > 0
  AND amount <= 1000000.00
  AND (
    (scope = 'PERSONAL' AND room_id IS NULL) OR
    (scope = 'SHARED' AND room_id IS NOT NULL AND is_room_member(room_id, auth.uid()))
  )
);

DROP POLICY IF EXISTS "recurring_rules_personal_update" ON public.recurring_expense_rules;
CREATE POLICY "recurring_rules_personal_update"
ON public.recurring_expense_rules FOR UPDATE
TO authenticated
USING (
  (scope = 'PERSONAL' AND user_id = auth.uid()) OR
  (scope = 'SHARED' AND room_id IS NOT NULL AND (user_id = auth.uid() OR is_room_admin(room_id, auth.uid())))
)
WITH CHECK (
  amount > 0
  AND amount <= 1000000.00
  AND (
    (scope = 'PERSONAL' AND user_id = auth.uid()) OR
    (scope = 'SHARED' AND room_id IS NOT NULL AND (user_id = auth.uid() OR is_room_admin(room_id, auth.uid())))
  )
);

DROP POLICY IF EXISTS "recurring_rules_personal_delete" ON public.recurring_expense_rules;
CREATE POLICY "recurring_rules_personal_delete"
ON public.recurring_expense_rules FOR DELETE
TO authenticated
USING (
  (scope = 'PERSONAL' AND user_id = auth.uid()) OR
  (scope = 'SHARED' AND room_id IS NOT NULL AND (user_id = auth.uid() OR is_room_admin(room_id, auth.uid())))
);

-- Remediation 3: Revoke direct client writes to recurring_expense_executions.
-- Executions can ONLY be recorded or updated by the authoritative RPC.
REVOKE INSERT, UPDATE, DELETE ON public.recurring_expense_executions FROM authenticated;

DROP POLICY IF EXISTS "recurring_executions_insert" ON public.recurring_expense_executions;
DROP POLICY IF EXISTS "recurring_executions_update" ON public.recurring_expense_executions;
DROP POLICY IF EXISTS "recurring_executions_delete" ON public.recurring_expense_executions;
DROP POLICY IF EXISTS "recurring_executions_select" ON public.recurring_expense_executions;

CREATE POLICY "recurring_executions_select"
ON public.recurring_expense_executions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = recurring_expense_executions.rule_id
      AND (
        (r.scope = 'PERSONAL' AND r.user_id = auth.uid()) OR
        (r.scope = 'SHARED' AND r.room_id IS NOT NULL AND is_room_member(r.room_id, auth.uid()))
      )
  )
  OR reviewed_by = auth.uid()
);

-- Explicit block policy for direct writes
CREATE POLICY "recurring_executions_block_client_writes"
ON public.recurring_expense_executions FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- 6. SECURE IDEMPOTENT EXECUTION RPC (Authoritative Ledger Mutation)
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
    
    -- Split calculation variables (Integer paise math)
    v_participants UUID[];
    v_member_count INT;
    v_total_paise BIGINT;
    v_base_paise BIGINT;
    v_rem_paise INT;
    v_current_member_id UUID;
    v_share_paise BIGINT;
    v_split_index INT;
    v_next_date DATE;
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

    -- Remediation 7: Validate rule status & archival
    IF v_rule.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'RULE_INACTIVE: Recurring rule % is % and cannot be executed', p_rule_id, v_rule.status;
    END IF;
    IF COALESCE(v_rule.is_archived, false) THEN
        RAISE EXCEPTION 'RULE_ARCHIVED: Recurring rule % is archived and cannot be executed', p_rule_id;
    END IF;

    -- Remediation 7: Validate schedule boundaries
    IF p_cycle_date < v_rule.start_date THEN
        RAISE EXCEPTION 'CYCLE_BEFORE_START: Cycle date % is before rule start date %', p_cycle_date, v_rule.start_date;
    END IF;
    IF v_rule.end_date IS NOT NULL AND p_cycle_date > v_rule.end_date THEN
        RAISE EXCEPTION 'CYCLE_AFTER_END: Cycle date % is after rule end date %', p_cycle_date, v_rule.end_date;
    END IF;

    -- Remediation 1: Authorization Verification & Server-Side Payer Validation
    IF v_rule.scope = 'PERSONAL' THEN
        IF v_rule.user_id <> v_caller_id THEN
            RAISE EXCEPTION 'FORBIDDEN: You do not own this personal recurring rule';
        END IF;
    ELSIF v_rule.scope = 'SHARED' THEN
        IF NOT is_room_member(v_rule.room_id, v_caller_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: You are not an active member of room %', v_rule.room_id;
        END IF;

        -- Server-side validation: verify the designated payer is STILL an active member of this room
        IF NOT EXISTS (
            SELECT 1 FROM public.room_members
            WHERE room_id = v_rule.room_id AND user_id = v_rule.user_id AND status = 'ACTIVE'
        ) THEN
            RAISE EXCEPTION 'PAYER_INACTIVE: Designated recurring payer % is not an active member of room %', v_rule.user_id, v_rule.room_id;
        END IF;
    END IF;

    -- 2. Idempotency Check: Verify if cycle date was already processed
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

    -- Remediation 7: Validate final amount against zero and bounds
    v_final_amount := COALESCE(p_confirmed_amount, v_rule.amount);
    IF v_final_amount <= 0 OR v_final_amount > 1000000.00 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Recurring expense amount must be between 0.01 and 1,000,000.00 INR';
    END IF;

    -- Remediation 2: Enforce auto_log = true before permitting AUTO_LOG action
    IF p_action = 'AUTO_LOG' THEN
        IF NOT COALESCE(v_rule.auto_log, false) THEN
            RAISE EXCEPTION 'AUTO_LOG_FORBIDDEN: Rule % is configured for manual review (auto_log is false)', p_rule_id;
        END IF;
        v_exec_status := 'AUTO_LOGGED';
    ELSIF p_action = 'SKIP' THEN
        v_exec_status := 'SKIPPED';
    ELSE
        v_exec_status := 'MANUALLY_CONFIRMED';
    END IF;

    -- 3. Insert Expense Entry (if not skipped)
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
                COALESCE(v_rule.notes, '') || ' (Recurring bill for ' || p_cycle_date::text || ')',
                p_cycle_date
            ) RETURNING id INTO v_generated_shared_id;

            -- Remediation 8: Generate Canonical Expense Splits with Integer Paise Reconciliation
            -- Determine participant IDs
            IF v_rule.split_participant_ids IS NOT NULL AND array_length(v_rule.split_participant_ids, 1) > 0 THEN
                v_participants := v_rule.split_participant_ids;
            ELSE
                SELECT array_agg(user_id) INTO v_participants
                FROM public.room_members
                WHERE room_id = v_rule.room_id AND status = 'ACTIVE';
            END IF;

            v_member_count := array_length(v_participants, 1);
            IF v_member_count IS NULL OR v_member_count = 0 THEN
                RAISE EXCEPTION 'NO_PARTICIPANTS: Room has no eligible split participants for recurring bill';
            END IF;

            v_total_paise := ROUND(v_final_amount * 100);
            v_base_paise := v_total_paise / v_member_count;
            v_rem_paise := (v_total_paise % v_member_count)::INT;

            FOR v_split_index IN 1..v_member_count LOOP
                v_current_member_id := v_participants[v_split_index];
                
                -- Distribute remainder paise to first participants deterministically
                IF v_split_index <= v_rem_paise THEN
                    v_share_paise := v_base_paise + 1;
                ELSE
                    v_share_paise := v_base_paise;
                END IF;

                INSERT INTO public.expense_splits (
                    shared_expense_id,
                    user_id,
                    share_amount,
                    created_at
                ) VALUES (
                    v_generated_shared_id,
                    v_current_member_id,
                    (v_share_paise::NUMERIC / 100.00),
                    now()
                );
            END LOOP;
        END IF;
    END IF;

    -- 4. Upsert Execution Record (with Remediation 9 snapshot fields)
    INSERT INTO public.recurring_expense_executions (
        rule_id,
        rule_title,
        rule_scope,
        rule_category,
        cycle_date,
        status,
        amount,
        generated_personal_expense_id,
        generated_shared_expense_id,
        executed_at,
        reviewed_by
    ) VALUES (
        p_rule_id,
        v_rule.title,
        v_rule.scope,
        v_rule.category,
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

    -- 5. Calculate next execution date based on frequency
    IF v_rule.frequency = 'MONTHLY' THEN
        v_next_date := p_cycle_date + INTERVAL '1 month';
    ELSIF v_rule.frequency = 'WEEKLY' THEN
        v_next_date := p_cycle_date + INTERVAL '1 week';
    ELSIF v_rule.frequency = 'CUSTOM_INTERVAL' AND v_rule.interval_count IS NOT NULL THEN
        IF v_rule.interval_unit = 'DAYS' THEN
            v_next_date := p_cycle_date + (v_rule.interval_count || ' days')::INTERVAL;
        ELSIF v_rule.interval_unit = 'WEEKS' THEN
            v_next_date := p_cycle_date + (v_rule.interval_count || ' weeks')::INTERVAL;
        ELSE
            v_next_date := p_cycle_date + (v_rule.interval_count || ' months')::INTERVAL;
        END IF;
    ELSE
        v_next_date := p_cycle_date + INTERVAL '1 month';
    END IF;

    -- Update Rule metadata
    UPDATE public.recurring_expense_rules
    SET last_executed_at = now(),
        next_execution_date = v_next_date,
        status = CASE 
            WHEN v_rule.end_date IS NOT NULL AND v_next_date > v_rule.end_date THEN 'COMPLETED'::public.recurring_rule_status
            ELSE status
        END,
        updated_at = now()
    WHERE id = p_rule_id;

    RETURN jsonb_build_object(
        'success', true,
        'execution_id', v_exec_id,
        'status', v_exec_status,
        'generated_personal_id', v_generated_personal_id,
        'generated_shared_id', v_generated_shared_id,
        'amount', v_final_amount,
        'next_execution_date', v_next_date
    );
END;
$$;

-- Revoke from anonymous callers, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.execute_recurring_cycle_secure FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_recurring_cycle_secure TO authenticated, service_role;

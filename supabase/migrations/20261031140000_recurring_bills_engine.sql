-- ============================================================================
-- RoomMate - Recurring Bills & Scheduled Expense Engine (Remediated V2)
-- Migration: 20261031140000_recurring_bills_engine.sql
-- Environment: ISOLATED STAGING ONLY (pbzaaskftrmnvocczhat remains untouched)
-- 
-- Remediation Enhancements:
-- 1. Fail-closed staging environment verification (Finding D).
-- 2. Idempotent ALTER TABLE operations for upgrading existing staging schemas (Requirement 4).
-- 3. Supports EQUAL, EXACT, PERCENTAGE, and SHARES split methods with integer-paise reconciliation (Finding A).
-- 4. Deduplicates participants and verifies active room membership server-side (Finding A).
-- 5. Field-level authority trigger preventing room admins from mutating payer, amount, auto-log, or splits (Finding B).
-- 6. Execution history preservation with owner_user_id, room_id, and snapshot fields surviving rule deletion (Finding C).
-- 7. Restricts direct client writes on execution ledger to authoritative RPC (Finding 3).
-- 8. Validates schedule boundaries, cycle dates, rule active status, and bounds server-side (Finding 7).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FAIL-CLOSED STAGING ENVIRONMENT VERIFICATION (Finding D)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- 1. Strict Fail-Closed Check: Explicitly require roommate.environment IN ('staging', 'local', 'test')
  IF current_setting('roommate.environment', true) IS NULL 
     OR current_setting('roommate.environment', true) NOT IN ('staging', 'local', 'test') THEN
    RAISE EXCEPTION 'MIGRATION_BLOCKED: This migration contains staging/local DDL and can only be executed in environments where roommate.environment is explicitly set to ''staging'', ''local'', or ''test''. Refusing to run in unknown or production environment.';
  END IF;

  -- 2. Multi-Vector Defense-in-Depth: block any connection identifying as production pbzaaskftrmnvocczhat
  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'iss', '') LIKE '%pbzaaskftrmnvocczhat%'
     OR COALESCE(current_setting('app.settings.project_ref', true), '') = 'pbzaaskftrmnvocczhat'
     OR COALESCE(current_setting('roommate.project_ref', true), '') = 'pbzaaskftrmnvocczhat'
     OR current_user LIKE '%pbzaaskftrmnvocczhat%'
     OR inet_server_addr()::text LIKE '%pbzaaskftrmnvocczhat%'
     OR current_database() LIKE '%pbzaaskftrmnvocczhat%' THEN
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
-- 3. TABLE: recurring_expense_rules (Fresh Install & Upgrade Idempotency)
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

-- Idempotent column additions for existing staging schemas
ALTER TABLE public.recurring_expense_rules ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.recurring_expense_rules ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_recurring_rules_user_scope 
  ON public.recurring_expense_rules (user_id, scope, status);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_due_scan 
  ON public.recurring_expense_rules (status, next_execution_date) WHERE NOT is_archived;

CREATE INDEX IF NOT EXISTS idx_recurring_rules_room 
  ON public.recurring_expense_rules (room_id) WHERE room_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. TABLE: recurring_expense_executions (Idempotency & Historical Audit Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_expense_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES public.recurring_expense_rules(id) ON DELETE SET NULL,
    owner_user_id UUID REFERENCES auth.users(id),
    room_id UUID REFERENCES public.rooms(id),
    rule_scope public.recurring_scope_type,
    rule_title TEXT,
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

-- Idempotent upgrades for existing staging tables (Finding C & Requirement 4)
ALTER TABLE public.recurring_expense_executions ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.recurring_expense_executions ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES public.rooms(id);
ALTER TABLE public.recurring_expense_executions ADD COLUMN IF NOT EXISTS rule_scope public.recurring_scope_type;
ALTER TABLE public.recurring_expense_executions ADD COLUMN IF NOT EXISTS rule_title TEXT;
ALTER TABLE public.recurring_expense_executions ADD COLUMN IF NOT EXISTS rule_category TEXT;

-- Safely make rule_id nullable and set ON DELETE SET NULL on existing staging constraint
DO $$
BEGIN
  ALTER TABLE public.recurring_expense_executions ALTER COLUMN rule_id DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.recurring_expense_executions DROP CONSTRAINT IF EXISTS recurring_expense_executions_rule_id_fkey;
  ALTER TABLE public.recurring_expense_executions 
    ADD CONSTRAINT recurring_expense_executions_rule_id_fkey 
    FOREIGN KEY (rule_id) REFERENCES public.recurring_expense_rules(id) ON DELETE SET NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_recurring_executions_rule_status 
  ON public.recurring_expense_executions (rule_id, status);

CREATE INDEX IF NOT EXISTS idx_recurring_executions_historical 
  ON public.recurring_expense_executions (room_id, owner_user_id, cycle_date);

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

-- Finding 1: Enforce user_id = auth.uid() on INSERT for ALL scopes.
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

-- Finding B: Field-level authority enforcement on UPDATE
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

-- Finding B Trigger: Guard sensitive fields against non-owner room admin modifications
CREATE OR REPLACE FUNCTION public.check_recurring_rule_update_authority()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  -- If caller is NOT the rule owner/payer (e.g. room admin modifying another member's shared rule)
  IF v_caller_id IS NOT NULL AND v_caller_id <> OLD.user_id THEN
    -- Admin is strictly forbidden from modifying payer, amount, auto_log, or split configuration
    IF NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Room administrators cannot reassign recurring rule payer ownership';
    END IF;
    IF NEW.amount <> OLD.amount THEN
      RAISE EXCEPTION 'FORBIDDEN: Room administrators cannot change the expense amount of another member recurring bill';
    END IF;
    IF NEW.auto_log <> OLD.auto_log THEN
      RAISE EXCEPTION 'FORBIDDEN: Room administrators cannot modify Auto-Log settings on another member recurring rule';
    END IF;
    IF NEW.split_method IS DISTINCT FROM OLD.split_method
       OR NEW.split_participant_ids IS DISTINCT FROM OLD.split_participant_ids
       OR NEW.custom_split_values IS DISTINCT FROM OLD.custom_split_values THEN
      RAISE EXCEPTION 'FORBIDDEN: Room administrators cannot modify split allocation configuration on another member recurring rule';
    END IF;
  END IF;

  -- Even rule owner cannot transfer payer ownership to another user via update
  IF v_caller_id IS NOT NULL AND v_caller_id = OLD.user_id THEN
    IF NEW.user_id <> OLD.user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Recurring rule payer ownership cannot be transferred to another user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_recurring_rule_updates ON public.recurring_expense_rules;
CREATE TRIGGER trg_guard_recurring_rule_updates
  BEFORE UPDATE ON public.recurring_expense_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.check_recurring_rule_update_authority();

-- Finding 3: Revoke direct client writes to recurring_expense_executions
REVOKE INSERT, UPDATE, DELETE ON public.recurring_expense_executions FROM authenticated;

DROP POLICY IF EXISTS "recurring_executions_insert" ON public.recurring_expense_executions;
DROP POLICY IF EXISTS "recurring_executions_update" ON public.recurring_expense_executions;
DROP POLICY IF EXISTS "recurring_executions_delete" ON public.recurring_expense_executions;
DROP POLICY IF EXISTS "recurring_executions_select" ON public.recurring_expense_executions;
DROP POLICY IF EXISTS "recurring_executions_block_client_writes" ON public.recurring_expense_executions;

-- Finding C: Execution history visibility after rule deletion
CREATE POLICY "recurring_executions_select"
ON public.recurring_expense_executions FOR SELECT
TO authenticated
USING (
  -- Personal executions: visible to owner or reviewer
  (rule_scope = 'PERSONAL' AND (owner_user_id = auth.uid() OR reviewed_by = auth.uid()))
  OR
  -- Shared executions: visible to room members (active or historical) or owner/reviewer
  (rule_scope = 'SHARED' AND room_id IS NOT NULL AND (
    is_room_member(room_id, auth.uid()) OR owner_user_id = auth.uid() OR reviewed_by = auth.uid()
  ))
  OR
  -- Fallback via live rule if present
  (rule_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.recurring_expense_rules r
    WHERE r.id = recurring_expense_executions.rule_id
      AND (
        (r.scope = 'PERSONAL' AND r.user_id = auth.uid()) OR
        (r.scope = 'SHARED' AND r.room_id IS NOT NULL AND is_room_member(r.room_id, auth.uid()))
      )
  ))
  OR reviewed_by = auth.uid()
);

-- Explicit block policy for direct writes
CREATE POLICY "recurring_executions_block_client_writes"
ON public.recurring_expense_executions FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- 6. SECURE IDEMPOTENT EXECUTION RPC (Findings A, B, C, 2, 7)
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
    
    -- Split calculation variables (Finding A)
    v_raw_participants UUID[];
    v_deduped_participants UUID[];
    v_member_count INT;
    v_total_paise BIGINT;
    v_base_paise BIGINT;
    v_rem_paise INT;
    v_current_member_id UUID;
    v_share_paise BIGINT;
    v_split_index INT;
    v_next_date DATE;
    v_split_method TEXT;
    
    -- EXACT / PERCENTAGE / SHARES variables
    v_exact_share_sum BIGINT := 0;
    v_pct_sum NUMERIC(8, 2) := 0;
    v_shares_total BIGINT := 0;
    v_allocated_paise BIGINT := 0;
    v_share_value NUMERIC;
    v_shares_weight BIGINT;
    v_custom_paise_map BIGINT[];
    v_diff_paise BIGINT;
    v_next_month_start DATE;
    v_days_in_next_month INT;
    v_target_day INT;
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

    -- Finding 7: Validate rule status & archival
    IF v_rule.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'RULE_INACTIVE: Recurring rule % is % and cannot be executed', p_rule_id, v_rule.status;
    END IF;
    IF COALESCE(v_rule.is_archived, false) THEN
        RAISE EXCEPTION 'RULE_ARCHIVED: Recurring rule % is archived and cannot be executed', p_rule_id;
    END IF;

    -- Finding 7: Validate schedule boundaries
    IF p_cycle_date < v_rule.start_date THEN
        RAISE EXCEPTION 'CYCLE_BEFORE_START: Cycle date % is before rule start date %', p_cycle_date, v_rule.start_date;
    END IF;
    IF v_rule.end_date IS NOT NULL AND p_cycle_date > v_rule.end_date THEN
        RAISE EXCEPTION 'CYCLE_AFTER_END: Cycle date % is after rule end date %', p_cycle_date, v_rule.end_date;
    END IF;

    -- Finding 1: Authorization Verification & Server-Side Payer Validation
    IF v_rule.scope = 'PERSONAL' THEN
        IF v_rule.user_id <> v_caller_id THEN
            RAISE EXCEPTION 'FORBIDDEN: You do not own this personal recurring rule';
        END IF;
    ELSIF v_rule.scope = 'SHARED' THEN
        IF NOT is_room_member(v_rule.room_id, v_caller_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: You are not an active member of room %', v_rule.room_id;
        END IF;

        -- Verify designated payer is STILL an active member of the room
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

    -- Finding 7: Validate final amount bounds
    v_final_amount := COALESCE(p_confirmed_amount, v_rule.amount);
    IF v_final_amount <= 0 OR v_final_amount > 1000000.00 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Recurring expense amount must be between 0.01 and 1,000,000.00 INR';
    END IF;

    -- Finding 2: Enforce auto_log = true before permitting AUTO_LOG action
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
            v_split_method := COALESCE(v_rule.split_method, 'EQUAL');

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
                v_split_method,
                COALESCE(v_rule.notes, '') || ' (Recurring bill for ' || p_cycle_date::text || ')',
                p_cycle_date
            ) RETURNING id INTO v_generated_shared_id;

            -- ----------------------------------------------------------------
            -- Finding A: Participant Deduplication & Active Membership Check
            -- ----------------------------------------------------------------
            IF v_rule.split_participant_ids IS NOT NULL AND array_length(v_rule.split_participant_ids, 1) > 0 THEN
                v_raw_participants := v_rule.split_participant_ids;
            ELSE
                SELECT array_agg(user_id) INTO v_raw_participants
                FROM public.room_members
                WHERE room_id = v_rule.room_id AND status = 'ACTIVE';
            END IF;

            -- Deduplicate participants and verify each is an ACTIVE room member
            SELECT array_agg(DISTINCT p_id) INTO v_deduped_participants
            FROM unnest(v_raw_participants) AS p_id;

            v_member_count := COALESCE(array_length(v_deduped_participants, 1), 0);
            IF v_member_count = 0 THEN
                RAISE EXCEPTION 'NO_PARTICIPANTS: Room has no eligible split participants for recurring bill';
            END IF;

            -- Check active membership for all participants
            IF EXISTS (
                SELECT 1 FROM unnest(v_deduped_participants) AS p_id
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.room_members rm
                    WHERE rm.room_id = v_rule.room_id AND rm.user_id = p_id AND rm.status = 'ACTIVE'
                )
            ) THEN
                RAISE EXCEPTION 'INVALID_PARTICIPANT: All recurring bill participants must be active room members';
            END IF;

            v_total_paise := ROUND(v_final_amount * 100);

            -- ----------------------------------------------------------------
            -- Finding A: Split Calculation Strategies (EQUAL, EXACT, PERCENTAGE, SHARES)
            -- ----------------------------------------------------------------
            IF v_split_method = 'EQUAL' THEN
                v_base_paise := v_total_paise / v_member_count;
                v_rem_paise := (v_total_paise % v_member_count)::INT;

                FOR v_split_index IN 1..v_member_count LOOP
                    v_current_member_id := v_deduped_participants[v_split_index];
                    IF v_split_index <= v_rem_paise THEN
                        v_share_paise := v_base_paise + 1;
                    ELSE
                        v_share_paise := v_base_paise;
                    END IF;

                    INSERT INTO public.expense_splits (
                        shared_expense_id, user_id, share_amount, created_at
                    ) VALUES (
                        v_generated_shared_id, v_current_member_id, (v_share_paise::NUMERIC / 100.00), now()
                    );
                END LOOP;

            ELSIF v_split_method = 'EXACT' THEN
                -- Sum custom exact paise and verify exact match
                FOR v_split_index IN 1..v_member_count LOOP
                    v_current_member_id := v_deduped_participants[v_split_index];
                    v_share_value := COALESCE((v_rule.custom_split_values->>v_current_member_id::text)::NUMERIC, 0);
                    v_share_paise := ROUND(v_share_value * 100);
                    v_exact_share_sum := v_exact_share_sum + v_share_paise;
                    v_custom_paise_map[v_split_index] := v_share_paise;
                END LOOP;

                IF v_exact_share_sum <> v_total_paise THEN
                    RAISE EXCEPTION 'EXACT_SPLIT_MISMATCH: Sum of exact shares (% paise) does not equal total amount (% paise)',
                        v_exact_share_sum, v_total_paise;
                END IF;

                FOR v_split_index IN 1..v_member_count LOOP
                    INSERT INTO public.expense_splits (
                        shared_expense_id, user_id, share_amount, created_at
                    ) VALUES (
                        v_generated_shared_id, v_deduped_participants[v_split_index], (v_custom_paise_map[v_split_index]::NUMERIC / 100.00), now()
                    );
                END LOOP;

            ELSIF v_split_method = 'PERCENTAGE' THEN
                -- Verify percentages sum to 100.00
                FOR v_split_index IN 1..v_member_count LOOP
                    v_current_member_id := v_deduped_participants[v_split_index];
                    v_share_value := COALESCE((v_rule.custom_split_values->>v_current_member_id::text)::NUMERIC, 0);
                    v_pct_sum := v_pct_sum + v_share_value;
                    v_share_paise := ROUND((v_total_paise * v_share_value) / 100.00);
                    v_custom_paise_map[v_split_index] := v_share_paise;
                    v_allocated_paise := v_allocated_paise + v_share_paise;
                END LOOP;

                IF ABS(v_pct_sum - 100.00) > 0.05 THEN
                    RAISE EXCEPTION 'PERCENTAGE_SPLIT_MISMATCH: Split percentages must sum to 100%%, got %', v_pct_sum;
                END IF;

                -- Reconcile rounding remainder to first participant
                v_diff_paise := v_total_paise - v_allocated_paise;
                v_custom_paise_map[1] := v_custom_paise_map[1] + v_diff_paise;

                FOR v_split_index IN 1..v_member_count LOOP
                    INSERT INTO public.expense_splits (
                        shared_expense_id, user_id, share_amount, created_at
                    ) VALUES (
                        v_generated_shared_id, v_deduped_participants[v_split_index], (v_custom_paise_map[v_split_index]::NUMERIC / 100.00), now()
                    );
                END LOOP;

            ELSIF v_split_method = 'SHARES' THEN
                -- Sum total shares/weights
                FOR v_split_index IN 1..v_member_count LOOP
                    v_current_member_id := v_deduped_participants[v_split_index];
                    v_shares_weight := COALESCE((v_rule.custom_split_values->>v_current_member_id::text)::BIGINT, 1);
                    IF v_shares_weight <= 0 THEN v_shares_weight := 1; END IF;
                    v_shares_total := v_shares_total + v_shares_weight;
                END LOOP;

                IF v_shares_total <= 0 THEN
                    RAISE EXCEPTION 'SHARES_SPLIT_INVALID: Total shares must be greater than zero';
                END IF;

                FOR v_split_index IN 1..v_member_count LOOP
                    v_current_member_id := v_deduped_participants[v_split_index];
                    v_shares_weight := COALESCE((v_rule.custom_split_values->>v_current_member_id::text)::BIGINT, 1);
                    IF v_shares_weight <= 0 THEN v_shares_weight := 1; END IF;
                    v_share_paise := ROUND((v_total_paise * v_shares_weight)::NUMERIC / v_shares_total::NUMERIC);
                    v_custom_paise_map[v_split_index] := v_share_paise;
                    v_allocated_paise := v_allocated_paise + v_share_paise;
                END LOOP;

                -- Reconcile rounding remainder
                v_diff_paise := v_total_paise - v_allocated_paise;
                v_custom_paise_map[1] := v_custom_paise_map[1] + v_diff_paise;

                FOR v_split_index IN 1..v_member_count LOOP
                    INSERT INTO public.expense_splits (
                        shared_expense_id, user_id, share_amount, created_at
                    ) VALUES (
                        v_generated_shared_id, v_deduped_participants[v_split_index], (v_custom_paise_map[v_split_index]::NUMERIC / 100.00), now()
                    );
                END LOOP;
            END IF;
        END IF;
    END IF;

    -- 4. Upsert Execution Record (with Finding C ownership & room snapshots)
    INSERT INTO public.recurring_expense_executions (
        rule_id,
        owner_user_id,
        room_id,
        rule_scope,
        rule_title,
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
        v_rule.user_id,
        v_rule.room_id,
        v_rule.scope,
        v_rule.title,
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
        owner_user_id = EXCLUDED.owner_user_id,
        room_id = EXCLUDED.room_id,
        rule_scope = EXCLUDED.rule_scope,
        rule_title = EXCLUDED.rule_title,
        rule_category = EXCLUDED.rule_category,
        generated_personal_expense_id = EXCLUDED.generated_personal_expense_id,
        generated_shared_expense_id = EXCLUDED.generated_shared_expense_id,
        executed_at = EXCLUDED.executed_at,
        reviewed_by = EXCLUDED.reviewed_by
    RETURNING id INTO v_exec_id;

    -- 5. Calculate next execution date based on frequency (Codex P2: Anchored monthly recurrence)
    IF v_rule.frequency = 'MONTHLY' THEN
        v_next_month_start := (date_trunc('month', p_cycle_date) + INTERVAL '1 month')::date;
        v_days_in_next_month := EXTRACT(DAY FROM ((v_next_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date))::INT;
        
        IF v_rule.is_last_day_of_month THEN
            v_next_date := (v_next_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
        ELSE
            v_target_day := COALESCE(v_rule.day_of_month, EXTRACT(DAY FROM v_rule.start_date)::INT);
            v_next_date := (v_next_month_start + (LEAST(v_target_day, v_days_in_next_month) - 1) * INTERVAL '1 day')::date;
        END IF;
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

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { PGlite } from '@electric-sql/pglite';

describe('Real PostgreSQL Engine - Phase 10 Database-Level Security & Integrity Suite', () => {
  let db: PGlite;

  const recurringMigrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20261031140000_recurring_bills_engine.sql'
  );
  const statementMigrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20261031120000_room_reconciliation_lock_and_statements.sql'
  );

  const recurringSql = fs.readFileSync(recurringMigrationPath, 'utf8');
  const statementSql = fs.readFileSync(statementMigrationPath, 'utf8');

  const ALICE_ID = '11111111-1111-1111-1111-111111111111';
  const BOB_ID = '22222222-2222-2222-2222-222222222222';
  const CHARLIE_ID = '33333333-3333-3333-3333-333333333333';
  const DAVE_ID = '44444444-4444-4444-4444-444444444444';
  const ROOM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup Supabase baseline environment in real PostgreSQL
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT
      );

      -- auth.uid() function mimicking Supabase JWT session claim
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      -- digest function for cryptographic canonical hashing
      CREATE OR REPLACE FUNCTION digest(data text, type text) RETURNS bytea AS $$
        SELECT sha256(data::bytea);
      $$ LANGUAGE sql IMMUTABLE;

      -- Base Tables
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY,
        full_name TEXT,
        name TEXT,
        email TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT clock_timestamp()
      );

      CREATE TABLE IF NOT EXISTS public.rooms (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_by UUID NOT NULL REFERENCES public.profiles(id),
        is_archived BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );

      CREATE TABLE IF NOT EXISTS public.room_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ROOM_ADMIN', 'MEMBER')),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LEFT', 'REMOVED')),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        left_at TIMESTAMPTZ,
        CONSTRAINT unique_room_member UNIQUE (room_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS public.personal_expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL,
        notes TEXT,
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );

      CREATE TABLE IF NOT EXISTS public.shared_expenses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
        created_by UUID NOT NULL REFERENCES public.profiles(id),
        paid_by UUID NOT NULL REFERENCES public.profiles(id),
        title TEXT NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
        category TEXT NOT NULL,
        split_method TEXT NOT NULL,
        notes TEXT,
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        is_deleted BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );

      CREATE TABLE IF NOT EXISTS public.expense_splits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        shared_expense_id UUID NOT NULL REFERENCES public.shared_expenses(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        share_amount NUMERIC(12, 2) NOT NULL CHECK (share_amount >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );

      CREATE TABLE IF NOT EXISTS public.settlement_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
        payer_id UUID NOT NULL REFERENCES public.profiles(id),
        payee_id UUID NOT NULL REFERENCES public.profiles(id),
        amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
        payment_method TEXT NOT NULL DEFAULT 'UPI',
        transaction_ref TEXT,
        notes TEXT,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );

      -- Supabase Helper Functions
      CREATE OR REPLACE FUNCTION public.is_room_member(check_room_id UUID, check_user_id UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.room_members
          WHERE room_id = check_room_id
            AND user_id = check_user_id
            AND status = 'ACTIVE'
        );
      $$;

      CREATE OR REPLACE FUNCTION public.is_room_admin(check_room_id UUID, check_user_id UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.room_members
          WHERE room_id = check_room_id
            AND user_id = check_user_id
            AND role = 'ROOM_ADMIN'
            AND status = 'ACTIVE'
        );
      $$;

      CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID)
      RETURNS BOOLEAN
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $$
        SELECT false;
      $$;
    `);

    // Seed test users
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${ALICE_ID}', 'alice@test.local'),
        ('${BOB_ID}', 'bob@test.local'),
        ('${CHARLIE_ID}', 'charlie@test.local'),
        ('${DAVE_ID}', 'dave@test.local');

      INSERT INTO public.profiles (id, full_name, email) VALUES
        ('${ALICE_ID}', 'Alice RoomAdmin', 'alice@test.local'),
        ('${BOB_ID}', 'Bob Roommate', 'bob@test.local'),
        ('${CHARLIE_ID}', 'Charlie Roommate', 'charlie@test.local'),
        ('${DAVE_ID}', 'Dave Inactive', 'dave@test.local');

      INSERT INTO public.rooms (id, name, created_by) VALUES
        ('${ROOM_ID}', 'Trimurti Apt', '${ALICE_ID}');

      INSERT INTO public.room_members (room_id, user_id, role, status, joined_at, left_at) VALUES
        ('${ROOM_ID}', '${ALICE_ID}', 'ROOM_ADMIN', 'ACTIVE', '2026-01-01 00:00:00+00', NULL),
        ('${ROOM_ID}', '${BOB_ID}', 'MEMBER', 'ACTIVE', '2026-01-01 00:00:00+00', NULL),
        ('${ROOM_ID}', '${CHARLIE_ID}', 'MEMBER', 'ACTIVE', '2026-01-01 00:00:00+00', NULL),
        ('${ROOM_ID}', '${DAVE_ID}', 'MEMBER', 'LEFT', '2026-01-01 00:00:00+00', '2026-08-01 00:00:00+00');
    `);
  });

  // --------------------------------------------------------------------------
  // 1. Finding D: Migration Fail-Closed Environment Guard
  // --------------------------------------------------------------------------
  describe('Finding D: Real PostgreSQL Environment Guard Verification', () => {
    it('fails closed when roommate.environment is unset in PostgreSQL session', async () => {
      // Execute statement migration without setting environment
      await expect(db.exec(statementSql)).rejects.toThrow(/MIGRATION_BLOCKED/);
    });

    it('fails closed when roommate.environment is set to production or unknown', async () => {
      await db.exec("SET roommate.environment = 'production';");
      await expect(db.exec(recurringSql)).rejects.toThrow(/MIGRATION_BLOCKED/);
    });

    it('successfully applies migrations when roommate.environment is set to staging', async () => {
      await db.exec("SET roommate.environment = 'staging';");
      // Run Track 4 Monthly Reconciliation & Statement Migration
      await db.exec(statementSql);
      // Run Track 5 Recurring Bills Engine Migration
      await db.exec(recurringSql);

      // Verify tables and functions exist in PostgreSQL catalog
      const tables = await db.query<{ tablename: string }>(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public';
      `);
      const tableNames = tables.rows.map((r) => r.tablename);
      expect(tableNames).toContain('room_reconciliation_periods');
      expect(tableNames).toContain('room_statement_signoffs');
      expect(tableNames).toContain('recurring_expense_rules');
      expect(tableNames).toContain('recurring_expense_executions');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Finding B: Field-Level Authority Trigger on Recurring Rules
  // --------------------------------------------------------------------------
  describe('Finding B: Field-Level Recurring Rule Modification Authority in Real PostgreSQL', () => {
    let ruleId: string;

    beforeAll(async () => {
      // Alice creates a recurring rule
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      const res = await db.query<{ id: string }>(`
        INSERT INTO public.recurring_expense_rules (
          user_id, room_id, scope, title, amount, category, frequency, split_method, split_participant_ids, auto_log, start_date, next_execution_date
        ) VALUES (
          '${ALICE_ID}', '${ROOM_ID}', 'SHARED', 'Airtel Broadband', 1200.00, 'Wi-Fi', 'MONTHLY',
          'EQUAL', ARRAY['${ALICE_ID}'::uuid, '${BOB_ID}'::uuid, '${CHARLIE_ID}'::uuid], false, '2026-11-01'::date, '2026-11-01'::date
        ) RETURNING id;
      `);
      ruleId = res.rows[0].id;
    });

    it('allows rule owner (Alice) to update amount and settings', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      await db.exec(`
        UPDATE public.recurring_expense_rules
        SET amount = 1500.00
        WHERE id = '${ruleId}';
      `);

      const res = await db.query<{ amount: number }>(`
        SELECT amount FROM public.recurring_expense_rules WHERE id = '${ruleId}';
      `);
      expect(Number(res.rows[0].amount)).toBe(1500.00);
    });

    it('blocks non-owner (Bob) from tampering with amount via trigger check_recurring_rule_update_authority', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${BOB_ID}';`);
      await expect(
        db.exec(`
          UPDATE public.recurring_expense_rules
          SET amount = 9999.00
          WHERE id = '${ruleId}';
        `)
      ).rejects.toThrow(/FORBIDDEN: Room administrators cannot change the expense amount/);
    });

    it('blocks non-owner (Bob) from mutating payer (user_id)', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${BOB_ID}';`);
      await expect(
        db.exec(`
          UPDATE public.recurring_expense_rules
          SET user_id = '${BOB_ID}'
          WHERE id = '${ruleId}';
        `)
      ).rejects.toThrow(/FORBIDDEN: Room administrators cannot reassign recurring rule payer ownership/);
    });

    it('blocks non-owner (Bob) from mutating auto_log setting', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${BOB_ID}';`);
      await expect(
        db.exec(`
          UPDATE public.recurring_expense_rules
          SET auto_log = true
          WHERE id = '${ruleId}';
        `)
      ).rejects.toThrow(/FORBIDDEN: Room administrators cannot modify Auto-Log settings/);
    });

    it('blocks non-owner (Bob) from mutating split allocation configuration', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${BOB_ID}';`);
      await expect(
        db.exec(`
          UPDATE public.recurring_expense_rules
          SET split_method = 'EXACT'
          WHERE id = '${ruleId}';
        `)
      ).rejects.toThrow(/FORBIDDEN: Room administrators cannot modify split allocation configuration/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Finding A: Recurring Cycle Split Generation in Real PostgreSQL Engine
  // --------------------------------------------------------------------------
  describe('Finding A: Split Allocation Strategies & Exact Paise Math in PostgreSQL', () => {
    let ruleId: string;

    beforeAll(async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      const res = await db.query<{ id: string }>(`
        INSERT INTO public.recurring_expense_rules (
          user_id, room_id, scope, title, amount, category, frequency, split_method, split_participant_ids, auto_log, start_date, next_execution_date
        ) VALUES (
          '${ALICE_ID}', '${ROOM_ID}', 'SHARED', 'Maid Salary', 1000.00, 'Cleaning', 'MONTHLY',
          'EQUAL', ARRAY['${ALICE_ID}'::uuid, '${BOB_ID}'::uuid, '${CHARLIE_ID}'::uuid], false, '2026-11-01'::date, '2026-11-01'::date
        ) RETURNING id;
      `);
      ruleId = res.rows[0].id;
    });

    it('EQUAL split: divides 1000.00 across 3 roommates with exact paise distribution (333.34, 333.33, 333.33)', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      const rpcRes = await db.query<{ execute_recurring_cycle_secure: any }>(`
        SELECT public.execute_recurring_cycle_secure('${ruleId}', '2026-11-01'::date, NULL, 'CONFIRM_LOG');
      `);
      const sharedExpenseId = rpcRes.rows[0].execute_recurring_cycle_secure.generated_shared_id;
      expect(sharedExpenseId).toBeDefined();

      const splits = await db.query<{ user_id: string; share_amount: string }>(`
        SELECT user_id, share_amount FROM public.expense_splits
        WHERE shared_expense_id = '${sharedExpenseId}'
        ORDER BY share_amount DESC;
      `);

      expect(splits.rows.length).toBe(3);
      const amounts = splits.rows.map((s) => Number(s.share_amount));
      expect(amounts).toEqual([333.34, 333.33, 333.33]);
      const totalAllocated = amounts.reduce((a, b) => a + b, 0);
      expect(totalAllocated).toBe(1000.00);
    });

    it('PERCENTAGE split: generates configured 50%, 30%, 20% splits exactly matching total', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      // Update rule to PERCENTAGE
      await db.exec(`
        UPDATE public.recurring_expense_rules
        SET split_method = 'PERCENTAGE',
            custom_split_values = '{"${ALICE_ID}": 50, "${BOB_ID}": 30, "${CHARLIE_ID}": 20}'::jsonb
        WHERE id = '${ruleId}';
      `);

      const rpcRes = await db.query<{ execute_recurring_cycle_secure: any }>(`
        SELECT public.execute_recurring_cycle_secure('${ruleId}', '2026-12-01'::date, NULL, 'CONFIRM_LOG');
      `);
      const sharedExpenseId = rpcRes.rows[0].execute_recurring_cycle_secure.generated_shared_id;

      const splits = await db.query<{ user_id: string; share_amount: string }>(`
        SELECT user_id, share_amount FROM public.expense_splits
        WHERE shared_expense_id = '${sharedExpenseId}'
        ORDER BY share_amount DESC;
      `);

      const map = Object.fromEntries(splits.rows.map((s) => [s.user_id, Number(s.share_amount)]));
      expect(map[ALICE_ID]).toBe(500.00);
      expect(map[BOB_ID]).toBe(300.00);
      expect(map[CHARLIE_ID]).toBe(200.00);
      const total = Object.values(map).reduce((a, b) => a + b, 0);
      expect(total).toBe(1000.00);
    });

    it('SHARES split: generates 2 shares, 1 share, 1 share (500.00, 250.00, 250.00)', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      await db.exec(`
        UPDATE public.recurring_expense_rules
        SET split_method = 'SHARES',
            custom_split_values = '{"${ALICE_ID}": 2, "${BOB_ID}": 1, "${CHARLIE_ID}": 1}'::jsonb
        WHERE id = '${ruleId}';
      `);

      const rpcRes = await db.query<{ execute_recurring_cycle_secure: any }>(`
        SELECT public.execute_recurring_cycle_secure('${ruleId}', '2027-01-01'::date, NULL, 'CONFIRM_LOG');
      `);
      const sharedExpenseId = rpcRes.rows[0].execute_recurring_cycle_secure.generated_shared_id;

      const splits = await db.query<{ user_id: string; share_amount: string }>(`
        SELECT user_id, share_amount FROM public.expense_splits
        WHERE shared_expense_id = '${sharedExpenseId}';
      `);

      const map = Object.fromEntries(splits.rows.map((s) => [s.user_id, Number(s.share_amount)]));
      expect(map[ALICE_ID]).toBe(500.00);
      expect(map[BOB_ID]).toBe(250.00);
      expect(map[CHARLIE_ID]).toBe(250.00);
      const total = Object.values(map).reduce((a, b) => a + b, 0);
      expect(total).toBe(1000.00);
    });

    it('rejects execution if configured participant is not an active room member (Dave)', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      // Dave has status = 'LEFT'
      await db.exec(`
        UPDATE public.recurring_expense_rules
        SET split_participant_ids = ARRAY['${ALICE_ID}'::uuid, '${DAVE_ID}'::uuid]
        WHERE id = '${ruleId}';
      `);

      await expect(
        db.exec(`
          SELECT public.execute_recurring_cycle_secure('${ruleId}', '2027-02-01'::date, NULL, 'CONFIRM_LOG');
        `)
      ).rejects.toThrow(/INVALID_PARTICIPANT: All recurring bill participants must be active room members/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Finding C: Execution History Retention Survives Rule Deletion
  // --------------------------------------------------------------------------
  describe('Finding C: Execution History Preservation in PostgreSQL', () => {
    let ruleId: string;
    let execId: string;

    beforeAll(async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      const res = await db.query<{ id: string }>(`
        INSERT INTO public.recurring_expense_rules (
          user_id, room_id, scope, title, amount, category, frequency, split_method, split_participant_ids, auto_log, start_date, next_execution_date
        ) VALUES (
          '${ALICE_ID}', '${ROOM_ID}', 'SHARED', 'Cylinder Refill', 1100.00, 'Gas', 'MONTHLY',
          'EQUAL', ARRAY['${ALICE_ID}'::uuid, '${BOB_ID}'::uuid], false, '2026-11-01'::date, '2026-11-01'::date
        ) RETURNING id;
      `);
      ruleId = res.rows[0].id;

      const cycleRes = await db.query<{ execute_recurring_cycle_secure: any }>(`
        SELECT public.execute_recurring_cycle_secure('${ruleId}', '2026-11-01'::date, NULL, 'CONFIRM_LOG');
      `);
      execId = cycleRes.rows[0].execute_recurring_cycle_secure.execution_id;
    });

    it('stores snapshot columns (owner_user_id, room_id, rule_title, rule_category)', async () => {
      const res = await db.query<{
        owner_user_id: string;
        room_id: string;
        rule_title: string;
        rule_category: string;
      }>(`
        SELECT owner_user_id, room_id, rule_title, rule_category
        FROM public.recurring_expense_executions
        WHERE id = '${execId}';
      `);

      expect(res.rows[0].owner_user_id).toBe(ALICE_ID);
      expect(res.rows[0].room_id).toBe(ROOM_ID);
      expect(res.rows[0].rule_title).toBe('Cylinder Refill');
      expect(res.rows[0].rule_category).toBe('Gas');
    });

    it('preserves execution row with rule_id SET NULL when parent rule is deleted', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      // Delete the parent rule
      await db.exec(`DELETE FROM public.recurring_expense_rules WHERE id = '${ruleId}';`);

      const execQuery = await db.query<{ id: string; rule_id: string | null; rule_title: string }>(`
        SELECT id, rule_id, rule_title FROM public.recurring_expense_executions WHERE id = '${execId}';
      `);

      expect(execQuery.rows.length).toBe(1);
      expect(execQuery.rows[0].rule_id).toBeNull();
      expect(execQuery.rows[0].rule_title).toBe('Cylinder Refill');
    });

    it('enforces RLS policy allowing room members to query orphaned historical execution records', async () => {
      // Bob queries execution history
      await db.exec(`SET request.jwt.claim.sub = '${BOB_ID}';`);
      const res = await db.query<{ id: string; rule_title: string }>(`
        SELECT id, rule_title FROM public.recurring_expense_executions
        WHERE room_id = '${ROOM_ID}';
      `);

      expect(res.rows.some((r) => r.rule_title === 'Cylinder Refill')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Finding E & Finding 10: Certified Reconciliation Periods Cannot Be Downgraded
  // --------------------------------------------------------------------------
  describe('Finding E & Finding 10: Certified Period Immutability in Real PostgreSQL', () => {
    let periodId: string;

    beforeAll(async () => {
      // Alice (ROOM_ADMIN) locks October 2026
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      const lockRes = await db.query<{ lock_room_period_v2: any }>(`
        SELECT public.lock_room_period_v2('${ROOM_ID}', 2026, 10);
      `);
      periodId = lockRes.rows[0].lock_room_period_v2.period_id;

      // Alice, Bob, and Charlie all sign off
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      await db.exec(`SELECT public.sign_room_statement_v2('${periodId}', 'SIGNED');`);

      await db.exec(`SET request.jwt.claim.sub = '${BOB_ID}';`);
      await db.exec(`SELECT public.sign_room_statement_v2('${periodId}', 'SIGNED');`);

      await db.exec(`SET request.jwt.claim.sub = '${CHARLIE_ID}';`);
      const charlieSign = await db.query<{ sign_room_statement_v2: any }>(`
        SELECT public.sign_room_statement_v2('${periodId}', 'SIGNED');
      `);

      // Once all sign, period automatically transitions to CERTIFIED with seal hash
      expect(charlieSign.rows[0].sign_room_statement_v2.is_certified).toBe(true);
      expect(charlieSign.rows[0].sign_room_statement_v2.certified_seal_hash).toBeTruthy();
    });

    it('verifies period status is CERTIFIED and sealed with deterministic hash', async () => {
      const res = await db.query<{ status: string; certified_seal_hash: string }>(`
        SELECT status, certified_seal_hash FROM public.room_reconciliation_periods WHERE id = '${periodId}';
      `);
      expect(res.rows[0].status).toBe('CERTIFIED');
      expect(res.rows[0].certified_seal_hash.length).toBe(64); // 64 hex characters (SHA-256)
    });

    it('Finding 10: unlock_room_period_v2 throws PERIOD_CERTIFIED if an admin attempts to reopen', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      await expect(
        db.exec(`
          SELECT public.unlock_room_period_v2('${ROOM_ID}', 2026, 10, 'Audit correction needed');
        `)
      ).rejects.toThrow(/PERIOD_CERTIFIED: Certified statement periods are cryptographically sealed and cannot be reopened or downgraded/);
    });

    it('Finding E: lock_room_period_v2 throws PERIOD_CERTIFIED if caller attempts to re-lock/downgrade', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      await expect(
        db.exec(`
          SELECT public.lock_room_period_v2('${ROOM_ID}', 2026, 10);
        `)
      ).rejects.toThrow(/PERIOD_CERTIFIED: Reconciliation period 2026-10 is already certified and cannot be locked or modified/);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Finding 4: Bidirectional Period Mutation Guard Trigger
  // --------------------------------------------------------------------------
  describe('Finding 4: Bidirectional Period Lock Mutation Trigger in Real PostgreSQL', () => {
    it('blocks INSERT of new expense into certified/locked period (2026-10)', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      await expect(
        db.exec(`
          INSERT INTO public.shared_expenses (
            room_id, created_by, paid_by, title, total_amount, category, split_method, expense_date
          ) VALUES (
            '${ROOM_ID}', '${ALICE_ID}', '${ALICE_ID}', 'Late WiFi Bill', 500.00, 'Wi-Fi', 'EQUAL', '2026-10-15'
          );
        `)
      ).rejects.toThrow(/PERIOD_LOCKED: Cannot add transaction to 2026-10 because monthly reconciliation is locked \(CERTIFIED\)/);
    });

    it('allows INSERT of expense into an open period (2026-09)', async () => {
      await db.exec(`SET request.jwt.claim.sub = '${ALICE_ID}';`);
      const res = await db.query<{ id: string }>(`
        INSERT INTO public.shared_expenses (
          room_id, created_by, paid_by, title, total_amount, category, split_method, expense_date
        ) VALUES (
          '${ROOM_ID}', '${ALICE_ID}', '${ALICE_ID}', 'September Groceries', 800.00, 'Groceries', 'EQUAL', '2026-09-15'
        ) RETURNING id;
      `);
      expect(res.rows[0].id).toBeDefined();

      const expenseId = res.rows[0].id;

      // Attempt to move this expense from open September into certified October
      await expect(
        db.exec(`
          UPDATE public.shared_expenses
          SET expense_date = '2026-10-20'
          WHERE id = '${expenseId}';
        `)
      ).rejects.toThrow(/PERIOD_LOCKED: Cannot move transaction into locked period 2026-10 \(CERTIFIED\)/);
    });
  });
});

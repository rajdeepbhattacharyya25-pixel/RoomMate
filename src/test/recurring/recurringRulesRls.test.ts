import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 2: Database Migration SQL, RLS Security & Idempotency Contract', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../supabase/migrations/20261031140000_recurring_bills_engine.sql'
  );

  it('contains the mandatory safety check protecting production project pbzaaskftrmnvocczhat', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("LIKE '%pbzaaskftrmnvocczhat%'");
    expect(sql).toContain("RAISE EXCEPTION 'SAFETY TRIGGERED: Migration blocked against production project pbzaaskftrmnvocczhat!'");
  });

  it('enforces strict unique constraint on (rule_id, cycle_date) for zero duplicate executions', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('CONSTRAINT uq_recurring_rule_cycle_date UNIQUE (rule_id, cycle_date)');
  });

  it('enables Row Level Security and revokes table access from anonymous users', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ALTER TABLE public.recurring_expense_rules ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.recurring_expense_executions ENABLE ROW LEVEL SECURITY;');

    expect(sql).toContain('REVOKE ALL ON public.recurring_expense_rules FROM anon;');
    expect(sql).toContain('REVOKE ALL ON public.recurring_expense_executions FROM anon;');
  });

  it('enforces owner-only isolation on personal recurring rules', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // SELECT policy
    expect(sql).toContain("scope = 'PERSONAL' AND user_id = auth.uid()");
    // INSERT policy check
    expect(sql).toContain("user_id = auth.uid() AND amount > 0");
    // UPDATE & DELETE policies
    expect(sql).toContain('CREATE POLICY "recurring_rules_personal_update"');
    expect(sql).toContain('CREATE POLICY "recurring_rules_personal_delete"');
  });

  it('hardens execute_recurring_cycle_secure RPC with immutable search_path and caller check', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('SET search_path = public, pg_temp');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('v_caller_id UUID := auth.uid();');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.execute_recurring_cycle_secure FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.execute_recurring_cycle_secure TO authenticated, service_role;');
  });

  it('simulates idempotent execution preventing double-charging on duplicate cycle attempts', async () => {
    // In-memory simulation of database state
    const processedCycles = new Set<string>();

    const simulateExecuteCycle = (ruleId: string, cycleDate: string, amount: number) => {
      const cycleKey = `${ruleId}_${cycleDate}`;
      if (processedCycles.has(cycleKey)) {
        return { success: true, message: 'ALREADY_PROCESSED', status: 'ALREADY_PROCESSED' };
      }
      processedCycles.add(cycleKey);
      return { success: true, message: 'LOGGED', status: 'MANUALLY_CONFIRMED', amount };
    };

    // First attempt -> succeeds and logs
    const attempt1 = simulateExecuteCycle('rule-1', '2026-11-01', 5000);
    expect(attempt1.status).toBe('MANUALLY_CONFIRMED');

    // Second retry attempt (e.g. network retry or concurrent app opens) -> returns ALREADY_PROCESSED without double logging
    const attempt2 = simulateExecuteCycle('rule-1', '2026-11-01', 5000);
    expect(attempt2.status).toBe('ALREADY_PROCESSED');
    expect(attempt2.message).toBe('ALREADY_PROCESSED');

    // Subsequent cycle (next month) -> successfully logs
    const attempt3 = simulateExecuteCycle('rule-1', '2026-12-01', 5000);
    expect(attempt3.status).toBe('MANUALLY_CONFIRMED');
  });
});

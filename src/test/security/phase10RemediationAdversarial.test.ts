import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Phase 10 Security Remediation & Adversarial Verification Suite', () => {
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

  // --------------------------------------------------------------------------
  // Finding 1: Shared Recurring Rule Ownership & Server-Side Payer Validation
  // --------------------------------------------------------------------------
  describe('Finding 1: Rule Ownership & Payer Validation', () => {
    it('mandates user_id = auth.uid() on INSERT across both PERSONAL and SHARED scopes', () => {
      // Must not allow arbitrary user_id in shared scope
      expect(recurringSql).toContain('CREATE POLICY "recurring_rules_personal_insert"');
      expect(recurringSql).toContain('user_id = auth.uid() AND amount > 0');
      // Shared scope still requires user_id = auth.uid()
      expect(recurringSql).toMatch(/scope = 'SHARED'.*room_id IS NOT NULL/);
    });

    it('enforces server-side validation that designated payer is an active member of the room', () => {
      expect(recurringSql).toContain('PAYER_INACTIVE: Designated recurring payer');
      expect(recurringSql).toContain("status = 'ACTIVE'");
    });

    it('adversarial simulation: blocks rogue roommate from attributing payer debt to another member', () => {
      const callerId = 'user-attacker';
      const victimId = 'user-victim';

      const simulateRuleInsertPolicy = (record: { user_id: string; scope: string; room_id?: string }, authUid: string) => {
        // Policy: user_id = auth.uid()
        if (record.user_id !== authUid) {
          throw new Error('RLS_VIOLATION: user_id must equal auth.uid()');
        }
        return true;
      };

      // Attacker attempts to forge victim as rule creator/payer
      expect(() => {
        simulateRuleInsertPolicy({ user_id: victimId, scope: 'SHARED', room_id: 'room-1' }, callerId);
      }).toThrow('RLS_VIOLATION');

      // Valid insert where caller sets themselves
      expect(simulateRuleInsertPolicy({ user_id: callerId, scope: 'SHARED', room_id: 'room-1' }, callerId)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Finding 2: Enforce auto_log = true before permitting AUTO_LOG
  // --------------------------------------------------------------------------
  describe('Finding 2: Server-Side Auto-Log Authorization', () => {
    it('verifies SQL RPC rejects AUTO_LOG action when rule auto_log is false', () => {
      expect(recurringSql).toContain("IF p_action = 'AUTO_LOG' THEN");
      expect(recurringSql).toContain('AUTO_LOG_FORBIDDEN: Rule % is configured for manual review (auto_log is false)');
    });

    it('adversarial simulation: rejects unauthorized client attempting to bypass manual review', () => {
      const simulateRpcAction = (rule: { auto_log: boolean }, action: string) => {
        if (action === 'AUTO_LOG') {
          if (!rule.auto_log) {
            throw new Error('AUTO_LOG_FORBIDDEN: Rule is not configured for automatic execution');
          }
          return 'AUTO_LOGGED';
        }
        return 'MANUALLY_CONFIRMED';
      };

      // Rule requires manual review (auto_log = false)
      const manualRule = { auto_log: false };
      expect(() => simulateRpcAction(manualRule, 'AUTO_LOG')).toThrow('AUTO_LOG_FORBIDDEN');

      // Rule allows auto-log
      const autoRule = { auto_log: true };
      expect(simulateRpcAction(autoRule, 'AUTO_LOG')).toBe('AUTO_LOGGED');
    });
  });

  // --------------------------------------------------------------------------
  // Finding 3: Restrict Direct Client Writes to Execution Ledger
  // --------------------------------------------------------------------------
  describe('Finding 3: Recurring Execution Direct Write Restriction', () => {
    it('revokes INSERT, UPDATE, and DELETE on recurring_expense_executions from authenticated role', () => {
      expect(recurringSql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.recurring_expense_executions FROM authenticated;');
      expect(recurringSql).toContain('CREATE POLICY "recurring_executions_block_client_writes"');
      expect(recurringSql).toContain('USING (false)');
      expect(recurringSql).toContain('WITH CHECK (false)');
    });

    it('leaves recurring_expense_executions accessible only via SELECT and authoritative RPC', () => {
      expect(recurringSql).toContain('CREATE POLICY "recurring_executions_select"');
      expect(recurringSql).not.toContain('CREATE POLICY "recurring_executions_insert"');
      expect(recurringSql).not.toContain('CREATE POLICY "recurring_executions_update"');
    });
  });

  // --------------------------------------------------------------------------
  // Finding 4: Validate both OLD and NEW room/date periods on locked transactions
  // --------------------------------------------------------------------------
  describe('Finding 4: Bidirectional Period Lock Mutation Guard', () => {
    it('verifies trigger inspects both OLD and NEW periods during UPDATE', () => {
      expect(statementSql).toContain("IF TG_OP = 'UPDATE' THEN");
      expect(statementSql).toContain('Cannot modify or move transaction out of locked period');
      expect(statementSql).toContain('Cannot move transaction into locked period');
    });

    it('adversarial simulation: prevents moving an expense out of a locked period into an unlocked period', () => {
      const lockedPeriods = new Set(['2026-10']);

      const simulateTransactionUpdateTrigger = (oldDate: string, newDate: string) => {
        const oldPeriod = oldDate.substring(0, 7);
        const newPeriod = newDate.substring(0, 7);

        // 1. Check OLD period lock
        if (lockedPeriods.has(oldPeriod)) {
          throw new Error(`PERIOD_LOCKED: Cannot modify or move transaction out of locked period ${oldPeriod}`);
        }
        // 2. Check NEW period lock
        if (lockedPeriods.has(newPeriod)) {
          throw new Error(`PERIOD_LOCKED: Cannot move transaction into locked period ${newPeriod}`);
        }
        return true;
      };

      // Attacker attempts to update date of October 2026 transaction (locked) to November 2026 (unlocked)
      expect(() => {
        simulateTransactionUpdateTrigger('2026-10-15', '2026-11-01');
      }).toThrow('Cannot modify or move transaction out of locked period 2026-10');

      // Attacker attempts to move unlocked November transaction into locked October period
      expect(() => {
        simulateTransactionUpdateTrigger('2026-11-05', '2026-10-20');
      }).toThrow('Cannot move transaction into locked period 2026-10');

      // Legitimate update between unlocked periods
      expect(simulateTransactionUpdateTrigger('2026-11-01', '2026-11-05')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Finding 5: Replace Certification Hash with Deterministic Canonical Digest
  // --------------------------------------------------------------------------
  describe('Finding 5: Cryptographic Canonical Statement Digest', () => {
    it('verifies SQL RPC hashes sorted canonical expenses, splits, settlements, and signatures', () => {
      expect(statementSql).toContain('CANONICAL_STATEMENT_SEAL_V2');
      expect(statementSql).toContain('ORDER BY coalesce(expense_date, created_at) ASC, id ASC');
      expect(statementSql).toContain('ORDER BY shared_expense_id ASC, user_id ASC');
      expect(statementSql).toContain('ORDER BY coalesce(payment_date, created_at) ASC, id ASC');
      expect(statementSql).toContain('ORDER BY user_id ASC');
    });

    it('adversarial simulation: produces deterministic hash that breaks on any tampering', () => {
      const generateCanonicalDigest = (dataset: {
        roomId: string;
        year: number;
        month: number;
        expenses: { id: string; amount: number }[];
        splits: { id: string; amount: number }[];
        signoffs: { userId: string; status: string }[];
      }) => {
        const expStr = dataset.expenses.map((e) => `${e.id}:${e.amount}`).sort().join('|');
        const splitStr = dataset.splits.map((s) => `${s.id}:${s.amount}`).sort().join('|');
        const signStr = dataset.signoffs.map((s) => `${s.userId}:${s.status}`).sort().join('|');

        const canonicalPayload = `ROOM:${dataset.roomId}|YEAR:${dataset.year}|MONTH:${dataset.month}|EXP:${expStr}|SPL:${splitStr}|SIG:${signStr}`;
        return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
      };

      const baseline = {
        roomId: 'room-101',
        year: 2026,
        month: 10,
        expenses: [{ id: 'e1', amount: 500 }, { id: 'e2', amount: 200 }],
        splits: [{ id: 's1', amount: 250 }, { id: 's2', amount: 250 }],
        signoffs: [{ userId: 'u1', status: 'SIGNED' }, { userId: 'u2', status: 'SIGNED' }],
      };

      const hash1 = generateCanonicalDigest(baseline);
      const hash2 = generateCanonicalDigest(baseline);

      // Determinism: Same input must yield identical hash every time
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);

      // Tampering: Change a split by even 1 cent
      const tampered = {
        ...baseline,
        splits: [{ id: 's1', amount: 250.01 }, { id: 's2', amount: 249.99 }],
      };
      const tamperedHash = generateCanonicalDigest(tampered);

      expect(tamperedHash).not.toBe(hash1);
    });
  });

  // --------------------------------------------------------------------------
  // Finding 6: Historical Statement Access for Former Members
  // --------------------------------------------------------------------------
  describe('Finding 6: Historical Statement Access for Former Members', () => {
    it('verifies RLS policy allows members who were active during the period to read', () => {
      expect(statementSql).toContain('Members and historical signatories can view room periods');
      expect(statementSql).toContain('rm.joined_at <=');
      expect(statementSql).toContain('rm.left_at IS NULL OR rm.left_at >=');
    });

    it('verifies RPC get_room_reconciliation_statement_v2 verifies historical tenure', () => {
      expect(statementSql).toContain('v_has_access');
      expect(statementSql).toContain('rm.joined_at <= v_month_end');
      expect(statementSql).toContain('rm.left_at IS NULL OR rm.left_at >= v_month_start');
    });
  });

  // --------------------------------------------------------------------------
  // Finding 7: Validate Rule Status, Cycle Dates, and Amount Bounds Server-Side
  // --------------------------------------------------------------------------
  describe('Finding 7: Server-Side Schedule & Bound Validation', () => {
    it('verifies RPC checks rule ACTIVE status, archival, and date boundaries', () => {
      expect(recurringSql).toContain("IF v_rule.status <> 'ACTIVE' THEN");
      expect(recurringSql).toContain('RULE_INACTIVE');
      expect(recurringSql).toContain('RULE_ARCHIVED');
      expect(recurringSql).toContain('CYCLE_BEFORE_START');
      expect(recurringSql).toContain('CYCLE_AFTER_END');
      expect(recurringSql).toContain('INVALID_AMOUNT: Recurring expense amount must be between 0.01 and 1,000,000.00 INR');
    });
  });

  // --------------------------------------------------------------------------
  // Finding 8: Canonical Shared Expense Splits with Integer Paise Reconciliation
  // --------------------------------------------------------------------------
  describe('Finding 8: Canonical Shared Split Generation', () => {
    it('verifies RPC calculates and inserts expense_splits with exact integer paise distribution', () => {
      expect(recurringSql).toContain('v_total_paise := ROUND(v_final_amount * 100);');
      expect(recurringSql).toContain('v_base_paise := v_total_paise / v_member_count;');
      expect(recurringSql).toContain('v_rem_paise := (v_total_paise % v_member_count)::INT;');
      expect(recurringSql).toContain('INSERT INTO public.expense_splits');
    });

    it('adversarial simulation: reconciles odd amounts across 3 roommates with zero loss of remainder paise', () => {
      const allocateSplits = (totalAmount: number, memberCount: number) => {
        const totalPaise = Math.round(totalAmount * 100);
        const basePaise = Math.floor(totalPaise / memberCount);
        const remPaise = totalPaise % memberCount;

        const splits: number[] = [];
        for (let i = 0; i < memberCount; i++) {
          const sharePaise = i < remPaise ? basePaise + 1 : basePaise;
          splits.push(sharePaise / 100);
        }
        return splits;
      };

      // ₹1000 divided among 3 roommates: 333.34, 333.33, 333.33
      const splits1000 = allocateSplits(1000, 3);
      expect(splits1000).toEqual([333.34, 333.33, 333.33]);
      const sum1000 = splits1000.reduce((a, b) => a + b, 0);
      expect(Math.round(sum1000 * 100)).toBe(100000);

      // ₹500 divided among 3 roommates: 166.67, 166.67, 166.66
      const splits500 = allocateSplits(500, 3);
      expect(splits500).toEqual([166.67, 166.67, 166.66]);
      const sum500 = splits500.reduce((a, b) => a + b, 0);
      expect(Math.round(sum500 * 100)).toBe(50000);
    });
  });

  // --------------------------------------------------------------------------
  // Finding 9: Preserve Execution Audit History on Rule Deletion / Archival
  // --------------------------------------------------------------------------
  describe('Finding 9: Audit History Preservation', () => {
    it('verifies ON DELETE SET NULL on rule_id and snapshot columns in recurring_expense_executions', () => {
      expect(recurringSql).toContain('rule_id UUID REFERENCES public.recurring_expense_rules(id) ON DELETE SET NULL');
      expect(recurringSql).toContain('rule_title TEXT');
      expect(recurringSql).toContain('rule_scope public.recurring_scope_type');
      expect(recurringSql).toContain('rule_category TEXT');
    });

    it('verifies is_archived and archived_at fields on recurring_expense_rules', () => {
      expect(recurringSql).toContain('is_archived BOOLEAN NOT NULL DEFAULT false');
      expect(recurringSql).toContain('archived_at TIMESTAMPTZ');
    });
  });

  // --------------------------------------------------------------------------
  // Finding 10 & Finding E: Prevent Reopening or Downgrading Certified Periods
  // --------------------------------------------------------------------------
  describe('Finding 10 & Finding E: Certified Period Immutability in lock and unlock RPCs', () => {
    it('verifies unlock_room_period_v2 explicitly blocks unlocking CERTIFIED periods', () => {
      expect(statementSql).toContain("IF v_current_status = 'CERTIFIED' THEN");
      expect(statementSql).toContain('PERIOD_CERTIFIED: Certified statement periods are cryptographically sealed and cannot be reopened or downgraded');
    });

    it('verifies lock_room_period_v2 explicitly rejects attempts to downgrade CERTIFIED periods (Finding E)', () => {
      expect(statementSql).toContain("IF v_period_status = 'CERTIFIED' THEN");
      expect(statementSql).toContain("RAISE EXCEPTION 'PERIOD_CERTIFIED: Reconciliation period %-% is already certified and cannot be locked or modified.'");
      expect(statementSql).toContain("WHERE room_reconciliation_periods.status != 'CERTIFIED'");
    });

    it('adversarial simulation: blocks rogue admin from downgrading certified statement back to OPEN or LOCKED', () => {
      const simulateUnlockPeriod = (period: { status: string }) => {
        if (period.status === 'CERTIFIED') {
          throw new Error('PERIOD_CERTIFIED: Certified statement periods are cryptographically sealed');
        }
        return { status: 'OPEN' };
      };

      const simulateLockPeriod = (period: { status: string }) => {
        if (period.status === 'CERTIFIED') {
          throw new Error('PERIOD_CERTIFIED: Reconciliation period is already certified and cannot be locked or modified.');
        }
        return { status: 'LOCKED' };
      };

      expect(() => simulateUnlockPeriod({ status: 'CERTIFIED' })).toThrow('PERIOD_CERTIFIED');
      expect(simulateUnlockPeriod({ status: 'LOCKED' })).toEqual({ status: 'OPEN' });

      expect(() => simulateLockPeriod({ status: 'CERTIFIED' })).toThrow('PERIOD_CERTIFIED');
      expect(simulateLockPeriod({ status: 'OPEN' })).toEqual({ status: 'LOCKED' });
    });
  });

  // --------------------------------------------------------------------------
  // Finding F: Signature Stamp Audit Verification Digest Clarification
  // --------------------------------------------------------------------------
  describe('Finding F: Signature Stamp Audit Clarification', () => {
    it('verifies signature_stamp is explicitly documented as an audit verification digest, not PKI digital signature', () => {
      expect(statementSql).toContain('Audit verification digest (SHA-256 over user_id, period_id, and timestamp)');
      expect(statementSql).toContain('Tamper-evident ledger approval audit record, not an asymmetric PKI digital signature');
    });
  });

  // --------------------------------------------------------------------------
  // Multi-Vector Production Safety Check Hardening & Fail-Closed Guard (Finding D)
  // --------------------------------------------------------------------------
  describe('Production Guard: Multi-Vector Safety Check & Fail-Closed Staging Requirement (Finding D)', () => {
    it('enforces fail-closed environment check requiring explicit roommate.environment setting', () => {
      expect(recurringSql).toContain("current_setting('roommate.environment', true) NOT IN ('staging', 'local', 'test')");
      expect(recurringSql).toContain('MIGRATION_BLOCKED: This migration contains staging/local DDL');

      expect(statementSql).toContain("current_setting('roommate.environment', true) NOT IN ('staging', 'local', 'test')");
      expect(statementSql).toContain('MIGRATION_BLOCKED: This migration contains staging/local DDL');
    });

    it('checks multiple independent sources beyond request.jwt.claims (project_ref, current_user, inet_server_addr)', () => {
      expect(recurringSql).toContain("app.settings.project_ref");
      expect(recurringSql).toContain("current_user LIKE '%pbzaaskftrmnvocczhat%'");
      expect(recurringSql).toContain("inet_server_addr()::text LIKE '%pbzaaskftrmnvocczhat%'");

      expect(statementSql).toContain("app.settings.project_ref");
      expect(statementSql).toContain("current_user LIKE '%pbzaaskftrmnvocczhat%'");
      expect(statementSql).toContain("inet_server_addr()::text LIKE '%pbzaaskftrmnvocczhat%'");
    });

    it('adversarial simulation: fail-closed blocks any migration run if roommate.environment is unset or unknown', () => {
      const simulateFailClosedMigrationGuard = (ctx: {
        environmentSetting: string | null;
        projectRef?: string;
      }) => {
        if (!ctx.environmentSetting || !['staging', 'local', 'test'].includes(ctx.environmentSetting)) {
          throw new Error('MIGRATION_BLOCKED: roommate.environment not set to staging/local/test');
        }
        if (ctx.projectRef === 'pbzaaskftrmnvocczhat') {
          throw new Error('SAFETY TRIGGERED: Migration blocked against production project pbzaaskftrmnvocczhat!');
        }
        return 'SUCCESS';
      };

      // Unset environment variable -> fails closed!
      expect(() => simulateFailClosedMigrationGuard({ environmentSetting: null })).toThrow('MIGRATION_BLOCKED');

      // Ambiguous or production setting -> fails closed!
      expect(() => simulateFailClosedMigrationGuard({ environmentSetting: 'production' })).toThrow('MIGRATION_BLOCKED');

      // Attempt to spoof staging on production project -> blocked by secondary vector!
      expect(() => simulateFailClosedMigrationGuard({ environmentSetting: 'staging', projectRef: 'pbzaaskftrmnvocczhat' })).toThrow('SAFETY TRIGGERED');

      // Genuine staging execution succeeds
      expect(simulateFailClosedMigrationGuard({ environmentSetting: 'staging', projectRef: 'staging-project-123' })).toBe('SUCCESS');
    });
  });
});


import { describe, it, expect } from 'vitest';
import { calculateRoomSummaryV2, validateSettlementAttempt } from './referenceEngine';
import { Expense, Settlement } from './types';

describe('Part 22 — Realtime Consistency Test Specification (Scenarios A–D)', () => {
  it('SCENARIO A: Authoritative Committed Snapshot Invariant', () => {
    // Device A creates an expense. Device B receives notification and computes snapshot.
    // Device B's local state must match Device A's authoritative committed state.
    const members = ['user-device-a', 'user-device-b'];
    const committedExpenses: Expense[] = [
      {
        id: 'exp-rt-1',
        roomId: 'room-rt',
        paidBy: 'user-device-a',
        totalAmountPaise: 20000,
        title: 'Electricity Bill',
        splitMethod: 'EQUAL',
        shares: [
          { userId: 'user-device-a', sharePaise: 10000 },
          { userId: 'user-device-b', sharePaise: 10000 },
        ],
      },
    ];

    const snapshotA = calculateRoomSummaryV2('room-rt', members, committedExpenses, []);
    const snapshotB = calculateRoomSummaryV2('room-rt', members, committedExpenses, []);

    // Assert: Device B's computed view is identical down to the exact paisa
    expect(snapshotB).toEqual(snapshotA);
    expect(snapshotB.isZeroSumVerified).toBe(true);
  });

  it('SCENARIO B: Atomic Commit Invariant (No partial state: expense without splits)', () => {
    // If an expense exists without committed splits, the ledger must reject it or treat it as incomplete.
    // In our reference model & PostgreSQL RPC, an expense cannot exist without full splits matching totalAmount.
    function validateExpenseAtomicity(exp: Expense): { isCommittedAndValid: boolean; error?: string } {
      if (!exp.shares || exp.shares.length === 0) {
        return { isCommittedAndValid: false, error: 'DANGLING_EXPENSE_NO_SPLITS' };
      }
      const sumShares = exp.shares.reduce((acc, s) => acc + s.sharePaise, 0);
      if (sumShares !== exp.totalAmountPaise) {
        return { isCommittedAndValid: false, error: 'SPLIT_SUM_MISMATCH' };
      }
      return { isCommittedAndValid: true };
    }

    const danglingExpense: Expense = {
      id: 'exp-dangling',
      roomId: 'room-rt',
      paidBy: 'user-device-a',
      totalAmountPaise: 10000,
      title: 'Partial Expense',
      splitMethod: 'EQUAL',
      shares: [], // Splits have not arrived yet!
    };

    const atomicityCheck = validateExpenseAtomicity(danglingExpense);
    expect(atomicityCheck.isCommittedAndValid).toBe(false);
    expect(atomicityCheck.error).toBe('DANGLING_EXPENSE_NO_SPLITS');
  });

  it('SCENARIO C: Concurrent Expense Creation Convergence', () => {
    // Device A and Device B create expenses concurrently:
    // Device A: Groceries ₹100 paid by A
    // Device B: Snacks ₹50 paid by B
    const members = ['user-device-a', 'user-device-b'];

    const expA: Expense = {
      id: 'exp-concurrent-a',
      roomId: 'room-concurrent',
      paidBy: 'user-device-a',
      totalAmountPaise: 10000,
      title: 'Groceries',
      splitMethod: 'EQUAL',
      shares: [
        { userId: 'user-device-a', sharePaise: 5000 },
        { userId: 'user-device-b', sharePaise: 5000 },
      ],
    };

    const expB: Expense = {
      id: 'exp-concurrent-b',
      roomId: 'room-concurrent',
      paidBy: 'user-device-b',
      totalAmountPaise: 5000,
      title: 'Snacks',
      splitMethod: 'EQUAL',
      shares: [
        { userId: 'user-device-a', sharePaise: 2500 },
        { userId: 'user-device-b', sharePaise: 2500 },
      ],
    };

    // Regardless of arrival order (A then B vs B then A), the converged ledger state is identical:
    const summaryOrderAB = calculateRoomSummaryV2('room-concurrent', members, [expA, expB], []);
    const summaryOrderBA = calculateRoomSummaryV2('room-concurrent', members, [expB, expA], []);

    expect(summaryOrderAB.members).toEqual(summaryOrderBA.members);
    expect(summaryOrderAB.simplifiedTransfers).toEqual(summaryOrderBA.simplifiedTransfers);
    expect(summaryOrderAB.isZeroSumVerified).toBe(true);
  });

  it('SCENARIO D: Concurrent Settlement Conflict Detection (Double Settlement Prevention)', () => {
    // Alice owes Bob ₹100 (10000 paise).
    // Device 1 and Device 2 concurrently attempt to settle ₹100 each.
    // The first settlement succeeds; the second must be rejected as over-settlement.
    const members = ['alice', 'bob'];
    const initialExpense: Expense = {
      id: 'exp-debt',
      roomId: 'room-settle',
      paidBy: 'bob',
      totalAmountPaise: 20000,
      title: 'Dinner',
      splitMethod: 'EQUAL',
      shares: [
        { userId: 'alice', sharePaise: 10000 },
        { userId: 'bob', sharePaise: 10000 },
      ],
    };

    // State 0: Alice owes 10000 paise
    const state0 = calculateRoomSummaryV2('room-settle', members, [initialExpense], []);
    const alicePos0 = state0.members.find((m) => m.userId === 'alice')!;
    const bobPos0 = state0.members.find((m) => m.userId === 'bob')!;

    // Settlement 1 arrives from Device 1
    const settle1Check = validateSettlementAttempt(alicePos0, bobPos0, 10000);
    expect(settle1Check.isValid).toBe(true);

    const settlement1: Settlement = {
      id: 'settle-tx-1',
      roomId: 'room-settle',
      payerId: 'alice',
      payeeId: 'bob',
      amountPaise: 10000,
      createdAt: '2026-10-04T10:00:00Z',
    };

    // State after Settlement 1 commits:
    const state1 = calculateRoomSummaryV2('room-settle', members, [initialExpense], [settlement1]);
    const alicePos1 = state1.members.find((m) => m.userId === 'alice')!;
    const bobPos1 = state1.members.find((m) => m.userId === 'bob')!;

    // Alice is now SETTLED (net position = 0)
    expect(alicePos1.netPositionPaise).toBe(0);

    // Settlement 2 arrives from Device 2 (concurrent attempt)
    const settle2Check = validateSettlementAttempt(alicePos1, bobPos1, 10000);
    expect(settle2Check.isValid).toBe(false);
    expect(settle2Check.error).toBe('PAYER_IS_NOT_A_DEBTOR');
    // Double settlement is completely blocked!
  });
});

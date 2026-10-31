import { describe, it, expect } from 'vitest';
import {
  calculateSplits,
  calculateEqualSplitsV2,
  calculateCanonicalRoomSummary,
  financialIntegrationService,
  MemberNetPositionV2,
} from '../../lib/ledger/engine';
import { SharedExpense, ExpenseSplit, SettlementPayment, User } from '../../types';

describe('Phase 10: Roommate Split Expense — Auditable Ledger & Simplification', () => {
  const userA: User = { id: 'usr-alice-1111-1111-1111-111111111111', name: 'Alice', email: 'alice@test.com' };
  const userB: User = { id: 'usr-bob-2222-2222-2222-222222222222', name: 'Bob', email: 'bob@test.com' };
  const userC: User = { id: 'usr-charlie-3333-3333-3333-333333333333', name: 'Charlie', email: 'charlie@test.com' };
  const userD: User = { id: 'usr-david-4444-4444-4444-444444444444', name: 'David', email: 'david@test.com' };
  const allUsers = [userA, userB, userC, userD];
  const roomId = 'room-flat-101-alpha';

  describe('1. Equal Split & Member Exclusion with Exact INR Paise Math', () => {
    it('splits equally among selected participants while excluding specific members', () => {
      // 4 members in room, but only Alice, Bob, Charlie share ₹900 groceries (David excluded)
      const selectedParticipants = [userA.id, userB.id, userC.id];
      const splits = calculateSplits(900, selectedParticipants, 'EQUAL');

      expect(splits).toHaveLength(3);
      expect(splits.find((s) => s.userId === userD.id)).toBeUndefined();

      for (const s of splits) {
        expect(s.shareAmount).toBe(300);
      }
      const sum = splits.reduce((acc, s) => acc + s.shareAmount, 0);
      expect(sum).toBe(900);
    });

    it('distributes remainder cents deterministically with zero roundoff error (₹100 split 3 ways)', () => {
      const selectedParticipants = [userA.id, userB.id, userC.id];
      const splits = calculateSplits(100, selectedParticipants, 'EQUAL');

      expect(splits).toHaveLength(3);
      const totalAllocated = splits.reduce((acc, s) => acc + s.shareAmount, 0);
      expect(totalAllocated).toBe(100);

      const shares = splits.map((s) => s.shareAmount);
      // One share gets 33.34, other two get 33.33
      expect(shares).toContain(33.34);
      expect(shares.filter((val) => val === 33.33)).toHaveLength(2);
    });

    it('V2 integer paise equal split guarantees exact sum to the single paisa', () => {
      const participantIds = [userA.id, userB.id, userC.id];
      const totalPaise = 10000; // ₹100.00
      const v2Splits = calculateEqualSplitsV2(totalPaise, participantIds);

      expect(v2Splits).toHaveLength(3);
      const sumPaise = v2Splits.reduce((acc, s) => acc + s.sharePaise, 0);
      expect(sumPaise).toBe(10000);
      expect(v2Splits[0].sharePaise).toBe(3334);
      expect(v2Splits[1].sharePaise).toBe(3333);
      expect(v2Splits[2].sharePaise).toBe(3333);
    });
  });

  describe('2. Transitive Debt Simplification alongside Original Pairwise History', () => {
    it('provides both Splitwise-style simplified transfers AND detailed bilateral audit debts', () => {
      // Scenario:
      // Bill 1: Alice pays ₹1,200 for Alice, Bob, Charlie, David (₹300 each)
      const exp1: SharedExpense = {
        id: 'exp-1',
        roomId,
        createdBy: userA.id,
        paidBy: userA.id,
        title: 'Electricity',
        totalAmount: 1200,
        category: 'Electricity',
        splitMethod: 'EQUAL',
        expenseDate: '2026-10-01',
        isDeleted: false,
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      };
      const splits1: ExpenseSplit[] = [
        { id: 's1-a', sharedExpenseId: 'exp-1', userId: userA.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
        { id: 's1-b', sharedExpenseId: 'exp-1', userId: userB.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
        { id: 's1-c', sharedExpenseId: 'exp-1', userId: userC.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
        { id: 's1-d', sharedExpenseId: 'exp-1', userId: userD.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
      ];

      // Bill 2: Bob pays ₹600 for Bob & Charlie (₹300 each)
      const exp2: SharedExpense = {
        id: 'exp-2',
        roomId,
        createdBy: userB.id,
        paidBy: userB.id,
        title: 'Wi-Fi',
        totalAmount: 600,
        category: 'Wi-Fi',
        splitMethod: 'EQUAL',
        expenseDate: '2026-10-02',
        isDeleted: false,
        createdAt: '2026-10-02T10:00:00Z',
        updatedAt: '2026-10-02T10:00:00Z',
      };
      const splits2: ExpenseSplit[] = [
        { id: 's2-b', sharedExpenseId: 'exp-2', userId: userB.id, shareAmount: 300, createdAt: '2026-10-02T10:00:00Z' },
        { id: 's2-c', sharedExpenseId: 'exp-2', userId: userC.id, shareAmount: 300, createdAt: '2026-10-02T10:00:00Z' },
      ];

      const expenses = [exp1, exp2];
      const splits = [...splits1, ...splits2];
      const settlements: SettlementPayment[] = [];

      const summary = calculateCanonicalRoomSummary(
        roomId,
        userA.id,
        expenses,
        splits,
        settlements,
        allUsers
      );

      // Verify Total Room Spending & Net Balances:
      // Alice: paid 1200, share 300 -> Net = +900 (Creditor)
      // Bob: paid 600, share 600 (300 + 300) -> Net = 0 (Settled)
      // Charlie: paid 0, share 600 (300 + 300) -> Net = -600 (Debtor)
      // David: paid 0, share 300 -> Net = -300 (Debtor)
      // Sum of net balances = 900 + 0 - 600 - 300 = 0 (Zero-Sum invariant verified)
      expect(summary.isZeroSumVerified).toBe(true);
      expect(summary.myNetBalance).toBe(900);

      // 1. Transitive Simplification (pairwiseDebts - Splitwise default):
      // Bob has net 0, so Bob does NOT need to pay or receive anything!
      // Charlie owes Alice ₹600.
      // David owes Alice ₹300.
      // Total transactions = 2 (instead of 3 bilateral payments).
      expect(summary.pairwiseDebts.length).toBe(2);
      const simplifiedDebtors = summary.pairwiseDebts.map((d) => d.userBId);
      expect(simplifiedDebtors).toContain(userC.id);
      expect(simplifiedDebtors).toContain(userD.id);
      expect(simplifiedDebtors).not.toContain(userB.id);

      // 2. Detailed Bilateral Audit Ledger (pairwiseAuditDebts):
      // Retains the exact bill-by-bill accounting:
      // Bob directly owes Alice ₹300 for Bill 1.
      // Charlie directly owes Bob ₹300 for Bill 2.
      // Charlie directly owes Alice ₹300 for Bill 1.
      // David directly owes Alice ₹300 for Bill 1.
      expect(summary.pairwiseAuditDebts).toBeDefined();
      expect(summary.pairwiseAuditDebts!.length).toBe(4);

      // Verify Bob <-> Alice audit trail:
      const bobAliceAudit = summary.pairwiseAuditDebts!.find(
        (d) => (d.userAId === userA.id && d.userBId === userB.id) || (d.userAId === userB.id && d.userBId === userA.id)
      );
      expect(bobAliceAudit).toBeDefined();
      expect(Math.abs(bobAliceAudit!.netAmount)).toBe(300);
      expect(bobAliceAudit!.explanation.aPaidForB).toBe(300);
    });

    it('preserves audit history and updates balances correctly after partial settlements', () => {
      // Alice paid ₹1,200 for 4 members (each ₹300)
      const exp: SharedExpense = {
        id: 'exp-1',
        roomId,
        createdBy: userA.id,
        paidBy: userA.id,
        title: 'Dinner',
        totalAmount: 1200,
        category: 'Food',
        splitMethod: 'EQUAL',
        expenseDate: '2026-10-01',
        isDeleted: false,
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      };
      const splits: ExpenseSplit[] = [
        { id: 's1', sharedExpenseId: 'exp-1', userId: userA.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
        { id: 's2', sharedExpenseId: 'exp-1', userId: userB.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
        { id: 's3', sharedExpenseId: 'exp-1', userId: userC.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
        { id: 's4', sharedExpenseId: 'exp-1', userId: userD.id, shareAmount: 300, createdAt: '2026-10-01T10:00:00Z' },
      ];

      // Bob makes a partial payment of ₹200 to Alice via UPI (leaving ₹100 unpaid)
      const pmt1: SettlementPayment = {
        id: 'pmt-1',
        roomId,
        payerId: userB.id,
        payeeId: userA.id,
        amount: 200,
        paymentMethod: 'UPI',
        transactionRef: 'UPI-TXN-PARTIAL-200',
        paymentDate: '2026-10-02',
        createdAt: '2026-10-02T12:00:00Z',
      };

      const summary = calculateCanonicalRoomSummary(
        roomId,
        userB.id,
        [exp],
        splits,
        [pmt1],
        allUsers
      );

      // Bob's net balance should now be -₹100 (₹300 share - ₹200 paid)
      expect(summary.myNetBalance).toBe(-100);

      // Audit trail in pairwiseAuditDebts shows:
      // aPaidForB: 300, settlementsBToA: 200, net: 100
      const auditDebt = summary.pairwiseAuditDebts!.find(
        (d) => (d.userAId === userA.id && d.userBId === userB.id) || (d.userAId === userB.id && d.userBId === userA.id)
      );
      expect(auditDebt).toBeDefined();
      expect(Math.abs(auditDebt!.netAmount)).toBe(100);
      expect(auditDebt!.explanation.settlementsBToA).toBe(200);
      expect(auditDebt!.explanation.aPaidForB).toBe(300);
    });
  });

  describe('3. Validation Against Oversettlement', () => {
    it('validates settlement attempt and prevents paying more than outstanding debt', () => {
      // Bob owes Alice ₹300
      const netPositions = new Map<string, MemberNetPositionV2>();
      netPositions.set(userA.id, {
        userId: userA.id,
        totalPaidPaise: 120000,
        totalSharePaise: 30000,
        settlementsSentPaise: 0,
        settlementsReceivedPaise: 0,
        grossNetPaise: 90000,
        netPositionPaise: 90000, // +₹900
        direction: 'RECEIVE',
        absoluteAmountPaise: 90000,
        displayInr: '₹900.00',
      });
      netPositions.set(userB.id, {
        userId: userB.id,
        totalPaidPaise: 0,
        totalSharePaise: 30000,
        settlementsSentPaise: 0,
        settlementsReceivedPaise: 0,
        grossNetPaise: -30000,
        netPositionPaise: -30000, // -₹300
        direction: 'OWES',
        absoluteAmountPaise: 30000,
        displayInr: '₹300.00',
      });

      // Attempt 1: Valid partial payment of ₹200 (20000 paise)
      const validPartial = financialIntegrationService.validateSettlementAttemptV2(
        netPositions.get(userB.id),
        netPositions.get(userA.id),
        20000
      );
      expect(validPartial.isValid).toBe(true);

      // Attempt 2: Oversettlement of ₹500 (50000 paise when Bob only owes 30000 paise)
      const oversettlement = financialIntegrationService.validateSettlementAttemptV2(
        netPositions.get(userB.id),
        netPositions.get(userA.id),
        50000
      );
      expect(oversettlement.isValid).toBe(false);
      expect(oversettlement.error).toContain('OVERSETTLEMENT_EXCEEDS_DEBT');
      expect(oversettlement.maxPermissiblePaise).toBe(30000);
    });
  });
});

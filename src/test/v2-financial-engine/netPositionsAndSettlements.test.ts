import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  calculateMemberNetPositions,
  validateSettlementAttempt,
  calculateRoomSummaryV2,
} from './referenceEngine';
import { Expense, Settlement } from './types';

describe('Part 11 — Net Position Tests', () => {
  it('correctly calculates gross net and settlement-adjusted position with semantic directions', () => {
    // 3 members: A, B, C
    // Expense: A pays ₹300, split equally (100 each)
    // Gross: A: +200 (RECEIVE), B: -100 (OWES), C: -100 (OWES)
    const members = ['user-a', 'user-b', 'user-c'];
    const expenses: Expense[] = [
      {
        id: 'exp-1',
        roomId: 'room-1',
        paidBy: 'user-a',
        totalAmountPaise: 30000,
        title: 'Dinner',
        splitMethod: 'EQUAL',
        shares: [
          { userId: 'user-a', sharePaise: 10000 },
          { userId: 'user-b', sharePaise: 10000 },
          { userId: 'user-c', sharePaise: 10000 },
        ],
      },
    ];

    // Initial state before settlements
    const initialNetMap = calculateMemberNetPositions(members, expenses, []);
    const posA = initialNetMap.get('user-a')!;
    const posB = initialNetMap.get('user-b')!;
    const posC = initialNetMap.get('user-c')!;

    expect(posA.netPositionPaise).toBe(20000);
    expect(posA.direction).toBe('RECEIVE');
    expect(posA.absoluteAmountPaise).toBe(20000);

    expect(posB.netPositionPaise).toBe(-10000);
    expect(posB.direction).toBe('OWES');
    expect(posB.absoluteAmountPaise).toBe(10000);

    expect(posC.netPositionPaise).toBe(-10000);
    expect(posC.direction).toBe('OWES');
    expect(posC.absoluteAmountPaise).toBe(10000);

    // Sum of net positions must be 0
    expect(posA.netPositionPaise + posB.netPositionPaise + posC.netPositionPaise).toBe(0);

    // Now B pays A ₹100 (10000 paise)
    const settlements: Settlement[] = [
      {
        id: 'settle-1',
        roomId: 'room-1',
        payerId: 'user-b',
        payeeId: 'user-a',
        amountPaise: 10000,
        createdAt: '2026-10-04T10:00:00Z',
      },
    ];

    const updatedNetMap = calculateMemberNetPositions(members, expenses, settlements);
    const updatedA = updatedNetMap.get('user-a')!;
    const updatedB = updatedNetMap.get('user-b')!;
    const updatedC = updatedNetMap.get('user-c')!;

    // A: gross +200 - received 100 = +100
    expect(updatedA.netPositionPaise).toBe(10000);
    expect(updatedA.direction).toBe('RECEIVE');

    // B: gross -100 + sent 100 = 0 (SETTLED)
    expect(updatedB.netPositionPaise).toBe(0);
    expect(updatedB.direction).toBe('SETTLED');

    // C: gross -100 = -100 (OWES)
    expect(updatedC.netPositionPaise).toBe(-10000);
    expect(updatedC.direction).toBe('OWES');

    // Conservation check
    expect(updatedA.netPositionPaise + updatedB.netPositionPaise + updatedC.netPositionPaise).toBe(0);
  });
});

describe('Part 12 — Canonical ₹700 Reference Scenario', () => {
  it('runs the ₹700 two-expense regression scenario (Jyotirmay, Raju, Lopamudra) with exact paise', () => {
    const memberJyotirmay = 'user-jyotirmay';
    const memberRaju = 'user-raju';
    const memberLopamudra = 'user-lopamudra';
    const members = [memberJyotirmay, memberRaju, memberLopamudra];

    // Expense 1: Wi-Fi ₹500 (50000 paise) paid by Jyotirmay, equal split
    const exp1Shares = calculateEqualSplits(50000, members);
    const exp1TotalShares = exp1Shares.reduce((s, x) => s + x.sharePaise, 0);
    expect(exp1TotalShares).toBe(50000);

    const exp1: Expense = {
      id: 'exp-wifi',
      roomId: 'room-700',
      paidBy: memberJyotirmay,
      totalAmountPaise: 50000,
      title: 'Wi-Fi',
      splitMethod: 'EQUAL',
      shares: exp1Shares,
    };

    // Expense 2: Water ₹200 (20000 paise) paid by Raju, equal split
    const exp2Shares = calculateEqualSplits(20000, members);
    const exp2TotalShares = exp2Shares.reduce((s, x) => s + x.sharePaise, 0);
    expect(exp2TotalShares).toBe(20000);

    const exp2: Expense = {
      id: 'exp-water',
      roomId: 'room-700',
      paidBy: memberRaju,
      totalAmountPaise: 20000,
      title: 'Water',
      splitMethod: 'EQUAL',
      shares: exp2Shares,
    };

    // Assert: SUM(all shares across all expenses) = 70000 paise exactly
    expect(exp1TotalShares + exp2TotalShares).toBe(70000);

    const summary = calculateRoomSummaryV2('room-700', members, [exp1, exp2], []);

    // Assert: Invariant L1 holds: SUM(net positions) = 0
    expect(summary.isZeroSumVerified).toBe(true);
    expect(summary.netDiscrepancyPaise).toBe(0);

    const jyotirmayPos = summary.members.find((m) => m.userId === memberJyotirmay)!;
    const rajuPos = summary.members.find((m) => m.userId === memberRaju)!;
    const lopamudraPos = summary.members.find((m) => m.userId === memberLopamudra)!;

    // Assert: Jyotirmay is a creditor
    expect(jyotirmayPos.netPositionPaise).toBeGreaterThan(0);
    expect(jyotirmayPos.direction).toBe('RECEIVE');

    // Assert: Raju and Lopamudra are debtors
    expect(rajuPos.netPositionPaise).toBeLessThan(0);
    expect(rajuPos.direction).toBe('OWES');

    expect(lopamudraPos.netPositionPaise).toBeLessThan(0);
    expect(lopamudraPos.direction).toBe('OWES');

    // Net sum verification: Jyotirmay's credit exactly matches Raju + Lopamudra debt
    expect(jyotirmayPos.netPositionPaise).toBe(
      Math.abs(rajuPos.netPositionPaise) + Math.abs(lopamudraPos.netPositionPaise)
    );

    // Debt Simplification (Min-Cash-Flow)
    const transfers = summary.simplifiedTransfers;
    expect(transfers.length).toBeLessThanOrEqual(2);

    // Assert: Only debtors pay creditors
    for (const t of transfers) {
      expect([memberRaju, memberLopamudra]).toContain(t.fromUserId);
      expect(t.toUserId).toBe(memberJyotirmay);
      expect(t.amountPaise).toBeGreaterThan(0);
    }

    // No cycle produced
    const fromSet = new Set(transfers.map((t) => t.fromUserId));
    const toSet = new Set(transfers.map((t) => t.toUserId));
    const intersection = [...fromSet].filter((x) => toSet.has(x));
    expect(intersection).toHaveLength(0); // Zero intermediate nodes, strictly bipartite DAG
  });
});

describe('Part 15 — Sequential Settlement Tests', () => {
  it('sequentially reduces debt: ₹166.67 -> settle ₹100 -> ₹66.67 -> settle ₹50 -> ₹16.67 -> settle ₹16.67 -> ₹0', () => {
    const memberA = 'user-a';
    const memberB = 'user-b';

    // A paid ₹333.34 for both A and B (16667 each)
    const exp: Expense = {
      id: 'exp-seq',
      roomId: 'room-seq',
      paidBy: memberA,
      totalAmountPaise: 33334,
      title: 'Groceries',
      splitMethod: 'EQUAL',
      shares: [
        { userId: memberA, sharePaise: 16667 },
        { userId: memberB, sharePaise: 16667 },
      ],
    };

    // Step 0: Initial outstanding = 16667 paise (₹166.67)
    let netMap = calculateMemberNetPositions([memberA, memberB], [exp], []);
    expect(netMap.get(memberB)!.netPositionPaise).toBe(-16667);
    expect(netMap.get(memberA)!.netPositionPaise).toBe(16667);

    // Step 1: B settles ₹100 (10000 paise)
    const settlements: Settlement[] = [
      {
        id: 's1',
        roomId: 'room-seq',
        payerId: memberB,
        payeeId: memberA,
        amountPaise: 10000,
        createdAt: '2026-10-04T10:00:00Z',
      },
    ];
    netMap = calculateMemberNetPositions([memberA, memberB], [exp], settlements);
    expect(netMap.get(memberB)!.netPositionPaise).toBe(-6667); // ₹66.67 remaining
    expect(netMap.get(memberA)!.netPositionPaise).toBe(6667);

    // Step 2: B settles ₹50 (5000 paise)
    settlements.push({
      id: 's2',
      roomId: 'room-seq',
      payerId: memberB,
      payeeId: memberA,
      amountPaise: 5000,
      createdAt: '2026-10-04T11:00:00Z',
    });
    netMap = calculateMemberNetPositions([memberA, memberB], [exp], settlements);
    expect(netMap.get(memberB)!.netPositionPaise).toBe(-1667); // ₹16.67 remaining
    expect(netMap.get(memberA)!.netPositionPaise).toBe(1667);

    // Step 3: B settles ₹16.67 (1667 paise)
    settlements.push({
      id: 's3',
      roomId: 'room-seq',
      payerId: memberB,
      payeeId: memberA,
      amountPaise: 1667,
      createdAt: '2026-10-04T12:00:00Z',
    });
    netMap = calculateMemberNetPositions([memberA, memberB], [exp], settlements);
    expect(netMap.get(memberB)!.netPositionPaise).toBe(0); // ₹0 remaining (SETTLED)
    expect(netMap.get(memberB)!.direction).toBe('SETTLED');
    expect(netMap.get(memberA)!.netPositionPaise).toBe(0); // ₹0 remaining (SETTLED)
    expect(netMap.get(memberA)!.direction).toBe('SETTLED');

    // Assert: Original expense shares remain completely unchanged!
    expect(exp.shares[0].sharePaise).toBe(16667);
    expect(exp.shares[1].sharePaise).toBe(16667);
    expect(settlements).toHaveLength(3);
  });
});

describe('Part 16 — Over-Settlement Tests', () => {
  it('strictly rejects over-settlement, zero settlement, negative settlement, and self-settlement', () => {
    const memberA = 'user-a'; // Creditor +10000
    const memberB = 'user-b'; // Debtor -10000

    const posA = {
      userId: memberA,
      totalPaidPaise: 20000,
      totalSharePaise: 10000,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      netPositionPaise: 10000,
      direction: 'RECEIVE' as const,
      absoluteAmountPaise: 10000,
    };

    const posB = {
      userId: memberB,
      totalPaidPaise: 0,
      totalSharePaise: 10000,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      netPositionPaise: -10000,
      direction: 'OWES' as const,
      absoluteAmountPaise: 10000,
    };

    // Valid settlement of ₹100 (10000 paise)
    expect(validateSettlementAttempt(posB, posA, 10000).isValid).toBe(true);

    // Attempt ₹100.01 (10001 paise) -> REJECTED
    const res10001 = validateSettlementAttempt(posB, posA, 10001);
    expect(res10001.isValid).toBe(false);
    expect(res10001.error).toContain('OVERSETTLEMENT_EXCEEDS_DEBT');

    // Attempt ₹101 (10100 paise) -> REJECTED
    const res10100 = validateSettlementAttempt(posB, posA, 10100);
    expect(res10100.isValid).toBe(false);
    expect(res10100.error).toContain('OVERSETTLEMENT_EXCEEDS_DEBT');

    // Attempt ₹0 -> REJECTED
    const res0 = validateSettlementAttempt(posB, posA, 0);
    expect(res0.isValid).toBe(false);
    expect(res0.error).toBe('SETTLEMENT_AMOUNT_MUST_BE_POSITIVE');

    // Attempt -₹1 (-100 paise) -> REJECTED
    const resNeg = validateSettlementAttempt(posB, posA, -100);
    expect(resNeg.isValid).toBe(false);
    expect(resNeg.error).toBe('SETTLEMENT_AMOUNT_MUST_BE_POSITIVE');

    // Attempt self-settlement (B -> B) -> REJECTED
    const resSelf = validateSettlementAttempt(posB, posB, 5000);
    expect(resSelf.isValid).toBe(false);
    expect(resSelf.error).toBe('SELF_SETTLEMENT_PROHIBITED');

    // Attempt settlement from creditor to debtor (A -> B) -> REJECTED
    const resWrongDir = validateSettlementAttempt(posA, posB, 5000);
    expect(resWrongDir.isValid).toBe(false);
    expect(resWrongDir.error).toBe('PAYER_IS_NOT_A_DEBTOR');
  });
});

describe('Part 17 — Settlement Conservation Tests', () => {
  it('proves that valid settlements strictly preserve value (SUM(net positions) === 0 before and after)', () => {
    const members = ['m1', 'm2', 'm3', 'm4'];
    const expenses: Expense[] = [
      {
        id: 'e1',
        roomId: 'r1',
        paidBy: 'm1',
        totalAmountPaise: 40000, // ₹400
        title: 'Team Outing',
        splitMethod: 'EQUAL',
        shares: [
          { userId: 'm1', sharePaise: 10000 },
          { userId: 'm2', sharePaise: 10000 },
          { userId: 'm3', sharePaise: 10000 },
          { userId: 'm4', sharePaise: 10000 },
        ],
      },
      {
        id: 'e2',
        roomId: 'r1',
        paidBy: 'm2',
        totalAmountPaise: 20000, // ₹200
        title: 'Snacks',
        splitMethod: 'EQUAL',
        shares: [
          { userId: 'm1', sharePaise: 5000 },
          { userId: 'm2', sharePaise: 5000 },
          { userId: 'm3', sharePaise: 5000 },
          { userId: 'm4', sharePaise: 5000 },
        ],
      },
    ];

    // Net before settlement:
    // m1: paid 40000, share 15000 -> +25000
    // m2: paid 20000, share 15000 -> +5000
    // m3: paid 0, share 15000 -> -15000
    // m4: paid 0, share 15000 -> -15000
    const preSummary = calculateRoomSummaryV2('r1', members, expenses, []);
    expect(preSummary.isZeroSumVerified).toBe(true);
    expect(preSummary.netDiscrepancyPaise).toBe(0);

    // Settlement 1: m3 pays m1 ₹150 (15000 paise)
    // Settlement 2: m4 pays m2 ₹50 (5000 paise)
    const settlements: Settlement[] = [
      { id: 's1', roomId: 'r1', payerId: 'm3', payeeId: 'm1', amountPaise: 15000, createdAt: '2026-10-04T10:00:00Z' },
      { id: 's2', roomId: 'r1', payerId: 'm4', payeeId: 'm2', amountPaise: 5000, createdAt: '2026-10-04T10:05:00Z' },
    ];

    const postSummary = calculateRoomSummaryV2('r1', members, expenses, settlements);
    expect(postSummary.isZeroSumVerified).toBe(true);
    expect(postSummary.netDiscrepancyPaise).toBe(0);

    // Total expenses should remain ₹600 (60000 paise)
    expect(postSummary.totalExpensesPaise).toBe(60000);
    // Total settled should be ₹200 (20000 paise)
    expect(postSummary.totalSettledPaise).toBe(20000);

    // m3 is now completely settled
    const m3 = postSummary.members.find((m) => m.userId === 'm3')!;
    expect(m3.netPositionPaise).toBe(0);
    expect(m3.direction).toBe('SETTLED');

    // m2 is now completely settled
    const m2 = postSummary.members.find((m) => m.userId === 'm2')!;
    expect(m2.netPositionPaise).toBe(0);
    expect(m2.direction).toBe('SETTLED');

    // m4 still owes ₹100 (10000 paise) to m1
    const m4 = postSummary.members.find((m) => m.userId === 'm4')!;
    expect(m4.netPositionPaise).toBe(-10000);
    const m1 = postSummary.members.find((m) => m.userId === 'm1')!;
    expect(m1.netPositionPaise).toBe(10000);

    // Transfer check: exactly 1 remaining transfer: m4 -> m1 for 10000 paise
    expect(postSummary.simplifiedTransfers).toEqual([
      { fromUserId: 'm4', toUserId: 'm1', amountPaise: 10000 },
    ]);
  });
});

describe('Part 23 — Leave-Room Financial Gate Contract', () => {
  it('correctly decides whether a member can safely leave the room based on net position', () => {
    function canMemberLeaveRoom(position: { netPositionPaise: number }): { canLeave: boolean; reason: string } {
      if (position.netPositionPaise === 0) {
        return { canLeave: true, reason: 'FINANCIALLY_CLEAR' };
      }
      if (position.netPositionPaise < 0) {
        return {
          canLeave: false,
          reason: `UNSETTLED_DEBT: Member still owes ${Math.abs(position.netPositionPaise)} paise`,
        };
      }
      return {
        canLeave: false,
        reason: `UNCOLLECTED_CREDIT: Member is owed ${position.netPositionPaise} paise by roommates`,
      };
    }

    expect(canMemberLeaveRoom({ netPositionPaise: 0 }).canLeave).toBe(true);
    expect(canMemberLeaveRoom({ netPositionPaise: -5000 }).canLeave).toBe(false);
    expect(canMemberLeaveRoom({ netPositionPaise: -5000 }).reason).toContain('UNSETTLED_DEBT');
    expect(canMemberLeaveRoom({ netPositionPaise: 3000 }).canLeave).toBe(false);
    expect(canMemberLeaveRoom({ netPositionPaise: 3000 }).reason).toContain('UNCOLLECTED_CREDIT');
  });
});

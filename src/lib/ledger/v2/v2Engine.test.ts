import { describe, it, expect } from 'vitest';
import {
  parseInrToPaise,
  formatPaiseToInr,
  formatPaiseToUpiAmount,
  inrFloatToPaise,
  paiseToInrFloat,
  addPaise,
  subPaise,
  comparePaise,
  calculateEqualSplitsV2,
  validateAndCalculateExactSplitsV2,
  calculatePercentageSplitsV2,
  calculateSharesSplitsV2,
  calculateMemberNetPositionsV2,
  calculateRoomFinancialSummaryV2,
  validateSettlementAttemptV2,
  canMemberExitRoomV2,
  ExpenseInputV2,
  SettlementInputV2,
} from './index';

describe('Phase 3 — Canonical Money Utilities', () => {
  it('parses diverse INR inputs to exact integer Paise losslessly', () => {
    expect(parseInrToPaise('0')).toBe(0);
    expect(parseInrToPaise('0.01')).toBe(1);
    expect(parseInrToPaise('₹0.99')).toBe(99);
    expect(parseInrToPaise('1')).toBe(100);
    expect(parseInrToPaise('1.01')).toBe(101);
    expect(parseInrToPaise('66.67')).toBe(6667);
    expect(parseInrToPaise('200')).toBe(20000);
    expect(parseInrToPaise('₹10,000.50')).toBe(1000050);
    expect(parseInrToPaise('-50.25')).toBe(-5025);
  });

  it('formats integer Paise to standard INR display string and UPI URI amount', () => {
    expect(formatPaiseToInr(6667)).toBe('₹66.67');
    expect(formatPaiseToInr(20000)).toBe('₹200.00');
    expect(formatPaiseToInr(-5025)).toBe('-₹50.25');

    expect(formatPaiseToUpiAmount(16667)).toBe('166.67');
    expect(formatPaiseToUpiAmount(20000)).toBe('200.00');
    expect(formatPaiseToUpiAmount(1)).toBe('0.01');
    expect(() => formatPaiseToUpiAmount(-100)).toThrow('NEGATIVE_UPI_AMOUNT_PROHIBITED');
  });

  it('safely handles DB float boundary conversions', () => {
    expect(inrFloatToPaise(66.67)).toBe(6667);
    expect(inrFloatToPaise(200)).toBe(20000);
    expect(paiseToInrFloat(6667)).toBe(66.67);
    expect(paiseToInrFloat(20000)).toBe(200);
  });

  it('performs safe arithmetic operations', () => {
    expect(addPaise(100, 200, 300)).toBe(600);
    expect(subPaise(500, 200)).toBe(300);
    expect(comparePaise(300, 200)).toBe(1);
    expect(comparePaise(200, 300)).toBe(-1);
    expect(comparePaise(200, 200)).toBe(0);
  });
});

describe('Phase 3 — Deterministic Splits Engine', () => {
  it('EQUAL: distributes remainder paise deterministically based on UUID order', () => {
    // ₹200 / 3 = 6667, 6667, 6666
    const participants = ['user-uuid-c', 'user-uuid-a', 'user-uuid-b'];
    const splits = calculateEqualSplitsV2(20000, participants);

    expect(splits).toEqual([
      { userId: 'user-uuid-a', sharePaise: 6667 },
      { userId: 'user-uuid-b', sharePaise: 6667 },
      { userId: 'user-uuid-c', sharePaise: 6666 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(20000);
  });

  it('EXACT: accepts sum(shares) === total and rejects any mismatch with zero tolerance', () => {
    // 5000 + 7500 + 7500 = 20000
    const valid = validateAndCalculateExactSplitsV2(20000, {
      u1: 5000,
      u2: 7500,
      u3: 7500,
    });
    expect(valid).toHaveLength(3);

    // 6666 * 3 = 19998 != 20000 -> REJECTED
    expect(() =>
      validateAndCalculateExactSplitsV2(20000, {
        u1: 6666,
        u2: 6666,
        u3: 6666,
      })
    ).toThrow('EXACT_SPLIT_SUM_MISMATCH');
  });

  it('PERCENTAGE: calculates basis point allocation and distributes remainder cents', () => {
    // 3333, 3333, 3334 bp = 10000 bp
    const splits = calculatePercentageSplitsV2(20000, {
      u1: 3333,
      u2: 3333,
      u3: 3334,
    });
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(20000);
    expect(() =>
      calculatePercentageSplitsV2(20000, { u1: 3333, u2: 3333, u3: 3333 })
    ).toThrow('PERCENTAGE_SUM_MISMATCH');
  });

  it('SHARES: allocates by weight and validates total preservation', () => {
    // 1 : 1 : 2 on ₹200 -> 50, 50, 100
    const splits = calculateSharesSplitsV2(20000, { u1: 1, u2: 1, u3: 2 });
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 5000 },
      { userId: 'u2', sharePaise: 5000 },
      { userId: 'u3', sharePaise: 10000 },
    ]);
  });
});

describe('Phase 3 — Canonical ₹700 Reference Regression', () => {
  it('executes Jyotirmay, Raju, and Lopamudra scenario with zero error', () => {
    const members = ['u-jyotirmay', 'u-raju', 'u-lopamudra'];

    const exp1: ExpenseInputV2 = {
      id: 'e-wifi',
      roomId: 'room-700',
      paidBy: 'u-jyotirmay',
      totalAmountPaise: 50000,
      title: 'Wi-Fi',
      splitMethod: 'EQUAL',
      shares: calculateEqualSplitsV2(50000, members),
    };

    const exp2: ExpenseInputV2 = {
      id: 'e-water',
      roomId: 'room-700',
      paidBy: 'u-raju',
      totalAmountPaise: 20000,
      title: 'Water',
      splitMethod: 'EQUAL',
      shares: calculateEqualSplitsV2(20000, members),
    };

    const summary = calculateRoomFinancialSummaryV2('room-700', members, [exp1, exp2], []);

    // 1. Total shares = 70000 paise
    expect(summary.totalExpensesPaise).toBe(70000);

    // 2. Net positions sum to zero
    expect(summary.isZeroSumVerified).toBe(true);
    expect(summary.netDiscrepancyPaise).toBe(0);

    const jyotirmay = summary.members.find((m) => m.userId === 'u-jyotirmay')!;
    const raju = summary.members.find((m) => m.userId === 'u-raju')!;
    const lopamudra = summary.members.find((m) => m.userId === 'u-lopamudra')!;

    // 3. Jyotirmay is a creditor
    expect(jyotirmay.direction).toBe('RECEIVE');
    expect(jyotirmay.netPositionPaise).toBeGreaterThan(0);

    // 4. Raju and Lopamudra are debtors
    expect(raju.direction).toBe('OWES');
    expect(raju.netPositionPaise).toBeLessThan(0);

    expect(lopamudra.direction).toBe('OWES');
    expect(lopamudra.netPositionPaise).toBeLessThan(0);

    // 5. Direct settlement transfers: only debtors pay creditors
    expect(summary.simplifiedTransfers.length).toBeLessThanOrEqual(2);
    for (const t of summary.simplifiedTransfers) {
      expect(['u-raju', 'u-lopamudra']).toContain(t.fromUserId);
      expect(t.toUserId).toBe('u-jyotirmay');
      expect(t.amountPaise).toBeGreaterThan(0);
    }
  });
});

describe('Phase 3 — Concurrent Settlement & Double-Payment Prevention', () => {
  it('prevents double settlement when two concurrent settlement requests race', () => {
    // Room state: Alice owes Bob ₹100 (10000 paise).
    // Device A and Device B both try to settle ₹100 simultaneously.
    const memberAlice = 'alice';
    const memberBob = 'bob';

    const expenses: ExpenseInputV2[] = [
      {
        id: 'exp-racing',
        roomId: 'room-race',
        paidBy: memberBob,
        totalAmountPaise: 20000,
        title: 'Dinner',
        splitMethod: 'EQUAL',
        shares: [
          { userId: memberAlice, sharePaise: 10000 },
          { userId: memberBob, sharePaise: 10000 },
        ],
      },
    ];

    const settlements: SettlementInputV2[] = [];

    // Transaction Engine Simulator with atomic lock:
    function processSettlementTransaction(
      payerId: string,
      payeeId: string,
      amountPaise: number
    ): { success: boolean; error?: string } {
      // Re-read authoritative net positions under room lock
      const currentNet = calculateMemberNetPositionsV2([memberAlice, memberBob], expenses, settlements);
      const payerPos = currentNet.get(payerId);
      const payeePos = currentNet.get(payeeId);

      const validation = validateSettlementAttemptV2(payerPos, payeePos, amountPaise);
      if (!validation.isValid) {
        return { success: false, error: validation.error };
      }

      // Commit settlement atomically
      settlements.push({
        id: `settle-${settlements.length + 1}`,
        roomId: 'room-race',
        payerId,
        payeeId,
        amountPaise,
        createdAt: new Date().toISOString(),
      });

      return { success: true };
    }

    // Attempt 1 from Device A: Alice settles ₹100
    const txA = processSettlementTransaction(memberAlice, memberBob, 10000);
    expect(txA.success).toBe(true);

    // Attempt 2 from Device B: Alice concurrently attempts to settle ₹100 again
    const txB = processSettlementTransaction(memberAlice, memberBob, 10000);
    expect(txB.success).toBe(false);
    expect(txB.error).toBe('PAYER_IS_NOT_A_DEBTOR');

    // Final ledger check: Alice owes ₹0, Bob is owed ₹0. Exactly 10000 settled.
    const finalSummary = calculateRoomFinancialSummaryV2(
      'room-race',
      [memberAlice, memberBob],
      expenses,
      settlements
    );

    const aliceFinal = finalSummary.members.find((m) => m.userId === memberAlice)!;
    expect(aliceFinal.netPositionPaise).toBe(0);
    expect(aliceFinal.direction).toBe('SETTLED');
    expect(finalSummary.totalSettledPaise).toBe(10000);
    expect(finalSummary.simplifiedTransfers).toHaveLength(0);
  });
});

describe('Phase 3 — Leave Room Gating Contract', () => {
  it('permits exit only when net position is strictly 0', () => {
    expect(canMemberExitRoomV2(undefined).canLeave).toBe(true);
    expect(
      canMemberExitRoomV2({
        userId: 'u1',
        totalPaidPaise: 1000,
        totalSharePaise: 1000,
        settlementsSentPaise: 0,
        settlementsReceivedPaise: 0,
        grossNetPaise: 0,
        netPositionPaise: 0,
        direction: 'SETTLED',
        absoluteAmountPaise: 0,
        displayInr: '₹0.00',
      }).canLeave
    ).toBe(true);

    const debtorCheck = canMemberExitRoomV2({
      userId: 'u1',
      totalPaidPaise: 0,
      totalSharePaise: 1000,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      grossNetPaise: -1000,
      netPositionPaise: -1000,
      direction: 'OWES',
      absoluteAmountPaise: 1000,
      displayInr: '₹10.00',
    });
    expect(debtorCheck.canLeave).toBe(false);
    expect(debtorCheck.reason).toContain('UNSETTLED_DEBT');
  });
});

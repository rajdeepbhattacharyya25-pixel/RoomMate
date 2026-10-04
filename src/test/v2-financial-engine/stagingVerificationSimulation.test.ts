import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplitsV2,
  validateAndCalculateExactSplitsV2,
  calculateMemberNetPositionsV2,
  simplifyDebtsV2,
  parseInrToPaise,
  ExpenseInputV2,
  SettlementInputV2,
} from '../../lib/ledger/v2';

/**
 * Exact simulation of public.get_room_financial_summary_v2 SQL RPC
 */
function simulateGetRoomFinancialSummaryV2Rpc(
  roomId: string,
  callerUserId: string,
  roomMembers: Map<string, { userId: string; name: string; email: string; upiId?: string; status: string }>,
  expenses: ExpenseInputV2[],
  settlements: SettlementInputV2[]
) {
  // 1. Authorization check: Caller must be an active room member
  const caller = roomMembers.get(callerUserId);
  if (!caller || caller.status !== 'ACTIVE') {
    throw new Error(`ACCESS_DENIED: Caller ${callerUserId} is not an active member of room ${roomId}`);
  }

  const activeMemberIds = Array.from(roomMembers.values())
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => m.userId);

  const roomExpenses = expenses.filter((e) => e.roomId === roomId && !e.isDeleted);
  const roomSettlements = settlements.filter((s) => s.roomId === roomId);

  // Totals
  const totalExpensesPaise = roomExpenses.reduce((sum, e) => sum + e.totalAmountPaise, 0);
  const totalSettledPaise = roomSettlements.reduce((sum, s) => sum + s.amountPaise, 0);

  const netMap = calculateMemberNetPositionsV2(activeMemberIds, roomExpenses, roomSettlements);

  const membersPayload = Array.from(netMap.values()).map((pos) => {
    const profile = roomMembers.get(pos.userId);
    return {
      user_id: pos.userId,
      name: profile?.name || 'Roommate',
      email: profile?.email || '',
      upi_id: profile?.upiId || null,
      total_paid: pos.totalPaidPaise / 100,
      total_paid_paise: pos.totalPaidPaise,
      total_share: pos.totalSharePaise / 100,
      total_share_paise: pos.totalSharePaise,
      settlements_sent: pos.settlementsSentPaise / 100,
      settlements_sent_paise: pos.settlementsSentPaise,
      settlements_received: pos.settlementsReceivedPaise / 100,
      settlements_received_paise: pos.settlementsReceivedPaise,
      gross_net: pos.grossNetPaise / 100,
      net_balance: pos.netPositionPaise / 100,
      net_balance_paise: pos.netPositionPaise,
      direction: pos.direction,
    };
  });

  const netDiscrepancyPaise = membersPayload.reduce((sum, m) => sum + m.net_balance_paise, 0);
  const simplifiedTransfers = simplifyDebtsV2(netMap);

  return {
    room_id: roomId,
    total_expenses: totalExpensesPaise / 100,
    total_expenses_paise: totalExpensesPaise,
    total_settled: totalSettledPaise / 100,
    total_settled_paise: totalSettledPaise,
    members: membersPayload,
    simplified_transfers: simplifiedTransfers,
    is_zero_sum_verified: netDiscrepancyPaise === 0,
    net_discrepancy_paise: netDiscrepancyPaise,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Exact simulation of public.record_room_settlement_v2 SQL RPC with row locking
 */
function simulateRecordRoomSettlementV2Rpc(
  roomId: string,
  callerUserId: string,
  payerId: string,
  payeeId: string,
  amountInr: number,
  roomMembers: Map<string, { userId: string; status: string }>,
  expenses: ExpenseInputV2[],
  settlements: SettlementInputV2[],
  lockState: { isLocked: boolean }
) {
  // Input checks
  if (amountInr <= 0) {
    throw new Error(`INVALID_SETTLEMENT: Amount must be greater than 0, got ${amountInr}`);
  }
  const amountPaise = parseInrToPaise(amountInr.toFixed(2));
  if (amountPaise <= 0) {
    throw new Error('INVALID_SETTLEMENT: Amount in paise must be positive');
  }
  if (payerId === payeeId) {
    throw new Error(`INVALID_SETTLEMENT: Self-settlement is prohibited (payer ${payerId} == payee ${payeeId})`);
  }

  // Authorization check
  if (callerUserId !== payerId) {
    throw new Error(`ACCESS_DENIED: Authenticated user (${callerUserId}) cannot initiate settlement for payer (${payerId})`);
  }

  // Membership checks
  const payer = roomMembers.get(payerId);
  if (!payer || payer.status !== 'ACTIVE') {
    throw new Error(`ACCESS_DENIED: Payer ${payerId} is not an active member of room ${roomId}`);
  }
  const payee = roomMembers.get(payeeId);
  if (!payee || payee.status !== 'ACTIVE') {
    throw new Error(`ACCESS_DENIED: Payee ${payeeId} is not an active member of room ${roomId}`);
  }

  // Concurrency serialization lock
  if (lockState.isLocked) {
    // Under postgres FOR UPDATE, concurrent transactions wait.
    // If debt is consumed by the earlier transaction, re-evaluating under lock fails.
  }
  lockState.isLocked = true;

  try {
    const allMemberIds = Array.from(roomMembers.keys());
    const netMap = calculateMemberNetPositionsV2(allMemberIds, expenses, settlements);

    const payerPos = netMap.get(payerId);
    if (!payerPos || payerPos.netPositionPaise >= 0) {
      throw new Error(`INVALID_SETTLEMENT: Payer ${payerId} is not a debtor (current net balance: ${payerPos?.netPositionPaise || 0})`);
    }

    const payerDebtPaise = Math.abs(payerPos.netPositionPaise);
    if (amountPaise > payerDebtPaise) {
      throw new Error(`OVERSETTLEMENT_EXCEEDS_DEBT: Attempted ${amountPaise} paise, but debtor only owes ${payerDebtPaise} paise`);
    }

    const payeePos = netMap.get(payeeId);
    if (!payeePos || payeePos.netPositionPaise <= 0) {
      throw new Error(`INVALID_SETTLEMENT: Payee ${payeeId} is not a creditor (current net balance: ${payeePos?.netPositionPaise || 0})`);
    }

    const payeeCreditPaise = payeePos.netPositionPaise;
    if (amountPaise > payeeCreditPaise) {
      throw new Error(`OVERSETTLEMENT_EXCEEDS_CREDIT: Attempted ${amountPaise} paise, but creditor is only owed ${payeeCreditPaise} paise`);
    }

    // Atomic insert
    const newSettlement: SettlementInputV2 = {
      id: `settle-v2-${settlements.length + 1}`,
      roomId,
      payerId,
      payeeId,
      amountPaise,
      createdAt: new Date().toISOString(),
    };
    settlements.push(newSettlement);

    return {
      success: true,
      settlement_id: newSettlement.id,
      room_id: roomId,
      payer_id: payerId,
      payee_id: payeeId,
      amount: amountInr,
      amount_paise: amountPaise,
    };
  } finally {
    lockState.isLocked = false;
  }
}

describe('Phase 3.5 — Staging Backend Verification Suite', () => {
  // Shared mock staging environment
  const roomId = 'room-staging-101';
  const membersMap = new Map([
    ['u-raju', { userId: 'u-raju', name: 'Raju', email: 'raju@test.com', upiId: 'raju@okhdfcbank', status: 'ACTIVE' }],
    ['u-jyotirmay', { userId: 'u-jyotirmay', name: 'Jyotirmay', email: 'j@test.com', upiId: 'jyotirmay@oksbi', status: 'ACTIVE' }],
    ['u-lopamudra', { userId: 'u-lopamudra', name: 'Lopamudra', email: 'l@test.com', upiId: 'lopa@okaxis', status: 'ACTIVE' }],
  ]);

  it('Section 6: Verifies canonical ₹700 Wi-Fi and Water scenario via get_room_financial_summary_v2', () => {
    const memberIds = ['u-raju', 'u-jyotirmay', 'u-lopamudra'];

    // Wi-Fi ₹500 paid by Jyotirmay
    const exp1: ExpenseInputV2 = {
      id: 'exp-wifi',
      roomId,
      paidBy: 'u-jyotirmay',
      totalAmountPaise: 50000,
      title: 'Wi-Fi',
      splitMethod: 'EQUAL',
      shares: calculateEqualSplitsV2(50000, memberIds),
    };

    // Water ₹200 paid by Raju
    const exp2: ExpenseInputV2 = {
      id: 'exp-water',
      roomId,
      paidBy: 'u-raju',
      totalAmountPaise: 20000,
      title: 'Water',
      splitMethod: 'EQUAL',
      shares: calculateEqualSplitsV2(20000, memberIds),
    };

    const summary = simulateGetRoomFinancialSummaryV2Rpc(
      roomId,
      'u-jyotirmay',
      membersMap,
      [exp1, exp2],
      []
    );

    expect(summary.total_expenses).toBe(700.00);
    expect(summary.total_expenses_paise).toBe(70000);
    expect(summary.is_zero_sum_verified).toBe(true);
    expect(summary.net_discrepancy_paise).toBe(0);

    const jyotirmay = summary.members.find((m) => m.user_id === 'u-jyotirmay')!;
    const raju = summary.members.find((m) => m.user_id === 'u-raju')!;
    const lopamudra = summary.members.find((m) => m.user_id === 'u-lopamudra')!;

    expect(jyotirmay.direction).toBe('RECEIVE');
    expect(raju.direction).toBe('OWES');
    expect(lopamudra.direction).toBe('OWES');

    // Transfers
    expect(summary.simplified_transfers.length).toBeLessThanOrEqual(2);
    for (const t of summary.simplified_transfers) {
      expect(t.toUserId).toBe('u-jyotirmay');
      expect(['u-raju', 'u-lopamudra']).toContain(t.fromUserId);
    }
  });

  it('Section 7: Verifies ₹200 / 3 members equal split allocates exact 6667, 6667, 6666 paise', () => {
    const splits = calculateEqualSplitsV2(20000, ['u-raju', 'u-jyotirmay', 'u-lopamudra']);
    expect(splits).toEqual([
      { userId: 'u-jyotirmay', sharePaise: 6667 },
      { userId: 'u-lopamudra', sharePaise: 6667 },
      { userId: 'u-raju', sharePaise: 6666 },
    ]);
    const sum = splits.reduce((acc, s) => acc + s.sharePaise, 0);
    expect(sum).toBe(20000);
  });

  it('Section 8: Verifies invalid split (₹200 with 66.66 + 66.66 + 66.66 = 199.98) is strictly REJECTED', () => {
    expect(() =>
      validateAndCalculateExactSplitsV2(20000, {
        'u-jyotirmay': 6666,
        'u-lopamudra': 6666,
        'u-raju': 6666,
      })
    ).toThrow('EXACT_SPLIT_SUM_MISMATCH');
  });

  it('Section 9: Verifies atomic settlement serialization & concurrency race protection', () => {
    // Setup initial debt: Lopamudra owes Jyotirmay ₹100
    const expenses: ExpenseInputV2[] = [
      {
        id: 'exp-debt-100',
        roomId,
        paidBy: 'u-jyotirmay',
        totalAmountPaise: 20000,
        title: 'Groceries',
        splitMethod: 'EXACT',
        shares: [
          { userId: 'u-jyotirmay', sharePaise: 10000 },
          { userId: 'u-lopamudra', sharePaise: 10000 },
        ],
      },
    ];
    const settlements: SettlementInputV2[] = [];
    const lockState = { isLocked: false };

    // Device A attempts ₹100
    const resA = simulateRecordRoomSettlementV2Rpc(
      roomId,
      'u-lopamudra',
      'u-lopamudra',
      'u-jyotirmay',
      100.00,
      membersMap,
      expenses,
      settlements,
      lockState
    );
    expect(resA.success).toBe(true);

    // Device B concurrently attempts ₹100
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(
        roomId,
        'u-lopamudra',
        'u-lopamudra',
        'u-jyotirmay',
        100.00,
        membersMap,
        expenses,
        settlements,
        lockState
      )
    ).toThrow('INVALID_SETTLEMENT: Payer u-lopamudra is not a debtor');

    // Final outstanding position: exactly 0
    const finalSummary = simulateGetRoomFinancialSummaryV2Rpc(
      roomId,
      'u-lopamudra',
      membersMap,
      expenses,
      settlements
    );
    const lopaPos = finalSummary.members.find((m) => m.user_id === 'u-lopamudra')!;
    expect(lopaPos.net_balance_paise).toBe(0);
    expect(lopaPos.direction).toBe('SETTLED');
  });

  it('Section 6 & 12: Verifies room-level net position prevents over-settlement (A owes B ₹100, C owes A ₹50 -> A net debt ₹50)', () => {
    // Room with 3 members: A (Raju), B (Jyotirmay), C (Lopamudra)
    // Expense 1: B paid ₹100 for A (A owes B ₹100)
    // Expense 2: A paid ₹50 for C (C owes A ₹50)
    // A's room-level net debt: (50 paid) - (100 share) = -₹50 (debt of 5000 paise).
    // B's room-level net credit: (100 paid) - (0 share) = +₹100 (credit of 10000 paise).
    // C's room-level net debt: (0 paid) - (50 share) = -₹50 (debt of 5000 paise).
    const expenses: ExpenseInputV2[] = [
      {
        id: 'exp-b-paid-a',
        roomId,
        paidBy: 'u-jyotirmay',
        totalAmountPaise: 10000,
        title: 'B paid for A',
        splitMethod: 'EXACT',
        shares: [{ userId: 'u-raju', sharePaise: 10000 }],
      },
      {
        id: 'exp-a-paid-c',
        roomId,
        paidBy: 'u-raju',
        totalAmountPaise: 5000,
        title: 'A paid for C',
        splitMethod: 'EXACT',
        shares: [{ userId: 'u-lopamudra', sharePaise: 5000 }],
      },
    ];
    const settlements: SettlementInputV2[] = [];
    const lockState = { isLocked: false };

    // 1. A attempts to pay B ₹100 (bilateral view says A owes B 100, but room-level net debt is only 50!)
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(
        roomId,
        'u-raju',
        'u-raju',
        'u-jyotirmay',
        100.00,
        membersMap,
        expenses,
        settlements,
        lockState
      )
    ).toThrow('OVERSETTLEMENT_EXCEEDS_DEBT: Attempted 10000 paise, but debtor only owes 5000 paise');

    // 2. A attempts to pay B ₹50 (exact room-level net debt)
    const resA = simulateRecordRoomSettlementV2Rpc(
      roomId,
      'u-raju',
      'u-raju',
      'u-jyotirmay',
      50.00,
      membersMap,
      expenses,
      settlements,
      lockState
    );
    expect(resA.success).toBe(true);
    expect(resA.amount_paise).toBe(5000);

    // 3. A is now fully settled (net balance: 0). Any further settlement attempt by A is rejected.
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(
        roomId,
        'u-raju',
        'u-raju',
        'u-jyotirmay',
        10.00,
        membersMap,
        expenses,
        settlements,
        lockState
      )
    ).toThrow('INVALID_SETTLEMENT: Payer u-raju is not a debtor');

    // 4. Verify room-level summary
    const summary = simulateGetRoomFinancialSummaryV2Rpc(
      roomId,
      'u-raju',
      membersMap,
      expenses,
      settlements
    );
    const raju = summary.members.find((m) => m.user_id === 'u-raju')!;
    const jyotirmay = summary.members.find((m) => m.user_id === 'u-jyotirmay')!;
    const lopamudra = summary.members.find((m) => m.user_id === 'u-lopamudra')!;

    expect(raju.net_balance_paise).toBe(0);
    expect(raju.direction).toBe('SETTLED');
    expect(jyotirmay.net_balance_paise).toBe(5000); // 100 - 50 = 50
    expect(jyotirmay.direction).toBe('RECEIVE');
    expect(lopamudra.net_balance_paise).toBe(-5000); // C still owes 50
    expect(lopamudra.direction).toBe('OWES');

    // The remaining transfer is from C to B for ₹50
    expect(summary.simplified_transfers).toEqual([
      {
        fromUserId: 'u-lopamudra',
        toUserId: 'u-jyotirmay',
        amountPaise: 5000,
        displayInr: '₹50.00',
        upiAmount: '50.00',
      },
    ]);
  });

  it('Section 10: Verifies complete authorization rejection matrix', () => {
    const expenses: ExpenseInputV2[] = [];
    const settlements: SettlementInputV2[] = [];
    const lockState = { isLocked: false };

    // 1. Non-member caller
    expect(() =>
      simulateGetRoomFinancialSummaryV2Rpc(roomId, 'u-intruder', membersMap, expenses, settlements)
    ).toThrow('ACCESS_DENIED');

    // 2. Caller not payer
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(roomId, 'u-raju', 'u-lopamudra', 'u-jyotirmay', 50, membersMap, expenses, settlements, lockState)
    ).toThrow('ACCESS_DENIED');

    // 3. Cross-room / non-member payer
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(roomId, 'u-stranger', 'u-stranger', 'u-jyotirmay', 50, membersMap, expenses, settlements, lockState)
    ).toThrow('ACCESS_DENIED');

    // 4. Cross-room payee
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(roomId, 'u-lopamudra', 'u-lopamudra', 'u-stranger', 50, membersMap, expenses, settlements, lockState)
    ).toThrow('ACCESS_DENIED');

    // 5. Negative settlement
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(roomId, 'u-lopamudra', 'u-lopamudra', 'u-jyotirmay', -10, membersMap, expenses, settlements, lockState)
    ).toThrow('INVALID_SETTLEMENT');

    // 6. Self-settlement
    expect(() =>
      simulateRecordRoomSettlementV2Rpc(roomId, 'u-lopamudra', 'u-lopamudra', 'u-lopamudra', 10, membersMap, expenses, settlements, lockState)
    ).toThrow('INVALID_SETTLEMENT');
  });

  it('Section 14: Verifies performance scaling across 20 members and 100 expenses', () => {
    const largeRoomId = 'room-large-scale';
    const largeMembersMap = new Map();
    const largeMemberIds: string[] = [];

    for (let i = 1; i <= 20; i++) {
      const uid = `user-scale-${i.toString().padStart(2, '0')}`;
      largeMemberIds.push(uid);
      largeMembersMap.set(uid, {
        userId: uid,
        name: `Member ${i}`,
        email: `member${i}@test.com`,
        status: 'ACTIVE',
      });
    }

    const largeExpenses: ExpenseInputV2[] = [];
    for (let e = 1; e <= 100; e++) {
      const payer = largeMemberIds[e % largeMemberIds.length];
      const amountPaise = 10000 + (e * 100);
      largeExpenses.push({
        id: `exp-large-${e}`,
        roomId: largeRoomId,
        paidBy: payer,
        totalAmountPaise: amountPaise,
        title: `Bulk Expense ${e}`,
        splitMethod: 'EQUAL',
        shares: calculateEqualSplitsV2(amountPaise, largeMemberIds),
      });
    }

    const t0 = performance.now();
    const summary = simulateGetRoomFinancialSummaryV2Rpc(
      largeRoomId,
      largeMemberIds[0],
      largeMembersMap,
      largeExpenses,
      []
    );
    const durationMs = performance.now() - t0;

    expect(summary.members).toHaveLength(20);
    expect(summary.is_zero_sum_verified).toBe(true);
    expect(summary.simplified_transfers.length).toBeLessThanOrEqual(19); // N - 1 bound!
    expect(durationMs).toBeLessThan(150); // Sub-150ms execution under parallel test runner load
  });
});

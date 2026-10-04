/**
 * RoomMate Shared Expense Engine V2 — Member Net Positions
 * Phase 3 Implementation
 * 
 * Implements Gross Net Positions (Part 8) and Settlement Adjustments (Part 9).
 * 
 * Invariants:
 * - Gross Net = TotalPaid - TotalAllocatedShare
 * - Outstanding Net = Gross Net + SettlementsSent - SettlementsReceived
 * - Invariant L1: Sum of all member net positions in a room must strictly equal 0.
 */

import {
  Paise,
  ExpenseInputV2,
  SettlementInputV2,
  MemberNetPositionV2,
  NetPositionDirectionV2,
} from './types';
import { assertIntegerPaise, addPaise, subPaise, formatPaiseToInr } from './money';

/**
 * Calculates authoritative Gross and Outstanding Net Positions for all room members.
 */
export function calculateMemberNetPositionsV2(
  allMemberUserIds: string[],
  expenses: ExpenseInputV2[],
  settlements: SettlementInputV2[]
): Map<string, MemberNetPositionV2> {
  const activeExpenses = expenses.filter((e) => !e.isDeleted);
  const result = new Map<string, MemberNetPositionV2>();

  // Ensure all relevant users (members + payers + participants + settlement participants) are captured
  const allUserIds = Array.from(
    new Set([
      ...allMemberUserIds,
      ...activeExpenses.map((e) => e.paidBy),
      ...activeExpenses.flatMap((e) => e.shares.map((s) => s.userId)),
      ...settlements.map((s) => s.payerId),
      ...settlements.map((s) => s.payeeId),
    ])
  ).sort();

  for (const userId of allUserIds) {
    let totalPaidPaise: Paise = 0;
    let totalSharePaise: Paise = 0;
    let settlementsSentPaise: Paise = 0;
    let settlementsReceivedPaise: Paise = 0;

    // 1. Process Expenses
    for (const exp of activeExpenses) {
      if (exp.paidBy === userId) {
        assertIntegerPaise(exp.totalAmountPaise, `Expense total amount for ${exp.id}`);
        totalPaidPaise = addPaise(totalPaidPaise, exp.totalAmountPaise);
      }
      for (const share of exp.shares) {
        if (share.userId === userId) {
          assertIntegerPaise(share.sharePaise, `Share for user ${userId} in ${exp.id}`);
          totalSharePaise = addPaise(totalSharePaise, share.sharePaise);
        }
      }
    }

    // 2. Process Settlements
    for (const s of settlements) {
      assertIntegerPaise(s.amountPaise, `Settlement amount for ${s.id}`);
      if (s.payerId === userId) {
        settlementsSentPaise = addPaise(settlementsSentPaise, s.amountPaise);
      }
      if (s.payeeId === userId) {
        settlementsReceivedPaise = addPaise(settlementsReceivedPaise, s.amountPaise);
      }
    }

    // 3. Gross Net: Total Paid - Total Share
    const grossNetPaise = subPaise(totalPaidPaise, totalSharePaise);

    // 4. Outstanding Net: Gross Net + Sent - Received
    const netPositionPaise = addPaise(
      subPaise(totalPaidPaise, totalSharePaise),
      subPaise(settlementsSentPaise, settlementsReceivedPaise)
    );

    // 5. Semantic Direction Determination
    let direction: NetPositionDirectionV2 = 'SETTLED';
    if (netPositionPaise > 0) {
      direction = 'RECEIVE';
    } else if (netPositionPaise < 0) {
      direction = 'OWES';
    }

    result.set(userId, {
      userId,
      totalPaidPaise,
      totalSharePaise,
      settlementsSentPaise,
      settlementsReceivedPaise,
      grossNetPaise,
      netPositionPaise,
      direction,
      absoluteAmountPaise: Math.abs(netPositionPaise),
      displayInr: formatPaiseToInr(Math.abs(netPositionPaise)),
    });
  }

  // 6. Conservation Check: Sum(netPositions) must be exactly 0
  const netSum = Array.from(result.values()).reduce(
    (acc, pos) => addPaise(acc, pos.netPositionPaise),
    0
  );

  if (netSum !== 0) {
    throw new Error(
      `CONSERVATION_INVARIANT_VIOLATION: Sum of room member net positions must equal 0, discrepancy is ${netSum} paise`
    );
  }

  return result;
}

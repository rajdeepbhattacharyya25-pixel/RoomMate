/**
 * RoomMate Shared Expense Engine V2 — Reference Implementation
 * Phase 2 Test Harness
 * 
 * Strict Invariant: Pure integer arithmetic in Paise.
 * Zero floating-point drift.
 */

import {
  Paise,
  ExpenseShare,
  Expense,
  Settlement,
  NetPosition,
  SimplifiedTransfer,
  RoomFinancialSummaryV2,
} from './types';

/**
 * Parses an INR string or integer into exact integer Paise without floating-point drift.
 * Examples:
 * "66.67" -> 6667
 * "200" -> 20000
 * "0.01" -> 1
 * "0.99" -> 99
 */
export function parseInrToPaise(val: string | number): Paise {
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      // If passing already in paise or whole rupees, handle cleanly
      // Convention: if user passes e.g. 200, assume string format is safer.
      // We parse number via string conversion to avoid binary fraction surprises.
      val = val.toString();
    } else {
      val = val.toFixed(2);
    }
  }

  const clean = val.trim().replace(/^₹/, '').replace(/,/g, '');
  if (!clean || clean === '0' || clean === '0.00') return 0;

  const parts = clean.split('.');
  const whole = parseInt(parts[0] || '0', 10);
  if (isNaN(whole)) throw new Error(`INVALID_CURRENCY_INPUT: "${val}"`);

  let fraction = 0;
  if (parts.length > 1) {
    const fracStr = (parts[1] + '00').substring(0, 2);
    fraction = parseInt(fracStr, 10);
    if (isNaN(fraction)) throw new Error(`INVALID_CURRENCY_FRACTION: "${val}"`);
  }

  const sign = clean.startsWith('-') ? -1 : 1;
  const absWhole = Math.abs(whole);
  return sign * (absWhole * 100 + fraction);
}

/**
 * Formats integer Paise to INR string with ₹ symbol.
 * 6667 -> "₹66.67"
 * 20000 -> "₹200.00"
 */
export function formatPaiseToInr(paise: Paise): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const remStr = remainder < 10 ? `0${remainder}` : `${remainder}`;
  return `${sign}₹${rupees}.${remStr}`;
}

/**
 * Formats integer Paise to exact two-decimal string for UPI URI specs.
 * 16667 -> "166.67"
 * 20000 -> "200.00"
 */
export function formatPaiseToUpiAmount(paise: Paise): string {
  if (paise < 0) throw new Error('NEGATIVE_UPI_AMOUNT_PROHIBITED');
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  const remStr = remainder < 10 ? `0${remainder}` : `${remainder}`;
  return `${rupees}.${remStr}`;
}

/**
 * Deterministic Equal Split (Invariant L3):
 * 1. Base share = floor(totalPaise / k)
 * 2. Remainder = totalPaise % k
 * 3. Sort participants lexicographically ascending by userId (UUID).
 * 4. First remainder participants receive base + 1, rest receive base.
 * Guarantees sum(shares) === totalPaise exactly.
 */
export function calculateEqualSplits(
  totalAmountPaise: Paise,
  participantUserIds: string[]
): ExpenseShare[] {
  if (participantUserIds.length === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Equal split requires at least one participant');
  }
  if (totalAmountPaise <= 0) {
    throw new Error('INVALID_AMOUNT: Expense total must be greater than 0');
  }

  // Deduplicate and sort participants lexicographically by UUID for 100% determinism
  const sortedParticipants = Array.from(new Set(participantUserIds)).sort();
  const k = sortedParticipants.length;

  const baseShare = Math.floor(totalAmountPaise / k);
  const remainder = totalAmountPaise % k;

  return sortedParticipants.map((userId, index) => ({
    userId,
    sharePaise: index < remainder ? baseShare + 1 : baseShare,
  }));
}

/**
 * Exact Amount Split Validation & Construction:
 * Validates that every share > 0 and sum(shares) === totalAmountPaise to the exact paisa.
 * No tolerance allowed.
 */
export function validateAndCalculateExactSplits(
  totalAmountPaise: Paise,
  shares: Record<string, Paise>
): ExpenseShare[] {
  if (totalAmountPaise <= 0) {
    throw new Error('INVALID_AMOUNT: Expense total must be greater than 0');
  }

  const entries = Object.entries(shares);
  if (entries.length === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Exact split requires at least one participant');
  }

  let totalAllocated = 0;
  const result: ExpenseShare[] = [];

  for (const [userId, sharePaise] of entries) {
    if (!Number.isInteger(sharePaise)) {
      throw new Error(`NON_INTEGER_SHARE: Share for user ${userId} must be an integer paise`);
    }
    if (sharePaise <= 0) {
      throw new Error(`NON_POSITIVE_SHARE: Share for user ${userId} must be greater than 0`);
    }
    totalAllocated += sharePaise;
    result.push({ userId, sharePaise });
  }

  if (totalAllocated !== totalAmountPaise) {
    throw new Error(
      `EXACT_SPLIT_SUM_MISMATCH: Sum of allocated shares (${totalAllocated} paise) does not equal total amount (${totalAmountPaise} paise)`
    );
  }

  return result.sort((a, b) => a.userId.localeCompare(b.userId));
}

/**
 * Percentage Split:
 * Input percentages in basis points (100.00% = 10000 bp).
 * Must sum exactly to 10000 basis points.
 * Remainder paise distributed to highest fractional cent or sorted user ID.
 */
export function calculatePercentageSplits(
  totalAmountPaise: Paise,
  percentagesBp: Record<string, number>
): ExpenseShare[] {
  if (totalAmountPaise <= 0) {
    throw new Error('INVALID_AMOUNT: Expense total must be greater than 0');
  }

  const entries = Object.entries(percentagesBp).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Percentage split requires at least one participant');
  }

  let sumBp = 0;
  for (const [userId, bp] of entries) {
    if (!Number.isInteger(bp) || bp <= 0) {
      throw new Error(`INVALID_PERCENTAGE: Basis points for ${userId} must be positive integer`);
    }
    sumBp += bp;
  }

  if (sumBp !== 10000) {
    throw new Error(`PERCENTAGE_SUM_MISMATCH: Basis points sum to ${sumBp}, expected exactly 10000 (100.00%)`);
  }

  // Calculate integer shares and collect fractional remainders
  let allocatedSum = 0;
  const tempShares: { userId: string; basePaise: Paise; frac: number }[] = [];

  for (const [userId, bp] of entries) {
    const rawPaise = (totalAmountPaise * bp) / 10000;
    const basePaise = Math.floor(rawPaise);
    const frac = rawPaise - basePaise;
    allocatedSum += basePaise;
    tempShares.push({ userId, basePaise, frac });
  }

  let remainder = totalAmountPaise - allocatedSum;
  // Sort descending by fractional remainder, tie-break by userId ascending
  tempShares.sort((a, b) => {
    if (Math.abs(b.frac - a.frac) > 1e-9) {
      return b.frac - a.frac;
    }
    return a.userId.localeCompare(b.userId);
  });

  for (let i = 0; i < remainder; i++) {
    tempShares[i].basePaise += 1;
  }

  return tempShares
    .map((s) => ({ userId: s.userId, sharePaise: s.basePaise }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

/**
 * Shares-Based Split:
 * Input weights as positive integers (e.g. 1, 2, 1).
 * Total shares = sum(weights).
 * Distributes remainder paise deterministically.
 */
export function calculateSharesSplits(
  totalAmountPaise: Paise,
  weights: Record<string, number>
): ExpenseShare[] {
  if (totalAmountPaise <= 0) {
    throw new Error('INVALID_AMOUNT: Expense total must be greater than 0');
  }

  const entries = Object.entries(weights).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Shares split requires at least one participant');
  }

  let totalShares = 0;
  for (const [userId, w] of entries) {
    if (!Number.isInteger(w) || w <= 0) {
      throw new Error(`INVALID_SHARE_WEIGHT: Weight for ${userId} must be positive integer`);
    }
    totalShares += w;
  }

  let allocatedSum = 0;
  const tempShares: { userId: string; basePaise: Paise; frac: number }[] = [];

  for (const [userId, w] of entries) {
    const rawPaise = (totalAmountPaise * w) / totalShares;
    const basePaise = Math.floor(rawPaise);
    const frac = rawPaise - basePaise;
    allocatedSum += basePaise;
    tempShares.push({ userId, basePaise, frac });
  }

  let remainder = totalAmountPaise - allocatedSum;
  tempShares.sort((a, b) => {
    if (Math.abs(b.frac - a.frac) > 1e-9) {
      return b.frac - a.frac;
    }
    return a.userId.localeCompare(b.userId);
  });

  for (let i = 0; i < remainder; i++) {
    tempShares[i].basePaise += 1;
  }

  return tempShares
    .map((s) => ({ userId: s.userId, sharePaise: s.basePaise }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
}

/**
 * Calculates Canonical Member Net Positions:
 * For each member:
 * Gross Net = TotalPaidAsPayer - TotalAllocatedShare
 * Net Position = Gross Net + SettlementsSent - SettlementsReceived
 */
export function calculateMemberNetPositions(
  allMemberUserIds: string[],
  expenses: Expense[],
  settlements: Settlement[]
): Map<string, NetPosition> {
  const activeExpenses = expenses.filter((e) => !e.isDeleted);
  const result = new Map<string, NetPosition>();

  const allUserIds = Array.from(new Set([
    ...allMemberUserIds,
    ...activeExpenses.map((e) => e.paidBy),
    ...activeExpenses.flatMap((e) => e.shares.map((s) => s.userId)),
    ...settlements.map((s) => s.payerId),
    ...settlements.map((s) => s.payeeId),
  ])).sort();

  for (const userId of allUserIds) {
    let totalPaidPaise = 0;
    let totalSharePaise = 0;
    let settlementsSentPaise = 0;
    let settlementsReceivedPaise = 0;

    // 1. Sum expenses paid by user
    for (const exp of activeExpenses) {
      if (exp.paidBy === userId) {
        totalPaidPaise += exp.totalAmountPaise;
      }
      // Sum user's allocated share
      for (const split of exp.shares) {
        if (split.userId === userId) {
          totalSharePaise += split.sharePaise;
        }
      }
    }

    // 2. Sum settlements
    for (const pmt of settlements) {
      if (pmt.payerId === userId) {
        settlementsSentPaise += pmt.amountPaise;
      }
      if (pmt.payeeId === userId) {
        settlementsReceivedPaise += pmt.amountPaise;
      }
    }

    // 3. Net Position
    const netPositionPaise =
      (totalPaidPaise + settlementsSentPaise) - (totalSharePaise + settlementsReceivedPaise);

    let direction: 'RECEIVE' | 'OWES' | 'SETTLED' = 'SETTLED';
    if (netPositionPaise > 0) direction = 'RECEIVE';
    else if (netPositionPaise < 0) direction = 'OWES';

    result.set(userId, {
      userId,
      totalPaidPaise,
      totalSharePaise,
      settlementsSentPaise,
      settlementsReceivedPaise,
      netPositionPaise,
      direction,
      absoluteAmountPaise: Math.abs(netPositionPaise),
    });
  }

  return result;
}

/**
 * Canonical Debt Simplification (Min-Cash-Flow Matching):
 * Matches largest debtors against largest creditors.
 * Guarantees at most N - 1 transfers.
 * Strictly acyclic (zero cycles).
 * Deterministic tie-breaking by userId ascending.
 */
export function simplifyDebts(netPositions: Map<string, NetPosition>): SimplifiedTransfer[] {
  interface Account {
    userId: string;
    amount: Paise;
  }

  const creditors: Account[] = [];
  const debtors: Account[] = [];

  for (const [userId, pos] of netPositions.entries()) {
    if (pos.netPositionPaise > 0) {
      creditors.push({ userId, amount: pos.netPositionPaise });
    } else if (pos.netPositionPaise < 0) {
      debtors.push({ userId, amount: Math.abs(pos.netPositionPaise) });
    }
  }

  // Sort descending by amount, tie-break by userId ascending for 100% determinism
  const sortFn = (a: Account, b: Account) => {
    if (b.amount !== a.amount) {
      return b.amount - a.amount;
    }
    return a.userId.localeCompare(b.userId);
  };

  creditors.sort(sortFn);
  debtors.sort(sortFn);

  const transfers: SimplifiedTransfer[] = [];

  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const cred = creditors[cIdx];
    const debt = debtors[dIdx];

    const transferAmount = Math.min(cred.amount, debt.amount);
    if (transferAmount > 0) {
      transfers.push({
        fromUserId: debt.userId,
        toUserId: cred.userId,
        amountPaise: transferAmount,
      });
    }

    cred.amount -= transferAmount;
    debt.amount -= transferAmount;

    if (cred.amount === 0) {
      cIdx++;
    }
    if (debt.amount === 0) {
      dIdx++;
    }
  }

  return transfers;
}

/**
 * Validates whether an attempted settlement is legal:
 * - Must be positive (> 0)
 * - Payer must not be Payee
 * - Payer must be a Debtor (netPosition < 0)
 * - Settlement must not exceed payer's debt
 * - Payee must be a Creditor (netPosition > 0)
 * - Settlement must not exceed payee's credit
 */
export function validateSettlementAttempt(
  payerPosition: NetPosition | undefined,
  payeePosition: NetPosition | undefined,
  amountPaise: Paise
): { isValid: boolean; error?: string } {
  if (amountPaise <= 0) {
    return { isValid: false, error: 'SETTLEMENT_AMOUNT_MUST_BE_POSITIVE' };
  }
  if (!payerPosition || !payeePosition) {
    return { isValid: false, error: 'PARTICIPANTS_MUST_EXIST' };
  }
  if (payerPosition.userId === payeePosition.userId) {
    return { isValid: false, error: 'SELF_SETTLEMENT_PROHIBITED' };
  }
  if (payerPosition.netPositionPaise >= 0) {
    return { isValid: false, error: 'PAYER_IS_NOT_A_DEBTOR' };
  }
  if (payeePosition.netPositionPaise <= 0) {
    return { isValid: false, error: 'PAYEE_IS_NOT_A_CREDITOR' };
  }

  const maxPayerCanPay = Math.abs(payerPosition.netPositionPaise);
  if (amountPaise > maxPayerCanPay) {
    return {
      isValid: false,
      error: `OVERSETTLEMENT_EXCEEDS_DEBT: Attempted ${amountPaise} paise, but debtor only owes ${maxPayerCanPay} paise`,
    };
  }

  const maxPayeeCanReceive = payeePosition.netPositionPaise;
  if (amountPaise > maxPayeeCanReceive) {
    return {
      isValid: false,
      error: `OVERSETTLEMENT_EXCEEDS_CREDIT: Attempted ${amountPaise} paise, but creditor is only owed ${maxPayeeCanReceive} paise`,
    };
  }

  return { isValid: true };
}

/**
 * Calculates complete room financial summary V2:
 * 1. Computes member net positions
 * 2. Checks Invariant L1: sum(netPositions) === 0
 * 3. Runs min-cash-flow debt simplification
 */
export function calculateRoomSummaryV2(
  roomId: string,
  memberUserIds: string[],
  expenses: Expense[],
  settlements: Settlement[]
): RoomFinancialSummaryV2 {
  const roomExpenses = expenses.filter((e) => e.roomId === roomId && !e.isDeleted);
  const roomSettlements = settlements.filter((s) => s.roomId === roomId);

  const netMap = calculateMemberNetPositions(memberUserIds, roomExpenses, roomSettlements);
  const members = Array.from(netMap.values()).sort((a, b) => a.userId.localeCompare(b.userId));

  const totalExpensesPaise = roomExpenses.reduce((sum, e) => sum + e.totalAmountPaise, 0);
  const totalSettledPaise = roomSettlements.reduce((sum, s) => sum + s.amountPaise, 0);

  const netDiscrepancyPaise = members.reduce((sum, m) => sum + m.netPositionPaise, 0);
  const isZeroSumVerified = netDiscrepancyPaise === 0;

  const simplifiedTransfers = simplifyDebts(netMap);

  return {
    roomId,
    totalExpensesPaise,
    totalSettledPaise,
    members,
    simplifiedTransfers,
    isZeroSumVerified,
    netDiscrepancyPaise,
  };
}

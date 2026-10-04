/**
 * RoomMate Shared Expense Engine V2 — Deterministic Expense Allocation
 * Phase 3 Implementation
 * 
 * Implements Equal, Exact, Percentage, and Shares allocations in integer Paise.
 * Invariant L3: Sum of allocated shares must equal totalAmountPaise to the exact paisa.
 */

import { Paise, ExpenseShareV2 } from './types';
import { assertIntegerPaise, addPaise } from './money';

/**
 * PART 4 — Deterministic Equal Split:
 * 1. Base share = floor(totalPaise / k)
 * 2. Remainder = totalPaise % k
 * 3. Participants deduplicated and sorted lexicographically ascending by userId (UUID).
 * 4. First `remainder` participants receive base + 1, remaining receive base.
 * Guarantees sum(shares) === totalPaise with zero rounding drift.
 */
export function calculateEqualSplitsV2(
  totalAmountPaise: Paise,
  participantUserIds: string[]
): ExpenseShareV2[] {
  assertIntegerPaise(totalAmountPaise, 'calculateEqualSplitsV2 total');

  if (totalAmountPaise <= 0) {
    throw new Error(`INVALID_EXPENSE_AMOUNT: Total amount must be positive, got ${totalAmountPaise}`);
  }

  // Deduplicate and canonicalize participants by UUID
  const sortedParticipants = Array.from(new Set(participantUserIds)).sort();
  const k = sortedParticipants.length;

  if (k === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Equal split requires at least one participant');
  }

  const baseShare = Math.floor(totalAmountPaise / k);
  const remainder = totalAmountPaise % k;

  const splits: ExpenseShareV2[] = sortedParticipants.map((userId, index) => ({
    userId,
    sharePaise: index < remainder ? baseShare + 1 : baseShare,
  }));

  // Invariant verification
  const sum = splits.reduce((acc, s) => addPaise(acc, s.sharePaise), 0);
  if (sum !== totalAmountPaise) {
    throw new Error(`ALLOCATION_INVARIANT_VIOLATION: Sum of equal shares (${sum}) !== total (${totalAmountPaise})`);
  }

  return splits;
}

/**
 * PART 5 — Exact Split Validation & Allocation:
 * Validates that every share is a positive integer Paise and sum(shares) === totalAmountPaise.
 * Strictly ZERO tolerance (no epsilon or floating approximations permitted).
 */
export function validateAndCalculateExactSplitsV2(
  totalAmountPaise: Paise,
  shares: Record<string, Paise>
): ExpenseShareV2[] {
  assertIntegerPaise(totalAmountPaise, 'validateAndCalculateExactSplitsV2 total');

  if (totalAmountPaise <= 0) {
    throw new Error(`INVALID_EXPENSE_AMOUNT: Total amount must be positive, got ${totalAmountPaise}`);
  }

  const entries = Object.entries(shares);
  if (entries.length === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Exact split requires at least one participant');
  }

  let totalAllocated = 0;
  const result: ExpenseShareV2[] = [];

  for (const [userId, sharePaise] of entries) {
    assertIntegerPaise(sharePaise, `Exact share for user ${userId}`);

    if (sharePaise <= 0) {
      throw new Error(`NON_POSITIVE_SHARE: Share for user ${userId} must be greater than 0, got ${sharePaise}`);
    }

    totalAllocated = addPaise(totalAllocated, sharePaise);
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
 * PART 6 — Deterministic Percentage Split:
 * Takes percentages in basis points (100.00% = 10000 bp).
 * Validates sum(bp) === 10000 exactly.
 * Allocates base paise using floor((total * bp) / 10000).
 * Remainder paise distributed to highest fractional cent, tie-break by sorted UUID.
 */
export function calculatePercentageSplitsV2(
  totalAmountPaise: Paise,
  percentagesBp: Record<string, number>
): ExpenseShareV2[] {
  assertIntegerPaise(totalAmountPaise, 'calculatePercentageSplitsV2 total');

  if (totalAmountPaise <= 0) {
    throw new Error(`INVALID_EXPENSE_AMOUNT: Total amount must be positive, got ${totalAmountPaise}`);
  }

  const entries = Object.entries(percentagesBp).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Percentage split requires at least one participant');
  }

  let sumBp = 0;
  for (const [userId, bp] of entries) {
    assertIntegerPaise(bp, `Basis points for user ${userId}`);
    if (bp <= 0) {
      throw new Error(`INVALID_PERCENTAGE: Basis points for user ${userId} must be positive, got ${bp}`);
    }
    sumBp += bp;
  }

  if (sumBp !== 10000) {
    throw new Error(`PERCENTAGE_SUM_MISMATCH: Basis points sum to ${sumBp}, must equal exactly 10000 (100.00%)`);
  }

  let allocatedSum = 0;
  const tempShares: { userId: string; basePaise: Paise; frac: number }[] = [];

  for (const [userId, bp] of entries) {
    const rawPaise = (totalAmountPaise * bp) / 10000;
    const basePaise = Math.floor(rawPaise);
    const frac = rawPaise - basePaise;
    allocatedSum += basePaise;
    tempShares.push({ userId, basePaise, frac });
  }

  const remainder = totalAmountPaise - allocatedSum;
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

  const result = tempShares
    .map((s) => ({ userId: s.userId, sharePaise: s.basePaise }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const totalVerified = result.reduce((acc, s) => addPaise(acc, s.sharePaise), 0);
  if (totalVerified !== totalAmountPaise) {
    throw new Error(`PERCENTAGE_ALLOCATION_MISMATCH: Expected ${totalAmountPaise}, got ${totalVerified}`);
  }

  return result;
}

/**
 * PART 7 — Deterministic Shares-Based Split:
 * Takes integer weights (e.g. 1, 1, 2).
 * Allocates base paise using floor((total * weight) / totalShares).
 * Remainder paise distributed to highest fractional cent, tie-break by sorted UUID.
 */
export function calculateSharesSplitsV2(
  totalAmountPaise: Paise,
  weights: Record<string, number>
): ExpenseShareV2[] {
  assertIntegerPaise(totalAmountPaise, 'calculateSharesSplitsV2 total');

  if (totalAmountPaise <= 0) {
    throw new Error(`INVALID_EXPENSE_AMOUNT: Total amount must be positive, got ${totalAmountPaise}`);
  }

  const entries = Object.entries(weights).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    throw new Error('EMPTY_PARTICIPANTS: Shares split requires at least one participant');
  }

  let totalShares = 0;
  for (const [userId, w] of entries) {
    assertIntegerPaise(w, `Share weight for user ${userId}`);
    if (w <= 0) {
      throw new Error(`INVALID_SHARE_WEIGHT: Weight for user ${userId} must be positive integer, got ${w}`);
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

  const remainder = totalAmountPaise - allocatedSum;
  tempShares.sort((a, b) => {
    if (Math.abs(b.frac - a.frac) > 1e-9) {
      return b.frac - a.frac;
    }
    return a.userId.localeCompare(b.userId);
  });

  for (let i = 0; i < remainder; i++) {
    tempShares[i].basePaise += 1;
  }

  const result = tempShares
    .map((s) => ({ userId: s.userId, sharePaise: s.basePaise }))
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const totalVerified = result.reduce((acc, s) => addPaise(acc, s.sharePaise), 0);
  if (totalVerified !== totalAmountPaise) {
    throw new Error(`SHARES_ALLOCATION_MISMATCH: Expected ${totalAmountPaise}, got ${totalVerified}`);
  }

  return result;
}

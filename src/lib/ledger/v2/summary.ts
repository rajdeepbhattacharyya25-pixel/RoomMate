/**
 * RoomMate Shared Expense Engine V2 — Canonical Room Financial Summary
 * Phase 3 Implementation
 * 
 * Aggregates room expenses and settlements, verifies Invariant L1,
 * generates simplified settlement transfers, and validates settlement attempts.
 */

import {
  Paise,
  ExpenseInputV2,
  SettlementInputV2,
  RoomFinancialSummaryV2,
  MemberNetPositionV2,
  SettlementValidationResultV2,
  LeaveRoomValidationResultV2,
} from './types';
import { calculateMemberNetPositionsV2 } from './netPositions';
import { simplifyDebtsV2 } from './simplification';
import { assertIntegerPaise, addPaise } from './money';

/**
 * Calculates complete authoritative financial summary for a room.
 */
export function calculateRoomFinancialSummaryV2(
  roomId: string,
  memberUserIds: string[],
  expenses: ExpenseInputV2[],
  settlements: SettlementInputV2[]
): RoomFinancialSummaryV2 {
  const roomExpenses = expenses.filter((e) => e.roomId === roomId && !e.isDeleted);
  const roomSettlements = settlements.filter((s) => s.roomId === roomId);

  const netMap = calculateMemberNetPositionsV2(memberUserIds, roomExpenses, roomSettlements);
  const members = Array.from(netMap.values()).sort((a, b) => a.userId.localeCompare(b.userId));

  const totalExpensesPaise = roomExpenses.reduce(
    (acc, e) => addPaise(acc, e.totalAmountPaise),
    0
  );

  const totalSettledPaise = roomSettlements.reduce(
    (acc, s) => addPaise(acc, s.amountPaise),
    0
  );

  const netDiscrepancyPaise = members.reduce(
    (acc, m) => addPaise(acc, m.netPositionPaise),
    0
  );

  const isZeroSumVerified = netDiscrepancyPaise === 0;
  const simplifiedTransfers = simplifyDebtsV2(netMap);

  return {
    roomId,
    totalExpensesPaise,
    totalSettledPaise,
    members,
    simplifiedTransfers,
    isZeroSumVerified,
    netDiscrepancyPaise,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Validates whether an attempted settlement payment is mathematically and logically legal.
 * Invariants:
 * - Amount must be positive integer Paise.
 * - Payer cannot be Payee.
 * - Payer must be an active Debtor (netPositionPaise < 0).
 * - Settlement must not exceed payer's total outstanding debt.
 * - Payee must be an active Creditor (netPositionPaise > 0).
 * - Settlement must not exceed payee's total credit.
 */
export function validateSettlementAttemptV2(
  payerPosition: MemberNetPositionV2 | undefined,
  payeePosition: MemberNetPositionV2 | undefined,
  amountPaise: Paise
): SettlementValidationResultV2 {
  assertIntegerPaise(amountPaise, 'validateSettlementAttemptV2 amount');

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
      maxPermissiblePaise: maxPayerCanPay,
    };
  }

  const maxPayeeCanReceive = payeePosition.netPositionPaise;
  if (amountPaise > maxPayeeCanReceive) {
    return {
      isValid: false,
      error: `OVERSETTLEMENT_EXCEEDS_CREDIT: Attempted ${amountPaise} paise, but creditor is only owed ${maxPayeeCanReceive} paise`,
      maxPermissiblePaise: maxPayeeCanReceive,
    };
  }

  return {
    isValid: true,
    maxPermissiblePaise: Math.min(maxPayerCanPay, maxPayeeCanReceive),
  };
}

/**
 * Validates whether a member can safely exit a room without leaving unsettled obligations.
 */
export function canMemberExitRoomV2(
  position: MemberNetPositionV2 | undefined
): LeaveRoomValidationResultV2 {
  if (!position) {
    return { canLeave: true, reason: 'FINANCIALLY_CLEAR', netPositionPaise: 0 };
  }

  if (position.netPositionPaise === 0) {
    return { canLeave: true, reason: 'FINANCIALLY_CLEAR', netPositionPaise: 0 };
  }

  if (position.netPositionPaise < 0) {
    return {
      canLeave: false,
      reason: `UNSETTLED_DEBT: Member still owes ${Math.abs(position.netPositionPaise)} paise to roommates`,
      netPositionPaise: position.netPositionPaise,
    };
  }

  return {
    canLeave: false,
    reason: `UNCOLLECTED_CREDIT: Member is owed ${position.netPositionPaise} paise by roommates`,
    netPositionPaise: position.netPositionPaise,
  };
}

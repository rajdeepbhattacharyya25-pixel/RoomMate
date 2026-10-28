import {
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  PersonalExpense,
  User,
  PairwiseDebt,
  RoomFinancialSummary,
  UserUnifiedDashboard,
  SplitMethod,
} from '../../types';

// Re-export V2 Canonical Financial Ledger Engine (Phase 3)
export * from './v2';

/**
 * High-precision rounding to 2 decimal places to avoid floating point anomalies.
 * @deprecated Use integer Paise operations in `./v2` for authoritative financial calculations.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates point-in-time splits for a shared expense across participating users.
 * Automatically distributes remainder cents deterministically to ensure sum(splits) === totalAmount.
 * @deprecated Legacy client calculation. For canonical V2 allocations, use `calculateEqualSplitsV2`,
 * `validateAndCalculateExactSplitsV2`, etc. from `./v2`.
 */
export function calculateSplits(
  totalAmount: number,
  participantUserIds: string[],
  method: SplitMethod = 'EQUAL',
  customValues?: Record<string, number> // exact amounts, percentages, or shares
): { userId: string; shareAmount: number }[] {
  if (participantUserIds.length === 0 || totalAmount <= 0) {
    return [];
  }

  const cleanTotal = round2(totalAmount);
  const count = participantUserIds.length;

  let baseSplits: { userId: string; shareAmount: number }[] = [];

  if (method === 'EQUAL') {
    const rawShare = Math.floor((cleanTotal / count) * 100) / 100;
    baseSplits = participantUserIds.map((userId) => ({
      userId,
      shareAmount: rawShare,
    }));
  } else if (method === 'EXACT' && customValues) {
    baseSplits = participantUserIds.map((userId) => ({
      userId,
      shareAmount: round2(customValues[userId] || 0),
    }));
  } else if (method === 'PERCENTAGE' && customValues) {
    baseSplits = participantUserIds.map((userId) => {
      const pct = customValues[userId] || 0;
      return {
        userId,
        shareAmount: round2((cleanTotal * pct) / 100),
      };
    });
  } else if (method === 'SHARES' && customValues) {
    const totalShares = Object.values(customValues).reduce((acc, val) => acc + val, 0);
    if (totalShares === 0) return [];
    baseSplits = participantUserIds.map((userId) => {
      const shares = customValues[userId] || 0;
      return {
        userId,
        shareAmount: round2((cleanTotal * shares) / totalShares),
      };
    });
  } else {
    return calculateSplits(cleanTotal, participantUserIds, 'EQUAL');
  }

  // Reconcile rounding discrepancies down to the exact cent across all split methods
  // Ensures sum(splits.shareAmount) === cleanTotal, preventing Postgres RPC SPLIT_SUM_MISMATCH errors
  const totalAllocated = round2(baseSplits.reduce((acc, s) => acc + s.shareAmount, 0));
  let remainderCents = Math.round((cleanTotal - totalAllocated) * 100);

  if (remainderCents !== 0 && baseSplits.length > 0) {
    if (remainderCents > 0) {
      for (let i = 0; i < baseSplits.length && remainderCents > 0; i++) {
        baseSplits[i].shareAmount = round2(baseSplits[i].shareAmount + 0.01);
        remainderCents--;
      }
    } else {
      for (let i = 0; i < baseSplits.length && remainderCents < 0; i++) {
        if (baseSplits[i].shareAmount >= 0.02) {
          baseSplits[i].shareAmount = round2(baseSplits[i].shareAmount - 0.01);
          remainderCents++;
        }
      }
    }
  }

  return baseSplits;
}

/**
 * Calculates raw, unsimplified bilateral pairwise debts between members.
 * Preserves the exact auditable trail of who paid for whom and direct settlement transfers.
 */
export { calculateRoomPairwiseDebts } from './financialIntegrationService';

// Export Canonical Financial Integration Service (Phase 4)
export * from './financialIntegrationService';
import { calculateCanonicalRoomSummary } from './financialIntegrationService';

/**
 * Calculates the complete financial summary for a specific room from a user's perspective.
 * Canonical V2 Engine: Powered by multilateral net positions and min-cash-flow simplification.
 */
export function calculateRoomSummary(
  roomId: string,
  currentUserId: string,
  expenses: SharedExpense[],
  splits: ExpenseSplit[],
  settlements: SettlementPayment[],
  users: User[]
): RoomFinancialSummary {
  return calculateCanonicalRoomSummary(
    roomId,
    currentUserId,
    expenses,
    splits,
    settlements,
    users
  );
}

/**
 * Calculates the unified dashboard summary for an individual student,
 * aggregating 100% private personal expenses + my share of all active room obligations.
 */
export function calculateUnifiedDashboard(
  currentUserId: string,
  personalExpenses: PersonalExpense[],
  allExpenses: SharedExpense[],
  allSplits: ExpenseSplit[],
  allSettlements: SettlementPayment[],
  users: User[],
  activeRoomIds: string[]
): UserUnifiedDashboard {
  // 1. Private Personal Outflow
  const myPersonalExpenses = personalExpenses.filter((p) => p.userId === currentUserId);
  const personalTotal = round2(myPersonalExpenses.reduce((sum, p) => sum + p.amount, 0));

  // 2. Shared Obligations
  const activeExpenseMap = new Map(
    allExpenses.filter((e) => activeRoomIds.includes(e.roomId) && !e.isDeleted).map((e) => [e.id, e])
  );
  const mySplits = allSplits.filter(
    (s) => s.userId === currentUserId && activeExpenseMap.has(s.sharedExpenseId)
  );
  const sharedObligationsTotal = round2(mySplits.reduce((sum, s) => sum + s.shareAmount, 0));

  // 3. Net Receivables & Payables Across All Rooms
  let netReceivables = 0;
  let netPayables = 0;

  for (const roomId of activeRoomIds) {
    const summary = calculateRoomSummary(
      roomId,
      currentUserId,
      allExpenses,
      allSplits,
      allSettlements,
      users
    );

    for (const debt of summary.pairwiseDebts) {
      if (debt.userAId === currentUserId) {
        if (debt.netAmount > 0) {
          netReceivables = round2(netReceivables + debt.netAmount);
        } else if (debt.netAmount < 0) {
          netPayables = round2(netPayables + Math.abs(debt.netAmount));
        }
      } else if (debt.userBId === currentUserId) {
        if (debt.netAmount < 0) {
          netReceivables = round2(netReceivables + Math.abs(debt.netAmount));
        } else if (debt.netAmount > 0) {
          netPayables = round2(netPayables + debt.netAmount);
        }
      }
    }
  }

  return {
    personalTotal,
    sharedObligationsTotal,
    totalOutflow: round2(personalTotal + sharedObligationsTotal),
    netReceivables,
    netPayables,
    activeRoomsCount: activeRoomIds.length,
  };
}

export interface MemberObligationsSummary {
  debtsOwed: { toUserId: string; toUserName: string; amount: number }[];
  creditsOwed: { fromUserId: string; fromUserName: string; amount: number }[];
  totalOwed: number;
  totalCredit: number;
  hasUnresolvedObligations: boolean;
}

/**
 * Calculates authoritative unresolved pairwise financial obligations for a specific member in a room.
 * Separates debts owed to others from credits owed by others to prevent false clean exits on net zero.
 */
export function getOutstandingObligationsForMember(
  userId: string,
  pairwiseDebts: PairwiseDebt[]
): MemberObligationsSummary {
  const debtsOwed: { toUserId: string; toUserName: string; amount: number }[] = [];
  const creditsOwed: { fromUserId: string; fromUserName: string; amount: number }[] = [];

  for (const debt of pairwiseDebts) {
    const absAmount = Math.abs(debt.netAmount);
    if (absAmount < 0.01) continue;

    // In calculateRoomPairwiseDebts:
    // netAmount > 0 means userB owes userA
    // netAmount < 0 means userA owes userB
    if (debt.userAId === userId) {
      if (debt.netAmount > 0) {
        // userB owes userA (me) -> Credit
        creditsOwed.push({
          fromUserId: debt.userBId,
          fromUserName: debt.userBName,
          amount: absAmount,
        });
      } else {
        // userA (me) owes userB -> Debt
        debtsOwed.push({
          toUserId: debt.userBId,
          toUserName: debt.userBName,
          amount: absAmount,
        });
      }
    } else if (debt.userBId === userId) {
      if (debt.netAmount > 0) {
        // userB (me) owes userA -> Debt
        debtsOwed.push({
          toUserId: debt.userAId,
          toUserName: debt.userAName,
          amount: absAmount,
        });
      } else {
        // userA owes userB (me) -> Credit
        creditsOwed.push({
          fromUserId: debt.userAId,
          fromUserName: debt.userAName,
          amount: absAmount,
        });
      }
    }
  }

  const totalOwed = round2(debtsOwed.reduce((sum, d) => sum + d.amount, 0));
  const totalCredit = round2(creditsOwed.reduce((sum, c) => sum + c.amount, 0));
  const hasUnresolvedObligations = debtsOwed.length > 0 || creditsOwed.length > 0;

  return {
    debtsOwed,
    creditsOwed,
    totalOwed,
    totalCredit,
    hasUnresolvedObligations,
  };
}

/**
 * Clean Exit Gate: A member can only exit cleanly if they have zero unresolved debts and zero unresolved credits.
 */
export function canCleanExit(obligations: MemberObligationsSummary): boolean {
  return !obligations.hasUnresolvedObligations;
}

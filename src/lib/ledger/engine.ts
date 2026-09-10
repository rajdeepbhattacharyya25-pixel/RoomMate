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

/**
 * High-precision rounding to 2 decimal places to avoid floating point anomalies.
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates point-in-time splits for a shared expense across participating users.
 * Automatically distributes remainder cents deterministically to ensure sum(splits) === totalAmount.
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

  if (method === 'EQUAL') {
    const rawShare = Math.floor((cleanTotal / count) * 100) / 100;
    const baseSplits = participantUserIds.map((userId) => ({
      userId,
      shareAmount: rawShare,
    }));

    // Calculate remainder cents (e.g. 100 / 3 = 33.33 * 3 = 99.99 -> remainder 0.01)
    const totalAllocated = round2(rawShare * count);
    let remainderCents = Math.round((cleanTotal - totalAllocated) * 100);

    // Deterministically assign extra cent to first N members
    for (let i = 0; i < baseSplits.length && remainderCents > 0; i++) {
      baseSplits[i].shareAmount = round2(baseSplits[i].shareAmount + 0.01);
      remainderCents--;
    }

    return baseSplits;
  }

  if (method === 'EXACT' && customValues) {
    return participantUserIds.map((userId) => ({
      userId,
      shareAmount: round2(customValues[userId] || 0),
    }));
  }

  if (method === 'PERCENTAGE' && customValues) {
    return participantUserIds.map((userId) => {
      const pct = customValues[userId] || 0;
      return {
        userId,
        shareAmount: round2((cleanTotal * pct) / 100),
      };
    });
  }

  if (method === 'SHARES' && customValues) {
    const totalShares = Object.values(customValues).reduce((acc, val) => acc + val, 0);
    if (totalShares === 0) return [];
    return participantUserIds.map((userId) => {
      const shares = customValues[userId] || 0;
      return {
        userId,
        shareAmount: round2((cleanTotal * shares) / totalShares),
      };
    });
  }

  // Fallback to equal
  return calculateSplits(cleanTotal, participantUserIds, 'EQUAL');
}

/**
 * Calculates two-way pairwise net balances between all members in a room.
 * Formula for Pair (A, B):
 * NetBalance(A -> B) = Obligations(B -> A) - Obligations(A -> B) + Settlements(A -> B) - Settlements(B -> A)
 *
 * Positive NetBalance: B owes A
 * Negative NetBalance: A owes B
 */
export function calculateRoomPairwiseDebts(
  expenses: SharedExpense[],
  splits: ExpenseSplit[],
  settlements: SettlementPayment[],
  users: User[]
): PairwiseDebt[] {
  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));
  const activeExpenses = expenses.filter((e) => !e.isDeleted);
  const expenseMap = new Map<string, SharedExpense>(activeExpenses.map((e) => [e.id, e]));

  // Track raw obligations and direct settlement transfers
  // Key format: `${payerId}:::${debtorId}` represents "debtor owes payer"
  const rawObligations = new Map<string, number>();
  const rawSettlements = new Map<string, number>();

  const getPairKey = (payerId: string, debtorId: string) => `${payerId}:::${debtorId}`;

  // 1. Process Expense Splits
  for (const split of splits) {
    const expense = expenseMap.get(split.sharedExpenseId);
    if (!expense) continue;

    const payerId = expense.paidBy;
    const debtorId = split.userId;

    if (payerId !== debtorId) {
      const key = getPairKey(payerId, debtorId);
      const current = rawObligations.get(key) || 0;
      rawObligations.set(key, round2(current + split.shareAmount));
    }
  }

  // 2. Process Settlement Payments
  for (const pmt of settlements) {
    const payerId = pmt.payerId; // Money sender
    const payeeId = pmt.payeeId; // Money receiver

    const key = getPairKey(payerId, payeeId);
    const current = rawSettlements.get(key) || 0;
    rawSettlements.set(key, round2(current + pmt.amount));
  }

  // 3. Consolidate Unique Pairs
  const allUserIds = Array.from(userMap.keys());
  const pairwiseResults: PairwiseDebt[] = [];

  for (let i = 0; i < allUserIds.length; i++) {
    for (let j = i + 1; j < allUserIds.length; j++) {
      const uA = allUserIds[i];
      const uB = allUserIds[j];

      // Obligations
      const bOwesAForBills = rawObligations.get(getPairKey(uA, uB)) || 0;
      const aOwesBForBills = rawObligations.get(getPairKey(uB, uA)) || 0;

      // Direct Payments / Settlements
      const aPaidBDirectly = rawSettlements.get(getPairKey(uA, uB)) || 0;
      const bPaidADirectly = rawSettlements.get(getPairKey(uB, uA)) || 0;

      // Net from A's perspective:
      // What B owes A = bOwesAForBills - bPaidADirectly
      // What A owes B = aOwesBForBills - aPaidBDirectly
      // NetBalance(A <-> B) = (What B owes A) - (What A owes B)
      const netAmount = round2(bOwesAForBills - aOwesBForBills + aPaidBDirectly - bPaidADirectly);

      if (Math.abs(netAmount) >= 0.01) {
        pairwiseResults.push({
          userAId: uA,
          userBId: uB,
          userAName: userMap.get(uA)?.name || 'Unknown',
          userBName: userMap.get(uB)?.name || 'Unknown',
          netAmount,
          explanation: {
            aPaidForB: bOwesAForBills,
            bPaidForA: aOwesBForBills,
            settlementsAToB: aPaidBDirectly,
            settlementsBToA: bPaidADirectly,
          },
        });
      }
    }
  }

  return pairwiseResults;
}

/**
 * Calculates the complete financial summary for a specific room from a user's perspective.
 */
export function calculateRoomSummary(
  roomId: string,
  currentUserId: string,
  expenses: SharedExpense[],
  splits: ExpenseSplit[],
  settlements: SettlementPayment[],
  users: User[]
): RoomFinancialSummary {
  const roomExpenses = expenses.filter((e) => e.roomId === roomId && !e.isDeleted);
  const roomExpenseIds = new Set(roomExpenses.map((e) => e.id));
  const roomSplits = splits.filter((s) => roomExpenseIds.has(s.sharedExpenseId));
  const roomSettlements = settlements.filter((s) => s.roomId === roomId);

  const totalRoomExpenses = round2(roomExpenses.reduce((sum, e) => sum + e.totalAmount, 0));

  // My total spending paid out-of-pocket for the room
  const myTotalPaid = round2(
    roomExpenses.filter((e) => e.paidBy === currentUserId).reduce((sum, e) => sum + e.totalAmount, 0)
  );

  // My assigned share obligations
  const myTotalShare = round2(
    roomSplits.filter((s) => s.userId === currentUserId).reduce((sum, s) => sum + s.shareAmount, 0)
  );

  const pairwiseDebts = calculateRoomPairwiseDebts(roomExpenses, roomSplits, roomSettlements, users);

  // Calculate my personal net balance in this room
  // Positive: room owes me | Negative: I owe room
  let myNetBalance = 0;
  for (const debt of pairwiseDebts) {
    if (debt.userAId === currentUserId) {
      myNetBalance = round2(myNetBalance + debt.netAmount);
    } else if (debt.userBId === currentUserId) {
      myNetBalance = round2(myNetBalance - debt.netAmount);
    }
  }

  return {
    roomId,
    totalRoomExpenses,
    myTotalPaid,
    myTotalShare,
    myNetBalance,
    pairwiseDebts,
  };
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

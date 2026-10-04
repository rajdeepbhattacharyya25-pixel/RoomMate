/**
 * RoomMate Shared Expense Engine V2 — Financial Integration Service
 * Phase 4 Implementation: Canonical Integration Layer
 * 
 * Bridges the canonical V2 ledger engine (integer-paise, min-cash-flow, zero-sum)
 * and PostgreSQL V2 RPCs with the RoomMate application components, dashboards,
 * and export services.
 */

import {
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  User,
  RoomFinancialSummary,
  PairwiseDebt,
} from '../../types';
import {
  Paise,
  ExpenseInputV2,
  SettlementInputV2,
  RoomFinancialSummaryV2,
  MemberNetPositionV2,
  rupeesToPaise,
  paiseToRupees,
  formatPaiseToInr,
  calculateRoomFinancialSummaryV2,
  simplifyDebtsV2,
  validateSettlementAttemptV2,
  canMemberExitRoomV2,
  DbFinancialSummaryV2,
  DbMemberFinancialPositionV2,
  RecordSettlementV2Result,
  FinancialDataState,
  SplitMethodV2,
} from './v2';
import { supabaseService } from '../supabase/supabaseService';

export interface CanonicalRoomSummaryResult extends RoomFinancialSummary {
  v2Summary: RoomFinancialSummaryV2;
  isZeroSumVerified: boolean;
  netDiscrepancyPaise: Paise;
  source: 'POSTGRESQL_V2_AUTHORITATIVE' | 'CLIENT_V2_FALLBACK' | 'OFFLINE_LOCAL';
  financialState?: FinancialDataState;
  isStale?: boolean;
  error?: string | null;
}

/**
 * Converts a legacy SharedExpense and its ExpenseSplits into a canonical V2 ExpenseInput.
 * Automatically reconciles any fractional cent discrepancies in legacy splits
 * to ensure sum(shares) === totalAmountPaise strictly.
 */
export function adaptLegacyExpenseToV2(
  expense: SharedExpense,
  allSplits: ExpenseSplit[]
): ExpenseInputV2 {
  const expenseSplits = allSplits.filter((s) => s.sharedExpenseId === expense.id);
  const totalAmountPaise = rupeesToPaise(expense.totalAmount);

  // Convert splits to integer Paise, sorting deterministically by UUID
  const sortedSplits = [...expenseSplits].sort((a, b) => a.userId.localeCompare(b.userId));
  const shares = sortedSplits.map((s) => ({
    userId: s.userId,
    sharePaise: rupeesToPaise(s.shareAmount),
  }));

  // Reconcile any historical split sum discrepancy
  const allocatedPaise = shares.reduce((acc, s) => acc + s.sharePaise, 0);
  const discrepancy = totalAmountPaise - allocatedPaise;

  if (discrepancy !== 0 && shares.length > 0) {
    // Deterministically absorb discrepancy onto first participant
    shares[0].sharePaise += discrepancy;
  }

  return {
    id: expense.id,
    roomId: expense.roomId,
    paidBy: expense.paidBy,
    totalAmountPaise,
    title: expense.title,
    splitMethod: (expense.splitMethod as SplitMethodV2) || 'EQUAL',
    shares,
    isDeleted: expense.isDeleted,
  };
}

/**
 * Converts a legacy SettlementPayment into a canonical V2 SettlementInput.
 */
export function adaptLegacySettlementToV2(settlement: SettlementPayment): SettlementInputV2 {
  return {
    id: settlement.id,
    roomId: settlement.roomId,
    payerId: settlement.payerId,
    payeeId: settlement.payeeId,
    amountPaise: rupeesToPaise(settlement.amount),
    paymentDate: settlement.paymentDate,
    createdAt: settlement.createdAt,
  };
}

/**
 * Canonical Room Financial Summary Calculator.
 * 
 * Computes exact integer-paise member net positions and applies greedy
 * min-cash-flow debt simplification (O(N) minimal transfers without circular loops).
 * 
 * Formats the output for complete backward-compatibility with existing UI components
 * (RoomLedger, MobileRoomLedger, MobileDashboard, UnifiedDashboard).
 */
export function calculateCanonicalRoomSummary(
  roomId: string,
  currentUserId: string,
  expenses: SharedExpense[],
  splits: ExpenseSplit[],
  settlements: SettlementPayment[],
  users: User[],
  options?: {
    financialState?: FinancialDataState;
    isStale?: boolean;
    error?: string | null;
  }
): CanonicalRoomSummaryResult {
  const roomExpenses = expenses.filter((e) => e.roomId === roomId && !e.isDeleted);
  const roomExpenseIds = new Set(roomExpenses.map((e) => e.id));
  const roomSplits = splits.filter((s) => roomExpenseIds.has(s.sharedExpenseId));
  const roomSettlements = settlements.filter((s) => s.roomId === roomId);

  // Gather all unique member / participant IDs
  const memberIdSet = new Set<string>();
  if (currentUserId) memberIdSet.add(currentUserId);
  users.forEach((u) => memberIdSet.add(u.id));
  roomExpenses.forEach((e) => memberIdSet.add(e.paidBy));
  roomSplits.forEach((s) => memberIdSet.add(s.userId));
  roomSettlements.forEach((s) => {
    memberIdSet.add(s.payerId);
    memberIdSet.add(s.payeeId);
  });
  const memberUserIds = Array.from(memberIdSet);

  // Convert inputs to Canonical V2
  const v2Expenses = roomExpenses.map((e) => adaptLegacyExpenseToV2(e, roomSplits));
  const v2Settlements = roomSettlements.map((s) => adaptLegacySettlementToV2(s));

  // Run Authoritative V2 Engine
  const v2Summary = calculateRoomFinancialSummaryV2(
    roomId,
    memberUserIds,
    v2Expenses,
    v2Settlements
  );

  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));

  // Find current user's position
  const myPosition = v2Summary.members.find((m) => m.userId === currentUserId);
  const myTotalPaid = myPosition ? paiseToRupees(myPosition.totalPaidPaise) : 0;
  const myTotalShare = myPosition ? paiseToRupees(myPosition.totalSharePaise) : 0;
  const myNetBalance = myPosition ? paiseToRupees(myPosition.netPositionPaise) : 0;
  const totalRoomExpenses = paiseToRupees(v2Summary.totalExpensesPaise);

  // Adapt Simplified Transfers into PairwiseDebt format for UI views:
  // In PairwiseDebt:
  // - userAId is Creditor (Receives)
  // - userBId is Debtor (Owes)
  // - netAmount > 0 means "userB owes userA"
  const pairwiseDebts: PairwiseDebt[] = v2Summary.simplifiedTransfers.map((transfer) => {
    const creditorId = transfer.toUserId;
    const debtorId = transfer.fromUserId;
    const amountRupees = paiseToRupees(transfer.amountPaise);

    const creditorUser = userMap.get(creditorId);
    const debtorUser = userMap.get(debtorId);

    return {
      userAId: creditorId,
      userBId: debtorId,
      userAName: creditorUser?.name || 'Roommate',
      userBName: debtorUser?.name || 'Roommate',
      netAmount: amountRupees, // Positive -> Debtor (userB) owes Creditor (userA)
      explanation: {
        aPaidForB: amountRupees,
        bPaidForA: 0,
        settlementsAToB: 0,
        settlementsBToA: 0,
      },
    };
  });

  return {
    roomId,
    totalRoomExpenses,
    myTotalPaid,
    myTotalShare,
    myNetBalance,
    pairwiseDebts,
    v2Summary,
    isZeroSumVerified: v2Summary.isZeroSumVerified,
    netDiscrepancyPaise: v2Summary.netDiscrepancyPaise,
    source: options?.financialState === 'OFFLINE_LOCAL' ? 'OFFLINE_LOCAL' : 'CLIENT_V2_FALLBACK',
    financialState: options?.financialState || 'OFFLINE_LOCAL',
    isStale: options?.isStale,
    error: options?.error,
  };
}

/**
 * Adapts raw JSON returned by PostgreSQL RPC get_room_financial_summary_v2
 * into the CanonicalRoomSummaryResult consumed by the active RoomMate UI.
 * 
 * Ensures that the UI consumes the authoritative database tier directly
 * when connected, with zero local balance recomputation.
 */
export function adaptDbSummaryToCanonicalRoomSummary(
  dbSummary: DbFinancialSummaryV2,
  currentUserId: string,
  users: User[]
): CanonicalRoomSummaryResult {
  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));
  const netMap = new Map<string, MemberNetPositionV2>();

  const dbMembers = Array.isArray(dbSummary.members) ? dbSummary.members : [];
  for (const m of dbMembers) {
    const netPaise = m.net_balance_paise !== undefined
      ? Number(m.net_balance_paise)
      : Math.round(Number(m.net_balance || 0) * 100);

    const pos: MemberNetPositionV2 = {
      userId: m.user_id,
      totalPaidPaise: m.total_paid_paise !== undefined
        ? Number(m.total_paid_paise)
        : Math.round(Number(m.total_paid || 0) * 100),
      totalSharePaise: m.total_share_paise !== undefined
        ? Number(m.total_share_paise)
        : Math.round(Number(m.total_share || 0) * 100),
      settlementsSentPaise: m.settlements_sent_paise !== undefined
        ? Number(m.settlements_sent_paise)
        : Math.round(Number(m.settlements_sent || 0) * 100),
      settlementsReceivedPaise: m.settlements_received_paise !== undefined
        ? Number(m.settlements_received_paise)
        : Math.round(Number(m.settlements_received || 0) * 100),
      grossNetPaise: Math.round(Number(m.gross_net || 0) * 100),
      netPositionPaise: netPaise,
      direction: m.direction || (netPaise > 0 ? 'RECEIVE' : netPaise < 0 ? 'OWES' : 'SETTLED'),
      absoluteAmountPaise: Math.abs(netPaise),
      displayInr: formatPaiseToInr(netPaise),
    };
    netMap.set(m.user_id, pos);
  }

  // Authoritative debt simplification from database net positions
  const simplifiedTransfers = simplifyDebtsV2(netMap);

  const pairwiseDebts: PairwiseDebt[] = simplifiedTransfers.map((transfer) => {
    const creditorId = transfer.toUserId;
    const debtorId = transfer.fromUserId;
    const amountRupees = paiseToRupees(transfer.amountPaise);

    const creditorUser = userMap.get(creditorId);
    const debtorUser = userMap.get(debtorId);

    return {
      userAId: creditorId,
      userBId: debtorId,
      userAName: creditorUser?.name || 'Roommate',
      userBName: debtorUser?.name || 'Roommate',
      netAmount: amountRupees,
      explanation: {
        aPaidForB: amountRupees,
        bPaidForA: 0,
        settlementsAToB: 0,
        settlementsBToA: 0,
      },
    };
  });

  const myMember = dbMembers.find((m: DbMemberFinancialPositionV2) => m.user_id === currentUserId);
  const myTotalPaid = myMember
    ? (myMember.total_paid !== undefined ? Number(myMember.total_paid) : (myMember.total_paid_paise !== undefined ? paiseToRupees(myMember.total_paid_paise) : 0))
    : 0;
  const myTotalShare = myMember
    ? (myMember.total_share !== undefined ? Number(myMember.total_share) : (myMember.total_share_paise !== undefined ? paiseToRupees(myMember.total_share_paise) : 0))
    : 0;
  const myNetBalance = myMember
    ? (myMember.net_balance !== undefined
        ? Number(myMember.net_balance)
        : (myMember.net_balance_paise !== undefined
            ? paiseToRupees(myMember.net_balance_paise)
            : 0))
    : 0;
  const totalRoomExpenses = dbSummary.total_expenses !== undefined
    ? Number(dbSummary.total_expenses)
    : (dbSummary.total_expenses_paise !== undefined
        ? paiseToRupees(dbSummary.total_expenses_paise)
        : 0);

  const v2Summary: RoomFinancialSummaryV2 = {
    roomId: dbSummary.room_id,
    totalExpensesPaise: dbSummary.total_expenses_paise !== undefined
      ? Number(dbSummary.total_expenses_paise)
      : Math.round(totalRoomExpenses * 100),
    totalSettledPaise: dbSummary.total_settled_paise !== undefined
      ? Number(dbSummary.total_settled_paise)
      : Math.round(Number(dbSummary.total_settled || 0) * 100),
    members: Array.from(netMap.values()),
    simplifiedTransfers,
    isZeroSumVerified: Boolean(dbSummary.is_zero_sum_verified),
    netDiscrepancyPaise: Number(dbSummary.net_discrepancy_paise || 0),
    generatedAt: dbSummary.generated_at || new Date().toISOString(),
  };

  return {
    roomId: dbSummary.room_id,
    totalRoomExpenses,
    myTotalPaid,
    myTotalShare,
    myNetBalance,
    pairwiseDebts,
    v2Summary,
    isZeroSumVerified: v2Summary.isZeroSumVerified,
    netDiscrepancyPaise: v2Summary.netDiscrepancyPaise,
    source: 'POSTGRESQL_V2_AUTHORITATIVE',
    financialState: 'ONLINE_AUTHORITATIVE',
  };
}

/**
 * Financial Integration Service API
 */
export const financialIntegrationService = {
  adaptLegacyExpenseToV2,
  adaptLegacySettlementToV2,
  calculateCanonicalRoomSummary,
  adaptDbSummaryToCanonicalRoomSummary,
  validateSettlementAttemptV2,
  canMemberExitRoomV2,

  /**
   * Fetches authoritative V2 financial summary from PostgreSQL database.
   */
  async fetchRoomFinancialSummaryV2(roomId: string): Promise<DbFinancialSummaryV2 | null> {
    return supabaseService.getRoomFinancialSummaryV2(roomId);
  },

  /**
   * Executes atomic settlement recording via PostgreSQL V2 RPC with row-locking.
   */
  async recordRoomSettlementV2(
    roomId: string,
    payerId: string,
    payeeId: string,
    amount: number
  ): Promise<RecordSettlementV2Result> {
    return supabaseService.recordRoomSettlementV2(roomId, payerId, payeeId, amount);
  },
};

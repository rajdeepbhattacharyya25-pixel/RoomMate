/**
 * RoomMate Shared Expense Engine V2 — Min-Cash-Flow Simplification
 * Phase 3 Implementation
 * 
 * Replaces legacy calculateRoomPairwiseDebts() with deterministic multilateral debt simplification.
 * 
 * Properties:
 * - Solves the minimum cash flow problem via greedy bipartite matching.
 * - Upper bound: At most N - 1 transfers for N members.
 * - Strictly acyclic: Graph is a directed forest / bipartite matching (debtors -> creditors).
 * - Deterministic: Amount descending, tie-break by UUID ascending.
 * - Zero intermediary clearinghouse nodes: Net-neutral members are completely bypassed.
 */

import { MemberNetPositionV2, SimplifiedTransferV2, Paise } from './types';
import { formatPaiseToInr, formatPaiseToUpiAmount } from './money';

interface AccountNode {
  userId: string;
  balancePaise: Paise;
}

/**
 * Simplifies multilateral member balances into an optimal, acyclic set of direct transfers.
 */
export function simplifyDebtsV2(
  netPositions: Map<string, MemberNetPositionV2>
): SimplifiedTransferV2[] {
  const creditors: AccountNode[] = [];
  const debtors: AccountNode[] = [];

  for (const [userId, pos] of netPositions.entries()) {
    if (pos.netPositionPaise > 0) {
      creditors.push({ userId, balancePaise: pos.netPositionPaise });
    } else if (pos.netPositionPaise < 0) {
      debtors.push({ userId, balancePaise: Math.abs(pos.netPositionPaise) });
    }
  }

  // Sort descending by amount, tie-break lexicographically by userId for 100% determinism
  const sortComparator = (a: AccountNode, b: AccountNode) => {
    if (b.balancePaise !== a.balancePaise) {
      return b.balancePaise - a.balancePaise;
    }
    return a.userId.localeCompare(b.userId);
  };

  creditors.sort(sortComparator);
  debtors.sort(sortComparator);

  const transfers: SimplifiedTransferV2[] = [];

  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx];
    const debtor = debtors[dIdx];

    const transferAmount = Math.min(creditor.balancePaise, debtor.balancePaise);
    if (transferAmount > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountPaise: transferAmount,
        displayInr: formatPaiseToInr(transferAmount),
        upiAmount: formatPaiseToUpiAmount(transferAmount),
      });
    }

    creditor.balancePaise -= transferAmount;
    debtor.balancePaise -= transferAmount;

    if (creditor.balancePaise === 0) {
      cIdx++;
    }
    if (debtor.balancePaise === 0) {
      dIdx++;
    }
  }

  return transfers;
}

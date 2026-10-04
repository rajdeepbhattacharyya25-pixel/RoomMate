import { describe, it, expect } from 'vitest';
import { simplifyDebts, calculateMemberNetPositions } from './referenceEngine';
import { NetPosition, Expense } from './types';

function createMockNetPositions(balances: Record<string, number>): Map<string, NetPosition> {
  const map = new Map<string, NetPosition>();
  for (const [userId, netPositionPaise] of Object.entries(balances)) {
    let direction: 'RECEIVE' | 'OWES' | 'SETTLED' = 'SETTLED';
    if (netPositionPaise > 0) direction = 'RECEIVE';
    else if (netPositionPaise < 0) direction = 'OWES';

    map.set(userId, {
      userId,
      totalPaidPaise: netPositionPaise > 0 ? netPositionPaise : 0,
      totalSharePaise: netPositionPaise < 0 ? Math.abs(netPositionPaise) : 0,
      settlementsSentPaise: 0,
      settlementsReceivedPaise: 0,
      netPositionPaise,
      direction,
      absoluteAmountPaise: Math.abs(netPositionPaise),
    });
  }
  return map;
}

function verifyTransferInvariants(
  netMap: Map<string, NetPosition>,
  transfers: { fromUserId: string; toUserId: string; amountPaise: number }[]
) {
  const originalDebtors = new Set(
    [...netMap.values()].filter((p) => p.netPositionPaise < 0).map((p) => p.userId)
  );
  const originalCreditors = new Set(
    [...netMap.values()].filter((p) => p.netPositionPaise > 0).map((p) => p.userId)
  );

  const debtorSent = new Map<string, number>();
  const creditorReceived = new Map<string, number>();

  for (const t of transfers) {
    // 1. Every transfer is debtor -> creditor
    expect(originalDebtors.has(t.fromUserId)).toBe(true);
    expect(originalCreditors.has(t.toUserId)).toBe(true);

    // 2. No self-payment
    expect(t.fromUserId).not.toBe(t.toUserId);

    // 3. Positive amount
    expect(t.amountPaise).toBeGreaterThan(0);

    debtorSent.set(t.fromUserId, (debtorSent.get(t.fromUserId) || 0) + t.amountPaise);
    creditorReceived.set(t.toUserId, (creditorReceived.get(t.toUserId) || 0) + t.amountPaise);
  }

  // 4. Total transferred from each debtor equals exactly their debt
  for (const [userId, pos] of netMap.entries()) {
    if (pos.netPositionPaise < 0) {
      expect(debtorSent.get(userId) || 0).toBe(Math.abs(pos.netPositionPaise));
    }
  }

  // 5. Total received by each creditor equals exactly their credit
  for (const [userId, pos] of netMap.entries()) {
    if (pos.netPositionPaise > 0) {
      expect(creditorReceived.get(userId) || 0).toBe(pos.netPositionPaise);
    }
  }

  // 6. No cycles: directed graph must have zero cycles (it is bipartite debtor -> creditor)
  const fromSet = new Set(transfers.map((t) => t.fromUserId));
  const toSet = new Set(transfers.map((t) => t.toUserId));
  const commonNodes = [...fromSet].filter((x) => toSet.has(x));
  expect(commonNodes).toHaveLength(0); // Bipartite property guarantees topological DAG
}

describe('Part 13 — Min-Cash-Flow Tests', () => {
  it('CASE A: 1 debtor, 1 creditor -> 1 transfer', () => {
    // D1 owes C1 ₹100
    const netMap = createMockNetPositions({
      d1: -10000,
      c1: 10000,
    });
    const transfers = simplifyDebts(netMap);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toEqual({ fromUserId: 'd1', toUserId: 'c1', amountPaise: 10000 });
    verifyTransferInvariants(netMap, transfers);
  });

  it('CASE B: 2 debtors, 1 creditor -> <= 2 transfers', () => {
    // D1 owes ₹40, D2 owes ₹60, C1 owed ₹100
    const netMap = createMockNetPositions({
      d1: -4000,
      d2: -6000,
      c1: 10000,
    });
    const transfers = simplifyDebts(netMap);
    expect(transfers.length).toBeLessThanOrEqual(2);
    verifyTransferInvariants(netMap, transfers);
  });

  it('CASE C: 1 debtor, 2 creditors -> <= 2 transfers', () => {
    // D1 owes ₹100, C1 owed ₹70, C2 owed ₹30
    const netMap = createMockNetPositions({
      d1: -10000,
      c1: 7000,
      c2: 3000,
    });
    const transfers = simplifyDebts(netMap);
    expect(transfers.length).toBeLessThanOrEqual(2);
    verifyTransferInvariants(netMap, transfers);
  });

  it('CASE D: 2 debtors, 2 creditors -> <= 3 transfers', () => {
    // D1 owes ₹50, D2 owes ₹50, C1 owed ₹60, C2 owed ₹40
    const netMap = createMockNetPositions({
      d1: -5000,
      d2: -5000,
      c1: 6000,
      c2: 4000,
    });
    const transfers = simplifyDebts(netMap);
    expect(transfers.length).toBeLessThanOrEqual(3);
    verifyTransferInvariants(netMap, transfers);
  });

  it('CASE E: 3 debtors, 3 creditors -> <= 5 transfers', () => {
    // D1: -100, D2: -200, D3: -300 | C1: +150, C2: +250, C3: +200 (Total = 600)
    const netMap = createMockNetPositions({
      d1: -10000,
      d2: -20000,
      d3: -30000,
      c1: 15000,
      c2: 25000,
      c3: 20000,
    });
    const transfers = simplifyDebts(netMap);
    expect(transfers.length).toBeLessThanOrEqual(5);
    verifyTransferInvariants(netMap, transfers);
  });
});

describe('Part 14 — Prove No Circular Debt & Elimination of Intermediaries', () => {
  it('eliminates symmetric 3-way circular debt completely (A->B, B->C, C->A)', () => {
    // Expense 1: A pays ₹100 for B
    // Expense 2: B pays ₹100 for C
    // Expense 3: C pays ₹100 for A
    // In legacy bilateral engine, this created A owes C, C owes B, B owes A.
    // In V2 Net Ledger:
    // A: paid 100, share 100 -> net = 0
    // B: paid 100, share 100 -> net = 0
    // C: paid 100, share 100 -> net = 0
    const expenses: Expense[] = [
      {
        id: 'e1',
        roomId: 'r-cycle',
        paidBy: 'user-a',
        totalAmountPaise: 10000,
        title: 'Exp 1',
        splitMethod: 'EXACT',
        shares: [{ userId: 'user-b', sharePaise: 10000 }],
      },
      {
        id: 'e2',
        roomId: 'r-cycle',
        paidBy: 'user-b',
        totalAmountPaise: 10000,
        title: 'Exp 2',
        splitMethod: 'EXACT',
        shares: [{ userId: 'user-c', sharePaise: 10000 }],
      },
      {
        id: 'e3',
        roomId: 'r-cycle',
        paidBy: 'user-c',
        totalAmountPaise: 10000,
        title: 'Exp 3',
        splitMethod: 'EXACT',
        shares: [{ userId: 'user-a', sharePaise: 10000 }],
      },
    ];

    const netMap = calculateMemberNetPositions(['user-a', 'user-b', 'user-c'], expenses, []);
    expect(netMap.get('user-a')!.netPositionPaise).toBe(0);
    expect(netMap.get('user-b')!.netPositionPaise).toBe(0);
    expect(netMap.get('user-c')!.netPositionPaise).toBe(0);

    const transfers = simplifyDebts(netMap);
    // ZERO transfers required! Completely settled!
    expect(transfers).toHaveLength(0);
  });

  it('eliminates net-neutral intermediary B (A owes B, B owes C -> Direct A pays C)', () => {
    // Expense 1: B pays ₹100 for A (A owes B ₹100)
    // Expense 2: C pays ₹100 for B (B owes C ₹100)
    // Net:
    // A: paid 0, share 100 -> net -100 (debtor)
    // B: paid 100, share 100 -> net 0 (neutral!)
    // C: paid 100, share 0 -> net +100 (creditor)
    const expenses: Expense[] = [
      {
        id: 'e1',
        roomId: 'r-inter',
        paidBy: 'user-b',
        totalAmountPaise: 10000,
        title: 'B paid for A',
        splitMethod: 'EXACT',
        shares: [{ userId: 'user-a', sharePaise: 10000 }],
      },
      {
        id: 'e2',
        roomId: 'r-inter',
        paidBy: 'user-c',
        totalAmountPaise: 10000,
        title: 'C paid for B',
        splitMethod: 'EXACT',
        shares: [{ userId: 'user-b', sharePaise: 10000 }],
      },
    ];

    const netMap = calculateMemberNetPositions(['user-a', 'user-b', 'user-c'], expenses, []);
    expect(netMap.get('user-a')!.netPositionPaise).toBe(-10000);
    expect(netMap.get('user-b')!.netPositionPaise).toBe(0); // Neutral!
    expect(netMap.get('user-c')!.netPositionPaise).toBe(10000);

    const transfers = simplifyDebts(netMap);
    // Exactly 1 transfer: user-a pays user-c directly! user-b is eliminated!
    expect(transfers).toEqual([
      { fromUserId: 'user-a', toUserId: 'user-c', amountPaise: 10000 },
    ]);
  });
});

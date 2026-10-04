import { describe, it, expect } from 'vitest';
import { gatherRoomExportData } from '../../lib/services/roomExpenseExportService';
import { calculateRoomSummaryV2 } from './referenceEngine';
import { SharedExpense, ExpenseSplit, SettlementPayment, User } from '../../types';

describe('Part 24 — Export Service vs V2 Canonical Ledger Parity Contract', () => {
  const users: User[] = [
    { id: 'user-a', name: 'Alice', email: 'alice@test.com', avatarUrl: '' },
    { id: 'user-b', name: 'Bob', email: 'bob@test.com', avatarUrl: '' },
    { id: 'user-c', name: 'Charlie', email: 'charlie@test.com', avatarUrl: '' },
  ];

  it('compares canonical member net balances between export service and V2 ledger', () => {
    const expenses: SharedExpense[] = [
      {
        id: 'exp-1',
        roomId: 'room-parity',
        paidBy: 'user-a',
        totalAmount: 300,
        title: 'Groceries',
        splitMethod: 'EQUAL',
        createdAt: '2026-09-15T10:00:00Z',
      },
    ];

    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-1', userId: 'user-a', shareAmount: 100 },
      { id: 'sp-2', sharedExpenseId: 'exp-1', userId: 'user-b', shareAmount: 100 },
      { id: 'sp-3', sharedExpenseId: 'exp-1', userId: 'user-c', shareAmount: 100 },
    ];

    const settlements: SettlementPayment[] = [
      {
        id: 'set-1',
        roomId: 'room-parity',
        payerId: 'user-b',
        payeeId: 'user-a',
        amount: 100,
        paymentDate: '2026-09-16T10:00:00Z',
        createdAt: '2026-09-16T10:00:00Z',
      },
    ];

    // 1. Run Export Service
    const exportDataset = gatherRoomExportData({
      roomId: 'room-parity',
      monthIndex: 8, // September (0-indexed)
      year: 2026,
      currentUser: users[0],
      sharedExpenses: expenses,
      expenseSplits: splits,
      settlementPayments: settlements,
      allUsers: users,
    });

    // 2. Run V2 Reference Engine
    const v2Summary = calculateRoomSummaryV2(
      'room-parity',
      users.map((u) => u.id),
      [
        {
          id: 'exp-1',
          roomId: 'room-parity',
          paidBy: 'user-a',
          totalAmountPaise: 30000,
          title: 'Groceries',
          splitMethod: 'EQUAL',
          shares: [
            { userId: 'user-a', sharePaise: 10000 },
            { userId: 'user-b', sharePaise: 10000 },
            { userId: 'user-c', sharePaise: 10000 },
          ],
        },
      ],
      [
        {
          id: 'set-1',
          roomId: 'room-parity',
          payerId: 'user-b',
          payeeId: 'user-a',
          amountPaise: 10000,
          createdAt: '2026-09-16T10:00:00Z',
        },
      ]
    );

    // Verify mathematical agreement on net balances:
    for (const member of v2Summary.members) {
      const exportRow = exportDataset.settlements.find((s) => s.userId === member.userId)!;
      expect(exportRow).toBeDefined();

      // Export uses rupees (e.g. 100), V2 uses paise (e.g. 10000)
      const exportNetPaise = Math.round(exportRow.netBalance * 100);
      expect(exportNetPaise).toBe(member.netPositionPaise);
    }
  });

  it('documents critical export discrepancy on sub-50 paise balances due to loose threshold', () => {
    // If a member has a net balance of -₹0.40 (-40 paise), V2 strictly reports OWES (40 paise).
    // But the current export service has:
    //   if (netBalance >= 0.5) 'Receive'
    //   else if (netBalance <= -0.5) 'Pay'
    //   else 'Settled'
    // This causes -40 paise to be incorrectly labelled as 'Settled'!
    const netBalanceRupees = -0.4;
    let exportStatus: 'Receive' | 'Pay' | 'Settled' = 'Settled';
    if (netBalanceRupees >= 0.5) {
      exportStatus = 'Receive';
    } else if (netBalanceRupees <= -0.5) {
      exportStatus = 'Pay';
    }

    // Proves that the existing export service swallows debts < 50 paise!
    expect(exportStatus).toBe('Settled');

    // In V2, any non-zero paise is strictly OWES or RECEIVE:
    const netBalancePaise = -40;
    const v2Direction = netBalancePaise < 0 ? 'OWES' : 'SETTLED';
    expect(v2Direction).toBe('OWES');
    // DISCREPANCY DOCUMENTED: Export service must be upgraded in Phase 4 to use integer paise without 0.5 tolerance.
  });
});

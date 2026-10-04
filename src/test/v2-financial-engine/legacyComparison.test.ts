import { describe, it, expect } from 'vitest';
import {
  calculateSplits as legacyCalculateSplits,
  calculateRoomPairwiseDebts as legacyCalculateRoomPairwiseDebts,
} from '../../lib/ledger/engine';
import {
  calculateEqualSplits,
  calculateRoomSummaryV2,
} from './referenceEngine';
import { SharedExpense, ExpenseSplit, User } from '../../types';

describe('Part 19 — Legacy Engine vs V2 Reference Model Comparison', () => {
  it('Scenario 1: ₹200 / 3 equal split comparison', () => {
    const participants = ['user-uuid-c', 'user-uuid-a', 'user-uuid-b'];

    // Legacy calculation (uses array order as provided without UUID sorting)
    const legacySplits = legacyCalculateSplits(200, participants, 'EQUAL');
    // V2 calculation (deterministic, UUID-sorted)
    const v2Splits = calculateEqualSplits(20000, participants);

    // Legacy distributes 66.67 to participants[0] ('user-uuid-c') and participants[1] ('user-uuid-a')
    // and 66.66 to participants[2] ('user-uuid-b') based on input array ordering!
    expect(legacySplits).toEqual([
      { userId: 'user-uuid-c', shareAmount: 66.67 },
      { userId: 'user-uuid-a', shareAmount: 66.67 },
      { userId: 'user-uuid-b', shareAmount: 66.66 },
    ]);

    // V2 strictly sorts by UUID first, so user-uuid-a and user-uuid-b get 6667, user-uuid-c gets 6666
    expect(v2Splits).toEqual([
      { userId: 'user-uuid-a', sharePaise: 6667 },
      { userId: 'user-uuid-b', sharePaise: 6667 },
      { userId: 'user-uuid-c', sharePaise: 6666 },
    ]);

    // DIFFERENCE 1 DOCUMENTED:
    // Legacy is sensitive to participant array ordering; V2 is canonical and UUID-order invariant.
  });

  it('Scenario 2: ₹500 / 3 equal split comparison', () => {
    const participants = ['u1', 'u2', 'u3'];
    const legacySplits = legacyCalculateSplits(500, participants, 'EQUAL');
    const v2Splits = calculateEqualSplits(50000, participants);

    // Both sum to total (500 and 50000 paise)
    expect(legacySplits.reduce((s, x) => s + x.shareAmount, 0)).toBe(500);
    expect(v2Splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(50000);

    // DIFFERENCE 2 DOCUMENTED:
    // Legacy represents values as floating-point numbers (166.67), risking precision bugs downstream,
    // whereas V2 represents all values as exact integer Paise (16667).
  });

  it('Scenario 3: ₹700 canonical scenario (Jyotirmay, Raju, Lopamudra)', () => {
    const users: User[] = [
      { id: 'u-jyotirmay', name: 'Jyotirmay', email: 'j@test.com', avatarUrl: '' },
      { id: 'u-raju', name: 'Raju', email: 'r@test.com', avatarUrl: '' },
      { id: 'u-lopamudra', name: 'Lopamudra', email: 'l@test.com', avatarUrl: '' },
    ];
    const memberIds = users.map((u) => u.id);

    // 1. Legacy inputs
    const legacyExpenses: SharedExpense[] = [
      {
        id: 'e-wifi',
        roomId: 'room-700',
        paidBy: 'u-jyotirmay',
        totalAmount: 500,
        title: 'Wi-Fi',
        splitMethod: 'EQUAL',
        createdAt: '2026-10-04T10:00:00Z',
      },
      {
        id: 'e-water',
        roomId: 'room-700',
        paidBy: 'u-raju',
        totalAmount: 200,
        title: 'Water',
        splitMethod: 'EQUAL',
        createdAt: '2026-10-04T10:05:00Z',
      },
    ];

    const legacySplits: ExpenseSplit[] = [
      // Wi-Fi 500 / 3 = 166.67, 166.67, 166.66
      { id: 's1', sharedExpenseId: 'e-wifi', userId: 'u-jyotirmay', shareAmount: 166.67 },
      { id: 's2', sharedExpenseId: 'e-wifi', userId: 'u-raju', shareAmount: 166.67 },
      { id: 's3', sharedExpenseId: 'e-wifi', userId: 'u-lopamudra', shareAmount: 166.66 },
      // Water 200 / 3 = 66.67, 66.67, 66.66
      { id: 's4', sharedExpenseId: 'e-water', userId: 'u-jyotirmay', shareAmount: 66.67 },
      { id: 's5', sharedExpenseId: 'e-water', userId: 'u-raju', shareAmount: 66.67 },
      { id: 's6', sharedExpenseId: 'e-water', userId: 'u-lopamudra', shareAmount: 66.66 },
    ];

    const legacyPairwise = legacyCalculateRoomPairwiseDebts(legacyExpenses, legacySplits, [], users);

    // Legacy outputs pairwise edges:
    // Pairwise between (Jyotirmay, Raju)
    // Pairwise between (Jyotirmay, Lopamudra)
    // Pairwise between (Raju, Lopamudra) -> Lopamudra owes Raju ₹66.66!
    const rajuLopamudraPair = legacyPairwise.find(
      (p) =>
        (p.userAId === 'u-raju' && p.userBId === 'u-lopamudra') ||
        (p.userAId === 'u-lopamudra' && p.userBId === 'u-raju')
    );
    expect(rajuLopamudraPair).toBeDefined();
    // In legacy, Lopamudra owes Raju ₹66.66 even though Raju is an overall NET DEBTOR to the room!
    expect(Math.abs(rajuLopamudraPair!.netAmount)).toBe(66.66);

    // 2. V2 Reference Calculation
    const v2Summary = calculateRoomSummaryV2(
      'room-700',
      memberIds,
      [
        {
          id: 'e-wifi',
          roomId: 'room-700',
          paidBy: 'u-jyotirmay',
          totalAmountPaise: 50000,
          title: 'Wi-Fi',
          splitMethod: 'EQUAL',
          shares: [
            { userId: 'u-jyotirmay', sharePaise: 16667 },
            { userId: 'u-lopamudra', sharePaise: 16667 },
            { userId: 'u-raju', sharePaise: 16666 },
          ],
        },
        {
          id: 'e-water',
          roomId: 'room-700',
          paidBy: 'u-raju',
          totalAmountPaise: 20000,
          title: 'Water',
          splitMethod: 'EQUAL',
          shares: [
            { userId: 'u-jyotirmay', sharePaise: 6667 },
            { userId: 'u-lopamudra', sharePaise: 6667 },
            { userId: 'u-raju', sharePaise: 6666 },
          ],
        },
      ],
      []
    );

    // In V2, Raju is identified as an overall net debtor (paid 200, share 233.32 -> owes 33.32)
    const v2Raju = v2Summary.members.find((m) => m.userId === 'u-raju')!;
    expect(v2Raju.netPositionPaise).toBeLessThan(0);
    expect(v2Raju.direction).toBe('OWES');

    // In V2, Lopamudra NEVER pays Raju! Both Lopamudra and Raju pay Jyotirmay directly!
    for (const t of v2Summary.simplifiedTransfers) {
      expect(t.toUserId).toBe('u-jyotirmay');
      expect(t.fromUserId).not.toBe('u-jyotirmay');
    }

    // CRITICAL ARCHITECTURAL DIFFERENCE:
    // Legacy forces Lopamudra to pay Raju ₹66.66 and Raju to pay Jyotirmay ₹100.
    // V2 eliminates the intermediate transaction: Raju pays Jyotirmay ₹33.32, Lopamudra pays Jyotirmay ₹233.34.
  });

  it('Scenario 4: Circular debt cycle scenario (A -> B, B -> C, C -> A)', () => {
    const users: User[] = [
      { id: 'user-a', name: 'Alice', email: 'a@test.com', avatarUrl: '' },
      { id: 'user-b', name: 'Bob', email: 'b@test.com', avatarUrl: '' },
      { id: 'user-c', name: 'Charlie', email: 'c@test.com', avatarUrl: '' },
    ];

    const legacyExpenses: SharedExpense[] = [
      { id: 'e1', roomId: 'r1', paidBy: 'user-a', totalAmount: 100, title: 'Exp 1', splitMethod: 'EXACT', createdAt: '2026-10-04T10:00:00Z' },
      { id: 'e2', roomId: 'r1', paidBy: 'user-b', totalAmount: 100, title: 'Exp 2', splitMethod: 'EXACT', createdAt: '2026-10-04T10:01:00Z' },
      { id: 'e3', roomId: 'r1', paidBy: 'user-c', totalAmount: 100, title: 'Exp 3', splitMethod: 'EXACT', createdAt: '2026-10-04T10:02:00Z' },
    ];

    const legacySplits: ExpenseSplit[] = [
      { id: 's1', sharedExpenseId: 'e1', userId: 'user-b', shareAmount: 100 },
      { id: 's2', sharedExpenseId: 'e2', userId: 'user-c', shareAmount: 100 },
      { id: 's3', sharedExpenseId: 'e3', userId: 'user-a', shareAmount: 100 },
    ];

    // Legacy pairwise calculation
    const legacyDebts = legacyCalculateRoomPairwiseDebts(legacyExpenses, legacySplits, [], users);

    // CRITICAL FLAW IN LEGACY:
    // Legacy produces 3 separate circular debts:
    // A-B debt: 100
    // B-C debt: 100
    // A-C debt: 100
    expect(legacyDebts).toHaveLength(3);

    // V2 calculation
    const v2Summary = calculateRoomSummaryV2(
      'r1',
      ['user-a', 'user-b', 'user-c'],
      [
        { id: 'e1', roomId: 'r1', paidBy: 'user-a', totalAmountPaise: 10000, title: 'Exp 1', splitMethod: 'EXACT', shares: [{ userId: 'user-b', sharePaise: 10000 }] },
        { id: 'e2', roomId: 'r1', paidBy: 'user-b', totalAmountPaise: 10000, title: 'Exp 2', splitMethod: 'EXACT', shares: [{ userId: 'user-c', sharePaise: 10000 }] },
        { id: 'e3', roomId: 'r1', paidBy: 'user-c', totalAmountPaise: 10000, title: 'Exp 3', splitMethod: 'EXACT', shares: [{ userId: 'user-a', sharePaise: 10000 }] },
      ],
      []
    );

    // V2 correctly identifies all members are net-zero (0 paise outstanding)
    for (const m of v2Summary.members) {
      expect(m.netPositionPaise).toBe(0);
      expect(m.direction).toBe('SETTLED');
    }
    // V2 produces ZERO transfers: 0 cycles!
    expect(v2Summary.simplifiedTransfers).toHaveLength(0);
  });
});

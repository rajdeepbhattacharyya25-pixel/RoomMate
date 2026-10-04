import { describe, it, expect } from 'vitest';
import { financialIntegrationService } from '../../lib/ledger/financialIntegrationService';
import {
  calculateRoomSummary,
  getOutstandingObligationsForMember,
  canCleanExit,
} from '../../lib/ledger/engine';
import { gatherRoomExportData } from '../../lib/services/roomExpenseExportService';
import { SharedExpense, ExpenseSplit, SettlementPayment, User } from '../../types';

describe('Phase 4 — Canonical Financial Backend Integration & Cutover Suite', () => {
  const users: User[] = [
    { id: 'u-jyotirmay', name: 'Jyotirmay', email: 'j@test.com', avatarUrl: '' },
    { id: 'u-raju', name: 'Raju', email: 'r@test.com', avatarUrl: '' },
    { id: 'u-lopamudra', name: 'Lopamudra', email: 'l@test.com', avatarUrl: '' },
  ];

  describe('1. Canonical ₹700 Scenario Integration & UI Contract Parity', () => {
    // Wi-Fi: 500 paid by Jyotirmay, Water: 200 paid by Raju, 3 equal shares
    const expenses: SharedExpense[] = [
      {
        id: 'exp-wifi',
        roomId: 'room-700',
        paidBy: 'u-jyotirmay',
        totalAmount: 500,
        title: 'Wi-Fi',
        splitMethod: 'EQUAL',
        createdAt: '2026-10-04T10:00:00Z',
      },
      {
        id: 'exp-water',
        roomId: 'room-700',
        paidBy: 'u-raju',
        totalAmount: 200,
        title: 'Water',
        splitMethod: 'EQUAL',
        createdAt: '2026-10-04T10:05:00Z',
      },
    ];

    const splits: ExpenseSplit[] = [
      // Wi-Fi (500: 166.67, 166.67, 166.66)
      { id: 's1', sharedExpenseId: 'exp-wifi', userId: 'u-jyotirmay', shareAmount: 166.67 },
      { id: 's2', sharedExpenseId: 'exp-wifi', userId: 'u-raju', shareAmount: 166.67 },
      { id: 's3', sharedExpenseId: 'exp-wifi', userId: 'u-lopamudra', shareAmount: 166.66 },
      // Water (200: 66.67, 66.67, 66.66)
      { id: 's4', sharedExpenseId: 'exp-water', userId: 'u-jyotirmay', shareAmount: 66.67 },
      { id: 's5', sharedExpenseId: 'exp-water', userId: 'u-raju', shareAmount: 66.67 },
      { id: 's6', sharedExpenseId: 'exp-water', userId: 'u-lopamudra', shareAmount: 66.66 },
    ];

    it('calculates canonical summary with zero-sum invariant and zero circular debts', () => {
      const summaryJyotirmay = calculateRoomSummary(
        'room-700',
        'u-jyotirmay',
        expenses,
        splits,
        [],
        users
      );

      // Verify room totals
      expect(summaryJyotirmay.totalRoomExpenses).toBe(700);
      expect(summaryJyotirmay.myTotalPaid).toBe(500);
      expect(summaryJyotirmay.myTotalShare).toBe(233.34);
      // Jyotirmay net balance: +₹266.66 (Creditor)
      expect(summaryJyotirmay.myNetBalance).toBe(266.66);

      // Verify Raju's perspective
      const summaryRaju = calculateRoomSummary(
        'room-700',
        'u-raju',
        expenses,
        splits,
        [],
        users
      );
      expect(summaryRaju.myTotalPaid).toBe(200);
      expect(summaryRaju.myTotalShare).toBe(233.34);
      // Raju is an overall net debtor (-₹33.34 / -₹33.32 depending on exact cent split)
      expect(summaryRaju.myNetBalance).toBeLessThan(0);

      // Verify Lopamudra's perspective
      const summaryLopa = calculateRoomSummary(
        'room-700',
        'u-lopamudra',
        expenses,
        splits,
        [],
        users
      );
      expect(summaryLopa.myTotalPaid).toBe(0);
      expect(summaryLopa.myTotalShare).toBe(233.32);
      expect(summaryLopa.myNetBalance).toBe(-233.32);

      // CRITICAL CANONICAL INVARIANT:
      // Simplified debts MUST NOT contain Lopamudra paying Raju!
      // In pairwiseDebts:
      // userAId = Creditor (toUserId), userBId = Debtor (fromUserId), netAmount > 0
      for (const debt of summaryJyotirmay.pairwiseDebts) {
        expect(debt.userAId).toBe('u-jyotirmay'); // Jyotirmay is the only creditor
        expect(debt.userBId).not.toBe('u-jyotirmay');
        expect(debt.netAmount).toBeGreaterThan(0);
      }

      // Lopamudra pays Jyotirmay, Raju pays Jyotirmay.
      // There are exactly 2 simplified transfers (M = N - 1 = 3 - 1 = 2)
      expect(summaryJyotirmay.pairwiseDebts.length).toBe(2);
    });

    it('seamlessly integrates with getOutstandingObligationsForMember and canCleanExit', () => {
      const summary = calculateRoomSummary(
        'room-700',
        'u-raju',
        expenses,
        splits,
        [],
        users
      );

      const rajuObligations = getOutstandingObligationsForMember('u-raju', summary.pairwiseDebts);
      expect(rajuObligations.hasUnresolvedObligations).toBe(true);
      expect(rajuObligations.debtsOwed.length).toBe(1);
      expect(rajuObligations.debtsOwed[0].toUserId).toBe('u-jyotirmay');
      expect(rajuObligations.creditsOwed.length).toBe(0);
      expect(canCleanExit(rajuObligations)).toBe(false);

      // After settling debt to Jyotirmay:
      const settlement: SettlementPayment = {
        id: 'settle-raju-jyo',
        roomId: 'room-700',
        payerId: 'u-raju',
        payeeId: 'u-jyotirmay',
        amount: rajuObligations.totalOwed,
        paymentMethod: 'UPI',
        paymentDate: '2026-10-04',
        createdAt: '2026-10-04T12:00:00Z',
      };

      const postSettlementSummary = calculateRoomSummary(
        'room-700',
        'u-raju',
        expenses,
        splits,
        [settlement],
        users
      );
      const postObligations = getOutstandingObligationsForMember('u-raju', postSettlementSummary.pairwiseDebts);
      expect(postObligations.hasUnresolvedObligations).toBe(false);
      expect(canCleanExit(postObligations)).toBe(true);
    });
  });

  describe('2. Circular Debt Loop Elimination', () => {
    it('completely dissolves circular debt cycles (A -> B, B -> C, C -> A)', () => {
      const ringUsers: User[] = [
        { id: 'user-a', name: 'Alice', email: 'a@test.com', avatarUrl: '' },
        { id: 'user-b', name: 'Bob', email: 'b@test.com', avatarUrl: '' },
        { id: 'user-c', name: 'Charlie', email: 'c@test.com', avatarUrl: '' },
      ];

      const ringExpenses: SharedExpense[] = [
        { id: 'e1', roomId: 'r-ring', paidBy: 'user-a', totalAmount: 100, title: 'E1', splitMethod: 'EXACT', createdAt: '2026-10-04T10:00:00Z' },
        { id: 'e2', roomId: 'r-ring', paidBy: 'user-b', totalAmount: 100, title: 'E2', splitMethod: 'EXACT', createdAt: '2026-10-04T10:01:00Z' },
        { id: 'e3', roomId: 'r-ring', paidBy: 'user-c', totalAmount: 100, title: 'E3', splitMethod: 'EXACT', createdAt: '2026-10-04T10:02:00Z' },
      ];

      const ringSplits: ExpenseSplit[] = [
        { id: 's1', sharedExpenseId: 'e1', userId: 'user-b', shareAmount: 100 },
        { id: 's2', sharedExpenseId: 'e2', userId: 'user-c', shareAmount: 100 },
        { id: 's3', sharedExpenseId: 'e3', userId: 'user-a', shareAmount: 100 },
      ];

      const summary = calculateRoomSummary('r-ring', 'user-a', ringExpenses, ringSplits, [], ringUsers);

      // In V2, net positions are all 0:
      expect(summary.myNetBalance).toBe(0);
      // Zero pairwise debt transfers needed!
      expect(summary.pairwiseDebts.length).toBe(0);

      const obligationsA = getOutstandingObligationsForMember('user-a', summary.pairwiseDebts);
      expect(canCleanExit(obligationsA)).toBe(true);
    });
  });

  describe('3. Export Service Sub-50 Paise Precision Parity', () => {
    it('verifies that sub-50 paise balances are correctly classified as Pay and Receive without swallowing', () => {
      const exp: SharedExpense = {
        id: 'exp-cents',
        roomId: 'room-cents',
        paidBy: 'u-jyotirmay',
        totalAmount: 1.00,
        title: 'Penny Candy',
        splitMethod: 'EQUAL',
        createdAt: '2026-10-01T10:00:00Z',
      };

      // 3-way split of ₹1.00: 0.34, 0.33, 0.33
      const sp: ExpenseSplit[] = [
        { id: 'sp-1', sharedExpenseId: 'exp-cents', userId: 'u-jyotirmay', shareAmount: 0.34 },
        { id: 'sp-2', sharedExpenseId: 'exp-cents', userId: 'u-raju', shareAmount: 0.33 },
        { id: 'sp-3', sharedExpenseId: 'exp-cents', userId: 'u-lopamudra', shareAmount: 0.33 },
      ];

      const exportData = gatherRoomExportData({
        roomId: 'room-cents',
        monthIndex: 9, // October (0-indexed)
        year: 2026,
        currentUser: users[0],
        sharedExpenses: [exp],
        expenseSplits: sp,
        settlementPayments: [],
        allUsers: users,
      });

      const rajuExport = exportData.settlements.find((s) => s.userId === 'u-raju')!;
      expect(rajuExport).toBeDefined();
      expect(rajuExport.netBalance).toBe(-0.33);
      // Under V2 exact integer paise logic, Raju's status MUST be 'Pay', NOT 'Settled'
      expect(rajuExport.status).toBe('Pay');

      const jyotirmayExport = exportData.settlements.find((s) => s.userId === 'u-jyotirmay')!;
      expect(jyotirmayExport.netBalance).toBe(0.66);
      expect(jyotirmayExport.status).toBe('Receive');
    });
  });

  describe('4. Financial Integration Service Facade Contracts', () => {
    it('exposes canonical calculation and RPC contract methods', () => {
      expect(typeof financialIntegrationService.calculateCanonicalRoomSummary).toBe('function');
      expect(typeof financialIntegrationService.adaptDbSummaryToCanonicalRoomSummary).toBe('function');
      expect(typeof financialIntegrationService.adaptLegacyExpenseToV2).toBe('function');
      expect(typeof financialIntegrationService.adaptLegacySettlementToV2).toBe('function');
      expect(typeof financialIntegrationService.fetchRoomFinancialSummaryV2).toBe('function');
      expect(typeof financialIntegrationService.recordRoomSettlementV2).toBe('function');
    });
  });

  describe('5. Authoritative Database V2 Summary UI Consumption Parity', () => {
    it('adapts raw PostgreSQL V2 RPC JSON output directly into the active UI summary', () => {
      // Exact mock payload from public.get_room_financial_summary_v2 for ₹700 scenario
      const rawDbPayload = {
        room_id: 'room-700',
        total_expenses: 700.0,
        total_expenses_paise: 70000,
        total_settled: 0.0,
        total_settled_paise: 0,
        members: [
          {
            user_id: 'u-jyotirmay',
            name: 'Jyotirmay',
            email: 'j@test.com',
            total_paid: 500.0,
            total_paid_paise: 50000,
            total_share: 233.34,
            total_share_paise: 23334,
            settlements_sent: 0.0,
            settlements_sent_paise: 0,
            settlements_received: 0.0,
            settlements_received_paise: 0,
            gross_net: 266.66,
            net_balance: 266.66,
            net_balance_paise: 26666,
            direction: 'RECEIVE',
          },
          {
            user_id: 'u-raju',
            name: 'Raju',
            email: 'r@test.com',
            total_paid: 200.0,
            total_paid_paise: 20000,
            total_share: 233.34,
            total_share_paise: 23334,
            settlements_sent: 0.0,
            settlements_sent_paise: 0,
            settlements_received: 0.0,
            settlements_received_paise: 0,
            gross_net: -33.34,
            net_balance: -33.34,
            net_balance_paise: -3334,
            direction: 'OWES',
          },
          {
            user_id: 'u-lopamudra',
            name: 'Lopamudra',
            email: 'l@test.com',
            total_paid: 0.0,
            total_paid_paise: 0,
            total_share: 233.32,
            total_share_paise: 23332,
            settlements_sent: 0.0,
            settlements_sent_paise: 0,
            settlements_received: 0.0,
            settlements_received_paise: 0,
            gross_net: -233.32,
            net_balance: -233.32,
            net_balance_paise: -23332,
            direction: 'OWES',
          },
        ],
        is_zero_sum_verified: true,
        net_discrepancy_paise: 0,
        generated_at: '2026-10-04T12:00:00Z',
      };

      const uiSummary = financialIntegrationService.adaptDbSummaryToCanonicalRoomSummary(
        rawDbPayload,
        'u-jyotirmay',
        users
      );

      // Verify source tag
      expect(uiSummary.source).toBe('POSTGRESQL_V2_AUTHORITATIVE');
      expect(uiSummary.isZeroSumVerified).toBe(true);
      expect(uiSummary.netDiscrepancyPaise).toBe(0);

      // Verify UI values consumed directly from database
      expect(uiSummary.totalRoomExpenses).toBe(700);
      expect(uiSummary.myTotalPaid).toBe(500);
      expect(uiSummary.myTotalShare).toBe(233.34);
      expect(uiSummary.myNetBalance).toBe(266.66);

      // Verify simplified transfers
      expect(uiSummary.pairwiseDebts.length).toBe(2);
      for (const transfer of uiSummary.pairwiseDebts) {
        expect(transfer.userAId).toBe('u-jyotirmay'); // Creditor receives
        expect(transfer.netAmount).toBeGreaterThan(0);
      }
    });
  });
});

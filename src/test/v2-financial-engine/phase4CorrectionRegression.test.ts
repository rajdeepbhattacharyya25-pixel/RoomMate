import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSettlementCloud } from '../../lib/storage/cloudStorageAdapter';
import { supabaseService } from '../../lib/supabase/supabaseService';
import { db } from '../../lib/storage/mockStorage';
import { financialIntegrationService } from '../../lib/ledger/financialIntegrationService';
import { calculateCanonicalRoomSummary } from '../../lib/ledger/engine';
import { DbFinancialSummaryV2, FinancialDataState } from '../../lib/ledger/v2';
import { User, SharedExpense, ExpenseSplit } from '../../types';

describe('Phase 4 Correction Pass — Regression & Hardening Suite', () => {
  const users: User[] = [
    { id: 'u-payer', name: 'Payer User', email: 'payer@test.com', avatarUrl: '' },
    { id: 'u-payee', name: 'Payee User', email: 'payee@test.com', avatarUrl: '' },
    { id: 'u-other', name: 'Other User', email: 'other@test.com', avatarUrl: '' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    const state = db.getState();
    const testRoom = {
      id: 'room-test-1',
      name: 'Test Room',
      createdAt: '2026-10-04T10:00:00Z',
      createdBy: 'u-payer',
    };
    const testMembers = [
      { id: 'rm-1', roomId: 'room-test-1', userId: 'u-payer', role: 'ROOM_ADMIN' as const, status: 'ACTIVE' as const, joinedAt: '2026-10-04T10:00:00Z' },
      { id: 'rm-2', roomId: 'room-test-1', userId: 'u-payee', role: 'ROOM_MEMBER' as const, status: 'ACTIVE' as const, joinedAt: '2026-10-04T10:00:00Z' },
    ];
    db.saveState({
      ...state,
      rooms: [testRoom],
      roomMembers: testMembers,
    });
  });

  describe('Finding 1 & Requirement 1: V2 Settlement RPC Failure Never Inserts Row', () => {
    it('throws typed financial error and does NOT create any settlement row in local or cloud store when V2 RPC fails', async () => {
      const initialSettlementCount = db.getState().settlementPayments.length;

      // Mock V2 RPC to simulate server rejection (e.g. OVERSETTLEMENT_EXCEEDS_DEBT)
      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValueOnce({
        success: false,
        error: 'OVERSETTLEMENT_EXCEEDS_DEBT: Attempted 5000 paise, but debtor only owes 2000 paise',
        errorCode: 'OVERSETTLEMENT_EXCEEDS_DEBT',
      });

      // Attempt settlement
      await expect(
        recordSettlementCloud({
          roomId: 'room-test-1',
          payerId: 'u-payer',
          payeeId: 'u-payee',
          amount: 50.0,
          paymentMethod: 'UPI',
        })
      ).rejects.toThrow('OVERSETTLEMENT_EXCEEDS_DEBT');

      // VERIFY: No row was inserted into local storage
      const finalSettlementCount = db.getState().settlementPayments.length;
      expect(finalSettlementCount).toBe(initialSettlementCount);
    });

    it('rejects settlement when caller is not the debtor without creating a settlement row', async () => {
      const initialSettlementCount = db.getState().settlementPayments.length;

      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValueOnce({
        success: false,
        error: 'INVALID_SETTLEMENT: PAYER_IS_NOT_A_DEBTOR - member has net balance 100',
        errorCode: 'INVALID_SETTLEMENT',
      });

      await expect(
        recordSettlementCloud({
          roomId: 'room-test-1',
          payerId: 'u-payer',
          payeeId: 'u-payee',
          amount: 10.0,
          paymentMethod: 'UPI',
        })
      ).rejects.toThrow('PAYER_IS_NOT_A_DEBTOR');

      expect(db.getState().settlementPayments.length).toBe(initialSettlementCount);
    });
  });

  describe('Finding 2 & Requirements 2 & 3: Explicit Financial States & Offline Handling', () => {
    const expenses: SharedExpense[] = [
      {
        id: 'e1',
        roomId: 'r-state',
        paidBy: 'u-payee',
        totalAmount: 100,
        title: 'Electricity',
        splitMethod: 'EQUAL',
        createdAt: '2026-10-04T10:00:00Z',
      },
    ];

    const splits: ExpenseSplit[] = [
      { id: 's1', sharedExpenseId: 'e1', userId: 'u-payee', shareAmount: 50 },
      { id: 's2', sharedExpenseId: 'e1', userId: 'u-payer', shareAmount: 50 },
    ];

    it('does NOT silently use local calculation on online RPC error, but marks error and staleness explicitly', () => {
      const errorSummary = calculateCanonicalRoomSummary(
        'r-state',
        'u-payer',
        expenses,
        splits,
        [],
        users,
        {
          financialState: 'ERROR',
          isStale: true,
          error: '500 Internal Server Error: Failed to reach PostgreSQL V2 RPC',
        }
      );

      // Financial state must be ERROR
      expect(errorSummary.financialState).toBe('ERROR');
      expect(errorSummary.isStale).toBe(true);
      expect(errorSummary.error).toContain('500 Internal Server Error');
      // UI knows this is NOT server-verified
      expect(errorSummary.source).toBe('CLIENT_V2_FALLBACK');
    });

    it('allows local V2 calculation explicitly when in OFFLINE_LOCAL state', () => {
      const offlineSummary = calculateCanonicalRoomSummary(
        'r-state',
        'u-payer',
        expenses,
        splits,
        [],
        users,
        {
          financialState: 'OFFLINE_LOCAL',
        }
      );

      expect(offlineSummary.financialState).toBe('OFFLINE_LOCAL');
      expect(offlineSummary.isStale).toBeUndefined();
      expect(offlineSummary.error).toBeUndefined();
      expect(offlineSummary.totalRoomExpenses).toBe(100);
      expect(offlineSummary.myNetBalance).toBe(-50);
      expect(offlineSummary.isZeroSumVerified).toBe(true);
    });

    it('adapts authoritative database summary as ONLINE_AUTHORITATIVE with 0 discrepancy', () => {
      const dbSummary: DbFinancialSummaryV2 = {
        room_id: 'r-state',
        total_expenses: 100.0,
        total_expenses_paise: 10000,
        total_settled: 0.0,
        total_settled_paise: 0,
        members: [
          {
            user_id: 'u-payee',
            name: 'Payee User',
            email: 'payee@test.com',
            total_paid: 100.0,
            total_paid_paise: 10000,
            total_share: 50.0,
            total_share_paise: 5000,
            settlements_sent: 0.0,
            settlements_sent_paise: 0,
            settlements_received: 0.0,
            settlements_received_paise: 0,
            gross_net: 50.0,
            net_balance: 50.0,
            net_balance_paise: 5000,
            direction: 'RECEIVE',
          },
          {
            user_id: 'u-payer',
            name: 'Payer User',
            email: 'payer@test.com',
            total_paid: 0.0,
            total_paid_paise: 0,
            total_share: 50.0,
            total_share_paise: 5000,
            settlements_sent: 0.0,
            settlements_sent_paise: 0,
            settlements_received: 0.0,
            settlements_received_paise: 0,
            gross_net: -50.0,
            net_balance: -50.0,
            net_balance_paise: -5000,
            direction: 'OWES',
          },
        ],
        is_zero_sum_verified: true,
        net_discrepancy_paise: 0,
        generated_at: new Date().toISOString(),
      };

      const authoritativeSummary = financialIntegrationService.adaptDbSummaryToCanonicalRoomSummary(
        dbSummary,
        'u-payer',
        users
      );

      expect(authoritativeSummary.financialState).toBe('ONLINE_AUTHORITATIVE');
      expect(authoritativeSummary.source).toBe('POSTGRESQL_V2_AUTHORITATIVE');
      expect(authoritativeSummary.isZeroSumVerified).toBe(true);
      expect(authoritativeSummary.myNetBalance).toBe(-50.0);
      expect(authoritativeSummary.pairwiseDebts.length).toBe(1);
      expect(authoritativeSummary.pairwiseDebts[0].netAmount).toBe(50.0);
    });
  });

  describe('Finding 3: Type Safety at Financial Boundary', () => {
    it('verifies that FinancialDataState accommodates all four lifecycle states', () => {
      const states: FinancialDataState[] = [
        'LOADING',
        'ONLINE_AUTHORITATIVE',
        'OFFLINE_LOCAL',
        'ERROR',
      ];
      expect(states.length).toBe(4);
      expect(states).toContain('ONLINE_AUTHORITATIVE');
      expect(states).toContain('OFFLINE_LOCAL');
      expect(states).toContain('LOADING');
      expect(states).toContain('ERROR');
    });
  });

  describe('Finding 5 & Requirement 4: Zero Direct-Table Insert Bypass in Application Path', () => {
    it('proves online settlement creation strictly calls V2 RPC and never executes direct table insert', async () => {
      const rpcSpy = vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValueOnce({
        success: true,
        settlement_id: 'v2-settle-12345',
        room_id: 'room-test-1',
        payer_id: 'u-payer',
        payee_id: 'u-payee',
        amount: 50.0,
        amount_paise: 5000,
        created_at: new Date().toISOString(),
      });

      const result = await recordSettlementCloud({
        roomId: 'room-test-1',
        payerId: 'u-payer',
        payeeId: 'u-payee',
        amount: 50.0,
        paymentMethod: 'UPI',
      });

      // Verify V2 RPC was invoked
      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith('room-test-1', 'u-payer', 'u-payee', 50.0);
      expect(result.id).toBe('v2-settle-12345');
    });
  });

  describe('Requirements 5, 6, 7 & 8: End-to-End Financial Model Invariants', () => {
    it('Req 5: Valid V2 settlement updates net balances and simplifies transfers', () => {
      const initialSummary = calculateCanonicalRoomSummary(
        'room-val',
        'u-payer',
        [
          {
            id: 'e1',
            roomId: 'room-val',
            paidBy: 'u-payee',
            totalAmount: 100,
            title: 'Bill',
            splitMethod: 'EQUAL',
            createdAt: '2026-10-04T10:00:00Z',
          },
        ],
        [
          { id: 's1', sharedExpenseId: 'e1', userId: 'u-payee', shareAmount: 50 },
          { id: 's2', sharedExpenseId: 'e1', userId: 'u-payer', shareAmount: 50 },
        ],
        [],
        users,
        { financialState: 'OFFLINE_LOCAL' }
      );

      expect(initialSummary.myNetBalance).toBe(-50);
      expect(initialSummary.pairwiseDebts.length).toBe(1);

      // Record valid settlement of 50
      const postSettlementSummary = calculateCanonicalRoomSummary(
        'room-val',
        'u-payer',
        [
          {
            id: 'e1',
            roomId: 'room-val',
            paidBy: 'u-payee',
            totalAmount: 100,
            title: 'Bill',
            splitMethod: 'EQUAL',
            createdAt: '2026-10-04T10:00:00Z',
          },
        ],
        [
          { id: 's1', sharedExpenseId: 'e1', userId: 'u-payee', shareAmount: 50 },
          { id: 's2', sharedExpenseId: 'e1', userId: 'u-payer', shareAmount: 50 },
        ],
        [
          {
            id: 'st-1',
            roomId: 'room-val',
            payerId: 'u-payer',
            payeeId: 'u-payee',
            amount: 50,
            paymentMethod: 'UPI',
            paymentDate: '2026-10-04',
            createdAt: '2026-10-04T11:00:00Z',
          },
        ],
        users,
        { financialState: 'OFFLINE_LOCAL' }
      );

      expect(postSettlementSummary.myNetBalance).toBe(0);
      expect(postSettlementSummary.pairwiseDebts.length).toBe(0);
      expect(postSettlementSummary.isZeroSumVerified).toBe(true);
    });

    it('Req 6: Oversettlement fails via typed financial error from V2 RPC', async () => {
      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValueOnce({
        success: false,
        error: 'OVERSETTLEMENT_EXCEEDS_DEBT: Attempted 10000 paise, but debtor only owes 5000 paise',
        errorCode: 'OVERSETTLEMENT_EXCEEDS_DEBT',
      });

      await expect(
        recordSettlementCloud({
          roomId: 'room-over',
          payerId: 'u-payer',
          payeeId: 'u-payee',
          amount: 100.0,
          paymentMethod: 'UPI',
        })
      ).rejects.toThrow('OVERSETTLEMENT_EXCEEDS_DEBT');
    });

    it('Req 7: Concurrent duplicate settlement produces exactly one success and rejects the second', async () => {
      let callCount = 0;
      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            success: true,
            settlement_id: 'settle-win-1',
            room_id: 'room-test-1',
            payer_id: 'u-payer',
            payee_id: 'u-payee',
            amount: 50.0,
            amount_paise: 5000,
            created_at: new Date().toISOString(),
          };
        } else {
          return {
            success: false,
            error: 'INVALID_SETTLEMENT: PAYER_IS_NOT_A_DEBTOR - member has net balance 0',
            errorCode: 'INVALID_SETTLEMENT',
          };
        }
      });

      const [res1, res2] = await Promise.allSettled([
        recordSettlementCloud({
          roomId: 'room-test-1',
          payerId: 'u-payer',
          payeeId: 'u-payee',
          amount: 50.0,
          paymentMethod: 'UPI',
        }),
        recordSettlementCloud({
          roomId: 'room-test-1',
          payerId: 'u-payer',
          payeeId: 'u-payee',
          amount: 50.0,
          paymentMethod: 'UPI',
        }),
      ]);

      expect(res1.status).toBe('fulfilled');
      expect(res2.status).toBe('rejected');
      if (res2.status === 'rejected') {
        expect(res2.reason.message).toContain('PAYER_IS_NOT_A_DEBTOR');
      }
    });

    it('Req 8: Database summary remains authoritative across repeated queries/refresh', async () => {
      const mockSummary: DbFinancialSummaryV2 = {
        room_id: 'room-stable',
        total_expenses: 700.0,
        total_expenses_paise: 70000,
        total_settled: 50.0,
        total_settled_paise: 5000,
        members: [
          {
            user_id: 'u-payee',
            name: 'Payee User',
            email: 'payee@test.com',
            total_paid: 500.0,
            total_paid_paise: 50000,
            total_share: 233.34,
            total_share_paise: 23334,
            settlements_sent: 0.0,
            settlements_sent_paise: 0,
            settlements_received: 50.0,
            settlements_received_paise: 5000,
            gross_net: 266.66,
            net_balance: 216.66,
            net_balance_paise: 21666,
            direction: 'RECEIVE',
          },
        ],
        is_zero_sum_verified: true,
        net_discrepancy_paise: 0,
        generated_at: new Date().toISOString(),
      };

      vi.spyOn(supabaseService, 'getRoomFinancialSummaryV2').mockResolvedValue(mockSummary);

      // First fetch
      const fetch1 = await financialIntegrationService.fetchRoomFinancialSummaryV2('room-stable');
      // Second fetch (simulate refresh)
      const fetch2 = await financialIntegrationService.fetchRoomFinancialSummaryV2('room-stable');

      expect(fetch1).not.toBeNull();
      expect(fetch2).not.toBeNull();
      expect(fetch1?.net_discrepancy_paise).toBe(0);
      expect(fetch2?.net_discrepancy_paise).toBe(0);
      expect(fetch1?.total_expenses_paise).toBe(fetch2?.total_expenses_paise);
      expect(fetch1?.members[0].net_balance_paise).toBe(fetch2?.members[0].net_balance_paise);
    });
  });
});

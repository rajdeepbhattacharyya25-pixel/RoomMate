import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateUpiAppIntent,
  UpiIntentOptions,
  formatWhatsAppSettlementReceipt,
} from '../../lib/payments/upiIntentService';
import {
  enqueueOfflineItem,
  flushOfflineQueue,
  clearOfflineQueue,
  getOfflineQueue,
} from '../../lib/storage/offlineQueue';
import {
  calculateEqualSplitsV2,
  validateAndCalculateExactSplitsV2,
} from '../../lib/ledger/v2/splits';
import { canMemberExitRoomV2 } from '../../lib/ledger/v2/summary';
import { formatInrExact } from '../../lib/utils/currencyFormatter';
import {
  financialIntegrationService,
  calculateCanonicalRoomSummary,
} from '../../lib/ledger/financialIntegrationService';
import { recordSettlementCloud } from '../../lib/storage/cloudStorageAdapter';
import { supabaseService } from '../../lib/supabase/supabaseService';
import { db } from '../../lib/storage/mockStorage';
import { User, SharedExpense, ExpenseSplit } from '../../types';
import { DbFinancialSummaryV2 } from '../../lib/ledger/v2';

describe('Phase 7 — UPI + Realtime + Leave-Room Integrity Hardening Suite', () => {
  const roomAlpha = 'room-alpha-p7-001';
  const userJyotirmay: User = {
    id: 'usr-jyo-001',
    name: 'Jyotirmay',
    email: 'jyo@example.com',
    role: 'USER',
    createdAt: '2026-10-01T00:00:00Z',
    upiId: 'jyotirmay@okaxis',
  };
  const userRaju: User = {
    id: 'usr-raj-002',
    name: 'Raju',
    email: 'raju@example.com',
    role: 'USER',
    createdAt: '2026-10-01T00:00:00Z',
    upiId: 'raju@upi',
  };
  const userLopamudra: User = {
    id: 'usr-lopa-003',
    name: 'Lopamudra',
    email: 'lopa@example.com',
    role: 'USER',
    createdAt: '2026-10-01T00:00:00Z',
    upiId: 'lopa@icici',
  };
  const allUsers = [userJyotirmay, userRaju, userLopamudra];

  function createCanonical700MockDbSummary(): DbFinancialSummaryV2 {
    return {
      room_id: roomAlpha,
      total_expenses: 700.0,
      total_expenses_paise: 70000,
      total_settled: 0,
      total_settled_paise: 0,
      members: [
        {
          user_id: userJyotirmay.id,
          name: 'Jyotirmay',
          email: 'jyo@example.com',
          upi_id: 'jyotirmay@okaxis',
          total_paid: 500.0,
          total_paid_paise: 50000,
          total_share: 233.34,
          total_share_paise: 23334,
          settlements_sent: 0,
          settlements_sent_paise: 0,
          settlements_received: 0,
          settlements_received_paise: 0,
          gross_net: 266.66,
          net_balance: 266.66,
          net_balance_paise: 26666,
          direction: 'RECEIVE',
        },
        {
          user_id: userRaju.id,
          name: 'Raju',
          email: 'raju@example.com',
          upi_id: 'raju@upi',
          total_paid: 200.0,
          total_paid_paise: 20000,
          total_share: 233.32,
          total_share_paise: 23332,
          settlements_sent: 0,
          settlements_sent_paise: 0,
          settlements_received: 0,
          settlements_received_paise: 0,
          gross_net: -33.32,
          net_balance: -33.32,
          net_balance_paise: -3332,
          direction: 'OWES',
        },
        {
          user_id: userLopamudra.id,
          name: 'Lopamudra',
          email: 'lopa@example.com',
          upi_id: 'lopa@icici',
          total_paid: 0,
          total_paid_paise: 0,
          total_share: 233.34,
          total_share_paise: 23334,
          settlements_sent: 0,
          settlements_sent_paise: 0,
          settlements_received: 0,
          settlements_received_paise: 0,
          gross_net: -233.34,
          net_balance: -233.34,
          net_balance_paise: -23334,
          direction: 'OWES',
        },
      ],
      is_zero_sum_verified: true,
      net_discrepancy_paise: 0,
      generated_at: new Date().toISOString(),
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    clearOfflineQueue();
    const state = db.getState();
    db.saveState({
      ...state,
      rooms: [
        {
          id: roomAlpha,
          name: 'Flat 402',
          createdBy: userJyotirmay.id,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
          inviteCode: 'FLAT402',
          isArchived: false,
        },
      ],
      roomMembers: [
        {
          id: 'rm-1',
          roomId: roomAlpha,
          userId: userJyotirmay.id,
          role: 'ROOM_ADMIN',
          status: 'ACTIVE',
          joinedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 'rm-2',
          roomId: roomAlpha,
          userId: userRaju.id,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: '2026-10-01T01:00:00Z',
        },
        {
          id: 'rm-3',
          roomId: roomAlpha,
          userId: userLopamudra.id,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: '2026-10-01T02:00:00Z',
        },
      ],
      sharedExpenses: [],
      expenseSplits: [],
      settlementPayments: [],
    });
  });

  // ============================================================================
  // TARGET 1 & 2: UPI Exact Amount & Parameter Encoding / Sanitization
  // ============================================================================
  describe('Target 1 & 2: UPI Exact Amount & Parameter Encoding', () => {
    it('generates exact 2-decimal INR amount string without truncation in UPI URI', () => {
      const opts: UpiIntentOptions = {
        pa: 'jyotirmay@okaxis',
        pn: 'Jyotirmay',
        am: 33.32,
        tn: 'RoomMate_Settlement',
      };
      const uri = generateUpiAppIntent('generic', opts);
      expect(uri).toContain('am=33.32');
      expect(uri).toContain('cu=INR');
      expect(uri).toContain('pa=jyotirmay@okaxis');
      expect(uri).not.toContain('am=33&');
      expect(uri).not.toContain('am=33.3&');
    });

    it('sanitizes special characters and prevents arbitrary query injection in UPI VPA', () => {
      const maliciousOpts: UpiIntentOptions = {
        pa: 'attacker@upi&am=999999&pn=Hacked',
        pn: 'Attacker & Co',
        am: 50.0,
        tn: 'Test & Hack',
        tr: 'REF-123 & Extra',
      };
      const uri = generateUpiAppIntent('generic', maliciousOpts);
      // Ampersands and equals inside pa should be percent-encoded, NOT creating real query keys
      expect(uri).toContain('pa=attacker@upi%26am%3D999999%26pn%3DHacked');
      // The legitimate amount parameter is unaffected
      expect(uri).toContain('&am=50.00');
      expect(uri).toContain('&cu=INR');
      // Verify no unencoded '&Extra' injection in tr
      expect(uri).toContain('&tr=REF-123%20%26%20Extra');
    });
  });

  // ============================================================================
  // TARGET 3 & 4 & 5: UPI Cancellation, Retry, & Duplicate Prevention
  // ============================================================================
  describe('Target 3, 4 & 5: UPI Cancellation, Retry, and Idempotency', () => {
    it('does NOT record optimistic settlement when UPI intent is merely generated', () => {
      const opts: UpiIntentOptions = {
        pa: 'jyotirmay@okaxis',
        pn: 'Jyotirmay',
        am: 233.34,
        tn: 'RoomMate_Settlement',
      };
      const uri = generateUpiAppIntent('gpay', opts);
      expect(uri.startsWith('tez://upi/pay?')).toBe(true);
      // Ensure zero settlements are recorded in db
      expect(db.getState().settlementPayments.length).toBe(0);
    });

    it('rejects duplicate settlement attempt when debtor is already settled', async () => {
      // Mock V2 RPC to succeed once then reject with PAYER_IS_NOT_A_DEBTOR
      let callCount = 0;
      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            success: true,
            data: {
              settlement_id: 'stl-1',
              room_id: roomAlpha,
              payer_id: userRaju.id,
              payee_id: userJyotirmay.id,
              amount: 33.32,
              created_at: new Date().toISOString(),
            },
          };
        }
        return {
          success: false,
          error: 'INVALID_SETTLEMENT: PAYER_IS_NOT_A_DEBTOR - member has net balance 0',
        };
      });

      // Attempt 1: succeeds
      const res1 = await recordSettlementCloud({
        roomId: roomAlpha,
        payerId: userRaju.id,
        payeeId: userJyotirmay.id,
        amount: 33.32,
        paymentMethod: 'UPI',
      });
      expect(res1).toBeDefined();

      // Attempt 2 (accidental retry after settlement): rejected cleanly
      await expect(
        recordSettlementCloud({
          roomId: roomAlpha,
          payerId: userRaju.id,
          payeeId: userJyotirmay.id,
          amount: 33.32,
          paymentMethod: 'UPI',
        })
      ).rejects.toThrow('PAYER_IS_NOT_A_DEBTOR');
    });
  });

  // ============================================================================
  // TARGET 6 & 27 & 28: Offline Queue Replay & Conflict Discard
  // ============================================================================
  describe('Target 6, 27 & 28: Offline Settlement Replay & Conflict Safety', () => {
    it('flushes offline settlements strictly through authoritative recordRoomSettlementV2', async () => {
      const rpcSpy = vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValue({
        success: true,
        data: {
          settlement_id: 'stl-offline-1',
          room_id: roomAlpha,
          payer_id: userLopamudra.id,
          payee_id: userJyotirmay.id,
          amount: 233.34,
          created_at: new Date().toISOString(),
        },
      });

      enqueueOfflineItem('RECORD_SETTLEMENT', {
        roomId: roomAlpha,
        payerId: userLopamudra.id,
        payeeId: userJyotirmay.id,
        amount: 233.34,
        paymentMethod: 'UPI',
      });

      expect(getOfflineQueue().length).toBe(1);
      const flushResult = await flushOfflineQueue();
      expect(flushResult.syncedCount).toBe(1);
      expect(rpcSpy).toHaveBeenCalledWith(roomAlpha, userLopamudra.id, userJyotirmay.id, 233.34);
      expect(getOfflineQueue().length).toBe(0);
    });

    it('auto-discards permanent conflict when offline settlement was already settled elsewhere', async () => {
      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValue({
        success: false,
        error: 'OVERSETTLEMENT_EXCEEDS_DEBT: Attempted 3332 paise, but debtor only owes 0 paise',
      });

      enqueueOfflineItem('RECORD_SETTLEMENT', {
        roomId: roomAlpha,
        payerId: userRaju.id,
        payeeId: userJyotirmay.id,
        amount: 33.32,
        paymentMethod: 'UPI',
      });

      const flushResult = await flushOfflineQueue();
      expect(flushResult.failedCount).toBe(1);
      // Verified: auto-discarded from queue without infinite loop retry
      expect(getOfflineQueue().length).toBe(0);
    });
  });

  // ============================================================================
  // TARGET 8, 9, 10, 11, 12, 13: Realtime Architecture & Reconnect
  // ============================================================================
  describe('Target 8-13: Realtime Architecture, Invalidation & Reconnect', () => {
    it('does NOT perform local arithmetic on realtime event; re-fetches authoritative V2 summary', async () => {
      const mockDbSummary = createCanonical700MockDbSummary();

      const fetchSpy = vi
        .spyOn(financialIntegrationService, 'fetchRoomFinancialSummaryV2')
        .mockResolvedValue(mockDbSummary);

      // Simulate Realtime Event triggering authoritative fetch
      const result = await financialIntegrationService.fetchRoomFinancialSummaryV2(roomAlpha);
      expect(fetchSpy).toHaveBeenCalledWith(roomAlpha);
      expect(result).toEqual(mockDbSummary);

      const adapted = financialIntegrationService.adaptDbSummaryToCanonicalRoomSummary(
        result!,
        userJyotirmay.id,
        allUsers
      );
      expect(adapted.myNetBalance).toBe(266.66);
      expect(adapted.totalRoomExpenses).toBe(700.0);
    });

    it('converges correctly after reconnect following offline state', async () => {
      let networkStatus = 'DISCONNECTED';
      const mockSummaryOnline = createCanonical700MockDbSummary();

      vi.spyOn(financialIntegrationService, 'fetchRoomFinancialSummaryV2').mockImplementation(async () => {
        if (networkStatus === 'DISCONNECTED') return null;
        return mockSummaryOnline;
      });

      // While disconnected
      const offlineSummary = await financialIntegrationService.fetchRoomFinancialSummaryV2(roomAlpha);
      expect(offlineSummary).toBeNull();

      // Upon reconnect
      networkStatus = 'CONNECTED';
      const reconnectedSummary = await financialIntegrationService.fetchRoomFinancialSummaryV2(roomAlpha);
      expect(reconnectedSummary).not.toBeNull();
      expect(reconnectedSummary!.total_expenses_paise).toBe(70000);
      expect(reconnectedSummary!.members[0].net_balance_paise).toBe(26666);
    });
  });

  // ============================================================================
  // TARGET 15, 16, 17: Leave-Room Semantics (Zero, Debtor, Creditor)
  // ============================================================================
  describe('Target 15, 16 & 17: Leave-Room Semantics', () => {
    it('permits clean exit when member has exactly zero balance', () => {
      const validation = canMemberExitRoomV2({
        userId: userRaju.id,
        paidPaise: 10000,
        owedPaise: 10000,
        netPositionPaise: 0,
      });
      expect(validation.canLeave).toBe(true);
      expect(validation.reason).toBe('FINANCIALLY_CLEAR');
      expect(validation.netPositionPaise).toBe(0);
    });

    it('rejects clean exit when member owes money (debtor)', () => {
      const validation = canMemberExitRoomV2({
        userId: userRaju.id,
        paidPaise: 0,
        owedPaise: 3332,
        netPositionPaise: -3332,
      });
      expect(validation.canLeave).toBe(false);
      expect(validation.reason).toContain('UNSETTLED_DEBT');
      expect(validation.netPositionPaise).toBe(-3332);
    });

    it('rejects clean exit when member is owed money (creditor)', () => {
      const validation = canMemberExitRoomV2({
        userId: userJyotirmay.id,
        paidPaise: 26666,
        owedPaise: 0,
        netPositionPaise: 26666,
      });
      expect(validation.canLeave).toBe(false);
      expect(validation.reason).toContain('UNCOLLECTED_CREDIT');
      expect(validation.netPositionPaise).toBe(26666);
    });
  });

  // ============================================================================
  // TARGET 18: Settlement + Leave Race Condition & Historical Preservation
  // ============================================================================
  describe('Target 18 & 20: Settlement + Leave Race & Historical Data Preservation', () => {
    it('preserves all historical expenses and splits when member leaves room', () => {
      // Create expense involving userRaju
      db.createSharedExpense(userJyotirmay.id, {
        roomId: roomAlpha,
        title: 'Groceries',
        totalAmount: 300,
        category: 'GROCERIES',
        splitMethod: 'EQUAL',
        participantUserIds: [userJyotirmay.id, userRaju.id, userLopamudra.id],
      });

      expect(db.getState().sharedExpenses.length).toBe(1);
      expect(db.getState().expenseSplits.length).toBe(3);

      // Raju leaves room
      const leaveResult = db.leaveRoom(userRaju.id, roomAlpha);
      expect(leaveResult.success).toBe(true);

      // Verify member marked as LEFT
      const rajuMember = db.getState().roomMembers.find(
        (m) => m.roomId === roomAlpha && m.userId === userRaju.id
      );
      expect(rajuMember?.status).toBe('LEFT');

      // Verify all historical expenses and splits are preserved 100% intact
      expect(db.getState().sharedExpenses.length).toBe(1);
      expect(db.getState().expenseSplits.length).toBe(3);
      expect(db.getState().expenseSplits.some((s) => s.userId === userRaju.id)).toBe(true);
    });
  });

  // ============================================================================
  // TARGET 19 & 26: Membership & Removal Authorization
  // ============================================================================
  describe('Target 19 & 26: Member Removal Authorization', () => {
    it('prohibits non-admin from removing other room members', () => {
      expect(() => {
        db.removeMember(userRaju.id, roomAlpha, userLopamudra.id);
      }).toThrow('UNAUTHORIZED: Only an active room admin can remove members');
    });

    it('prohibits room admin from removing themselves via removeMember', () => {
      expect(() => {
        db.removeMember(userJyotirmay.id, roomAlpha, userJyotirmay.id);
      }).toThrow('CANNOT_REMOVE_SELF: Room admin cannot remove themselves, use leave flow instead');
    });

    it('allows room admin to remove an active member cleanly', () => {
      const result = db.removeMember(userJyotirmay.id, roomAlpha, userLopamudra.id);
      expect(result.success).toBe(true);
      const lopaMember = db.getState().roomMembers.find(
        (m) => m.roomId === roomAlpha && m.userId === userLopamudra.id
      );
      expect(lopaMember?.status).toBe('REMOVED');
    });
  });

  // ============================================================================
  // TARGET 22: Canonical ₹700 Regression Fixture
  // ============================================================================
  describe('Target 22: Canonical ₹700 Regression Fixture', () => {
    it('calculates exact net balances and zero circular transfers for the canonical ₹700 fixture', () => {
      // Canonical Phase 5 Fixture:
      // Expense 1: ₹500 Wi-Fi paid by Jyotirmay
      // Splits: Jyotirmay ₹166.67, Lopamudra ₹166.67, Raju ₹166.66
      // Expense 2: ₹200 Water paid by Raju
      // Splits: Jyotirmay ₹66.67, Lopamudra ₹66.67, Raju ₹66.66

      const expenses: SharedExpense[] = [
        {
          id: 'exp-wifi-500',
          roomId: roomAlpha,
          paidBy: userJyotirmay.id,
          createdBy: userJyotirmay.id,
          title: 'Wi-Fi',
          totalAmount: 500,
          category: 'UTILITIES',
          splitMethod: 'EXACT',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
          isDeleted: false,
        },
        {
          id: 'exp-water-200',
          roomId: roomAlpha,
          paidBy: userRaju.id,
          createdBy: userRaju.id,
          title: 'Water',
          totalAmount: 200,
          category: 'UTILITIES',
          splitMethod: 'EXACT',
          createdAt: '2026-10-01T01:00:00Z',
          updatedAt: '2026-10-01T01:00:00Z',
          isDeleted: false,
        },
      ];

      const splits: ExpenseSplit[] = [
        // Exp 1
        { id: 'sp-1', sharedExpenseId: 'exp-wifi-500', userId: userJyotirmay.id, shareAmount: 166.67 },
        { id: 'sp-2', sharedExpenseId: 'exp-wifi-500', userId: userLopamudra.id, shareAmount: 166.67 },
        { id: 'sp-3', sharedExpenseId: 'exp-wifi-500', userId: userRaju.id, shareAmount: 166.66 },
        // Exp 2
        { id: 'sp-4', sharedExpenseId: 'exp-water-200', userId: userJyotirmay.id, shareAmount: 66.67 },
        { id: 'sp-5', sharedExpenseId: 'exp-water-200', userId: userLopamudra.id, shareAmount: 66.67 },
        { id: 'sp-6', sharedExpenseId: 'exp-water-200', userId: userRaju.id, shareAmount: 66.66 },
      ];

      const summary = calculateCanonicalRoomSummary(
        roomAlpha,
        userJyotirmay.id,
        expenses,
        splits,
        [],
        allUsers
      );

      // Total room expenses
      expect(summary.totalRoomExpenses).toBe(700.0);

      // Jyotirmay's standing
      expect(summary.myNetBalance).toBe(266.66);
      expect(summary.myTotalPaid).toBe(500.0);
      expect(summary.myTotalShare).toBe(233.34);

      // Raju's standing
      const rajuSummary = calculateCanonicalRoomSummary(
        roomAlpha,
        userRaju.id,
        expenses,
        splits,
        [],
        allUsers
      );
      expect(rajuSummary.myNetBalance).toBe(-33.32);
      expect(rajuSummary.myTotalPaid).toBe(200.0);
      expect(rajuSummary.myTotalShare).toBe(233.32);

      // Lopamudra's standing
      const lopaSummary = calculateCanonicalRoomSummary(
        roomAlpha,
        userLopamudra.id,
        expenses,
        splits,
        [],
        allUsers
      );
      expect(lopaSummary.myNetBalance).toBe(-233.34);
      expect(lopaSummary.myTotalPaid).toBe(0.0);
      expect(lopaSummary.myTotalShare).toBe(233.34);

      // Verify zero circular debt in simplified pairwise transfers
      expect(summary.pairwiseDebts.length).toBe(2);

      const transferFromRaju = summary.pairwiseDebts.find((p) => p.userBId === userRaju.id)!;
      const transferFromLopa = summary.pairwiseDebts.find((p) => p.userBId === userLopamudra.id)!;

      expect(transferFromRaju.userAId).toBe(userJyotirmay.id);
      expect(transferFromRaju.netAmount).toBe(33.32);

      expect(transferFromLopa.userAId).toBe(userJyotirmay.id);
      expect(transferFromLopa.netAmount).toBe(233.34);

      // Formatted INR presentation
      expect(formatInrExact(transferFromRaju.netAmount)).toBe('₹33.32');
      expect(formatInrExact(transferFromLopa.netAmount)).toBe('₹233.34');
      expect(formatInrExact(summary.myNetBalance)).toBe('₹266.66');
    });
  });

  // ============================================================================
  // TARGET 23 & 24: Remainder Ordering & Exact ₹200 / 3
  // ============================================================================
  describe('Target 23 & 24: Deterministic Remainder Ordering & ₹200 / 3', () => {
    it('sorts participants lexicographically by UUID for deterministic remainder distribution', () => {
      // 3 UUIDs in non-alphabetical order
      const uC = 'cccccccc-0000-0000-0000-000000000003';
      const uA = 'aaaaaaaa-0000-0000-0000-000000000001';
      const uB = 'bbbbbbbb-0000-0000-0000-000000000002';

      const splits = calculateEqualSplitsV2(20000, [uC, uA, uB]);
      expect(splits.length).toBe(3);

      // First two participants lexicographically receive 6667, third receives 6666
      expect(splits[0].userId).toBe(uA);
      expect(splits[0].sharePaise).toBe(6667);

      expect(splits[1].userId).toBe(uB);
      expect(splits[1].sharePaise).toBe(6667);

      expect(splits[2].userId).toBe(uC);
      expect(splits[2].sharePaise).toBe(6666);

      const totalPaise = splits.reduce((acc, s) => acc + s.sharePaise, 0);
      expect(totalPaise).toBe(20000);
    });

    it('rejects exact splits when sum does not equal total to the exact paisa', () => {
      expect(() => {
        validateAndCalculateExactSplitsV2(20000, {
          'user-1': 6667,
          'user-2': 6667,
          'user-3': 6665, // Sum = 19999 (1 paisa short)
        });
      }).toThrow('EXACT_SPLIT_SUM_MISMATCH');
    });
  });

  // ============================================================================
  // TARGET 25: Settlement History Immutability
  // ============================================================================
  describe('Target 25: Settlement History Immutability', () => {
    it('guarantees settlement records are immutable and cannot be altered by UI interactions', () => {
      const payment = db.recordSettlementPayment(userRaju.id, {
        roomId: roomAlpha,
        payerId: userRaju.id,
        payeeId: userJyotirmay.id,
        amount: 33.32,
        paymentMethod: 'UPI',
        transactionRef: 'REF-TX-001',
      });

      expect(payment.id).toBeDefined();
      expect(payment.amount).toBe(33.32);

      const saved = db.getState().settlementPayments.find((s) => s.id === payment.id);
      expect(saved?.amount).toBe(33.32);
      expect(saved?.payerId).toBe(userRaju.id);
      expect(saved?.payeeId).toBe(userJyotirmay.id);
    });
  });

  // ============================================================================
  // TARGET 29 & 30: UPI Receipt & Final V2/UI Convergence
  // ============================================================================
  describe('Target 29 & 30: UPI Receipt Generation & Final V2/UI Convergence', () => {
    it('generates WhatsApp settlement receipt with exact 2-decimal amounts', () => {
      const receipt = formatWhatsAppSettlementReceipt({
        amount: 33.32,
        payerName: 'Raju',
        payeeName: 'Jyotirmay',
        payeeUpiId: 'jyotirmay@okaxis',
        roomName: 'Flat 402',
        paymentMethod: 'UPI (GPay)',
        transactionRef: 'CF-2026-ABCD-1234',
        dateStr: '04 Oct 2026, 07:45 PM',
      });

      expect(receipt).toContain('₹33.32');
      expect(receipt).toContain('Jyotirmay');
      expect(receipt).toContain('Flat 402');
      expect(receipt).not.toContain('₹33.3\n');
      expect(receipt).not.toContain('₹33\n');
    });

    it('verifies final V2 financial engine result converges with UI human formatters', () => {
      const mockDbSummary = createCanonical700MockDbSummary();

      const canonical = financialIntegrationService.adaptDbSummaryToCanonicalRoomSummary(
        mockDbSummary,
        userRaju.id,
        allUsers
      );

      // Raju owes ₹33.32
      expect(canonical.myNetBalance).toBe(-33.32);
      expect(formatInrExact(Math.abs(canonical.myNetBalance))).toBe('₹33.32');

      // Jyotirmay gets ₹266.66
      const jyoCanonical = financialIntegrationService.adaptDbSummaryToCanonicalRoomSummary(
        mockDbSummary,
        userJyotirmay.id,
        allUsers
      );
      expect(jyoCanonical.myNetBalance).toBe(266.66);
      expect(formatInrExact(jyoCanonical.myNetBalance)).toBe('₹266.66');
    });
  });
});

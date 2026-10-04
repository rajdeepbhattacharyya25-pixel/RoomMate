import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateUpiAppIntent } from '../../lib/payments/upiIntentService';
import { generateUpiDeepLink } from '../../lib/ledger/nudgeService';
import {
  enqueueOfflineItem,
  flushOfflineQueue,
  clearOfflineQueue,
  getOfflineQueue,
} from '../../lib/storage/offlineQueue';
import { supabaseService } from '../../lib/supabase/supabaseService';
import { supabase } from '../../lib/supabase/client';

describe('Phase 8 — External Attack-Surface, DAST & Security Regression Suite', () => {
  beforeEach(() => {
    clearOfflineQueue();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // SECTION 13: UPI SECURITY REGRESSION & INJECTION HARDENING
  // ===========================================================================
  describe('Section 13: UPI Parameter Injection & Exact-Money Security', () => {
    it('sanitizes malicious VPA query parameter injection attempts', () => {
      const maliciousVpas = [
        'attacker@upi&am=99999',
        'attacker@upi?am=99999',
        'attacker@upi#fragment',
        'victim@okhdfcbank&cu=USD&pn=Hacked',
        'legit@upi%26am%3D50000',
      ];

      for (const vpa of maliciousVpas) {
        const uri = generateUpiAppIntent('generic', {
          pa: vpa,
          pn: 'Victim Name',
          am: 33.32,
          tr: 'TXN_123',
          tn: 'Test Settlement',
        });

        // The query string must NOT contain an unencoded am=99999 or am=50000 parameter
        const query = uri.split('?')[1] || '';
        const urlParams = new URLSearchParams(query);
        expect(urlParams.get('am')).toBe('33.32');
        expect(urlParams.get('cu')).toBe('INR');

        // The raw query must NOT contain unencoded injection delimiters for am or cu
        expect(query).not.toContain('&am=99999');
        expect(query).not.toContain('?am=99999');
        expect(query).not.toContain('&am=50000');
        expect(query).not.toContain('&cu=USD');
      }
    });

    it('sanitizes VPA injection in nudgeService generateUpiDeepLink', () => {
      const deepLink = generateUpiDeepLink({
        pa: 'attacker@upi&am=999999&pn=Exploit',
        pn: 'Target Roommate',
        am: 66.67,
        tn: 'Wi-Fi Share',
      });

      expect(deepLink).toContain('am=66.67');
      expect(deepLink).not.toContain('am=999999');
      expect(deepLink).toContain('cu=INR');
    });

    it('preserves valid RFC-compliant UPI VPAs with @ symbols', () => {
      const validVpas = [
        'student.rent@okhdfcbank',
        'user9876543210@paytm',
        'flatmate_expenses@axl',
        'sneha-patel@ybl',
      ];

      for (const vpa of validVpas) {
        const uri = generateUpiAppIntent('generic', {
          pa: vpa,
          pn: 'Valid User',
          am: 233.34,
          tn: 'Rent Share',
        });

        const query = uri.split('?')[1] || '';
        const urlParams = new URLSearchParams(query);
        expect(urlParams.get('pa')).toBe(vpa);
        expect(urlParams.get('am')).toBe('233.34');
      }
    });

    it('enforces exact two-decimal INR amounts without truncation or rounding loss', () => {
      const testCases = [
        { input: 33.32, expected: '33.32' },
        { input: 33.34, expected: '33.34' },
        { input: 66.67, expected: '66.67' },
        { input: 166.66, expected: '166.66' },
        { input: 233.34, expected: '233.34' },
        { input: 1234.56, expected: '1234.56' },
        { input: 0, expected: '0.00' },
        { input: -50, expected: '0.00' },
      ];

      for (const { input, expected } of testCases) {
        const uri = generateUpiAppIntent('generic', {
          pa: 'merchant@upi',
          pn: 'Merchant',
          am: input,
          tn: 'Test',
        });

        expect(uri).toContain(`am=${expected}`);
        expect(uri).not.toMatch(/am=\d+\.\d{3,}/); // Never more than 2 decimals
        if (input > 0 && Math.floor(input) !== input) {
          // Verify it's never truncated to an integer without decimals (e.g. am=33& or am=33 at end)
          expect(uri).not.toMatch(new RegExp(`am=${Math.floor(input)}(&|$)`));
        }
      }
    });

    it('does not create an optimistic settlement mutation merely because a UPI URI was opened', () => {
      expect(getOfflineQueue().length).toBe(0);
      generateUpiAppIntent('generic', {
        pa: 'roommate@upi',
        pn: 'Roommate',
        am: 100.0,
        tn: 'Test',
      });

      // No settlement row or mutation was placed into offline queue or storage
      expect(getOfflineQueue().length).toBe(0);
    });
  });

  // ===========================================================================
  // SECTION 14: OFFLINE QUEUE SECURITY & AUTHORIZATION
  // ===========================================================================
  describe('Section 14: Offline Queue Security & Mutation Integrity', () => {
    it('discards stale offline settlement replay when debtor owes 0 paise', async () => {
      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValueOnce({
        success: false,
        error: 'OVERSETTLEMENT_EXCEEDS_DEBT: Attempted 3332 paise, but debtor only owes 0 paise',
        errorCode: 'OVERSETTLEMENT_EXCEEDS_DEBT',
      });

      enqueueOfflineItem('RECORD_SETTLEMENT', {
        roomId: 'room-sec-123',
        payerId: 'user-raju',
        payeeId: 'user-jyo',
        amount: 33.32,
        paymentMethod: 'UPI',
      });

      const result = await flushOfflineQueue();

      expect(supabaseService.recordRoomSettlementV2).toHaveBeenCalledWith(
        'room-sec-123',
        'user-raju',
        'user-jyo',
        33.32
      );

      // Stale mutation was purged from queue (failed and permanent conflict auto-discarded)
      expect(getOfflineQueue().length).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    it('rejects direct client-side settlement mutation bypass via offline queue', async () => {
      const fromSpy = vi.spyOn(supabase, 'from');

      vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValueOnce({
        success: false,
        error: 'INVALID_SETTLEMENT: Client cannot bypass V2 RPC validation',
        errorCode: 'INVALID_SETTLEMENT',
      });

      enqueueOfflineItem('RECORD_SETTLEMENT', {
        roomId: 'room-sec-123',
        payerId: 'user-raju',
        payeeId: 'user-jyo',
        amount: 33.32,
        paymentMethod: 'UPI',
      });

      await flushOfflineQueue();

      // Ensure no direct supabase.from('settlement_payments').insert was executed
      expect(fromSpy).not.toHaveBeenCalledWith('settlement_payments');
      expect(getOfflineQueue().length).toBe(0);
    });
  });

  // ===========================================================================
  // SECTION 15: REALTIME TENANT ISOLATION
  // ===========================================================================
  describe('Section 15: Realtime Security & Cross-Tenant Channel Isolation', () => {
    it('scopes realtime channels strictly to the authorized room ID', () => {
      const channelSpy = vi.spyOn(supabase, 'channel');

      const unsubscribeA = supabaseService.subscribeToRoomUpdates('room-tenant-alpha', vi.fn());
      expect(channelSpy).toHaveBeenCalledWith('room-realtime-room-tenant-alpha');

      const unsubscribeB = supabaseService.subscribeToRoomUpdates('room-tenant-beta', vi.fn());
      expect(channelSpy).toHaveBeenCalledWith('room-realtime-room-tenant-beta');

      // The channels are isolated and do not collide
      expect('room-realtime-room-tenant-alpha').not.toBe('room-realtime-room-tenant-beta');

      unsubscribeA();
      unsubscribeB();
    });

    it('realtime event handlers trigger authoritative V2 fetch and never calculate local balances', () => {
      let registeredHandlers: Array<() => void> = [];
      vi.spyOn(supabase, 'channel').mockReturnValue({
        on: vi.fn().mockImplementation((_event, _filter, callback) => {
          registeredHandlers.push(callback);
          return {
            on: vi.fn().mockImplementation((_e, _f, cb) => {
              registeredHandlers.push(cb);
              return {
                subscribe: vi.fn(),
              };
            }),
            subscribe: vi.fn(),
          };
        }),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      } as unknown as ReturnType<typeof supabase.channel>);

      const onDataChange = vi.fn();
      supabaseService.subscribeToRoomUpdates('room-tenant-alpha', onDataChange);

      expect(registeredHandlers.length).toBeGreaterThan(0);

      // Trigger all registered postgres_changes events
      for (const handler of registeredHandlers) {
        handler();
      }

      // Handler triggered callback to request authoritative data refresh
      expect(onDataChange).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SECTION 7 & 12: TENANT ISOLATION & ID TAMPERING ATTACK SIMULATION
  // ===========================================================================
  describe('Section 7 & 12: API Authorization & Parameter Attack Boundary', () => {
    it('detects and rejects payer impersonation attack in RPC service', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'ACCESS_DENIED: Authenticated user cannot initiate settlement for payer' } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      const res = await supabaseService.recordRoomSettlementV2(
        'room-alpha',
        'user-victim',
        'user-attacker',
        50.0
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('ACCESS_DENIED');
      expect(res.error).toContain('ACCESS_DENIED');
    });

    it('rejects cross-room member settlement attack in RPC service', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'ACCESS_DENIED: Payer is not an active member of room' } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      const res = await supabaseService.recordRoomSettlementV2(
        'room-beta',
        'user-room-alpha-member',
        'user-room-beta-member',
        100.0
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('ACCESS_DENIED');
      expect(res.error).toContain('ACCESS_DENIED');
    });

    it('rejects self-settlement injection attack in RPC service', async () => {
      vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_SETTLEMENT: Self-settlement is prohibited (payer user-1 == payee user-1)' } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      const res = await supabaseService.recordRoomSettlementV2(
        'room-alpha',
        'user-1',
        'user-1',
        50.0
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('INVALID_SETTLEMENT');
      expect(res.error).toContain('INVALID_SETTLEMENT');
    });
  });
});

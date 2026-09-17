import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  crashService,
  sanitizeDiagnosticText,
  sanitizeContext,
  isTransientNetworkError,
} from './crashService';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

vi.mock('@capacitor-firebase/crashlytics', () => ({
  FirebaseCrashlytics: {
    setEnabled: vi.fn().mockResolvedValue(undefined),
    setCustomKey: vi.fn().mockResolvedValue(undefined),
    setUserId: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    recordException: vi.fn().mockResolvedValue(undefined),
    crash: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Crashlytics Service & Privacy Sanitization Test Suite', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await crashService.init();
  });

  describe('1. Privacy & Redaction Sanitization', () => {
    it('redacts UPI IDs from diagnostic strings', () => {
      const input = 'Payment error occurred while sending to roommate.bob@okaxis on UPI';
      const output = sanitizeDiagnosticText(input);
      expect(output).toBe('Payment error occurred while sending to [REDACTED_UPI] on UPI');
    });

    it('redacts Indian phone numbers from diagnostic strings', () => {
      const input = 'Contact sync failed for phone number 9876543210 and +919123456789';
      const output = sanitizeDiagnosticText(input);
      expect(output).toContain('[REDACTED_PHONE]');
      expect(output).not.toContain('9876543210');
      expect(output).not.toContain('9123456789');
    });

    it('redacts Bearer tokens and JWTs from logs', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsK88';
      const input = `Auth failed with token Bearer secret_token_123 and JWT ${jwt}`;
      const output = sanitizeDiagnosticText(input);
      expect(output).toContain('Bearer [REDACTED_TOKEN]');
      expect(output).toContain('[REDACTED_JWT]');
      expect(output).not.toContain('secret_token_123');
    });

    it('sanitizes context objects by scrubbing forbidden keys', () => {
      const context = {
        safeComponent: 'RoomLedger',
        pin: '1234',
        amount: 850,
        upiId: 'john@ybl',
        token: 'auth_jwt_token',
      };
      const sanitized = sanitizeContext(context);
      expect(sanitized).toEqual({
        safeComponent: 'RoomLedger',
        pin: '[REDACTED]',
        amount: '[REDACTED]',
        upiId: '[REDACTED]',
        token: '[REDACTED]',
      });
    });
  });

  describe('2. Network Error Filter', () => {
    it('detects transient network disconnects and offline aborts', () => {
      expect(isTransientNetworkError(new Error('TypeError: Failed to fetch'))).toBe(true);
      expect(isTransientNetworkError(new Error('NetworkError when attempting to fetch resource'))).toBe(true);
      expect(isTransientNetworkError(new Error('AbortError: The user aborted a request.'))).toBe(true);
      expect(isTransientNetworkError(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe(true);
    });

    it('returns false for actual application anomalies', () => {
      expect(isTransientNetworkError(new Error('CryptoKey decryption failed: invalid padding'))).toBe(false);
      expect(isTransientNetworkError(new Error('Cannot read properties of undefined (reading "id")'))).toBe(false);
      expect(isTransientNetworkError(null)).toBe(false);
    });
  });

  describe('3. User Association & PII Guards', () => {
    it('associates clean internal user UUIDs', async () => {
      await crashService.setUserId('usr-resident-uuid-456');
      expect(FirebaseCrashlytics.setUserId).toHaveBeenCalledWith({
        userId: 'usr-resident-uuid-456',
      });
    });

    it('rejects email addresses as user identifiers to preserve privacy', async () => {
      await crashService.setUserId('student@university.edu');
      expect(FirebaseCrashlytics.setUserId).toHaveBeenCalledWith({ userId: '' });
    });

    it('rejects phone numbers as user identifiers to preserve privacy', async () => {
      await crashService.setUserId('9876543210');
      expect(FirebaseCrashlytics.setUserId).toHaveBeenCalledWith({ userId: '' });
    });

    it('clears user identifier upon signout', async () => {
      await crashService.setUserId(null);
      expect(FirebaseCrashlytics.setUserId).toHaveBeenCalledWith({ userId: '' });
    });
  });

  describe('4. Categorized Non-Fatal Error Reporting', () => {
    it('suppresses transient network errors from being logged as non-fatal crashes', async () => {
      await crashService.recordNonFatalError(
        'CLOUD_SYNC_CORRUPT',
        new Error('TypeError: Failed to fetch')
      );
      expect(FirebaseCrashlytics.recordException).not.toHaveBeenCalled();
    });

    it('records critical categorized non-fatal exceptions with sanitized context', async () => {
      const error = new Error('Vault decryption failure for pin 1234');
      await crashService.recordNonFatalError('VAULT_CRYPTO', error, {
        roomId: 'room-1',
        pin: '1234',
      });

      expect(FirebaseCrashlytics.setCustomKey).toHaveBeenCalledWith({
        key: 'diagnostic_category',
        value: 'VAULT_CRYPTO',
        type: 'string',
      });
      expect(FirebaseCrashlytics.log).toHaveBeenCalledWith({
        message: expect.stringContaining('pin: [REDACTED]'),
      });
      expect(FirebaseCrashlytics.recordException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Vault decryption failure'),
        })
      );
    });
  });

  describe('5. Diagnostic Test Mechanisms', () => {
    it('records diagnostic non-fatal test error without terminating app', async () => {
      await crashService.testNonFatalError();
      expect(FirebaseCrashlytics.recordException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'RoomMate Verified Diagnostic Non-Fatal Test',
        })
      );
    });

    it('triggers native controlled test crash when requested', async () => {
      await crashService.testCrash();
      expect(FirebaseCrashlytics.crash).toHaveBeenCalledWith({
        message: 'RoomMate Crashlytics Controlled Test Crash',
      });
    });
  });
});

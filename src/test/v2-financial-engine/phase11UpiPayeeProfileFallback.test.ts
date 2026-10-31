import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validatePayeeUpi,
  buildDynamicUpiUri,
  generateDynamicUpiQrCode,
  checkNudgeCooldown,
  recordNudgeSent,
  dispatchUpiNudgeNotification,
  buildWhatsAppNudgeUrl,
} from '../../lib/payments/upiProfileService';
import { User } from '../../types';
import * as cloudAdapter from '../../lib/storage/cloudStorageAdapter';

describe('Phase 11: Option B — Payee-Profile-First UPI Settle & Nudge Safeguards', () => {
  const userPayer: User = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Alice Payer',
    email: 'alice@example.com',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const userPayeeWithUpi: User = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bob Payee',
    email: 'bob@example.com',
    phone: '9876543210',
    upiId: 'bob.payee@okaxis',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const userPayeeWithoutUpi: User = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Charlie Roomie',
    email: 'charlie@example.com',
    phone: '9123456780',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const userPayeeWithInvalidUpi: User = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Dave Invalid',
    email: 'dave@example.com',
    upiId: 'not-a-valid-upi-handle',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  };

  const roomId = 'room-101-test';
  const roomName = 'Apartment 4B';
  const roomMemberIds = [userPayer.id, userPayeeWithUpi.id, userPayeeWithoutUpi.id];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Payee Profile Validation & Strict Fallback (No Fake VPAs)', () => {
    it('validates a payee with a legitimate NPCI UPI ID', () => {
      const status = validatePayeeUpi(userPayeeWithUpi);
      expect(status.hasValidUpi).toBe(true);
      expect(status.upiId).toBe('bob.payee@okaxis');
      expect(status.error).toBeUndefined();
    });

    it('rejects a payee who has not configured a UPI ID without synthesizing dummy VPAs', () => {
      const status = validatePayeeUpi(userPayeeWithoutUpi);
      expect(status.hasValidUpi).toBe(false);
      expect(status.upiId).toBeUndefined();
      expect(status.error).toBe("Your roommate hasn't added a UPI ID yet.");
    });

    it('rejects a payee with an invalid or malformed UPI ID format', () => {
      const status = validatePayeeUpi(userPayeeWithInvalidUpi);
      expect(status.hasValidUpi).toBe(false);
      expect(status.error).toContain('UPI ID must contain "@"');
    });

    it('handles missing or undefined payee gracefully', () => {
      const status = validatePayeeUpi(undefined);
      expect(status.hasValidUpi).toBe(false);
      expect(status.error).toBe('Recipient roommate not found.');
    });
  });

  describe('2. Dynamic NPCI UPI URI & Offline QR Generation', () => {
    it('constructs an accurate, properly escaped NPCI UPI URI', () => {
      const { uri, error } = buildDynamicUpiUri({
        upiId: 'bob.payee@okaxis',
        payeeName: 'Bob Payee',
        amount: 250.5,
        roomName: 'Apartment 4B',
        transactionRef: 'CF-2026-TEST-1',
      });

      expect(error).toBeUndefined();
      expect(uri).toContain('upi://pay?');
      expect(uri).toContain('pa=bob.payee@okaxis');
      expect(uri).toContain('pn=Bob%20Payee');
      expect(uri).toContain('am=250.50');
      expect(uri).toContain('cu=INR');
      expect(uri).toContain('tn=Apartment_4B_Settlement');
      expect(uri).toContain('tr=CF-2026-TEST-1');
    });

    it('rejects invalid, negative, or zero amounts for UPI URI generation', () => {
      const resZero = buildDynamicUpiUri({
        upiId: 'bob.payee@okaxis',
        payeeName: 'Bob',
        amount: 0,
      });
      expect(resZero.error).toBe('Settlement amount must be greater than zero.');
      expect(resZero.uri).toBe('');

      const resNegative = buildDynamicUpiUri({
        upiId: 'bob.payee@okaxis',
        payeeName: 'Bob',
        amount: -50,
      });
      expect(resNegative.error).toBe('Settlement amount must be greater than zero.');
    });

    it('generates an offline scannable base64 QR data URL locally', async () => {
      const { dataUrl, error } = await generateDynamicUpiQrCode({
        upiId: 'bob.payee@okaxis',
        payeeName: 'Bob Payee',
        amount: 150,
        roomName: 'Apartment 4B',
      });

      expect(error).toBeUndefined();
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('fails safely when generating QR code for a payee without a UPI ID', async () => {
      const { dataUrl, error } = await generateDynamicUpiQrCode({
        upiId: '',
        payeeName: 'Charlie',
        amount: 100,
      });

      expect(dataUrl).toBe('');
      expect(error).toBe('Cannot generate UPI URI without a valid UPI ID.');
    });
  });

  describe('3. Dual Dispatch Nudge: In-App Notification + WhatsApp Reminder', () => {
    it('dispatches an in-app notification when roommate lacks UPI ID', async () => {
      const spy = vi.spyOn(cloudAdapter, 'createInAppNotificationCloud').mockResolvedValue({
        id: 'notif-1',
        userId: userPayeeWithoutUpi.id,
        type: 'SETTLEMENT_REMINDER',
        title: 'Add UPI ID for Room Settlement',
        message: 'Alice wants to settle',
        priority: 'HIGH',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      const res = await dispatchUpiNudgeNotification({
        payerId: userPayer.id,
        payerName: userPayer.name,
        payeeId: userPayeeWithoutUpi.id,
        payeeName: userPayeeWithoutUpi.name,
        amount: 320,
        roomId,
        roomName,
        roomMemberIds,
        cooldownSeconds: 300,
      });

      expect(res.success).toBe(true);
      expect(res.message).toBe('In-app reminder sent to Charlie Roomie!');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userPayeeWithoutUpi.id,
          type: 'SETTLEMENT_REMINDER',
          priority: 'HIGH',
          actionType: 'UPDATE_UPI',
          actionTarget: 'settings/upi',
        })
      );
    });

    it('enforces cooldown to prevent notification spamming', async () => {
      recordNudgeSent(userPayer.id, userPayeeWithoutUpi.id);

      const res = await dispatchUpiNudgeNotification({
        payerId: userPayer.id,
        payerName: userPayer.name,
        payeeId: userPayeeWithoutUpi.id,
        payeeName: userPayeeWithoutUpi.name,
        amount: 320,
        roomId,
        roomName,
        roomMemberIds,
        cooldownSeconds: 300,
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain('Please wait');
      expect(res.cooldownSecondsRemaining).toBeGreaterThan(0);
    });

    it('rejects unauthorized notification dispatch to a user outside the active room', async () => {
      const res = await dispatchUpiNudgeNotification({
        payerId: userPayer.id,
        payerName: userPayer.name,
        payeeId: 'outsider-user-id',
        payeeName: 'Eve Outsider',
        amount: 500,
        roomId,
        roomName,
        roomMemberIds,
      });

      expect(res.success).toBe(false);
      expect(res.message).toContain('Unauthorized');
    });

    it('rejects self-nudging', async () => {
      const res = await dispatchUpiNudgeNotification({
        payerId: userPayer.id,
        payerName: userPayer.name,
        payeeId: userPayer.id,
        payeeName: userPayer.name,
        amount: 100,
        roomId,
        roomName,
        roomMemberIds,
      });

      expect(res.success).toBe(false);
      expect(res.message).toBe('Cannot nudge yourself to add a UPI ID.');
    });

    it('formats a respectful WhatsApp reminder URL with prefilled editable text without auto-launching', () => {
      const url = buildWhatsAppNudgeUrl({
        payeePhone: '9876543210',
        payeeName: 'Charlie Roomie',
        payerName: 'Alice',
        amount: 250,
        roomName: 'Apartment 4B',
      });

      expect(url).toContain('https://wa.me/919876543210?text=');
      expect(url).toContain('Charlie');
      expect(url).toContain('Apartment%204B');
      expect(url).toContain('250.00');
      expect(url).toContain('Edit%20UPI%20ID');
    });
  });

  describe('4. Rate Limiting & Cooldown Unit Verifications', () => {
    it('allows nudging when no prior nudge has been sent', () => {
      const status = checkNudgeCooldown('payer-new', 'payee-new', 300);
      expect(status.canNudge).toBe(true);
      expect(status.remainingSeconds).toBe(0);
    });

    it('correctly reports cooldown status immediately after recording a nudge', () => {
      recordNudgeSent('p1', 'p2');
      const status = checkNudgeCooldown('p1', 'p2', 300);
      expect(status.canNudge).toBe(false);
      expect(status.remainingSeconds).toBeGreaterThan(290);
    });
  });
});

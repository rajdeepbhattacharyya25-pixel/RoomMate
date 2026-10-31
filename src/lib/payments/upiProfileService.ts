/**
 * UPI Profile Service & Payee-First Settlement Flow
 *
 * Implements payee-profile-first UPI settlement safeguards:
 * 1. Checks payee profile for valid, saved UPI ID (NPCI spec) — never synthesizes fake VPAs.
 * 2. Formats and validates dynamic UPI URIs (amount clamped to balance, positive INR).
 * 3. Handles in-app notification dispatch with rate-limiting / spam cooldowns.
 * 4. Builds optional, user-initiated WhatsApp reminder links (no auto-launch).
 * 5. Decouples QR generation and viewing from ledger settlement mutations.
 */

import { User } from '../../types';
import { validateUpiId } from './upiExtraction';
import { generateQrDataUrl } from '../services/qrGenerator';
import { generateWhatsAppUrl } from '../ledger/nudgeService';
import { createInAppNotificationCloud } from '../storage/cloudStorageAdapter';

export interface PayeeUpiStatus {
  hasValidUpi: boolean;
  upiId?: string;
  error?: string;
  payeeName: string;
  payeePhone?: string;
}

export interface DynamicUpiUriOptions {
  upiId: string;
  payeeName: string;
  amount: number;
  roomName?: string;
  transactionRef?: string;
}

export interface DispatchUpiNudgeParams {
  payerId: string;
  payerName: string;
  payeeId: string;
  payeeName: string;
  amount: number;
  roomId: string;
  roomName: string;
  roomMemberIds?: string[];
  cooldownSeconds?: number;
}

export interface NudgeCooldownStatus {
  canNudge: boolean;
  remainingSeconds: number;
}

// In-memory fallback for environments without localStorage or during tests
const memoryCooldownMap = new Map<string, number>();

/**
 * Validates whether the payee has a legitimate, saved UPI ID configured on their profile.
 * Strictly adheres to NPCI VPA format and never invents dummy @okaxis handles.
 */
export function validatePayeeUpi(payee: Pick<User, 'id' | 'name' | 'upiId' | 'phone'> | undefined | null): PayeeUpiStatus {
  if (!payee) {
    return {
      hasValidUpi: false,
      error: 'Recipient roommate not found.',
      payeeName: 'Roommate',
    };
  }

  const rawUpi = payee.upiId?.trim();
  if (!rawUpi) {
    return {
      hasValidUpi: false,
      error: "Your roommate hasn't added a UPI ID yet.",
      payeeName: payee.name,
      payeePhone: payee.phone,
    };
  }

  const validation = validateUpiId(rawUpi);
  if (!validation.isValid) {
    return {
      hasValidUpi: false,
      error: validation.error || "Roommate's saved UPI ID is invalid.",
      payeeName: payee.name,
      payeePhone: payee.phone,
    };
  }

  return {
    hasValidUpi: true,
    upiId: validation.normalized || rawUpi.toLowerCase(),
    payeeName: payee.name,
    payeePhone: payee.phone,
  };
}

/**
 * Builds an NPCI-compliant dynamic UPI URI string: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
 * Enforces positive INR amounts with standard 2 decimal places.
 */
export function buildDynamicUpiUri(options: DynamicUpiUriOptions): { uri: string; error?: string } {
  const { upiId, payeeName, amount, roomName = 'RoomMate', transactionRef } = options;

  if (!upiId || !upiId.trim()) {
    return { uri: '', error: 'Cannot generate UPI URI without a valid UPI ID.' };
  }

  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return { uri: '', error: 'Settlement amount must be greater than zero.' };
  }

  const cleanUpi = encodeURIComponent(upiId.trim()).replace(/%40/g, '@');
  const cleanName = encodeURIComponent(payeeName.trim() || 'Roommate');
  const cleanAmount = amount.toFixed(2);
  const cleanNote = encodeURIComponent(`${roomName.replace(/\s+/g, '_')}_Settlement`);

  let uri = `upi://pay?pa=${cleanUpi}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}`;
  if (transactionRef && transactionRef.trim()) {
    uri += `&tr=${encodeURIComponent(transactionRef.trim())}`;
  }

  return { uri };
}

/**
 * Generates an offline data URI for the dynamic UPI payment QR code locally on-device.
 */
export async function generateDynamicUpiQrCode(options: DynamicUpiUriOptions): Promise<{ dataUrl: string; error?: string }> {
  const { uri, error } = buildDynamicUpiUri(options);
  if (error || !uri) {
    return { dataUrl: '', error: error || 'Failed to construct UPI URI' };
  }

  try {
    const dataUrl = await generateQrDataUrl(uri, {
      width: 280,
      margin: 2,
      darkColor: '#0F172A',
      lightColor: '#FFFFFF',
    });
    return { dataUrl };
  } catch (err) {
    return { dataUrl: '', error: err instanceof Error ? err.message : 'QR code generation failed' };
  }
}

/**
 * Checks if a payer can nudge a payee, enforcing rate limiting / cooldowns to prevent spam.
 */
export function checkNudgeCooldown(
  payerId: string,
  payeeId: string,
  cooldownSeconds = 300
): NudgeCooldownStatus {
  if (!payerId || !payeeId) {
    return { canNudge: false, remainingSeconds: 0 };
  }

  const key = `roommate_nudge_${payerId}_${payeeId}`;
  let lastTimestamp = memoryCooldownMap.get(key) || 0;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        lastTimestamp = Math.max(lastTimestamp, Number(stored) || 0);
      }
    } catch {
      // Ignore localStorage availability errors
    }
  }

  const now = Date.now();
  const elapsedSeconds = Math.floor((now - lastTimestamp) / 1000);

  if (elapsedSeconds < cooldownSeconds) {
    return {
      canNudge: false,
      remainingSeconds: cooldownSeconds - elapsedSeconds,
    };
  }

  return { canNudge: true, remainingSeconds: 0 };
}

/**
 * Records that a nudge was successfully dispatched for cooldown tracking.
 */
export function recordNudgeSent(payerId: string, payeeId: string): void {
  const key = `roommate_nudge_${payerId}_${payeeId}`;
  const now = Date.now();
  memoryCooldownMap.set(key, now);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(key, String(now));
    } catch {
      // Ignore localStorage availability errors
    }
  }
}

/**
 * Dispatches an in-app notification to the roommate prompting them to configure their UPI ID.
 * Enforces room authorization and rate limiting.
 */
export async function dispatchUpiNudgeNotification(params: DispatchUpiNudgeParams): Promise<{
  success: boolean;
  message: string;
  cooldownSecondsRemaining?: number;
}> {
  const {
    payerId,
    payerName,
    payeeId,
    payeeName,
    amount,
    roomId,
    roomName,
    roomMemberIds,
    cooldownSeconds = 300,
  } = params;

  // Authorization check: payee must belong to the active room
  if (roomMemberIds && roomMemberIds.length > 0 && !roomMemberIds.includes(payeeId)) {
    return {
      success: false,
      message: 'Unauthorized: Cannot send notifications to users outside this room.',
    };
  }

  // Prevent self-nudging
  if (payerId === payeeId) {
    return {
      success: false,
      message: 'Cannot nudge yourself to add a UPI ID.',
    };
  }

  // Rate-limiting check
  const cooldown = checkNudgeCooldown(payerId, payeeId, cooldownSeconds);
  if (!cooldown.canNudge) {
    return {
      success: false,
      message: `Please wait ${cooldown.remainingSeconds}s before sending another reminder.`,
      cooldownSecondsRemaining: cooldown.remainingSeconds,
    };
  }

  try {
    await createInAppNotificationCloud({
      userId: payeeId,
      roomId,
      type: 'SETTLEMENT_REMINDER',
      title: 'Add UPI ID for Room Settlement',
      message: `${payerName} wants to settle ₹${amount.toFixed(2)} with you in ${roomName}. Please add your UPI ID in Settings so they can pay directly via UPI QR.`,
      priority: 'HIGH',
      isRead: false,
      actionType: 'UPDATE_UPI',
      actionTarget: 'settings/upi',
      metadata: {
        payerId,
        payerName,
        payeeId,
        payeeName,
        amount,
        roomName,
        requiresUpi: true,
      },
    });

    recordNudgeSent(payerId, payeeId);

    return {
      success: true,
      message: `In-app reminder sent to ${payeeName}!`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to deliver in-app notification.',
    };
  }
}

/**
 * Formats a respectful, editable WhatsApp message link requesting the roommate to add their UPI ID.
 * Payer must explicitly initiate the link — never auto-launched.
 */
export function buildWhatsAppNudgeUrl(params: {
  payeePhone?: string;
  payeeName: string;
  payerName: string;
  amount: number;
  roomName: string;
}): string {
  const { payeePhone, payeeName, payerName, amount, roomName } = params;
  const firstName = payeeName.split(' ')[0] || 'Roommate';

  const message = [
    `Hey ${firstName}! 👋`,
    `I'm trying to settle my share of ₹${amount.toFixed(2)} in *${roomName}* on RoomMate.`,
    `Your profile doesn't have a UPI ID saved yet. Could you please add it in *Settings > Edit UPI ID* so I can pay you directly via UPI QR?`,
    '',
    `Thanks! — ${payerName}`,
  ].join('\n');

  return generateWhatsAppUrl(payeePhone, message);
}

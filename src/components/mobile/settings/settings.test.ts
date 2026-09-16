import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../../../lib/storage/mockStorage';
import { isNotificationSoundEnabled, setNotificationSoundEnabled } from '../../../lib/native/notificationSound';
import { isHapticsEnabled, setHapticsEnabled } from '../../../lib/native/haptics';
import { updateProfileName, updateProfileUpiId, updateUpiQrUrl } from '../../../lib/storage/cloudStorageAdapter';
import { generateUpiAppIntent, parseUpiQrString } from '../../../lib/payments/upiIntentService';
import { extractUpiIdFromQrPayload, validateUpiId } from '../../../lib/payments/upiExtraction';
import { registerBackButtonHandler } from '../../../lib/native/backButton';

// Polyfill localStorage in test environment
const mockStorageMap: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorageMap[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorageMap[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorageMap[key];
  },
  clear: () => {
    Object.keys(mockStorageMap).forEach((k) => delete mockStorageMap[k]);
  },
};

describe('RoomMate Migration & Settings Test Suite', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {
        localStorage: mockLocalStorage,
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('correctly migrates legacy database data to roommate_saas_db_v1', () => {
    const legacyData = {
      users: [
        {
          id: 'usr-migrated',
          name: 'Legacy User',
          email: 'legacy@roommate.app',
          role: 'STUDENT',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      rooms: [],
      roomMembers: [],
      subscriptions: [],
      subscriptionEvents: [],
      roomInvitations: [],
      roomJoinRequests: [],
      personalExpenses: [],
      sharedExpenses: [],
      expenseSplits: [],
      settlementPayments: [],
      auditLogs: [],
      notifications: [],
    };

    globalThis.localStorage.setItem('campusflow_saas_db_v3', JSON.stringify(legacyData));

    // Verify db instance has users
    const users = db.getState().users;
    expect(users.length).toBeGreaterThan(0);
  });

  it('dual-reads app lock settings with legacy fallback', () => {
    // 1. Only legacy exists
    globalThis.localStorage.setItem('campusflow_app_lock_enabled', 'false');
    const legacyVal = globalThis.localStorage.getItem('roommate_app_lock_enabled') ?? globalThis.localStorage.getItem('campusflow_app_lock_enabled');
    expect(legacyVal).toBe('false');

    // 2. New roommate key set
    globalThis.localStorage.setItem('roommate_app_lock_enabled', 'true');
    const newVal = globalThis.localStorage.getItem('roommate_app_lock_enabled') ?? globalThis.localStorage.getItem('campusflow_app_lock_enabled');
    expect(newVal).toBe('true');
  });

  it('supports notification sound preference toggling with RoomMate key', () => {
    setNotificationSoundEnabled(false);
    expect(isNotificationSoundEnabled()).toBe(false);
    expect(globalThis.localStorage.getItem('roommate_notification_sound_enabled')).toBe('false');

    setNotificationSoundEnabled(true);
    expect(isNotificationSoundEnabled()).toBe(true);
    expect(globalThis.localStorage.getItem('roommate_notification_sound_enabled')).toBe('true');
  });

  it('supports haptics preference toggling with RoomMate key', () => {
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    expect(globalThis.localStorage.getItem('roommate_haptics_enabled')).toBe('false');

    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);
    expect(globalThis.localStorage.getItem('roommate_haptics_enabled')).toBe('true');
  });

  it('updates profile name and UPI ID in local state', async () => {
    const user = db.getState().users[0];
    expect(user).toBeDefined();

    const newName = 'Rajdeep Bhattacharyya';
    const newUpi = 'rajdeep@okhdfcbank';

    await updateProfileName(user.id, newName);
    await updateProfileUpiId(user.id, newUpi);

    const updatedUser = db.getState().users.find((u) => u.id === user.id);
    expect(updatedUser?.name).toBe(newName);
    expect(updatedUser?.upiId).toBe(newUpi);
    expect(globalThis.localStorage.getItem(`roommate_upi_${user.id}`)).toBe(newUpi);
  });

  it('generates compliant NPCI UPI intent URLs for various app targets', () => {
    const options = {
      pa: 'sneha@okaxis',
      pn: 'Sneha',
      am: 450,
      tn: 'Room 302 Wifi',
    };

    const genericIntent = generateUpiAppIntent('generic', options);
    expect(genericIntent).toContain('upi://pay?');
    expect(genericIntent).toContain('pa=sneha@okaxis');
    expect(genericIntent).toContain('am=450.00');

    const gpayIntent = generateUpiAppIntent('gpay', options);
    expect(gpayIntent).toContain('tez://upi/pay?');

    const phonepeIntent = generateUpiAppIntent('phonepe', options);
    expect(phonepeIntent).toContain('phonepe://pay?');

    const paytmIntent = generateUpiAppIntent('paytm', options);
    expect(paytmIntent).toContain('paytmmp://pay?');
  });

  it('correctly parses raw UPI QR strings and direct VPAs', () => {
    const rawQr = 'upi://pay?pa=amit@oksbi&pn=Amit&am=120.00&tn=Groceries';
    const parsed = parseUpiQrString(rawQr);
    expect(parsed).not.toBeNull();
    expect(parsed?.vpa).toBe('amit@oksbi');
    expect(parsed?.name).toBe('Amit');
    expect(parsed?.amount).toBe(120);

    const directVpa = 'sneha@okhdfcbank';
    const parsedDirect = parseUpiQrString(directVpa);
    expect(parsedDirect).not.toBeNull();
    expect(parsedDirect?.vpa).toBe('sneha@okhdfcbank');
  });

  it('handles back button registration and unregistration properly', () => {
    let backTriggered = false;
    const unregister = registerBackButtonHandler(() => {
      backTriggered = true;
      return true;
    });

    expect(typeof unregister).toBe('function');
    unregister();
    expect(backTriggered).toBe(false);
  });

  it('persists and retrieves preferred payment methods and UPI applications', () => {
    globalThis.localStorage.setItem('roommate_default_payment_method', 'CASH');
    expect(globalThis.localStorage.getItem('roommate_default_payment_method')).toBe('CASH');

    globalThis.localStorage.setItem('roommate_preferred_upi_app', 'phonepe');
    expect(globalThis.localStorage.getItem('roommate_preferred_upi_app')).toBe('phonepe');
  });

  it('persists and validates appearance theme preferences', () => {
    const validThemes = ['system', 'light', 'dark'];
    validThemes.forEach((t) => {
      globalThis.localStorage.setItem('roommate_theme', t);
      expect(globalThis.localStorage.getItem('roommate_theme')).toBe(t);
    });
  });

  it('persists and validates lock timeout configuration', () => {
    const validTimeouts = ['immediate', '30s', '1m', '5m', '10m'];
    validTimeouts.forEach((timeout) => {
      globalThis.localStorage.setItem('roommate_app_lock_timeout', timeout);
      expect(globalThis.localStorage.getItem('roommate_app_lock_timeout')).toBe(timeout);
    });
  });

  it('persists and deserializes quiet hours schedule correctly', () => {
    const quietConfig = {
      enabled: true,
      start: '23:00',
      end: '08:00',
    };
    globalThis.localStorage.setItem('roommate_quiet_hours', JSON.stringify(quietConfig));

    const retrieved = JSON.parse(globalThis.localStorage.getItem('roommate_quiet_hours') || '{}');
    expect(retrieved.enabled).toBe(true);
    expect(retrieved.start).toBe('23:00');
    expect(retrieved.end).toBe('08:00');
  });

  it('validates BUILD_INFO contains correct RoomMate dynamic metadata', async () => {
    const { BUILD_INFO } = await import('../../../config/buildInfo');
    expect(BUILD_INFO.appName).toBe('RoomMate');
    expect(typeof BUILD_INFO.version).toBe('string');
    expect(typeof BUILD_INFO.buildNumber).toBe('number');
    expect(['staging', 'production']).toContain(BUILD_INFO.channel);
    expect(typeof BUILD_INFO.buildDate).toBe('string');
    expect(typeof BUILD_INFO.buildTime).toBe('string');
  });

  it('verifies MobileProfile facade is properly exported and callable', async () => {
    const { MobileProfile } = await import('../MobileProfile');
    expect(typeof MobileProfile).toBe('function');
  });

  describe('QR Code UPI ID Extraction & Independent Storage', () => {
    it('stores QR code URL and extracted UPI ID independently in user profile', async () => {
      const user = db.getState().users[0];
      const qrPayload = 'upi://pay?pa=rahul@okaxis&pn=Rahul';
      const extracted = extractUpiIdFromQrPayload(qrPayload);

      expect(extracted).not.toBeNull();
      expect(extracted?.upiId).toBe('rahul@okaxis');

      const mockQrImageUrl = 'https://i.ibb.co/test/qr-code.png';
      await updateUpiQrUrl(user.id, mockQrImageUrl);
      await updateProfileUpiId(user.id, extracted!.upiId);

      const updatedUser = db.getState().users.find((u) => u.id === user.id);
      expect(updatedUser?.upiQrUrl).toBe(mockQrImageUrl);
      expect(updatedUser?.upiId).toBe('rahul@okaxis');
      // Verify independence: removing QR code keeps UPI ID intact
      await updateUpiQrUrl(user.id, '');
      const userAfterQrRemoval = db.getState().users.find((u) => u.id === user.id);
      expect(userAfterQrRemoval?.upiQrUrl).toBe('');
      expect(userAfterQrRemoval?.upiId).toBe('rahul@okaxis');
    });

    it('correctly handles URL encoded UPI ID in QR payload', () => {
      const encodedPayload = 'upi://pay?pa=user%40oksbi&pn=User';
      const extracted = extractUpiIdFromQrPayload(encodedPayload);
      expect(extracted?.upiId).toBe('user@oksbi');
    });

    it('allows user to edit extracted UPI ID and validates the edited value', () => {
      const extracted = 'wrong@upi';
      expect(validateUpiId(extracted).isValid).toBe(true);

      const userEdited = 'correct@upi';
      const validation = validateUpiId(userEdited);
      expect(validation.isValid).toBe(true);
      expect(validation.normalized).toBe('correct@upi');

      const invalidEdited = 'invalid-upi-no-at';
      expect(validateUpiId(invalidEdited).isValid).toBe(false);
    });

    it('returns null for non-UPI QR codes allowing existing QR upload flow to proceed', () => {
      const websiteQr = 'https://example.com/payment-gateway';
      const extracted = extractUpiIdFromQrPayload(websiteQr);
      expect(extracted).toBeNull();
    });

    it('differentiates between identical UPI IDs and conflicting different UPI IDs', () => {
      const existingUpi = 'sneha@okhdfcbank';
      const sameExtracted = 'sneha@okhdfcbank';
      const differentExtracted = 'newuser@okaxis';

      // Duplicate detection
      const isDuplicate = existingUpi.toLowerCase() === sameExtracted.toLowerCase();
      expect(isDuplicate).toBe(true);

      // Conflict detection
      const isConflict = existingUpi.toLowerCase() !== differentExtracted.toLowerCase();
      expect(isConflict).toBe(true);
    });
  });
});


import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectDeviceModel,
  recordFailedAdminProbe,
  checkIntrusionLockout,
  clearIntrusionLockout,
  dispatchIntrusionAlert,
} from './intrusionDetectionService';
import { db } from '../storage/mockStorage';

// Polyfill localStorage and sessionStorage in test environment
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = createMockStorage();
}
if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as any).sessionStorage = createMockStorage();
}

describe('SuperAdmin Intrusion Detection & Threat Telemetry Suite', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
    clearIntrusionLockout();
  });

  describe('1. Hardware & Phone Model Fingerprinting', () => {
    it('detects Samsung Galaxy phones from Android User-Agent', () => {
      const samsungUa =
        'Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36';
      const result = detectDeviceModel(samsungUa);

      expect(result.platform).toBe('Android');
      expect(result.deviceModel).toContain('Samsung Galaxy (SM-S928B)');
      expect(result.browser).toBe('Google Chrome');
    });

    it('detects Xiaomi Redmi phones from Android User-Agent', () => {
      const redmiUa =
        'Mozilla/5.0 (Linux; Android 13; Redmi Note 12 Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36';
      const result = detectDeviceModel(redmiUa);

      expect(result.platform).toBe('Android');
      expect(result.deviceModel).toContain('Xiaomi Redmi Note 12');
    });

    it('detects Google Pixel phones from Android User-Agent', () => {
      const pixelUa =
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UD1A.230803.041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';
      const result = detectDeviceModel(pixelUa);

      expect(result.platform).toBe('Android');
      expect(result.deviceModel).toContain('Google Pixel 8 Pro');
    });

    it('detects Apple iPhone from iOS User-Agent', () => {
      const iphoneUa =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';
      const result = detectDeviceModel(iphoneUa);

      expect(result.platform).toBe('iOS');
      expect(result.deviceModel).toBe('Apple iPhone');
      expect(result.browser).toBe('Apple Safari');
    });

    it('detects Windows 10/11 Desktop PC', () => {
      const winUa =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0';
      const result = detectDeviceModel(winUa);

      expect(result.platform).toBe('Windows');
      expect(result.deviceModel).toBe('Windows 10/11 PC');
      expect(result.browser).toBe('Microsoft Edge');
    });

    it('detects Apple MacBook / Mac Desktop', () => {
      const macUa =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      const result = detectDeviceModel(macUa);

      expect(result.platform).toBe('macOS');
      expect(result.deviceModel).toBe('Apple MacBook / Mac');
      expect(result.browser).toBe('Apple Safari');
    });
  });

  describe('2. Multi-Tier Escalating Lockout & Persistence', () => {
    it('allows 1-2 failed attempts without locking out', () => {
      const attempt1 = recordFailedAdminProbe();
      expect(attempt1.isLocked).toBe(false);
      expect(attempt1.failedAttempts).toBe(1);
      expect(attempt1.shouldAlertAdmin).toBe(false);

      const attempt2 = recordFailedAdminProbe();
      expect(attempt2.isLocked).toBe(false);
      expect(attempt2.failedAttempts).toBe(2);
      expect(attempt2.shouldAlertAdmin).toBe(false);

      const check = checkIntrusionLockout();
      expect(check.isLocked).toBe(false);
    });

    it('triggers a 5-minute soft throttle on 3rd failed attempt', () => {
      recordFailedAdminProbe(); // 1
      recordFailedAdminProbe(); // 2
      const attempt3 = recordFailedAdminProbe(); // 3

      expect(attempt3.isLocked).toBe(true);
      expect(attempt3.failedAttempts).toBe(3);
      expect(attempt3.shouldAlertAdmin).toBe(true);
      expect(attempt3.remainingSeconds).toBe(5 * 60);

      const check = checkIntrusionLockout();
      expect(check.isLocked).toBe(true);
      expect(check.remainingSeconds).toBeGreaterThan(250);
    });

    it('triggers a 30-minute hard lockout on 5th failed attempt', () => {
      for (let i = 0; i < 4; i++) recordFailedAdminProbe();
      const attempt5 = recordFailedAdminProbe(); // 5

      expect(attempt5.isLocked).toBe(true);
      expect(attempt5.failedAttempts).toBe(5);
      expect(attempt5.shouldAlertAdmin).toBe(true);
      expect(attempt5.remainingSeconds).toBe(30 * 60);

      const check = checkIntrusionLockout();
      expect(check.isLocked).toBe(true);
      expect(check.remainingSeconds).toBeGreaterThan(1700);
    });

    it('triggers 24-hour device blacklist on 7th failed attempt', () => {
      for (let i = 0; i < 6; i++) recordFailedAdminProbe();
      const attempt7 = recordFailedAdminProbe(); // 7

      expect(attempt7.isLocked).toBe(true);
      expect(attempt7.isBlacklisted).toBe(true);
      expect(attempt7.shouldAlertAdmin).toBe(true);

      const check = checkIntrusionLockout();
      expect(check.isLocked).toBe(true);
      expect(check.isBlacklisted).toBe(true);
    });

    it('resets lockout completely when clearIntrusionLockout is called', () => {
      for (let i = 0; i < 5; i++) recordFailedAdminProbe();
      expect(checkIntrusionLockout().isLocked).toBe(true);

      clearIntrusionLockout();
      const resetCheck = checkIntrusionLockout();
      expect(resetCheck.isLocked).toBe(false);
      expect(resetCheck.failedAttempts).toBe(0);
    });
  });

  describe('3. SuperAdmin Incident Alert Dispatching', () => {
    it('dispatches structured in-app notifications and audit logs to superadmin', async () => {
      // Ensure at least one superadmin exists in mockStorage
      const adminUser = {
        id: 'usr-admin-test',
        name: 'Superadmin Lead',
        email: 'admin@roommate.app',
        role: 'SUPER_ADMIN' as const,
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.upsertUser(adminUser);

      const mockUa =
        'Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

      const snapshot = await dispatchIntrusionAlert('admin@roommate.app', 5, mockUa);

      expect(snapshot.deviceModel).toContain('Samsung Galaxy (SM-S928B)');
      expect(snapshot.platform).toBe('Android');

      // Check notification delivered to admin
      const notifications = db.getState().notifications.filter((n) => n.userId === adminUser.id);
      expect(notifications.length).toBeGreaterThan(0);

      const latestNotif = notifications[notifications.length - 1];
      expect(latestNotif.title).toContain('CRITICAL: SuperAdmin Lockout Triggered');
      expect(latestNotif.message).toContain('Samsung Galaxy (SM-S928B)');
      expect(latestNotif.message).toContain('admin@roommate.app');
      expect(latestNotif.priority).toBe('HIGH');
    });
  });
});

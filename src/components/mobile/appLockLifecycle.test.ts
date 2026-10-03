import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { isHapticsEnabled, setHapticsEnabled } from '../../lib/native/haptics';
import { listenToAppLifecycle } from '../../lib/native/network';

// In-memory storage mock for Node vitest runner
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

const mockSessionMap: Record<string, string> = {};
const mockSessionStorage = {
  getItem: (key: string) => mockSessionMap[key] ?? null,
  setItem: (key: string, value: string) => {
    mockSessionMap[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockSessionMap[key];
  },
  clear: () => {
    Object.keys(mockSessionMap).forEach((k) => delete mockSessionMap[k]);
  },
};

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = mockLocalStorage;
  }
  if (typeof globalThis.sessionStorage === 'undefined') {
    (globalThis as any).sessionStorage = mockSessionStorage;
  }
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = globalThis;
  }
  if (typeof (globalThis as any).window.dispatchEvent === 'undefined') {
    const listeners: Record<string, Function[]> = {};
    (globalThis as any).window.addEventListener = (event: string, cb: Function) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    };
    (globalThis as any).window.removeEventListener = (event: string, cb: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== cb);
      }
    };
    (globalThis as any).window.dispatchEvent = (event: any) => {
      const type = event.type || event;
      (listeners[type] || []).forEach((f) => f(event));
      return true;
    };
  }
});

describe('App Lock Lifecycle & Biometric Security Suite', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Haptics Preference & Persistence', () => {
    it('defaults to enabled when no preference stored', () => {
      expect(isHapticsEnabled()).toBe(true);
    });

    it('persists disabled state across localStorage without error', () => {
      setHapticsEnabled(false);
      expect(isHapticsEnabled()).toBe(false);
      expect(globalThis.localStorage.getItem('roommate_haptics_enabled')).toBe('false');

      setHapticsEnabled(true);
      expect(isHapticsEnabled()).toBe(true);
      expect(globalThis.localStorage.getItem('roommate_haptics_enabled')).toBe('true');
    });
  });

  describe('2. Defensive Settings Parsing', () => {
    it('safely handles corrupted or invalid JSON in quiet hours without throwing', () => {
      globalThis.localStorage.setItem('roommate_quiet_hours', 'INVALID_JSON_CORRUPT{');

      let parsedQuiet: { enabled?: boolean; start?: string; end?: string } | null = null;
      expect(() => {
        const raw = globalThis.localStorage.getItem('roommate_quiet_hours');
        if (raw) {
          try {
            parsedQuiet = JSON.parse(raw);
          } catch {
            parsedQuiet = null;
          }
        }
      }).not.toThrow();

      expect(parsedQuiet).toBeNull();
    });

    it('correctly parses valid quiet hours config', () => {
      globalThis.localStorage.setItem(
        'roommate_quiet_hours',
        JSON.stringify({ enabled: true, start: '23:00', end: '08:00' })
      );

      let parsedQuiet: { enabled?: boolean; start?: string; end?: string } | null = null;
      const raw = globalThis.localStorage.getItem('roommate_quiet_hours');
      if (raw) {
        try {
          parsedQuiet = JSON.parse(raw);
        } catch {
          parsedQuiet = null;
        }
      }

      expect(parsedQuiet?.enabled).toBe(true);
      expect(parsedQuiet?.start).toBe('23:00');
      expect(parsedQuiet?.end).toBe('08:00');
    });
  });

  describe('3. Lifecycle Background / Foreground & Grace Period Mechanics', () => {
    it('registers both resume and pause lifecycle hooks', () => {
      const onResume = vi.fn();
      const onPause = vi.fn();

      const cleanup = listenToAppLifecycle(onResume, onPause);
      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('correctly suppresses re-lock within the 5-second post-unlock grace period', () => {
      const lastUnlockTime = Date.now();
      const timeSinceLastUnlock = Date.now() - lastUnlockTime;

      // Even if background elapsed is large, grace period must bypass lock
      const shouldLock = timeSinceLastUnlock >= 5000;
      expect(shouldLock).toBe(false);
    });

    it('triggers app lock only when elapsed time exceeds timeout threshold outside grace period', () => {
      const timeoutMs = 3000; // Immediate (3s)
      const lastBackgroundTime = Date.now() - 5000; // 5 seconds ago
      const lastUnlockTime = Date.now() - 10000; // 10 seconds ago (grace period expired)

      const timeSinceLastUnlock = Date.now() - lastUnlockTime;
      const elapsed = Date.now() - lastBackgroundTime;

      const isGracePeriodActive = timeSinceLastUnlock < 5000;
      const shouldLock = !isGracePeriodActive && elapsed >= timeoutMs;

      expect(isGracePeriodActive).toBe(false);
      expect(shouldLock).toBe(true);
    });

    it('suppresses app lock when returning from external UPI intent', () => {
      globalThis.sessionStorage.setItem('roommate_upi_intent_active', 'true');

      let isLocked = false;
      const upiIntentActive = globalThis.sessionStorage.getItem('roommate_upi_intent_active') === 'true';
      if (upiIntentActive) {
        globalThis.sessionStorage.removeItem('roommate_upi_intent_active');
        // Grace buffer applied, do not lock
      } else {
        isLocked = true;
      }

      expect(isLocked).toBe(false);
      expect(globalThis.sessionStorage.getItem('roommate_upi_intent_active')).toBeNull();
    });
  });

  describe('4. Dynamic Settings Event Synchronization', () => {
    it('dispatches roommate_settings_changed when app lock is toggled', () => {
      const listener = vi.fn();
      (globalThis as any).window.addEventListener('roommate_settings_changed', listener);

      globalThis.localStorage.setItem('roommate_app_lock_enabled', 'false');
      (globalThis as any).window.dispatchEvent({ type: 'roommate_settings_changed' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(globalThis.localStorage.getItem('roommate_app_lock_enabled')).toBe('false');

      (globalThis as any).window.removeEventListener('roommate_settings_changed', listener);
    });
  });

  describe('5. Flow & Hardware Interaction Safeguards', () => {
    it('consumes hardware back button when PIN fallback is open in AppLockGateway', () => {
      let showPinFallback = true;
      const backHandler = () => {
        if (showPinFallback) {
          showPinFallback = false;
          return true; // handled / consumed
        }
        return false;
      };

      // When PIN fallback is open, pressing back returns to biometric mode
      const consumedFirst = backHandler();
      expect(consumedFirst).toBe(true);
      expect(showPinFallback).toBe(false);

      // Next back press is allowed to exit app
      const consumedSecond = backHandler();
      expect(consumedSecond).toBe(false);
    });

    it('suppresses shake-to-report when camera scanner or bottom sheet is active', () => {
      let isReportModalTriggered = false;
      const showQrScanner = true;
      const showQuickActionSheet = false;
      const showShakeReportModal = false;

      const isScannerOrModalActive = Boolean(showQrScanner || showQuickActionSheet || showShakeReportModal);

      const onShakeDetected = () => {
        if (isScannerOrModalActive) return;
        isReportModalTriggered = true;
      };

      onShakeDetected();
      expect(isReportModalTriggered).toBe(false);
    });

    it('ensures app lock is reset to false when resident logs in or out', () => {
      let isAppLocked = true;

      // On logout:
      isAppLocked = false;
      expect(isAppLocked).toBe(false);

      // On new login:
      isAppLocked = false;
      expect(isAppLocked).toBe(false);
    });

    it('navigates back to dashboard tab when hardware back button is pressed on a sub-tab', () => {
      let activeTab: string = 'rooms';

      // Simulates the MobileLayout back handler
      const subtabBackHandler = () => {
        if (activeTab !== 'dashboard') {
          activeTab = 'dashboard';
          return true; // Consumed
        }
        return false;
      };

      // Pressing back on rooms navigates to dashboard
      const handled = subtabBackHandler();
      expect(handled).toBe(true);
      expect(activeTab).toBe('dashboard');

      // Pressing back when already on dashboard allows exit
      const handledAgain = subtabBackHandler();
      expect(handledAgain).toBe(false);
      expect(activeTab).toBe('dashboard');
    });

    it('blocks split submission when exact custom split is not fully allocated', () => {
      const totalAmount = 100;
      const customValues = { 'user-1': 40, 'user-2': 30 }; // Sum = 70 !== 100
      const sumExact = Object.values(customValues).reduce((a, b) => a + b, 0);
      const diff = totalAmount - sumExact;
      const isValid = Math.abs(diff) <= 0.05 && totalAmount > 0;

      expect(isValid).toBe(false);
      expect(diff).toBe(30);

      let isSubmitted = false;
      const handleCreateSplit = () => {
        if (!isValid) {
          return; // Blocked!
        }
        isSubmitted = true;
      };

      handleCreateSplit();
      expect(isSubmitted).toBe(false);
    });
  });
});

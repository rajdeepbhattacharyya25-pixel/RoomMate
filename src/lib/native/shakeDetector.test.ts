import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  isShakeDetectionEnabled,
  setShakeDetectionEnabled,
  getShakeSensitivity,
  setShakeSensitivity,
  addShakeListener,
  triggerSimulatedShake,
  processMotionSample,
  resetShakeState,
} from './shakeDetector';
import {
  captureDiagnosticReport,
  generateBugReportMailtoUrl,
  getAdminSupportEmail,
  setAdminSupportEmail,
} from '../services/diagnosticService';
import { User } from '../../types';

// Polyfill localStorage & window for Node test environment
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

describe('Shake Detector & Diagnostic Telemetry Test Suite', () => {
  const mockUser: User = {
    id: 'usr-test-123',
    name: 'Alex Rivera',
    email: 'alex@campus.edu',
    role: 'STUDENT',
    isSuspended: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

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
        innerWidth: 390,
        innerHeight: 844,
        devicePixelRatio: 3,
      };
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    resetShakeState();
    vi.clearAllMocks();
  });

  it('defaults shake detection to enabled and persists user toggles', () => {
    expect(isShakeDetectionEnabled()).toBe(true);

    setShakeDetectionEnabled(false);
    expect(isShakeDetectionEnabled()).toBe(false);

    setShakeDetectionEnabled(true);
    expect(isShakeDetectionEnabled()).toBe(true);
  });

  it('manages and persists sensitivity tiers (low, medium, high)', () => {
    expect(getShakeSensitivity()).toBe('medium'); // default

    setShakeSensitivity('low');
    expect(getShakeSensitivity()).toBe('low');

    setShakeSensitivity('high');
    expect(getShakeSensitivity()).toBe('high');

    setShakeSensitivity('medium');
    expect(getShakeSensitivity()).toBe('medium');
  });

  it('notifies registered listeners when a shake occurs', () => {
    const callback = vi.fn();
    const unsubscribe = addShakeListener(callback);

    triggerSimulatedShake();
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    triggerSimulatedShake();
    expect(callback).toHaveBeenCalledTimes(1); // Not called again after unsubscription
  });

  describe('Multi-Peak Calibration & False-Trigger Elimination', () => {
    it('rejects single isolated acceleration impulses (e.g., picking up phone or setting on desk)', () => {
      const callback = vi.fn();
      const unsubscribe = addShakeListener(callback);

      // Single large spike of 20 m/s^2 linear acceleration
      const triggered = processMotionSample({ x: 20, y: 0, z: 0 }, null, 1000);

      expect(triggered).toBe(false);
      expect(callback).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('rejects ordinary gentle motions (walking, tilting phone, hand sway)', () => {
      const callback = vi.fn();
      const unsubscribe = addShakeListener(callback);

      // Gentle movement (magnitude ~ 5 m/s^2)
      processMotionSample({ x: 3, y: 3, z: 2 }, null, 1000);
      processMotionSample({ x: 3, y: 4, z: 2 }, null, 1100);
      processMotionSample({ x: 4, y: 3, z: 2 }, null, 1200);

      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('triggers on deliberate multi-peak oscillation within window', () => {
      const callback = vi.fn();
      const unsubscribe = addShakeListener(callback);

      setShakeSensitivity('medium'); // requires 3 peaks of >= 16 m/s^2 within 750ms

      // First oscillation reversal (t = 1000ms)
      const res1 = processMotionSample({ x: 18, y: 0, z: 0 }, null, 1000);
      expect(res1).toBe(false);

      // Second oscillation reversal (t = 1120ms, +120ms)
      const res2 = processMotionSample({ x: -18, y: 0, z: 0 }, null, 1120);
      expect(res2).toBe(false);

      // Third oscillation reversal (t = 1250ms, +130ms) -> Completes 3-peak shake!
      const res3 = processMotionSample({ x: 19, y: 0, z: 0 }, null, 1250);
      expect(res3).toBe(true);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('enforces 2.5s cooldown to prevent double triggering', () => {
      const callback = vi.fn();
      const unsubscribe = addShakeListener(callback);

      setShakeSensitivity('medium');

      // Valid shake burst
      processMotionSample({ x: 18, y: 0, z: 0 }, null, 1000);
      processMotionSample({ x: -18, y: 0, z: 0 }, null, 1120);
      processMotionSample({ x: 18, y: 0, z: 0 }, null, 1250);
      expect(callback).toHaveBeenCalledTimes(1);

      // Another rapid burst within cooldown (< 2500ms later, e.g. at t = 2000ms)
      processMotionSample({ x: 20, y: 0, z: 0 }, null, 2000);
      processMotionSample({ x: -20, y: 0, z: 0 }, null, 2120);
      const resCooldown = processMotionSample({ x: 20, y: 0, z: 0 }, null, 2250);

      expect(resCooldown).toBe(false);
      expect(callback).toHaveBeenCalledTimes(1); // Still only 1 call

      // After cooldown expires (> 2500ms, e.g. at t = 4000ms)
      processMotionSample({ x: 20, y: 0, z: 0 }, null, 4000);
      processMotionSample({ x: -20, y: 0, z: 0 }, null, 4120);
      const resAfter = processMotionSample({ x: 20, y: 0, z: 0 }, null, 4250);

      expect(resAfter).toBe(true);
      expect(callback).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('suppresses shake detection when disabled in settings', () => {
      const callback = vi.fn();
      const unsubscribe = addShakeListener(callback);

      setShakeDetectionEnabled(false);

      processMotionSample({ x: 25, y: 0, z: 0 }, null, 1000);
      processMotionSample({ x: -25, y: 0, z: 0 }, null, 1100);
      processMotionSample({ x: 25, y: 0, z: 0 }, null, 1200);

      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('requires 4 peaks on low sensitivity (sports-safe mode)', () => {
      const callback = vi.fn();
      const unsubscribe = addShakeListener(callback);

      setShakeSensitivity('low'); // requires 4 peaks >= 22 m/s^2

      // 3 peaks at 23 m/s^2
      processMotionSample({ x: 23, y: 0, z: 0 }, null, 1000);
      processMotionSample({ x: -23, y: 0, z: 0 }, null, 1100);
      const res3 = processMotionSample({ x: 23, y: 0, z: 0 }, null, 1200);
      expect(res3).toBe(false); // 3 is not enough for low sensitivity

      // 4th peak completes it
      const res4 = processMotionSample({ x: -23, y: 0, z: 0 }, null, 1300);
      expect(res4).toBe(true);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
    });
  });

  it('captures accurate diagnostic telemetry snapshot', () => {
    const diag = captureDiagnosticReport(mockUser, { id: 'room-1', name: 'Apartment 4B', createdBy: 'u1', isArchived: false, createdAt: '', updatedAt: '' }, 'ledger');

    expect(diag.route).toBe('ledger');
    expect(diag.roomName).toBe('Apartment 4B');
    expect(diag.roomId).toBe('room-1');
    expect(diag.networkOnline).toBeDefined();
    expect(diag.viewport).toBeDefined();
    expect(diag.viewport.width).toBeGreaterThan(0);
    expect(diag.appVersion).toContain('v');
  });

  it('generates formatted mailto URL with recipient and diagnostic specs', () => {
    setAdminSupportEmail('myadmin@custom.org');
    expect(getAdminSupportEmail()).toBe('myadmin@custom.org');

    const diag = captureDiagnosticReport(mockUser, null, 'dashboard');
    const mailtoUrl = generateBugReportMailtoUrl({
      category: 'UI_GLITCH',
      severity: 'HIGH',
      description: 'The split bill calculation showed 0 for member',
      currentUser: mockUser,
      diagnostics: diag,
    });

    expect(mailtoUrl).toContain('mailto:myadmin@custom.org');
    expect(mailtoUrl).toContain(encodeURIComponent('[RoomMate Issue] UI_GLITCH (HIGH) - Alex Rivera'));
    expect(mailtoUrl).toContain(encodeURIComponent('The split bill calculation showed 0 for member'));
    expect(mailtoUrl).toContain(encodeURIComponent('Alex Rivera (alex@campus.edu)'));
  });
});

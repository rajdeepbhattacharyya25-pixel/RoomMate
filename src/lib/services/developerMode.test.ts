import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  isDeveloperModeEnabled,
  setDeveloperMode,
  handleVersionTap,
} from './developerMode';

// Polyfill localStorage & window event dispatch in node test environment
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

beforeAll(() => {
  // @ts-expect-error polyfill for test
  globalThis.localStorage = mockLocalStorage;
  if (!globalThis.window) {
    // @ts-expect-error polyfill window
    globalThis.window = {
      dispatchEvent: () => true,
    };
  }
});

describe('Developer Mode Service & 5-Tap Unlock Gesture', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults to true in DEV environment, or false in prod when not set', () => {
    expect(isDeveloperModeEnabled()).toBe(true);
  });

  it('allows explicit enabling and disabling of developer mode in storage', () => {
    setDeveloperMode(true);
    expect(globalThis.localStorage.getItem('roommate_dev_mode_unlocked')).toBe('true');

    setDeveloperMode(false);
    expect(globalThis.localStorage.getItem('roommate_dev_mode_unlocked')).toBeNull();
  });

  it('tracks tap increments towards the 5-tap requirement', () => {
    // Tap 1
    const res1 = handleVersionTap();
    expect(res1.unlocked).toBe(false);
    expect(res1.tapsRemaining).toBe(4);

    // Tap 2
    const res2 = handleVersionTap();
    expect(res2.unlocked).toBe(false);
    expect(res2.tapsRemaining).toBe(3);
    expect(res2.message).toContain('3 more taps');

    // Tap 3
    const res3 = handleVersionTap();
    expect(res3.unlocked).toBe(false);
    expect(res3.tapsRemaining).toBe(2);
    expect(res3.message).toContain('2 more taps');

    // Tap 4
    const res4 = handleVersionTap();
    expect(res4.unlocked).toBe(false);
    expect(res4.tapsRemaining).toBe(1);
    expect(res4.message).toContain('1 more tap to unlock');

    // Tap 5 (Unlocks / toggles)
    const res5 = handleVersionTap();
    expect(res5.tapsRemaining).toBe(0);
    expect(res5.message).toBeDefined();
  });
});

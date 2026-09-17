/**
 * Developer Mode Service
 * Manages developer mode activation for technical inspection and testing.
 * Supports unlocking via a 5-tap gesture on the version card in Settings -> About.
 */

import { hapticImpact, hapticSuccess } from '../native/haptics';

const STORAGE_KEY = 'roommate_dev_mode_unlocked';
const TAP_WINDOW_MS = 2500;
const REQUIRED_TAPS = 5;

let tapCount = 0;
let tapTimer: ReturnType<typeof setTimeout> | null = null;

export const isDeveloperModeEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return true;
  return localStorage.getItem(STORAGE_KEY) === 'true';
};

export const setDeveloperMode = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  if (enabled) {
    localStorage.setItem(STORAGE_KEY, 'true');
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent('roommate_dev_mode_changed', { detail: { enabled } }));
};

export interface TapResult {
  unlocked: boolean;
  tapsRemaining: number;
  message?: string;
}

/**
 * Call on each tap on the version card.
 * Returns information about whether developer mode was toggled or how many taps remain.
 */
export const handleVersionTap = (): TapResult => {
  if (tapTimer) clearTimeout(tapTimer);

  tapCount += 1;

  tapTimer = setTimeout(() => {
    tapCount = 0;
  }, TAP_WINDOW_MS);

  // If already unlocked and tapped 5 times, allow re-locking or toggling
  if (tapCount >= REQUIRED_TAPS) {
    tapCount = 0;
    const currentState = isDeveloperModeEnabled();
    const nextState = !currentState;
    setDeveloperMode(nextState);
    void hapticSuccess();
    return {
      unlocked: nextState,
      tapsRemaining: 0,
      message: nextState
        ? '🛠️ Developer Mode Enabled!'
        : '🔒 Developer Mode Disabled',
    };
  }

  void hapticImpact('LIGHT');

  const tapsRemaining = REQUIRED_TAPS - tapCount;
  if (tapsRemaining <= 3 && tapsRemaining > 0) {
    return {
      unlocked: false,
      tapsRemaining,
      message: `${tapsRemaining} more tap${tapsRemaining > 1 ? 's' : ''} to unlock Developer Mode`,
    };
  }

  return {
    unlocked: false,
    tapsRemaining,
  };
};

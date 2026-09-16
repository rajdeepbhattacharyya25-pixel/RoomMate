import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const PRIMARY_HAPTICS_KEY = 'roommate_haptics_enabled';
const LEGACY_HAPTICS_KEY = 'campusflow_haptics_enabled';

/**
 * Check if haptic vibrations are enabled (default: true).
 */
export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true;
  try {
    const stored =
      localStorage.getItem(PRIMARY_HAPTICS_KEY) ??
      localStorage.getItem(LEGACY_HAPTICS_KEY);
    if (stored === null || stored === undefined) return true;
    return stored !== 'false' && stored !== '0' && stored !== 'off' && stored !== 'disabled';
  } catch {
    return true;
  }
}

/**
 * Toggle haptic vibrations on/off.
 */
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const val = enabled.toString();
    localStorage.setItem(PRIMARY_HAPTICS_KEY, val);
    localStorage.setItem(LEGACY_HAPTICS_KEY, val);
    window.dispatchEvent(new CustomEvent('roommate_haptics_changed', { detail: { enabled } }));
    window.dispatchEvent(new Event('roommate_settings_changed'));
    window.dispatchEvent(new Event('campusflow_settings_changed'));
  } catch (err) {
    console.warn('[RoomMate] Failed to save haptics preference to localStorage:', err);
  }
}

/**
 * Trigger subtle tactile impact for button taps, list selections, and card presses.
 */
export async function hapticImpact(style: 'LIGHT' | 'MEDIUM' | 'HEAVY' = 'LIGHT'): Promise<void> {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      const mapped =
        style === 'HEAVY'
          ? ImpactStyle.Heavy
          : style === 'MEDIUM'
          ? ImpactStyle.Medium
          : ImpactStyle.Light;
      await Haptics.impact({ style: mapped });
      return;
    } catch {
      // Ignore native haptics failure
    }
  }

  // Web fallback using Vibration API
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      const ms = style === 'HEAVY' ? 35 : style === 'MEDIUM' ? 20 : 10;
      navigator.vibrate(ms);
    } catch {
      // Ignore vibration error
    }
  }
}

/**
 * Trigger celebratory tactile feedback on successful settlement, expense add, or Face ID unlock.
 */
export async function hapticSuccess(): Promise<void> {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    } catch {
      // Ignore
    }
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([15, 30, 25]);
    } catch {
      // Ignore
    }
  }
}

export async function hapticNotification(_type?: string): Promise<void> {
  await hapticSuccess();
}

/**
 * Trigger warning vibration for overdue debts or validation warnings.
 */
export async function hapticWarning(): Promise<void> {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    } catch {
      // Ignore
    }
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([40, 40, 40]);
    } catch {
      // Ignore
    }
  }
}

/**
 * Selection tick on tab switches, tone sliders, and picker adjustments.
 */
export async function hapticSelection(): Promise<void> {
  if (!isHapticsEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    } catch {
      // Fallback
    }
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(12);
    } catch {
      // Ignore
    }
  }
}

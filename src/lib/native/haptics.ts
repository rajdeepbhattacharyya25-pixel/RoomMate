import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Trigger subtle tactile impact for button taps, list selections, and card presses.
 */
export async function hapticImpact(style: 'LIGHT' | 'MEDIUM' | 'HEAVY' = 'LIGHT'): Promise<void> {
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

/**
 * Trigger warning vibration for overdue debts or validation warnings.
 */
export async function hapticWarning(): Promise<void> {
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
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      return;
    } catch {
      // Ignore
    }
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(8);
    } catch {
      // Ignore
    }
  }
}

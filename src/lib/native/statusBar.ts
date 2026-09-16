import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Configure edge-to-edge status bar styling on mobile devices.
 */
export async function setAppStatusBarStyle(style: 'LIGHT' | 'DARK' = 'LIGHT', backgroundColor: string = '#F9F9FF'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Style.Light sets dark icons/text (for light backgrounds)
      // Style.Dark sets light/white icons/text (for dark backgrounds)
      await StatusBar.setStyle({
        style: style === 'DARK' ? Style.Dark : Style.Light,
      });
      await StatusBar.setBackgroundColor({ color: backgroundColor });
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch (err) {
      console.warn('Status bar styling warning:', err);
    }
  }
}

/**
 * Dismiss native splash screen smoothly when app mounting and data hydration finish.
 */
export async function hideSplashScreen(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await SplashScreen.hide({
        fadeOutDuration: 400,
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * Sets up native keyboard behavior and automatic dismissal on outside scroll.
 */
export function setupKeyboardListeners(): () => void {
  if (Capacitor.isNativePlatform()) {
    try {
      Keyboard.setAccessoryBarVisible({ isVisible: true });

      const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
        document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      });

      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        document.body.style.removeProperty('--keyboard-height');
      });

      return () => {
        showListener.then((h) => h.remove());
        hideListener.then((h) => h.remove());
      };
    } catch (err) {
      console.warn('Keyboard listeners warning:', err);
    }
  }

  return () => {};
}

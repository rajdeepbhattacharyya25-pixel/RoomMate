import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

type BackHandler = () => boolean; // return true if handled (consumed), false if not

const handlers: BackHandler[] = [];
let lastBackPressTime = 0;

/**
 * Register a priority handler for Android hardware back button / back gesture.
 * When the back button is pressed, the most recently registered handler is called first.
 * If it returns true, the event is consumed.
 */
export function registerBackButtonHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  };
}

/**
 * Initializes the global native Android back button dispatcher.
 */
export function setupBackButtonListener(onExitRequested?: (message: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  try {
    const listenerPromise = CapApp.addListener('backButton', () => {
      // 1. Run through handlers in reverse order (LIFO - top modal/drawer first)
      for (let i = handlers.length - 1; i >= 0; i--) {
        const handled = handlers[i]();
        if (handled) {
          return;
        }
      }

      // 2. Default exit-protection: Double-tap back within 2s to exit
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTime = now;
        if (onExitRequested) {
          onExitRequested('Press back again to exit RoomMate');
        }
      }
    });

    return () => {
      listenerPromise.then((h) => h.remove());
    };
  } catch (err) {
    console.warn('Android Back button listener warning:', err);
    return () => {};
  }
}

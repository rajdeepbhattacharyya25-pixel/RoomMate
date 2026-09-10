import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { App as CapApp } from '@capacitor/app';

/**
 * Listens to native device network changes (Wi-Fi, Cellular, Offline).
 */
export function listenToNetworkStatus(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  let isMounted = true;

  if (Capacitor.isNativePlatform()) {
    try {
      const listenerPromise = Network.addListener('networkStatusChange', (status) => {
        if (!isMounted) return;
        if (status.connected) {
          console.log('[Network] Device reconnected via:', status.connectionType);
          onOnline();
        } else {
          console.log('[Network] Device went offline');
          onOffline();
        }
      });

      return () => {
        isMounted = false;
        listenerPromise.then((h) => h.remove());
      };
    } catch (err) {
      console.warn('Network listener error:', err);
    }
  }

  // Web Browser fallback
  const handleOnline = () => {
    if (isMounted) onOnline();
  };
  const handleOffline = () => {
    if (isMounted) onOffline();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    isMounted = false;
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Listens to app background/foreground transitions to trigger instant cloud state re-hydration.
 */
export function listenToAppLifecycle(onResume: () => void): () => void {
  if (Capacitor.isNativePlatform()) {
    try {
      const listenerPromise = CapApp.addListener('appStateChange', (state) => {
        if (state.isActive) {
          console.log('[App] Foregrounded, reconciling room state...');
          onResume();
        }
      });

      return () => {
        listenerPromise.then((h) => h.remove());
      };
    } catch {
      // Ignore
    }
  }

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      onResume();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

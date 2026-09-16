import { Capacitor } from '@capacitor/core';
import { Network, ConnectionStatus } from '@capacitor/network';
import { App as CapApp } from '@capacitor/app';

export type ConnectionType = 'wifi' | 'cellular' | 'none' | 'unknown';

export interface NetworkState {
  isOnline: boolean;
  connectionType: ConnectionType;
  lastChangedAt: number;
  isSimulated: boolean;
}

// Storage key for developer/tester simulated offline mode
const PRIMARY_SIMULATED_OFFLINE_KEY = 'roommate_simulated_offline';
const LEGACY_SIMULATED_OFFLINE_KEY = 'campusflow_simulated_offline';

let simulatedOffline: boolean = (() => {
  try {
    const val =
      localStorage.getItem(PRIMARY_SIMULATED_OFFLINE_KEY) ??
      localStorage.getItem(LEGACY_SIMULATED_OFFLINE_KEY);
    return val === 'true';
  } catch {
    return false;
  }
})();

// Set of active listeners subscribed to network changes
const networkSubscribers = new Set<(state: NetworkState) => void>();

let cachedNetworkState: NetworkState = {
  isOnline: !simulatedOffline && (typeof navigator !== 'undefined' ? navigator.onLine : true),
  connectionType: simulatedOffline ? 'none' : 'unknown',
  lastChangedAt: Date.now(),
  isSimulated: simulatedOffline,
};

function normalizeConnectionType(type: string): ConnectionType {
  const lower = (type || '').toLowerCase();
  if (lower.includes('wifi')) return 'wifi';
  if (lower.includes('cellular') || lower.includes('4g') || lower.includes('3g') || lower.includes('5g') || lower.includes('lte')) return 'cellular';
  if (lower === 'none' || lower === 'offline') return 'none';
  return 'unknown';
}

/**
 * Actively resolves the current network status using Capacitor Network or Browser Navigator.
 */
export async function getCurrentNetworkStatus(): Promise<NetworkState> {
  if (simulatedOffline) {
    cachedNetworkState = {
      isOnline: false,
      connectionType: 'none',
      lastChangedAt: cachedNetworkState.lastChangedAt,
      isSimulated: true,
    };
    return cachedNetworkState;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const status: ConnectionStatus = await Network.getStatus();
      const isOnline = Boolean(status.connected);
      cachedNetworkState = {
        isOnline,
        connectionType: isOnline ? normalizeConnectionType(status.connectionType) : 'none',
        lastChangedAt: Date.now(),
        isSimulated: false,
      };
      return cachedNetworkState;
    } catch (err) {
      console.warn('[Network] Error checking native network status:', err);
    }
  }

  // Web Browser fallback
  const isOnline = typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : true;
  let connectionType: ConnectionType = isOnline ? 'wifi' : 'none';

  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const navConn = (navigator as unknown as { connection?: { type?: string; effectiveType?: string } }).connection;
    if (navConn?.type) {
      connectionType = normalizeConnectionType(navConn.type);
    } else if (navConn?.effectiveType && isOnline) {
      connectionType = navConn.effectiveType.includes('2g') || navConn.effectiveType.includes('3g') || navConn.effectiveType.includes('4g')
        ? 'cellular'
        : 'wifi';
    }
  }

  cachedNetworkState = {
    isOnline,
    connectionType,
    lastChangedAt: Date.now(),
    isSimulated: false,
  };

  return cachedNetworkState;
}

/**
 * Performs a fast ping probe to verify real internet connectivity
 * (detects Wi-Fi router connected but no upstream internet or captive portal).
 */
export async function verifyInternetAccess(timeoutMs = 3500): Promise<boolean> {
  if (simulatedOffline) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Attempt lightweight cache-busting fetch
    const response = await fetch(`https://httpbin.org/status/200?_t=${Date.now()}`, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);
    return response.type === 'opaque' || response.ok;
  } catch {
    // Fallback: ping app's own origin if external ping blocked by CORS
    try {
      const localResp = await fetch(`/?_ping=${Date.now()}`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      return localResp.ok || localResp.status < 400;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  }
}

/**
 * Toggles or sets developer simulated offline mode for rapid UI and sync testing.
 */
export function setSimulatedOffline(enabled: boolean): void {
  simulatedOffline = enabled;
  try {
    localStorage.setItem(PRIMARY_SIMULATED_OFFLINE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage issues
  }

  const newState: NetworkState = {
    isOnline: !enabled,
    connectionType: enabled ? 'none' : 'wifi',
    lastChangedAt: Date.now(),
    isSimulated: enabled,
  };

  cachedNetworkState = newState;
  notifySubscribers(newState);
}

export function isSimulatedOfflineMode(): boolean {
  return simulatedOffline;
}

function notifySubscribers(state: NetworkState) {
  for (const sub of networkSubscribers) {
    try {
      sub(state);
    } catch (e) {
      console.error('[Network] Subscriber error:', e);
    }
  }
}

/**
 * Subscribes to real-time network state changes.
 * Immediately invokes callback with current known state.
 */
export function subscribeToNetworkChanges(callback: (state: NetworkState) => void): () => void {
  networkSubscribers.add(callback);

  // Immediately report current state
  getCurrentNetworkStatus().then((current) => {
    callback(current);
  });

  return () => {
    networkSubscribers.delete(callback);
  };
}

// Global system listeners initialization (singleton)
let isGlobalListenerSetup = false;

function setupGlobalNetworkListeners() {
  if (isGlobalListenerSetup) return;
  isGlobalListenerSetup = true;

  if (Capacitor.isNativePlatform()) {
    try {
      Network.addListener('networkStatusChange', (status) => {
        if (simulatedOffline) return;
        const isOnline = Boolean(status.connected);
        const newState: NetworkState = {
          isOnline,
          connectionType: isOnline ? normalizeConnectionType(status.connectionType) : 'none',
          lastChangedAt: Date.now(),
          isSimulated: false,
        };
        cachedNetworkState = newState;
        console.log('[Network] Native status change:', newState);
        notifySubscribers(newState);
      });
    } catch (err) {
      console.warn('[Network] Native listener attach failed:', err);
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (simulatedOffline) return;
      const newState: NetworkState = {
        isOnline: true,
        connectionType: 'wifi',
        lastChangedAt: Date.now(),
        isSimulated: false,
      };
      cachedNetworkState = newState;
      console.log('[Network] Browser online event fired');
      notifySubscribers(newState);
    });

    window.addEventListener('offline', () => {
      if (simulatedOffline) return;
      const newState: NetworkState = {
        isOnline: false,
        connectionType: 'none',
        lastChangedAt: Date.now(),
        isSimulated: false,
      };
      cachedNetworkState = newState;
      console.log('[Network] Browser offline event fired');
      notifySubscribers(newState);
    });
  }
}

// Initialize global listeners on module load
setupGlobalNetworkListeners();

/**
 * Backward-compatible helper for legacy callers.
 */
export function listenToNetworkStatus(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  let wasOnline: boolean | null = null;

  return subscribeToNetworkChanges((state) => {
    if (wasOnline === null) {
      wasOnline = state.isOnline;
      if (!state.isOnline) {
        onOffline();
      }
      return;
    }

    if (state.isOnline !== wasOnline) {
      wasOnline = state.isOnline;
      if (state.isOnline) {
        onOnline();
      } else {
        onOffline();
      }
    }
  });
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

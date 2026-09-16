import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  ConnectionType,
  NetworkState,
  subscribeToNetworkChanges,
  verifyInternetAccess,
  setSimulatedOffline,
  isSimulatedOfflineMode,
  getCurrentNetworkStatus,
} from '../lib/native/network';
import {
  getPendingQueueCount,
  subscribeToQueueChanges,
  flushOfflineQueue,
} from '../lib/storage/offlineQueue';
import { hapticNotification, hapticImpact } from '../lib/native/haptics';

export interface NetworkContextValue {
  isOnline: boolean;
  connectionType: ConnectionType;
  isReconnecting: boolean;
  isChecking: boolean;
  pendingSyncCount: number;
  isSimulatedOffline: boolean;
  lastOfflineAt: number | null;
  checkConnection: () => Promise<boolean>;
  toggleSimulateOffline: () => void;
  triggerManualSync: () => Promise<{ syncedCount: number; failedCount: number }>;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

export const NetworkProvider: React.FC<{
  children: React.ReactNode;
  onReconnected?: () => void;
}> = ({ children, onReconnected }) => {
  const [networkState, setNetworkState] = useState<NetworkState>(() => ({
    isOnline: !isSimulatedOfflineMode() && (typeof navigator !== 'undefined' ? navigator.onLine : true),
    connectionType: isSimulatedOfflineMode() ? 'none' : 'unknown',
    lastChangedAt: Date.now(),
    isSimulated: isSimulatedOfflineMode(),
  }));

  const [isChecking, setIsChecking] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => getPendingQueueCount());
  const [lastOfflineAt, setLastOfflineAt] = useState<number | null>(() =>
    !isSimulatedOfflineMode() && (typeof navigator !== 'undefined' ? navigator.onLine : true) ? null : Date.now()
  );

  // Subscribe to offline queue changes
  useEffect(() => {
    const unsubscribeQueue = subscribeToQueueChanges((queue) => {
      setPendingSyncCount(queue.length);
    });
    return () => {
      unsubscribeQueue();
    };
  }, []);

  // Handle re-synchronization when connection resumes
  const handleReconnection = useCallback(async () => {
    setIsReconnecting(true);
    hapticNotification('SUCCESS');

    try {
      // 1. Flush offline mutation queue first
      const result = await flushOfflineQueue();
      if (result.syncedCount > 0) {
        console.log(`[NetworkContext] Reconnected: Flushed ${result.syncedCount} queued mutations`);
      }

      // 2. Trigger parent callback to re-hydrate cloud state
      if (onReconnected) {
        onReconnected();
      }
    } catch (err) {
      console.warn('[NetworkContext] Reconnection sync error:', err);
    } finally {
      setTimeout(() => {
        setIsReconnecting(false);
      }, 1000);
    }
  }, [onReconnected]);

  // Subscribe to network updates
  useEffect(() => {
    let previousOnline = networkState.isOnline;

    const unsubscribe = subscribeToNetworkChanges((state) => {
      setNetworkState(state);

      if (!state.isOnline) {
        setLastOfflineAt((prev) => prev || Date.now());
      } else {
        setLastOfflineAt(null);
      }

      // Detect transition from offline to online
      if (!previousOnline && state.isOnline) {
        console.log('[NetworkContext] Device re-established connection!');
        handleReconnection();
      }

      previousOnline = state.isOnline;
    });

    return () => {
      unsubscribe();
    };
  }, [handleReconnection, networkState.isOnline]);

  // Active check of connectivity
  const checkConnection = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    hapticImpact('LIGHT');
    try {
      const current = await getCurrentNetworkStatus();
      if (!current.isOnline) {
        setNetworkState(current);
        return false;
      }

      // Probe actual internet access
      const hasInternet = await verifyInternetAccess();
      const verifiedState: NetworkState = {
        ...current,
        isOnline: hasInternet,
        connectionType: hasInternet ? current.connectionType : 'none',
        lastChangedAt: Date.now(),
      };

      setNetworkState(verifiedState);
      if (hasInternet && !networkState.isOnline) {
        handleReconnection();
      }
      return hasInternet;
    } finally {
      setIsChecking(false);
    }
  }, [handleReconnection, networkState.isOnline]);

  // Developer simulation toggle
  const toggleSimulateOffline = useCallback(() => {
    const next = !networkState.isSimulated;
    setSimulatedOffline(next);
    hapticImpact('MEDIUM');
  }, [networkState.isSimulated]);

  // Manual sync trigger
  const triggerManualSync = useCallback(async () => {
    setIsReconnecting(true);
    hapticImpact('MEDIUM');
    try {
      const res = await flushOfflineQueue();
      if (onReconnected) onReconnected();
      return res;
    } finally {
      setIsReconnecting(false);
    }
  }, [onReconnected]);

  return (
    <NetworkContext.Provider
      value={{
        isOnline: networkState.isOnline,
        connectionType: networkState.connectionType,
        isReconnecting,
        isChecking,
        pendingSyncCount,
        isSimulatedOffline: networkState.isSimulated,
        lastOfflineAt,
        checkConnection,
        toggleSimulateOffline,
        triggerManualSync,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useNetworkStatus(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      connectionType: 'unknown',
      isReconnecting: false,
      isChecking: false,
      pendingSyncCount: 0,
      isSimulatedOffline: false,
      lastOfflineAt: null,
      checkConnection: async () => true,
      toggleSimulateOffline: () => {},
      triggerManualSync: async () => ({ syncedCount: 0, failedCount: 0 }),
    };
  }
  return context;
}

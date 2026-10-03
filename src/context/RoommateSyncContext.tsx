import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface SyncConflictNotice {
  itemId: string;
  type: string;
  error: string;
  timestamp: number;
}

export interface RoommateSyncContextValue {
  isRealtimeLive: boolean;
  setIsRealtimeLive: (live: boolean) => void;
  remoteSyncToast: string | null;
  setRemoteSyncToast: (toast: string | null) => void;
  syncConflictNotice: SyncConflictNotice | null;
  dismissConflictNotice: () => void;
  showTransientToast: (message: string, durationMs?: number) => void;
}

const RoommateSyncContext = createContext<RoommateSyncContextValue | null>(null);

export const RoommateSyncProvider: React.FC<{
  children: React.ReactNode;
  initialRealtimeLive?: boolean;
}> = ({ children, initialRealtimeLive = false }) => {
  const [isRealtimeLive, setIsRealtimeLive] = useState(initialRealtimeLive);
  const [remoteSyncToast, setRemoteSyncToast] = useState<string | null>(null);
  const [syncConflictNotice, setSyncConflictNotice] = useState<SyncConflictNotice | null>(null);

  // Automatically listen for discarded offline conflicts from offlineQueue.ts
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleConflictDiscarded = (e: Event) => {
      const customEvent = e as CustomEvent<SyncConflictNotice>;
      if (customEvent.detail) {
        setSyncConflictNotice(customEvent.detail);
        setRemoteSyncToast(`⚠️ Offline change (${customEvent.detail.type.replace(/_/g, ' ')}) discarded due to remote conflict.`);
        setTimeout(() => {
          setRemoteSyncToast(null);
        }, 5000);
      }
    };

    window.addEventListener('roommate_sync_conflict_discarded', handleConflictDiscarded);
    return () => {
      window.removeEventListener('roommate_sync_conflict_discarded', handleConflictDiscarded);
    };
  }, []);

  const dismissConflictNotice = useCallback(() => {
    setSyncConflictNotice(null);
  }, []);

  const showTransientToast = useCallback((message: string, durationMs: number = 4000) => {
    setRemoteSyncToast(message);
    setTimeout(() => {
      setRemoteSyncToast((curr) => (curr === message ? null : curr));
    }, durationMs);
  }, []);

  return (
    <RoommateSyncContext.Provider
      value={{
        isRealtimeLive,
        setIsRealtimeLive,
        remoteSyncToast,
        setRemoteSyncToast,
        syncConflictNotice,
        dismissConflictNotice,
        showTransientToast,
      }}
    >
      {children}
    </RoommateSyncContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useRoommateSync(): RoommateSyncContextValue {
  const context = useContext(RoommateSyncContext);
  if (!context) {
    throw new Error('useRoommateSync must be used within a RoommateSyncProvider');
  }
  return context;
}

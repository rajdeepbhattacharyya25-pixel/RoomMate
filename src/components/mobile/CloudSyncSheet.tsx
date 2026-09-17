import React, { useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  WifiOff,
  RefreshCw,
  X,
  ShieldCheck,
  Clock,
  Layers,
  Database,
  Smartphone,
} from 'lucide-react';
import { hapticImpact, hapticSuccess } from '../../lib/native/haptics';
import { isDeveloperModeEnabled } from '../../lib/services/developerMode';
import { useNetworkStatus } from '../../context/NetworkContext';

interface CloudSyncSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline?: boolean;
  pendingSyncCount?: number;
  lastSyncTime?: string;
  roomsCount?: number;
  expensesCount?: number;
  onForceSync?: () => Promise<void>;
  onOpenDeveloperHub?: () => void;
}

export const CloudSyncSheet: React.FC<CloudSyncSheetProps> = ({
  isOpen,
  onClose,
  isOnline: propIsOnline,
  pendingSyncCount: propPendingCount,
  lastSyncTime: propLastSyncTime,
  roomsCount = 0,
  expensesCount = 0,
  onForceSync,
  onOpenDeveloperHub,
}) => {
  const network = useNetworkStatus();
  const isOnline = propIsOnline !== undefined ? propIsOnline : network.isOnline;
  const pendingSyncCount = propPendingCount !== undefined ? propPendingCount : network.pendingSyncCount;

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string>(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  if (!isOpen) return null;

  const isDevMode = isDeveloperModeEnabled();
  const displayTime = propLastSyncTime || syncedAt || 'Just now';

  const handleSyncClick = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    void hapticImpact('MEDIUM');

    try {
      if (onForceSync) {
        await onForceSync();
      } else {
        await network.triggerManualSync();
      }
      setSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      void hapticSuccess();
      setSyncFeedback('All records synced successfully!');
      setTimeout(() => setSyncFeedback(null), 3500);
    } catch {
      setSyncFeedback('Sync failed. Changes remain safe in your offline vault.');
      setTimeout(() => setSyncFeedback(null), 3500);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200/90 text-slate-900 animate-in slide-in-from-bottom-6 duration-250"
        role="dialog"
        aria-modal="true"
      >
        {/* Mobile Pull Handle */}
        <div className="sm:hidden w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'
                  : 'bg-amber-50 text-amber-600 border border-amber-200/80'
              }`}
            >
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Cloud Backup & Sync
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isOnline
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatic RoomMate Cloud Protection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 active:scale-95 transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sheet Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Main Status Hero Banner */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isOnline
                ? 'bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/50 border-emerald-200/80'
                : 'bg-gradient-to-br from-amber-50/70 via-white to-orange-50/50 border-amber-200/80'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  isOnline
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {isOnline ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <WifiOff className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-900">
                  {isOnline ? 'All Expenses Backed Up' : 'Offline Vault Active'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {isOnline
                    ? 'Your room balances, expense splits, and settlement records are safely stored in the cloud.'
                    : pendingSyncCount > 0
                    ? `${pendingSyncCount} pending change${
                        pendingSyncCount > 1 ? 's are' : ' is'
                      } saved locally and will automatically sync as soon as you reconnect.`
                    : 'You are working offline. Any bills you split now are safely stored in your local vault.'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                <span>Last Synced</span>
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                {displayTime}
              </div>
              <div className="text-[10px] text-slate-400">Background auto-sync</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
                <Layers className="w-3.5 h-3.5 text-emerald-500" />
                <span>Protected Data</span>
              </div>
              <div className="text-xs font-bold text-slate-900">
                {roomsCount} {roomsCount === 1 ? 'Room' : 'Rooms'} • {expensesCount}{' '}
                {expensesCount === 1 ? 'Bill' : 'Bills'}
              </div>
              <div className="text-[10px] text-slate-400">Synced to your group</div>
            </div>
          </div>

          {/* Reassurance Info Note */}
          <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100/90 flex items-start gap-2.5 text-xs text-indigo-950">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              When you record or settle an expense, RoomMate synchronizes it so all your
              roommates immediately see the exact same balances on their phones.
            </p>
          </div>

          {/* Sync Feedback Toast */}
          {syncFeedback && (
            <div className="p-3 rounded-xl bg-slate-900 text-white text-xs font-medium text-center animate-in fade-in duration-200">
              {syncFeedback}
            </div>
          )}

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleSyncClick}
            disabled={isSyncing}
            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 disabled:opacity-60 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all"
          >
            <RefreshCw
              className={`w-4 h-4 ${isSyncing ? 'animate-spin text-white' : ''}`}
            />
            <span>{isSyncing ? 'Syncing with Roommates...' : 'Sync Now'}</span>
          </button>

          {/* Optional Developer Mode Shortcut (Only visible if Developer Mode is unlocked) */}
          {isDevMode && onOpenDeveloperHub && (
            <div className="pt-2 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDeveloperHub();
                }}
                className="inline-flex items-center gap-1.5 text-[11px] text-amber-700 hover:text-amber-800 font-semibold py-1 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100/70 border border-amber-200 transition-colors"
              >
                <Database className="w-3.5 h-3.5 text-amber-600" />
                <span>Open Supabase Backend Hub (Dev Mode)</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Smartphone className="w-3 h-3 text-slate-400" />
            <span>RoomMate Vault v1.0</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-[11px] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

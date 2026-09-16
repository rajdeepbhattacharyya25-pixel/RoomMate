/* oxlint-disable react/purity */
import React, { useState, useEffect, useRef } from 'react';
import {
  WifiOff,
  Wifi,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  X,
  Database,
  Layers,
  Radio,
} from 'lucide-react';
import { useNetworkStatus } from '../../context/NetworkContext';
import { getOfflineQueue } from '../../lib/storage/offlineQueue';
import { hapticImpact } from '../../lib/native/haptics';

export const MobileOfflineBanner: React.FC = () => {
  const {
    isOnline,
    connectionType,
    isReconnecting,
    isChecking,
    pendingSyncCount,
    isSimulatedOffline,
    lastOfflineAt,
    checkConnection,
    toggleSimulateOffline,
    triggerManualSync,
  } = useNetworkStatus();

  const [showDetailsSheet, setShowDetailsSheet] = useState(false);
  const [showReconnectedBanner, setShowReconnectedBanner] = useState(false);
  const prevIsOnlineRef = useRef(isOnline);

  // Detect transition from offline to online to show temporary celebration banner
  useEffect(() => {
    if (!prevIsOnlineRef.current && isOnline) {
      setShowReconnectedBanner(true);
      const timer = setTimeout(() => {
        setShowReconnectedBanner(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
    prevIsOnlineRef.current = isOnline;
  }, [isOnline]);

  // Derived queue items while sheet is open or pending sync updates
  const queueItems = showDetailsSheet ? getOfflineQueue() : [];

  const handleOpenDetails = () => {
    hapticImpact('LIGHT');
    setShowDetailsSheet(true);
  };

  const handleRetryClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticImpact('MEDIUM');
    await checkConnection();
  };

  const handleManualSyncClick = async () => {
    hapticImpact('MEDIUM');
    await triggerManualSync();
  };

  // If online and not showing the reconnected confirmation, hide the banner
  if (isOnline && !showReconnectedBanner) {
    return null;
  }

  const formatOfflineDuration = () => {
    if (!lastOfflineAt) return 'Just now';
    const seconds = Math.floor((Date.now() - lastOfflineAt) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m ago`;
  };

  return (
    <>
      {/* Floating Network Notification Banner */}
      <div className="w-full px-3 pt-1 pb-1.5 z-40 animate-in fade-in slide-in-from-top-2 duration-300">
        {!isOnline ? (
          // OFFLINE BANNER
          <div
            onClick={handleOpenDetails}
            role="button"
            tabIndex={0}
            className="w-full bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-white rounded-2xl p-2.5 px-3 shadow-md border border-amber-400/40 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all"
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <WifiOff className="w-4 h-4 text-white animate-pulse" />
              </div>

              <div className="flex flex-col text-left min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold tracking-tight">Offline Mode</span>
                  {isSimulatedOffline && (
                    <span className="text-[9px] bg-amber-800/60 font-semibold px-1.5 py-0.2 rounded-md">
                      Simulated
                    </span>
                  )}
                  {pendingSyncCount > 0 && (
                    <span className="text-[10px] bg-white text-amber-800 font-bold px-1.5 py-0.2 rounded-full">
                      {pendingSyncCount} pending
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-amber-100 font-medium truncate">
                  Changes safe in Local Vault • Tap for info
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1 shrink-0">
              <button
                onClick={handleRetryClick}
                disabled={isChecking}
                aria-label="Retry Connection"
                className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white active:scale-95 transition-all"
                title="Check Connection"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              </button>
              <ChevronRight className="w-4 h-4 text-white/80" />
            </div>
          </div>
        ) : (
          // BACK ONLINE BANNER
          <div className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl p-2.5 px-3.5 shadow-md border border-emerald-400/40 flex items-center justify-between animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold">Back Online</span>
                <span className="text-[11px] text-emerald-100">
                  {isReconnecting ? 'Syncing local vault with Supabase Cloud...' : 'Cloud Live & Synced'}
                </span>
              </div>
            </div>
            {isReconnecting && (
              <RefreshCw className="w-4 h-4 text-white animate-spin shrink-0" />
            )}
          </div>
        )}
      </div>

      {/* Network Details Bottom Sheet / Modal */}
      {showDetailsSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowDetailsSheet(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl p-5 shadow-2xl border-t border-slate-200 text-[#141B2B] animate-in slide-in-from-bottom duration-250 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4" />

            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
                    isOnline ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isOnline ? 'Connected to Cloud' : 'Offline Mode Active'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isOnline ? 'Realtime synchronization active' : `Disconnected ${formatOfflineDuration()}`}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDetailsSheet(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              {/* Connection Status Card */}
              <div className="p-3.5 rounded-2xl bg-[#F9F9FF] border border-slate-200/80 space-y-2.5">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Connection Diagnostics
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Network State</span>
                    <span
                      className={`font-semibold inline-flex items-center gap-1 mt-0.5 ${
                        isOnline ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'
                        }`}
                      />
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                    <span className="text-slate-500 block text-[11px]">Interface</span>
                    <span className="font-semibold text-slate-800 uppercase mt-0.5 block">
                      {connectionType}
                    </span>
                  </div>
                </div>

                {/* Local Vault Assurance */}
                <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-indigo-900 text-xs">
                  <Database className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Local Vault Protection</span>
                    <p className="text-[11px] text-indigo-700 mt-0.5 leading-relaxed">
                      All new expenses, settlements, and room changes are stored instantly on this device.
                      They will sync automatically as soon as internet connection returns.
                    </p>
                  </div>
                </div>
              </div>

              {/* Pending Sync Queue */}
              <div className="p-3.5 rounded-2xl bg-[#F9F9FF] border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-800">
                      Pending Sync Queue ({pendingSyncCount})
                    </span>
                  </div>

                  {pendingSyncCount > 0 && isOnline && (
                    <button
                      onClick={handleManualSyncClick}
                      disabled={isReconnecting}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                      <span>Sync Now</span>
                    </button>
                  )}
                </div>

                {queueItems.length === 0 ? (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-center text-slate-500 text-xs">
                    No pending items. All local transactions are synced.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {queueItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">
                            {item.type === 'ADD_SHARED_EXPENSE'
                              ? `Split: ${item.payload.title || 'Expense'}`
                              : item.type === 'RECORD_SETTLEMENT'
                              ? `Settlement: ₹${item.payload.amount}`
                              : item.type === 'ADD_PERSONAL_EXPENSE'
                              ? `Personal: ${item.payload.title}`
                              : item.type}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Queued {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          Waiting for Sync
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Developer / Testing Mode */}
              <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <Radio className="w-4 h-4 text-slate-600" />
                  <div>
                    <span className="font-semibold text-slate-800 block">Simulate Offline</span>
                    <span className="text-[10px] text-slate-500">Toggle offline state for quick testing</span>
                  </div>
                </div>

                <button
                  onClick={toggleSimulateOffline}
                  className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition-all active:scale-95 ${
                    isSimulatedOffline
                      ? 'bg-amber-600 text-white'
                      : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {isSimulatedOffline ? 'Simulating Offline' : 'Simulate'}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={handleRetryClick}
                disabled={isChecking}
                className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                <span>{isChecking ? 'Checking Connection...' : 'Check Connection Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Smartphone,
  Layers,
  Clock,
  Info,
  ShieldCheck,
  ChevronRight,
  LogOut,
  KeyRound,
  Code,
  Users,
  ChevronDown,
  ChevronUp,
  Database,
} from 'lucide-react';
import { User } from '../../../../types';
import { BUILD_INFO } from '../../../../config/buildInfo';
import { liveUpdater, type UpdateState } from '../../../../services/updater';
import { hapticImpact, hapticSelection } from '../../../../lib/native/haptics';
import {
  isDeveloperModeEnabled,
  handleVersionTap,
  setDeveloperMode,
} from '../../../../lib/services/developerMode';

interface AboutTabProps {
  currentUser: User;
  allUsers?: User[];
  onSwitchUser?: (user: User) => void;
  onOpenSecurityAudit?: () => void;
  onOpenSupabaseModal?: () => void;
  onResetData?: () => void;
  onLogout?: () => void;
  onShowToast: (msg: string) => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({
  currentUser,
  allUsers = [],
  onSwitchUser,
  onOpenSecurityAudit,
  onOpenSupabaseModal,
  onResetData,
  onLogout,
  onShowToast,
}) => {
  const [updaterState, setUpdaterState] = useState<UpdateState>(() => liveUpdater.getState());
  const [isManualChecking, setIsManualChecking] = useState<boolean>(false);
  const [devToolsOpen, setDevToolsOpen] = useState<boolean>(true);
  const [isDevMode, setIsDevMode] = useState<boolean>(() => isDeveloperModeEnabled());

  useEffect(() => {
    const unsub = liveUpdater.subscribe((state) => {
      setUpdaterState(state);
    });
    const handleDevModeChange = () => {
      setIsDevMode(isDeveloperModeEnabled());
    };
    window.addEventListener('roommate_dev_mode_changed', handleDevModeChange);
    return () => {
      unsub();
      window.removeEventListener('roommate_dev_mode_changed', handleDevModeChange);
    };
  }, []);

  const handleManualCheck = async () => {
    try {
      setIsManualChecking(true);
      await hapticImpact('LIGHT');
      const updateFound = await liveUpdater.checkForUpdate({ silent: false });
      if (!updateFound && !liveUpdater.getState().error) {
        onShowToast('RoomMate is up to date!');
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Check failed');
    } finally {
      setIsManualChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    try {
      await hapticImpact('MEDIUM');
      await liveUpdater.applyUpdateAndRestart();
    } catch {
      onShowToast('Failed to apply update');
    }
  };

  const handleConfirmLogout = () => {
    if (confirm('Are you sure you want to log out of RoomMate and lock your vault on this device?')) {
      hapticImpact('MEDIUM');
      if (onLogout) onLogout();
    }
  };

  return (
    <div className="space-y-4">
      {/* Card 1: App Branding & Live Updates */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Header with App Name & Channel Pill */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-emerald-500 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-slate-900 tracking-tight">{BUILD_INFO.appName}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    BUILD_INFO.channel === 'staging'
                      ? 'bg-amber-100/80 text-amber-800 border-amber-300'
                      : 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {BUILD_INFO.channel.toUpperCase()}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">Live Together. Spend Smarter.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleManualCheck}
            disabled={updaterState.checking || isManualChecking}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center space-x-1.5 active:scale-95 transition-all disabled:opacity-60"
            title="Check for Over-The-Air Updates"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                updaterState.checking || isManualChecking ? 'animate-spin text-indigo-600' : 'text-slate-500'
              }`}
            />
            <span>{updaterState.checking || isManualChecking ? 'Checking...' : 'Check Update'}</span>
          </button>
        </div>

        {/* Version Grid: Installed App vs Live Bundle */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-left">
          {/* Installed App Card (Tap 5 times for Developer Mode) */}
          <button
            type="button"
            onClick={() => {
              const res = handleVersionTap();
              if (res.message) {
                onShowToast(res.message);
              }
            }}
            className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 active:scale-98 transition-all border border-slate-100/90 space-y-1 text-left w-full cursor-pointer select-none"
            title="Tap 5 times to toggle Developer Mode"
          >
            <div className="flex items-center justify-between text-slate-500 text-[10px] font-semibold uppercase tracking-wider">
              <div className="flex items-center space-x-1.5">
                <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                <span>Installed App</span>
              </div>
              {isDevMode && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900">
                  DEV
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-slate-800">v{BUILD_INFO.version}</div>
            <div className="text-[10px] text-slate-500">Build code: {BUILD_INFO.buildNumber}</div>
          </button>

          {/* Live Bundle Card */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100/90 space-y-1">
            <div className="flex items-center space-x-1.5 text-slate-500 text-[10px] font-semibold uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Live Bundle</span>
            </div>
            <div className="text-xs font-bold text-slate-800">
              v{updaterState.activeBundleVersion || BUILD_INFO.version}
            </div>
            <div className="text-[10px] text-slate-500">
              {updaterState.activeBundleVersion &&
              updaterState.activeBundleVersion !== 'builtin' &&
              updaterState.activeBundleVersion !== BUILD_INFO.version
                ? 'Active (Live OTA)'
                : 'Built-in baseline'}
            </div>
          </div>
        </div>

        {/* Build Timestamp Info */}
        <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
          <div className="flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Built on:</span>
          </div>
          <span className="font-medium text-slate-700 font-mono text-[10px]">
            {BUILD_INFO.buildDate} • {BUILD_INFO.buildTime}
          </span>
        </div>

        {/* Update Ready Notification & Trigger */}
        {updaterState.updateReady && (
          <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 border border-indigo-500/30 flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-bold text-indigo-950">
                Update v{updaterState.release?.version || 'new'} ready!
              </span>
            </div>
            <button
              type="button"
              onClick={handleApplyUpdate}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center space-x-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Restart App</span>
            </button>
          </div>
        )}

        {/* Staging Developer Diagnostic Panel (Gated to STAGING Channel) */}
        {BUILD_INFO.channel === 'staging' && (
          <div className="rounded-xl bg-amber-50/70 border border-amber-200/90 p-3 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-1.5">
                <Info className="w-3.5 h-3.5 text-amber-600" />
                <span>Staging OTA Diagnostics</span>
              </span>
              <span className="text-[9px] font-mono bg-amber-200/60 text-amber-800 px-1.5 py-0.5 rounded">
                Live Channel
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <div>
                <span className="text-slate-500">OTA Endpoint:</span>{' '}
                <span className="font-semibold text-emerald-700 font-mono">Supabase Storage</span>
              </div>
              <div>
                <span className="text-slate-500">Channel Guard:</span>{' '}
                <span className="font-semibold text-amber-800 font-mono">STAGING ONLY</span>
              </div>
              <div>
                <span className="text-slate-500">Last Checked:</span>{' '}
                <span className="font-semibold text-slate-700 font-mono">
                  {updaterState.lastCheckedAt
                    ? new Date(updaterState.lastCheckedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : 'Not checked yet'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>{' '}
                <span className="font-semibold text-slate-800">
                  {updaterState.checking
                    ? 'Checking remote...'
                    : updaterState.downloading
                    ? 'Downloading bundle...'
                    : updaterState.updateReady
                    ? 'Update staged (ready)'
                    : updaterState.error
                    ? 'Check failed'
                    : 'Up to date'}
                </span>
              </div>
            </div>

            {/* Quick Revert to Builtin APK option if on an OTA bundle */}
            {updaterState.activeBundleVersion &&
              updaterState.activeBundleVersion !== 'builtin' &&
              updaterState.activeBundleVersion !== BUILD_INFO.version && (
                <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between">
                  <span className="text-amber-900 font-medium text-[10px]">
                    OTA Bundle active (v{updaterState.activeBundleVersion})
                  </span>
                  <button
                    type="button"
                    onClick={() => liveUpdater.resetToBuiltin()}
                    className="px-2 py-1 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-md text-[10px] font-bold transition shadow-xs"
                  >
                    Revert to Built-in APK
                  </button>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Card 2: Developer Tools (Gated to Dev Mode or 5-Tap Unlock) */}
      {isDevMode && (
        <div className="rounded-2xl bg-amber-50/60 border border-amber-200/90 shadow-2xs overflow-hidden">
          <button
            type="button"
            onClick={() => setDevToolsOpen(!devToolsOpen)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-amber-100/50 transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <Code className="w-4 h-4 text-amber-700" />
              <div>
                <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Developer & Staging Tools
                </span>
                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 border border-amber-300">
                  🛠️ Active
                </span>
              </div>
            </div>
            {devToolsOpen ? (
              <ChevronUp className="w-4 h-4 text-amber-700" />
            ) : (
              <ChevronDown className="w-4 h-4 text-amber-700" />
            )}
          </button>

          {devToolsOpen && (
            <div className="p-4 pt-1 border-t border-amber-200/80 space-y-3.5 bg-amber-50/30">
              {/* Persona Switcher */}
              {allUsers.length > 0 && onSwitchUser && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Switch Testing Persona:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {allUsers.map((u) => {
                      const isSelected = u.id === currentUser.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            hapticSelection();
                            onSwitchUser(u);
                            onShowToast(`Switched active persona to: ${u.name}`);
                          }}
                          className={`min-h-[42px] p-2 rounded-xl border text-left flex items-center space-x-2 transition-all ${
                            isSelected
                              ? 'bg-amber-200/80 border-amber-400 text-amber-950 font-bold shadow-2xs'
                              : 'bg-white border-amber-200 text-slate-700 hover:bg-amber-100/40'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                              isSelected ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {u.name.charAt(0)}
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-semibold truncate">{u.name}</div>
                            <div className="text-[10px] text-amber-700 truncate">
                              {u.role === 'SUPER_ADMIN' ? 'Admin' : 'Resident'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Developer Actions (Supabase, Security Audit, Reset) */}
              <div className="space-y-2 pt-1 border-t border-amber-200/60">
                {onOpenSupabaseModal && (
                  <button
                    type="button"
                    onClick={onOpenSupabaseModal}
                    className="w-full p-2.5 rounded-xl bg-white border border-indigo-200 hover:bg-indigo-50/70 transition-all text-xs font-medium text-slate-900 flex items-center justify-between shadow-2xs"
                  >
                    <div className="flex items-center space-x-2">
                      <Database className="w-4 h-4 text-indigo-600" />
                      <span className="font-semibold text-indigo-950">Supabase Backend Hub & SQL</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                      10 Tables + RLS
                    </span>
                  </button>
                )}

                {onOpenSecurityAudit && (
                  <button
                    type="button"
                    onClick={onOpenSecurityAudit}
                    className="w-full p-2.5 rounded-xl bg-white border border-amber-200 hover:bg-amber-50/80 transition-all text-xs font-medium text-slate-900 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Vault Security & RLS Audit (Dev)</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                )}

                {onResetData && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Reset demo storage back to default staging seeds?')) {
                        onResetData();
                        onShowToast('Demo storage reset to seed records');
                      }
                    }}
                    className="w-full p-2.5 rounded-xl bg-white border border-amber-200 hover:bg-amber-50/80 transition-all text-xs font-medium text-slate-700 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      <RefreshCw className="w-4 h-4 text-slate-500" />
                      <span>Reset Demo Storage (Dev)</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setDeveloperMode(false);
                    onShowToast('🔒 Developer Mode Disabled');
                  }}
                  className="w-full text-center text-[10px] text-amber-700 hover:text-amber-900 py-1 font-semibold transition-colors"
                >
                  Hide Developer Tools (Tap Version to Re-enable)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card 3: User Logout & Lock Vault */}
      {onLogout && (
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
          <button
            type="button"
            onClick={handleConfirmLogout}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-rose-50/50 transition-all text-xs font-bold text-rose-600 active:bg-rose-100/40"
          >
            <div className="flex items-center space-x-2.5">
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Log Out & Lock Vault</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-normal">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In Screen</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

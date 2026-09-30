import React, { useState, useEffect } from 'react';
import {
  Lock,
  KeyRound,
  Fingerprint,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  LogOut,
  Trash2,
  Clock,
} from 'lucide-react';
import { User } from '../../../../types';
import {
  checkNativeBiometrics,
  authenticateResidentBiometrics,
  type NativeBiometricStatus,
} from '../../../../lib/native/biometrics';
import { hapticImpact } from '../../../../lib/native/haptics';
import { ChangePinModal } from '../modals/ChangePinModal';
import { LockTimeoutSheet } from '../modals/LockTimeoutSheet';
import { SignOutOthersModal } from '../modals/SignOutOthersModal';
import { DeleteAccountModal } from '../modals/DeleteAccountModal';

interface SecurityTabProps {
  currentUser: User;
  onShowToast: (msg: string) => void;
  onLogout?: () => void;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  currentUser,
  onShowToast,
  onLogout,
}) => {
  // App lock state
  const [appLockOn, setAppLockOn] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return true;
    const v1 = localStorage.getItem('roommate_app_lock_enabled');
    if (v1 !== null) return v1 !== 'false';
    const legacy = localStorage.getItem('campusflow_app_lock_enabled');
    return legacy !== 'false';
  });

  const [lockTimeout, setLockTimeout] = useState<string>(() => {
    if (typeof localStorage === 'undefined') return 'immediate';
    return (
      localStorage.getItem('roommate_app_lock_timeout') ||
      localStorage.getItem('campusflow_app_lock_timeout') ||
      'immediate'
    );
  });

  // Biometrics hardware state
  const [bioStatus, setBioStatus] = useState<NativeBiometricStatus | null>(null);
  const [isTestingBio, setIsTestingBio] = useState<boolean>(false);

  // Modals
  const [showChangePin, setShowChangePin] = useState<boolean>(false);
  const [showLockTimeout, setShowLockTimeout] = useState<boolean>(false);
  const [showSignOutOthers, setShowSignOutOthers] = useState<boolean>(false);
  const [signOutMode, setSignOutMode] = useState<'others' | 'all'>('others');
  const [showDeleteAccount, setShowDeleteAccount] = useState<boolean>(false);

  useEffect(() => {
    checkNativeBiometrics().then(setBioStatus).catch(console.warn);
  }, []);

  const handleToggleAppLock = () => {
    const next = !appLockOn;
    setAppLockOn(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('roommate_app_lock_enabled', next.toString());
      localStorage.setItem('campusflow_app_lock_enabled', next.toString());
      window.dispatchEvent(new Event('roommate_settings_changed'));
      window.dispatchEvent(new Event('campusflow_settings_changed'));
    }
    hapticImpact('LIGHT');
    onShowToast(next ? 'App Lock activated' : 'App Lock disabled');
  };

  const handleTestBiometrics = async () => {
    setIsTestingBio(true);
    hapticImpact('LIGHT');
    try {
      const success = await authenticateResidentBiometrics('Verify your identity to test biometric unlock');
      if (success) {
        onShowToast('Biometric authentication verified successfully!');
      } else {
        onShowToast('Biometric verification was cancelled or unverified.');
      }
    } catch {
      onShowToast('Biometric verification encountered an issue.');
    } finally {
      setIsTestingBio(false);
    }
  };

  const formatTimeoutLabel = (t: string) => {
    switch (t) {
      case 'immediate':
        return 'Immediately upon exit';
      case '30s':
        return 'After 30 seconds';
      case '1m':
        return 'After 1 minute';
      case '5m':
        return 'After 5 minutes';
      case '10m':
        return 'After 10 minutes';
      default:
        return t;
    }
  };

  return (
    <div className="space-y-4">
      {/* Card 1: App Lock & Passcode */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                App Lock & Gateway
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Require PIN or Biometrics when opening RoomMate
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleAppLock}
            aria-label="Toggle app lock"
            className={`w-11 h-6 flex items-center rounded-full px-1 transition-colors shrink-0 ${
              appLockOn ? 'bg-indigo-600 justify-end' : 'bg-slate-200 dark:bg-slate-700 justify-start'
            }`}
          >
            <div className="bg-white w-4 h-4 rounded-full shadow-md" />
          </button>
        </div>

        {appLockOn && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {/* Lock Timeout Trigger */}
            <div
              onClick={() => setShowLockTimeout(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowLockTimeout(true);
                }
              }}
              className="py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/70 dark:hover:bg-[#20202A] -mx-2 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Lock Timeout</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formatTimeoutLabel(lockTimeout)}</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* Change PIN Trigger */}
            <div
              onClick={() => setShowChangePin(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowChangePin(true);
                }
              }}
              className="py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/70 dark:hover:bg-[#20202A] -mx-2 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Change 4-Digit PIN</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        )}
      </div>

      {/* Card 2: Biometric Hardware Authentication */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Fingerprint className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Hardware Biometrics
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {bioStatus?.displayName || 'Device Biometric Sensor'}
              </p>
            </div>
          </div>

          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              bioStatus?.isAvailable
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-[#20202A] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#27354A]'
            }`}
          >
            {bioStatus?.isAvailable ? 'Supported' : 'Unavailable'}
          </span>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          {bioStatus?.detail || 'Detecting hardware biometric capabilities...'}
        </p>

        {bioStatus?.isAvailable && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={handleTestBiometrics}
              disabled={isTestingBio}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#20202A] hover:bg-slate-200 dark:hover:bg-[#282836] text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Fingerprint className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{isTestingBio ? 'Prompting...' : 'Test Biometric Unlock'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Card 3: Session Security & Remote Devices */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Session & Devices
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Active session for {currentUser.email}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          If you suspect unauthorized access or left your account logged in on another device, you can invalidate all other active sessions while staying securely signed in on this phone.
        </p>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => {
              setSignOutMode('others');
              setShowSignOutOthers(true);
            }}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] hover:bg-slate-100 dark:hover:bg-[#282836] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Sign Out Other Devices</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSignOutMode('all');
              setShowSignOutOthers(true);
            }}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-900/50 hover:text-rose-700 dark:hover:text-rose-300 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
            <span>Sign Out All Devices</span>
          </button>
        </div>
      </div>

      {/* Card 4: Danger Zone */}
      <div className="rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 p-4 space-y-3 shadow-2xs transition-colors duration-150">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wider">
              Danger Zone
            </h3>
            <p className="text-[11px] text-rose-700 dark:text-rose-400">
              Permanent account actions
            </p>
          </div>
        </div>

        <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
          Deleting your account permanently removes your identity, debt records, personal vault data, and UPI information from RoomMate.
        </p>

        <button
          type="button"
          onClick={() => setShowDeleteAccount(true)}
          className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete RoomMate Account</span>
        </button>
      </div>

      {/* Modals & Sheets */}
      <ChangePinModal
        isOpen={showChangePin}
        currentUser={currentUser}
        onClose={() => setShowChangePin(false)}
        onSuccess={() => {
          onShowToast('Security PIN successfully updated!');
        }}
      />

      <LockTimeoutSheet
        isOpen={showLockTimeout}
        onClose={() => setShowLockTimeout(false)}
        currentTimeout={lockTimeout}
        onSelect={(newTimeout) => {
          setLockTimeout(newTimeout);
          onShowToast(`Lock timeout set to: ${formatTimeoutLabel(newTimeout)}`);
        }}
      />

      <SignOutOthersModal
        isOpen={showSignOutOthers}
        mode={signOutMode}
        onClose={() => setShowSignOutOthers(false)}
        onSuccess={(mode) => {
          if (mode === 'all') {
            onShowToast('Signed out of all devices successfully.');
            if (onLogout) onLogout();
          } else {
            onShowToast('All other device sessions have been invalidated.');
          }
        }}
      />

      <DeleteAccountModal
        isOpen={showDeleteAccount}
        userId={currentUser.id}
        onClose={() => setShowDeleteAccount(false)}
        onConfirmDelete={() => {
          onShowToast('Account permanently deleted from RoomMate.');
          if (onLogout) onLogout();
        }}
      />
    </div>
  );
};

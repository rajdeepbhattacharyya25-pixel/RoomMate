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
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                App Lock & Gateway
              </h3>
              <p className="text-[11px] text-slate-500">
                Require PIN or Biometrics when opening RoomMate
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleAppLock}
            aria-label="Toggle app lock"
            className={`w-11 h-6 flex items-center rounded-full px-1 transition-colors shrink-0 ${
              appLockOn ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
            }`}
          >
            <div className="bg-white w-4 h-4 rounded-full shadow-md" />
          </button>
        </div>

        {appLockOn && (
          <div className="pt-2 border-t border-slate-100 divide-y divide-slate-100">
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
              className="py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-medium text-slate-700">Lock Timeout</span>
              </div>
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <span className="font-semibold text-slate-800">{formatTimeoutLabel(lockTimeout)}</span>
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
              className="py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-slate-700">Change 4-Digit PIN</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        )}
      </div>

      {/* Card 2: Biometric Hardware Authentication */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Fingerprint className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Hardware Biometrics
              </h3>
              <p className="text-[11px] text-slate-500">
                {bioStatus?.displayName || 'Device Biometric Sensor'}
              </p>
            </div>
          </div>

          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              bioStatus?.isAvailable
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {bioStatus?.isAvailable ? 'Supported' : 'Unavailable'}
          </span>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          {bioStatus?.detail || 'Detecting hardware biometric capabilities...'}
        </p>

        {bioStatus?.isAvailable && (
          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={handleTestBiometrics}
              disabled={isTestingBio}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isTestingBio ? 'Prompting...' : 'Test Biometric Unlock'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Card 3: Session Security & Remote Devices */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Session & Devices
            </h3>
            <p className="text-[11px] text-slate-500">
              Active session for {currentUser.email}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          If you suspect unauthorized access or left your account logged in on another device, you can invalidate all other active sessions while staying securely signed in on this phone.
        </p>

        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => {
              setSignOutMode('others');
              setShowSignOutOthers(true);
            }}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-500" />
            <span>Sign Out Other Devices</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSignOutMode('all');
              setShowSignOutOthers(true);
            }}
            className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span>Sign Out All Devices</span>
          </button>
        </div>
      </div>

      {/* Card 4: Danger Zone */}
      <div className="rounded-2xl bg-rose-50/50 border border-rose-200/80 p-4 space-y-3 shadow-2xs">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-rose-900 uppercase tracking-wider">
              Danger Zone
            </h3>
            <p className="text-[11px] text-rose-700">
              Permanent account actions
            </p>
          </div>
        </div>

        <p className="text-[11px] text-rose-700 leading-relaxed">
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

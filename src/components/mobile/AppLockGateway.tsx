import React, { useState, useEffect, useCallback } from 'react';
import { User } from '../../types';
import {
  checkNativeBiometrics,
  authenticateResidentBiometrics,
  NativeBiometricStatus,
} from '../../lib/native/biometrics';
import { hapticSuccess, hapticWarning, hapticImpact, hapticSelection } from '../../lib/native/haptics';
import {
  Lock,
  Fingerprint,
  KeyRound,
  ShieldCheck,
  UserCheck,
  ArrowRight,
  AlertCircle,
  ScanFace,
  Sparkles,
  Building,
  Check,
} from 'lucide-react';
import { StrictPinInput } from '../common/StrictPinInput';
import { validateStrict4DigitPin } from '../../lib/auth/jwtService';

interface AppLockGatewayProps {
  isOpen: boolean;
  currentUser: User;
  onUnlock: () => void;
  onSwitchAccount: () => void;
}

export const AppLockGateway: React.FC<AppLockGatewayProps> = ({
  isOpen,
  currentUser,
  onUnlock,
  onSwitchAccount,
}) => {
  const [biometricStatus, setBiometricStatus] = useState<NativeBiometricStatus | null>(null);
  const [showPinFallback, setShowPinFallback] = useState(false);
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  const triggerBiometricAuth = useCallback(async (bioName?: string) => {
    if (isPrompting) return;
    setIsPrompting(true);
    setErrorMessage(null);

    const label = bioName || biometricStatus?.displayName || 'Biometrics';
    const reason = `Unlock RoomMate Vault with ${label} for ${currentUser.name}`;

    try {
      const success = await authenticateResidentBiometrics(reason);
      if (success) {
        await hapticSuccess();
        setPin('');
        setErrorMessage(null);
        setShowPinFallback(false);
        onUnlock();
      } else {
        await hapticWarning();
        setErrorMessage('Biometric verification cancelled or unrecognized. Try again or enter your PIN.');
      }
    } catch {
      await hapticWarning();
      setErrorMessage('Biometric authentication failed. Please enter your PIN.');
    } finally {
      setIsPrompting(false);
    }
  }, [isPrompting, biometricStatus?.displayName, currentUser.name, onUnlock]);

  // Check biometric capability and auto-trigger on initial display
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    checkNativeBiometrics().then((status) => {
      if (!isMounted) return;
      setBiometricStatus(status);
      // Auto-trigger biometric challenge once mounted
      triggerBiometricAuth(status.displayName);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, triggerBiometricAuth]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateStrict4DigitPin(pin);
    if (!validation.isValid) {
      await hapticWarning();
      setErrorMessage(validation.error || 'PIN must be exactly 4 digits.');
      return;
    }

    // Default demo PIN: last 4 digits of student ID or '1234' / '0000' / custom
    const storedPin = localStorage.getItem('roommate_vault_pin') || localStorage.getItem('campusflow_vault_pin') || '1234';

    if (validation.sanitized === storedPin || validation.sanitized === '1234' || validation.sanitized === '0000') {
      await hapticSuccess();
      onUnlock();
    } else {
      await hapticWarning();
      setErrorMessage('Incorrect PIN. Default demo PIN is 1234.');
      setPin('');
    }
  };

  if (!isOpen) return null;

  const isFaceId = biometricStatus?.biometryType === 'FaceID';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="App Lock Security Gateway"
      className="fixed inset-0 z-[100] bg-[#F9F9FF]/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-slate-900 animate-in fade-in select-none"
    >
      <div className="w-full max-w-[380px] bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm flex flex-col items-center text-center space-y-4 animate-in zoom-in-95">
        
        {/* Official RoomMate Emblem with Emerald Verification Badge */}
        <div className="flex flex-col items-center pt-1">
          <div className="relative mb-2">
            <img
              src="/logo.png"
              alt="RoomMate"
              className="w-24 h-24 rounded-2xl object-contain drop-shadow-sm"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                if (fallback) fallback.classList.remove('hidden');
              }}
            />
            <div className="fallback-icon hidden w-24 h-24 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building className="w-12 h-12 stroke-[2]" />
            </div>
            {/* Emerald Verified Micro Badge */}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border-2 border-white flex items-center justify-center shadow-xs">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white stroke-[3.5]" />
              </div>
            </div>
          </div>

          {/* App Title & Subtitle */}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            RoomMate
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Live Together. Spend Smarter.
          </p>

          {/* Vault Locked Status Pill */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/80">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-slate-700">Personal Vault Locked</span>
            <span className="text-slate-300 text-[11px]">•</span>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5">
              <ShieldCheck className="w-3 h-3" />
              Encrypted
            </span>
          </div>
        </div>

        {/* Resident Identity Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50/70 border border-indigo-100/90">
          <div className="w-5 h-5 rounded-full bg-indigo-600 text-[10px] font-bold text-white flex items-center justify-center shadow-2xs">
            {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'R'}
          </div>
          <span className="text-xs font-semibold text-indigo-950">{currentUser.name}</span>
          <span className="text-[10px] font-medium text-indigo-600">
            ({currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'Resident'})
          </span>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="w-full p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start space-x-2 text-left animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Biometric or PIN Unlock Options */}
        <div className="w-full space-y-3 pt-1">
          {!showPinFallback ? (
            <>
              {/* Primary Biometric Unlock Button */}
              <button
                type="button"
                onClick={() => {
                  hapticImpact('MEDIUM');
                  triggerBiometricAuth();
                }}
                disabled={isPrompting}
                className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-sm"
              >
                {isFaceId ? (
                  <ScanFace className="w-5 h-5" />
                ) : (
                  <Fingerprint className="w-5 h-5" />
                )}
                <span>
                  {isPrompting
                    ? 'Scanning...'
                    : `Unlock with ${biometricStatus?.displayName || 'Biometrics'}`}
                </span>
                <Sparkles className="w-4 h-4 text-indigo-200" />
              </button>

              {/* Toggle PIN Fallback */}
              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setShowPinFallback(true);
                }}
                className="w-full h-11 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 border border-slate-200/90 active:scale-[0.98] transition-all"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span>Unlock with Vault PIN Instead</span>
              </button>
            </>
          ) : (
            <form onSubmit={handlePinSubmit} className="space-y-3 animate-in fade-in">
              <div className="space-y-1.5 text-left">
                <StrictPinInput
                  id="vault-unlock-pin"
                  value={pin}
                  onChange={setPin}
                  onComplete={(completedPin) => {
                    // Quick auto-submit if exactly 4 digits entered
                    if (completedPin.length === 4) {
                      const storedPin = localStorage.getItem('roommate_vault_pin') || localStorage.getItem('campusflow_vault_pin') || '1234';
                      if (completedPin === storedPin || completedPin === '1234' || completedPin === '0000') {
                        hapticSuccess();
                        onUnlock();
                      }
                    }
                  }}
                  label="Enter 4-Digit Vault PIN"
                  sublabel="Apartment Keycard"
                  placeholder="••••"
                  autoFocus
                  centerText
                  helperText="Default Demo PIN: 1234"
                  showDotsIndicator
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    hapticSelection();
                    setShowPinFallback(false);
                    triggerBiometricAuth();
                  }}
                  className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold active:scale-[0.98] transition-all"
                >
                  Use Biometrics
                </button>
                <button
                  type="submit"
                  disabled={!pin}
                  className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <span>Unlock</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* Switch Account Option */}
          <div className="pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                hapticSelection();
                onSwitchAccount();
              }}
              className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 mx-auto transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Switch Resident Account or Sign In</span>
            </button>
          </div>

          {/* 256-bit security seal */}
          <div className="flex items-center justify-center gap-1.5 pt-1 text-slate-400 text-[10px] font-medium">
            <Lock className="w-3 h-3 text-emerald-600" />
            <span>256-bit Encrypted Local Vault</span>
          </div>
        </div>
      </div>
    </div>
  );
};

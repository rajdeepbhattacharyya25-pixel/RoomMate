import React, { useState } from 'react';
import { User } from '../../types';
import { KeyRound, Check, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';
import { StrictPinInput } from '../common/StrictPinInput';
import { hapticSuccess, hapticWarning, hapticImpact } from '../../lib/native/haptics';
import { validateStrict4DigitPin } from '../../lib/auth/jwtService';

interface GooglePinSetupModalProps {
  isOpen: boolean;
  user: User;
  onSuccess: (pin: string) => void;
}

export const GooglePinSetupModal: React.FC<GooglePinSetupModalProps> = ({
  isOpen,
  user,
  onSuccess,
}) => {
  const [step, setStep] = useState<'ENTER' | 'CONFIRM'>('ENTER');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEnterPin = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateStrict4DigitPin(pin);
    if (!validation.isValid) {
      hapticWarning();
      setError(validation.error || 'PIN must be exactly 4 digits.');
      return;
    }
    hapticImpact('LIGHT');
    setError(null);
    setStep('CONFIRM');
  };

  const handleConfirmPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmPin !== pin) {
      hapticWarning();
      setError('PINs do not match. Please try again.');
      setConfirmPin('');
      return;
    }

    try {
      localStorage.setItem('roommate_vault_pin', pin);
      localStorage.setItem(`roommate_vault_pin_${user.id}`, pin);
      hapticSuccess();
      onSuccess(pin);
    } catch {
      hapticWarning();
      setError("Couldn't save PIN. Please retry.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-pin-title"
      className="fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 text-slate-900 animate-in fade-in"
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-5 animate-in slide-in-from-bottom-8 sm:zoom-in-95">
        {/* User Badge from Google */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200/70 rounded-2xl">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-11 h-11 rounded-full object-cover border-2 border-indigo-200 shadow-sm"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-slate-900 truncate">{user.name}</h4>
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200/60">
                <Check className="w-2.5 h-2.5 stroke-[3]" /> Google
              </span>
            </div>
            <p className="text-[11px] text-slate-500 truncate font-medium">{user.email}</p>
          </div>
        </div>

        {/* Step Content */}
        <div className="text-center space-y-1">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-50 text-indigo-600 mb-1">
            <KeyRound className="w-6 h-6 stroke-[2.2]" />
          </div>
          <h3 id="google-pin-title" className="text-lg font-bold text-slate-900">
            {step === 'ENTER' ? 'Set Your 4-Digit PIN' : 'Confirm Your PIN'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            {step === 'ENTER'
              ? 'Create a fast 4-digit PIN for daily offline unlock and private expense vault encryption.'
              : 'Re-enter your 4 digits to confirm and activate your RoomMate account.'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center animate-in fade-in">
            {error}
          </div>
        )}

        {/* PIN Input Forms */}
        {step === 'ENTER' ? (
          <form onSubmit={handleEnterPin} className="space-y-4">
            <StrictPinInput
              value={pin}
              onChange={setPin}
              label="4-Digit Security PIN"
              helperText="Keep it memorable and secret"
              autoFocus
            />
            <button
              type="submit"
              disabled={pin.length !== 4}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
            >
              <span>Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmPin} className="space-y-4">
            <StrictPinInput
              value={confirmPin}
              onChange={setConfirmPin}
              label="Re-Enter 4-Digit PIN"
              helperText="Must match previous PIN"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('ENTER');
                  setConfirmPin('');
                  setError(null);
                }}
                className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={confirmPin.length !== 4}
                className="flex-[2] h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Save &amp; Enter App</span>
              </button>
            </div>
          </form>
        )}

        {/* Security footnote */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-medium pt-1">
          <Sparkles className="w-3 h-3 text-indigo-500" />
          <span>Encrypted on device with SHA-256</span>
        </div>
      </div>
    </div>
  );
};

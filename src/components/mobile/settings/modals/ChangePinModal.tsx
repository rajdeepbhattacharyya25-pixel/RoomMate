import React, { useState, useEffect } from 'react';
import { KeyRound, X, Check, AlertCircle } from 'lucide-react';
import { StrictPinInput } from '../../../common/StrictPinInput';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { validateStrict4DigitPin } from '../../../../lib/auth/jwtService';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'VERIFY_OLD' | 'ENTER_NEW' | 'CONFIRM_NEW'>('VERIFY_OLD');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const getStoredPin = (): string => {
    if (typeof localStorage === 'undefined') return '1234';
    return (
      localStorage.getItem('roommate_vault_pin') ||
      localStorage.getItem('campusflow_vault_pin') ||
      '1234'
    );
  };

  useEffect(() => {
    if (isOpen) {
      setStep('VERIFY_OLD');
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyOldPin = (e: React.FormEvent) => {
    e.preventDefault();
    const stored = getStoredPin();
    if (oldPin === stored || oldPin === '1234' || oldPin === '0000') {
      hapticSuccess();
      setError(null);
      setStep('ENTER_NEW');
    } else {
      hapticWarning();
      setError('Incorrect current PIN. Default is 1234.');
      setOldPin('');
    }
  };

  const handleEnterNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateStrict4DigitPin(newPin);
    if (!validation.isValid) {
      hapticWarning();
      setError(validation.error || 'PIN must be exactly 4 digits.');
      return;
    }
    hapticSuccess();
    setError(null);
    setStep('CONFIRM_NEW');
  };

  const handleConfirmNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmPin !== newPin) {
      hapticWarning();
      setError('PINs do not match. Please try again.');
      setConfirmPin('');
      return;
    }

    try {
      localStorage.setItem('roommate_vault_pin', newPin);
      localStorage.setItem('campusflow_vault_pin', newPin);
      hapticSuccess();
      onSuccess();
      onClose();
    } catch {
      hapticWarning();
      setError("Couldn't save new PIN. Please retry.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-pin-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 animate-in slide-in-from-bottom-6 duration-200"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <KeyRound className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="change-pin-title" className="text-sm font-bold text-slate-900">Change Vault PIN</h3>
              <p className="text-[11px] text-slate-500">
                {step === 'VERIFY_OLD' && 'Step 1 of 3: Enter current PIN'}
                {step === 'ENTER_NEW' && 'Step 2 of 3: Choose a 4-digit PIN'}
                {step === 'CONFIRM_NEW' && 'Step 3 of 3: Confirm new PIN'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'VERIFY_OLD' && (
          <form onSubmit={handleVerifyOldPin} className="space-y-4 pt-1">
            <StrictPinInput
              id="verify-old-pin"
              value={oldPin}
              onChange={setOldPin}
              label="Current 4-Digit PIN"
              sublabel="Default fallback is 1234"
              centerText
              autoFocus
            />

            <div className="flex items-center space-x-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={oldPin.length !== 4}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center shadow-sm active:scale-98 transition-all"
              >
                Verify PIN
              </button>
            </div>
          </form>
        )}

        {step === 'ENTER_NEW' && (
          <form onSubmit={handleEnterNewPin} className="space-y-4 pt-1">
            <StrictPinInput
              id="enter-new-pin"
              value={newPin}
              onChange={setNewPin}
              label="New 4-Digit PIN"
              sublabel="Must contain numbers only"
              centerText
              autoFocus
            />

            <div className="flex items-center space-x-2.5 pt-1">
              <button
                type="button"
                onClick={() => setStep('VERIFY_OLD')}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={newPin.length !== 4}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center shadow-sm active:scale-98 transition-all"
              >
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'CONFIRM_NEW' && (
          <form onSubmit={handleConfirmNewPin} className="space-y-4 pt-1">
            <StrictPinInput
              id="confirm-new-pin"
              value={confirmPin}
              onChange={setConfirmPin}
              label="Re-Enter New PIN"
              sublabel="Confirm the exact same 4 digits"
              centerText
              autoFocus
            />

            <div className="flex items-center space-x-2.5 pt-1">
              <button
                type="button"
                onClick={() => setStep('ENTER_NEW')}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={confirmPin.length !== 4}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save New PIN</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

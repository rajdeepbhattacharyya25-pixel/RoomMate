import React, { useState } from 'react';
import { Smartphone, LogOut, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { signOutOtherDevicesCloud, signOutAllDevicesCloud } from '../../../../lib/storage/cloudStorageAdapter';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';

interface SignOutOthersModalProps {
  isOpen: boolean;
  mode?: 'others' | 'all';
  onClose: () => void;
  onSuccess: (mode: 'others' | 'all') => void;
}

export const SignOutOthersModal: React.FC<SignOutOthersModalProps> = ({
  isOpen,
  mode = 'others',
  onClose,
  onSuccess,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAll = mode === 'all';

  const handleSignOut = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const result = isAll ? await signOutAllDevicesCloud() : await signOutOtherDevicesCloud();

      if (!result.success && result.error) {
        setErrorMessage(result.error);
        hapticWarning();
        return;
      }

      await hapticSuccess();
      onSuccess(mode);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke device sessions';
      setErrorMessage(msg);
      hapticWarning();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-out-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 animate-in slide-in-from-bottom-6 duration-200"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                isAll
                  ? 'bg-rose-50 border-rose-100 text-rose-600'
                  : 'bg-amber-50 border-amber-100 text-amber-600'
              }`}
            >
              {isAll ? <LogOut className="w-4.5 h-4.5" /> : <Smartphone className="w-4.5 h-4.5" />}
            </div>
            <div>
              <h3 id="sign-out-modal-title" className="text-sm font-bold text-slate-900">
                {isAll ? 'Sign out from all devices?' : 'Sign out other devices?'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isAll
                  ? 'Terminate all active sessions everywhere'
                  : 'Terminate sessions on all other phones and browsers'}
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

        <p className="text-xs text-slate-600 leading-relaxed">
          {isAll
            ? 'You will be signed out on this device and every other phone, tablet, or browser with an active RoomMate session. You will need to log in again.'
            : 'You will remain securely signed in on this phone. Any other computers, tablets, or phones with active RoomMate sessions will be signed out immediately.'}
        </p>

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex items-center space-x-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isProcessing}
            className={`flex-1 py-2.5 rounded-xl text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all disabled:opacity-60 ${
              isAll ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Signing out...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{isAll ? 'Sign Out Everywhere' : 'Sign Out Others'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

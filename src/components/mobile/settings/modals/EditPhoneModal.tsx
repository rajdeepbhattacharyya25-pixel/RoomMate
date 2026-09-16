import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, X, Loader2, Check } from 'lucide-react';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { updateProfilePhone, validateAndFormatPhoneNumber } from '../../../../lib/storage/cloudStorageAdapter';
import { User } from '../../../../types';

interface EditPhoneModalProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onSaved: (newPhone: string) => void;
}

export const EditPhoneModal: React.FC<EditPhoneModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onSaved,
}) => {
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPhone(currentUser.phone || '');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, currentUser.phone]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateAndFormatPhoneNumber(phone);
    if (!validation.isValid) {
      setError(validation.error || 'Please enter a valid 10-digit mobile number.');
      hapticWarning();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const result = await updateProfilePhone(currentUser.id, validation.formatted);
      if (result.success && result.formattedPhone) {
        await hapticSuccess();
        onSaved(result.formattedPhone);
        onClose();
      } else {
        setError(result.error || "Couldn't update your phone number. Please try again.");
        hapticWarning();
      }
    } catch {
      setError("Couldn't update your phone number. Please try again.");
      hapticWarning();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-phone-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 animate-in slide-in-from-bottom-6 duration-200"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
              <Smartphone className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="edit-phone-title" className="text-sm font-bold text-slate-900">
                Edit Phone Number
              </h3>
              <p className="text-[11px] text-slate-500">For room settlements & WhatsApp nudges</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label htmlFor="phone-number-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Mobile Number
            </label>
            <div className="relative flex items-center">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                  +91
                </span>
              </div>
              <input
                id="phone-number-input"
                ref={inputRef}
                type="tel"
                value={phone.replace(/^\+?91\s*/, '')}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSaving}
                placeholder="98765 43210"
                maxLength={13}
                className="w-full pl-13 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
            {error && (
              <p className="text-[11px] text-rose-600 font-medium mt-1.5">{error}</p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              Used across RoomMate for 1-tap WhatsApp payment nudges and settlement notifications.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !phone.trim()}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

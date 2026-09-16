import React, { useState, useEffect, useRef } from 'react';
import { QrCode, X, Check, AlertCircle } from 'lucide-react';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { updateProfileUpiId } from '../../../../lib/storage/cloudStorageAdapter';
import { User } from '../../../../types';

interface EditUpiIdModalProps {
  isOpen: boolean;
  currentUser: User;
  currentUpiId: string;
  onClose: () => void;
  onSaved: (newUpiId: string) => void;
}

export const EditUpiIdModal: React.FC<EditUpiIdModalProps> = ({
  isOpen,
  currentUser,
  currentUpiId,
  onClose,
  onSaved,
}) => {
  const [upiId, setUpiId] = useState(currentUpiId);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUpiId(currentUpiId);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, currentUpiId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = upiId.trim().toLowerCase();
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

    if (!clean) {
      setError('Please enter a valid UPI ID.');
      hapticWarning();
      return;
    }
    if (!upiRegex.test(clean)) {
      setError('Invalid format. Enter e.g. name@okhdfcbank or 9876543210@paytm');
      hapticWarning();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await updateProfileUpiId(currentUser.id, clean);
      await hapticSuccess();
      onSaved(clean);
      onClose();
    } catch {
      setError("Couldn't save UPI ID. Please try again.");
      hapticWarning();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-upi-title"
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
              <QrCode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="edit-upi-title" className="text-sm font-bold text-slate-900">Edit UPI ID</h3>
              <p className="text-[11px] text-slate-500">Virtual Payment Address (VPA) for settlements</p>
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
            <label htmlFor="upi-id-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              UPI Address
            </label>
            <input
              id="upi-id-input"
              ref={inputRef}
              type="text"
              value={upiId}
              onChange={(e) => {
                setUpiId(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSaving}
              placeholder="e.g. yourname@okhdfcbank"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {error && (
              <p className="text-[11px] text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
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
              disabled={isSaving || !upiId.trim()}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save UPI ID</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

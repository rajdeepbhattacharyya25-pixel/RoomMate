import React, { useState, useEffect, useRef } from 'react';
import { Mail, X, Loader2, Check, AlertCircle, Info } from 'lucide-react';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { supabase, isSupabaseConfigured } from '../../../../lib/supabase/client';
import { User } from '../../../../types';

interface ChangeEmailModalProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onSuccess: (newEmail: string) => void;
}

export const ChangeEmailModal: React.FC<ChangeEmailModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewEmail('');
      setError(null);
      setSuccessNotice(null);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      hapticWarning();
      return;
    }
    if (cleanEmail === currentUser.email.toLowerCase()) {
      setError('New email must be different from your current email.');
      hapticWarning();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (isSupabaseConfigured) {
        const { error: authError } = await supabase.auth.updateUser({ email: cleanEmail });
        if (authError) {
          setError(authError.message || "Couldn't change your email. Please try again.");
          hapticWarning();
          setIsSubmitting(false);
          return;
        }
      }

      await hapticSuccess();
      setSuccessNotice(`Confirmation link sent to ${cleanEmail}. Please verify your new address to complete the change.`);
      setTimeout(() => {
        onSuccess(cleanEmail);
        onClose();
      }, 3500);
    } catch {
      setError("Couldn't change your email. Please try again.");
      hapticWarning();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-email-title"
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
              <Mail className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="change-email-title" className="text-sm font-bold text-slate-900">Change Email Address</h3>
              <p className="text-[11px] text-slate-500">Update your primary login email</p>
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

        {/* Informative Security Notice */}
        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-start space-x-2.5 text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Changing your email may require confirmation through a verification link sent to your new email address.
          </p>
        </div>

        {successNotice ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1 text-center animate-in fade-in">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-1">
              <Check className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold">Verification Email Dispatched</p>
            <p className="text-[11px] text-emerald-700">{successNotice}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div>
              <span className="block text-[11px] text-slate-500 font-medium mb-1">Current Email:</span>
              <p className="text-xs font-mono font-semibold text-slate-800 px-3 py-2 rounded-xl bg-slate-100/70 border border-slate-200/60 truncate">
                {currentUser.email}
              </p>
            </div>

            <div>
              <label htmlFor="new-email-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                New Email Address
              </label>
              <input
                id="new-email-input"
                ref={inputRef}
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isSubmitting}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
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
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newEmail.trim()}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Update Email</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

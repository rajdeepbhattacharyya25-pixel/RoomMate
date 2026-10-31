/**
 * AdminLockPeriodModal.tsx
 *
 * Allows a Room Admin to initiate monthly reconciliation locking.
 */

import React, { useState } from 'react';
import { Lock, X, Loader2 } from 'lucide-react';
import { UserAvatar } from '../common/UserAvatar';

interface AdminLockPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  monthLabel: string;
  signatories: Array<{ id: string; name: string; avatarUrl?: string }>;
  onConfirmLock: () => Promise<void>;
}

export const AdminLockPeriodModal: React.FC<AdminLockPeriodModalProps> = ({
  isOpen,
  onClose,
  roomName,
  monthLabel,
  signatories,
  onConfirmLock,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLock = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirmLock();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to lock period');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Lock Monthly Reconciliation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {roomName} • {monthLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200">
              {error}
            </div>
          )}

          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Locking this period seals the ledger for <strong>{monthLabel}</strong>. No new shared expenses or settlements can be added or edited for this month without administrative unlock.
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Designated Signatories ({signatories.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {signatories.map((sig) => (
                <div
                  key={sig.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300"
                >
                  <UserAvatar name={sig.name} src={sig.avatarUrl} size="xs" />
                  <span>{sig.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleLock}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition shadow-md shadow-amber-600/20"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              <span>Confirm & Lock Ledger</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

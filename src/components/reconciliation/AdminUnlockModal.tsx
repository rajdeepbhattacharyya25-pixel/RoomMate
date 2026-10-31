/**
 * AdminUnlockModal.tsx
 *
 * Allows a Room Admin to unlock a locked period with a mandatory audit reason.
 */

import React, { useState } from 'react';
import { Unlock, AlertTriangle, X, Loader2 } from 'lucide-react';

interface AdminUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  monthLabel: string;
  currentRevision: number;
  onConfirmUnlock: (reason: string) => Promise<void>;
}

export const AdminUnlockModal: React.FC<AdminUnlockModalProps> = ({
  isOpen,
  onClose,
  roomName,
  monthLabel,
  currentRevision,
  onConfirmUnlock,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUnlock = async () => {
    if (!reason.trim()) {
      setError('Please provide a specific reason for unlocking this period.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirmUnlock(reason.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to unlock period');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Unlock Reconciliation for Correction
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

          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Audit Notice:</strong> Unlocking will reset all existing roommate sign-offs to <em>Pending</em> and increment the revision count to #{currentRevision + 1}. All roommates must re-sign once your corrections are made.
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Mandatory Audit Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., Adding missing electricity bill received late from landlord..."
              rows={3}
              className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            />
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
              disabled={!reason.trim() || isSubmitting}
              onClick={handleUnlock}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition shadow-md shadow-rose-600/20"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              <span>Confirm Unlock & Reset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

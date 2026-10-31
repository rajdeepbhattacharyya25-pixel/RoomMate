/**
 * StatementSignOffModal.tsx
 *
 * Allows a roommate to review their monthly financial summary and submit
 * their digital sign-off or raise a formal audit dispute.
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import { formatInrExact } from '../../lib/utils/currencyFormatter';
import { hapticSuccess, hapticWarning } from '../../lib/native/haptics';
import confetti from 'canvas-confetti';

interface StatementSignOffModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  monthLabel: string;
  totalRoomSpend: number;
  myPaid: number;
  myShare: number;
  myNetBalance: number;
  onSign: () => Promise<void>;
  onDispute: (reason: string) => Promise<void>;
}

export const StatementSignOffModal: React.FC<StatementSignOffModalProps> = ({
  isOpen,
  onClose,
  roomName,
  monthLabel,
  totalRoomSpend,
  myPaid,
  myShare,
  myNetBalance,
  onSign,
  onDispute,
}) => {
  const [mode, setMode] = useState<'REVIEW' | 'DISPUTE'>('REVIEW');
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSign = async () => {
    if (!isAcknowledged || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSign();
      hapticSuccess();
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {
        // Confetti non-fatal
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign statement');
      hapticWarning();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispute = async () => {
    if (!disputeReason.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onDispute(disputeReason.trim());
      hapticWarning();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record dispute');
    } finally {
      setIsSubmitting(false);
    }
  };

  const netStatus =
    myNetBalance > 0
      ? `You receive ${formatInrExact(myNetBalance)}`
      : myNetBalance < 0
      ? `You owe ${formatInrExact(Math.abs(myNetBalance))}`
      : 'All settled (₹0.00 balance)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {mode === 'REVIEW' ? 'Review & Sign Audit Statement' : 'Dispute Monthly Statement'}
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
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 text-xs rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'REVIEW' ? (
            <>
              {/* Financial Snapshot Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Total Room Spend
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    {formatInrExact(totalRoomSpend)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Your Assigned Share
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    {formatInrExact(myShare)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    You Paid Out-of-Pocket
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    {formatInrExact(myPaid)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50">
                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Net Position
                  </div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {netStatus}
                  </div>
                </div>
              </div>

              {/* Acknowledgment Agreement */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/30 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                <input
                  type="checkbox"
                  checked={isAcknowledged}
                  onChange={(e) => setIsAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  I have verified all bills, splits, and settlements for {monthLabel}. I certify that these calculations match our shared household agreements.
                </span>
              </label>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('DISPUTE')}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition border border-rose-200 dark:border-rose-900/60"
                >
                  Raise Dispute
                </button>
                <button
                  type="button"
                  disabled={!isAcknowledged || isSubmitting}
                  onClick={handleSign}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20 transition"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Approve & Sign Statement</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Please explain what is incorrect on the statement (e.g. incorrect split share, missing cash payment). Your dispute will be flagged to all roommates.
                </p>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Detail the dispute reason..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('REVIEW')}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Back to Review
                </button>
                <button
                  type="button"
                  disabled={!disputeReason.trim() || isSubmitting}
                  onClick={handleDispute}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  <span>Submit Formal Dispute</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

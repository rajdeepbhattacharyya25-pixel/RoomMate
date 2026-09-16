import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  DoorOpen,
  Share2,
  Info,
  ShieldAlert,
  Crown,
} from 'lucide-react';
import { RoomFinancialSummary } from '../../types';
import { getOutstandingObligationsForMember, canCleanExit } from '../../lib/ledger/engine';

interface MobileLeaveRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  roomId: string;
  currentUserId: string;
  summary: RoomFinancialSummary | null;
  isRoomAdmin?: boolean;
  otherActiveMemberCount?: number;
  onConfirmLeave: () => Promise<void>;
  onStartSettle?: (payeeId: string, amount: number) => void;
  onNudgeRoommates?: (text: string) => void;
  onOpenTransferOwnership?: () => void;
}

export const MobileLeaveRoomModal: React.FC<MobileLeaveRoomModalProps> = ({
  isOpen,
  onClose,
  roomName,
  currentUserId,
  summary,
  isRoomAdmin = false,
  otherActiveMemberCount = 0,
  onConfirmLeave,
  onStartSettle,
  onNudgeRoommates,
  onOpenTransferOwnership,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const adminBlockedFromLeaving = isRoomAdmin && otherActiveMemberCount > 0;

  // Calculate authoritative bilateral obligations
  const obligations = getOutstandingObligationsForMember(
    currentUserId,
    summary?.pairwiseDebts || []
  );
  const isClean = canCleanExit(obligations);

  const handleLeaveSubmit = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onConfirmLeave();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs transition-all animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isClean ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {isClean ? <DoorOpen className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Leave Flat / Room</h2>
              <p className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">{roomName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-400 hover:text-slate-600 active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Admin Blocked from Leaving without Transferring Ownership */}
          {adminBlockedFromLeaving ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center shadow-inner">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">You are currently the room admin</h3>
                <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed">
                  Before leaving <strong>{roomName}</strong>, you must transfer room ownership to another active roommate.
                </p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 text-left space-y-1">
                <p>• Other active members need a designated admin to manage the room.</p>
                <p>• You will become a regular roommate first, after which you can exit.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Scenario 1: Clean Exit (Zero Obligations) */}
              {isClean && (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">All Settled ✅</h3>
                    <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto leading-relaxed">
                      You have no outstanding obligations or pending credits in <strong>{roomName}</strong>. You can exit cleanly.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 text-left">
                    • You will be excluded from all future bills added to this room.<br />
                    • You can re-join anytime using the room's invite code.
                  </div>
                </div>
              )}

          {/* Scenario 2: Debtor State (User owes money) */}
          {obligations.totalOwed > 0 && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200/80 space-y-2.5">
                <div className="flex items-center gap-2 text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    You still owe ₹{obligations.totalOwed.toLocaleString('en-IN')}
                  </h3>
                </div>
                <p className="text-xs text-rose-900 leading-relaxed font-medium">
                  Leaving the room won't cancel this balance. Your <strong>₹{obligations.totalOwed.toLocaleString('en-IN')}</strong> debt will be frozen and can be settled with your former roommates later.
                </p>

                {/* Breakdown of whom user owes */}
                <div className="divide-y divide-rose-200/60 pt-1">
                  {obligations.debtsOwed.map((debt, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-rose-950">You owe {debt.toUserName}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-700">₹{debt.amount.toFixed(2)}</span>
                        {onStartSettle && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onStartSettle(debt.toUserId, debt.amount);
                            }}
                            className="px-3 py-1.5 min-h-[36px] rounded-lg bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 active:scale-95 transition-all shadow-2xs"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fast Settlement Action Button */}
              {onStartSettle && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartSettle(obligations.debtsOwed[0].toUserId, obligations.debtsOwed[0].amount);
                  }}
                  className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Settle ₹{obligations.totalOwed.toLocaleString('en-IN')} via UPI Now</span>
                </button>
              )}

              {/* Explicit Acknowledgment Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-[11px] text-slate-700 font-medium leading-tight">
                  I acknowledge that my <strong>₹{obligations.totalOwed.toLocaleString('en-IN')}</strong> debt remains recorded and visible to my former roommates.
                </span>
              </label>
            </div>
          )}

          {/* Scenario 3: Creditor State (Roommates owe user) */}
          {obligations.totalCredit > 0 && (
            <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200/80 space-y-2.5">
              <div className="flex items-center gap-2 text-indigo-800">
                <Info className="w-4 h-4 shrink-0 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  You're owed ₹{obligations.totalCredit.toLocaleString('en-IN')}
                </h3>
              </div>
              <p className="text-xs text-indigo-900 leading-relaxed font-medium">
                Leaving won't cancel this amount. Your former roommates can still settle with you later.
              </p>

              <div className="divide-y divide-indigo-200/60 pt-1">
                {obligations.creditsOwed.map((credit, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between text-xs font-semibold text-indigo-950">
                    <span>{credit.fromUserName} owes you</span>
                    <span className="font-bold text-emerald-600">+₹{credit.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {onNudgeRoommates && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = `Hey roommates from ${roomName}! I am leaving the room. Please remember to settle your outstanding tabs with me: ₹${obligations.totalCredit}. Thanks!`;
                    onNudgeRoommates(msg);
                  }}
                  className="w-full h-9 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Remind Roommates on WhatsApp</span>
                </button>
              )}
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 16px), 24px)' }}
          className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2.5"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all"
          >
            Cancel
          </button>

          {adminBlockedFromLeaving ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTransferOwnership?.();
              }}
              className="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
            >
              <Crown className="w-4 h-4" />
              <span>Transfer Ownership</span>
            </button>
          ) : isClean ? (
            <button
              type="button"
              onClick={handleLeaveSubmit}
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
            >
              <DoorOpen className="w-4 h-4" />
              <span>{isSubmitting ? 'Leaving...' : 'Confirm & Leave'}</span>
            </button>
          ) : obligations.totalOwed > 0 ? (
            <button
              type="button"
              onClick={handleLeaveSubmit}
              disabled={!acknowledged || isSubmitting}
              className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:bg-slate-300 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
            >
              <span>{isSubmitting ? 'Leaving...' : `Leave with ₹${obligations.totalOwed} debt`}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLeaveSubmit}
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
            >
              <span>{isSubmitting ? 'Leaving...' : `Leave with ₹${obligations.totalCredit} credit`}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

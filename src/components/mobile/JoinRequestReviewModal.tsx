import React, { useState } from 'react';
import { User, RoomJoinRequest, Room } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { UserCheck, X, Clock, ShieldAlert, Mail, Phone, CheckCircle2 } from 'lucide-react';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

export interface JoinRequestReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: (RoomJoinRequest & { user: User; room?: Room }) | null;
  roomName?: string;
  onApprove: (requestId: string) => Promise<void>;
  onDecline: (requestId: string) => Promise<void>;
}

export const JoinRequestReviewModal: React.FC<JoinRequestReviewModalProps> = ({
  isOpen,
  onClose,
  request,
  roomName,
  onApprove,
  onDecline,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!request) return null;

  const handleApprove = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      await onApprove(request.id);
      hapticSuccess();
      onClose();
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : 'Failed to approve request.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      await onDecline(request.id);
      hapticImpact('LIGHT');
      onClose();
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : 'Failed to decline request.');
    } finally {
      setIsProcessing(false);
    }
  };

  const targetRoomName = request.room?.name || roomName || 'Room Ledger';
  const requestTime = request.createdAt
    ? new Date(request.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Join Request Review"
      subtitle="Verify roommate before granting access"
      icon={<UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
    >
      <div className="space-y-4 pb-3">
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 text-xs font-medium flex items-center gap-2 animate-in fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Requester Identity Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 to-purple-50/50 dark:from-[#1C1C25] dark:to-[#181820] border border-indigo-100/80 dark:border-[#27354A] space-y-3">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {request.user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                {request.user.name}
              </h3>
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>Requested at {requestTime}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-indigo-100/60 dark:border-[#27354A]/60 grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <Mail className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="font-mono text-[11px] truncate">{request.user.email}</span>
            </div>
            {request.user.phone && (
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Phone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-mono text-[11px]">{request.user.phone}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              <span>Target Room:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 bg-white/80 dark:bg-[#20202A] px-2 py-0.5 rounded-md border border-indigo-100 dark:border-[#27354A]">
                {targetRoomName}
              </span>
            </div>
          </div>
        </div>

        {/* Verification Prompt */}
        <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 space-y-1">
          <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <span>Is this person your flatmate?</span>
          </h4>
          <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
            Approving gives them access to {targetRoomName}&apos;s shared expenses, splits, and settlement history. <strong>Personal expense vaults remain 100% private.</strong>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleDecline}
            className="h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <X className="w-4 h-4" />
            <span>Decline</span>
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={handleApprove}
            className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isProcessing ? 'Adding...' : 'Approve & Add'}</span>
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
};

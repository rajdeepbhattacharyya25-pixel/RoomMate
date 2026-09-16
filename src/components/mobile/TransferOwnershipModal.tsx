import React, { useState } from 'react';
import { Crown, Check, ArrowRight, ShieldAlert } from 'lucide-react';
import { Room, RoomMember, User } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

interface TransferOwnershipModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  currentUser: User;
  roomMembers: RoomMember[];
  allUsers: User[];
  onTransferOwnership: (newAdminUserId: string) => Promise<void>;
}

export const TransferOwnershipModal: React.FC<TransferOwnershipModalProps> = ({
  isOpen,
  onClose,
  room,
  currentUser,
  roomMembers,
  allUsers,
  onTransferOwnership,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter other active roommates
  const eligibleRoommates = roomMembers
    .filter(
      (m) => m.roomId === room.id && m.status === 'ACTIVE' && m.userId !== currentUser.id && m.role !== 'ROOM_ADMIN'
    )
    .map((m) => {
      const u = allUsers.find((user) => user.id === m.userId);
      return {
        member: m,
        user: u || {
          id: m.userId,
          name: 'Roommate',
          email: 'roommate@roommate.app',
          role: 'STUDENT' as const,
          isSuspended: false,
          createdAt: m.joinedAt,
          updatedAt: m.joinedAt,
        },
      };
    });

  const targetRoommate = eligibleRoommates.find((r) => r.user.id === selectedUserId);

  const handleSelect = (userId: string) => {
    hapticImpact('LIGHT');
    setSelectedUserId(userId);
    setErrorMsg(null);
  };

  const handleProceedToConfirm = () => {
    if (!selectedUserId) {
      setErrorMsg('Please select a roommate to make the new admin');
      hapticWarning();
      return;
    }
    hapticImpact('MEDIUM');
    setIsConfirming(true);
  };

  const handleExecuteTransfer = async () => {
    if (!selectedUserId) return;
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onTransferOwnership(selectedUserId);
      hapticSuccess();
      setIsConfirming(false);
      onClose();
    } catch (err: unknown) {
      hapticWarning();
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={() => {
        setIsConfirming(false);
        setSelectedUserId(null);
        setErrorMsg(null);
        onClose();
      }}
      title="Transfer Room Ownership"
      subtitle={room.name}
      icon={<Crown className="w-4.5 h-4.5 text-amber-500" />}
    >
      <div className="space-y-4 pb-2">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {eligibleRoommates.length === 0 ? (
          <div className="p-6 text-center space-y-2 bg-slate-50 rounded-2xl border border-slate-200">
            <p className="text-xs font-semibold text-slate-700">No other active members</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              You are currently the only member in this room. Invite roommates before transferring ownership.
            </p>
          </div>
        ) : !isConfirming ? (
          <>
            <p className="text-xs text-slate-600 leading-relaxed">
              Select an active roommate who will take over as the room admin with full room management permissions.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {eligibleRoommates.map(({ user }) => {
                const isSelected = selectedUserId === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelect(user.id)}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{user.name}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[180px]">{user.email}</p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        isSelected
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedUserId}
                onClick={handleProceedToConfirm}
                className={`flex-1 h-11 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs ${
                  selectedUserId
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3.5 animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-900">
                  Transfer ownership to {targetRoommate?.user.name}?
                </h4>
                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                  <strong>{targetRoommate?.user.name}</strong> will become the new room admin. You will become a regular roommate and will lose admin permissions. Your existing bills, splits, and settlement history will remain completely unchanged.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsConfirming(false)}
                className="flex-1 h-10 rounded-xl bg-white border border-amber-300 text-amber-900 font-semibold text-xs hover:bg-amber-100 active:scale-95"
              >
                Back
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteTransfer}
                className="flex-1 h-10 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 shadow-xs"
              >
                {isSubmitting ? (
                  <span>Transferring...</span>
                ) : (
                  <>
                    <Crown className="w-3.5 h-3.5" />
                    <span>Confirm Transfer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
};

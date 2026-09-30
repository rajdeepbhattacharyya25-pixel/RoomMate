import React, { useState } from 'react';
import {
  Users,
  Crown,
  UserMinus,
  Check,
  X,
  UserPlus,
  ArrowRight,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Room, RoomMember, RoomJoinRequest, User } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

interface RoomMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  currentUser: User;
  roomMembers: RoomMember[];
  allUsers: User[];
  joinRequests: Array<RoomJoinRequest & { user: User }>;
  onApproveRequest?: (requestId: string) => Promise<void>;
  onDeclineRequest?: (requestId: string) => Promise<void>;
  onRemoveMember?: (targetUserId: string) => Promise<void>;
  onOpenTransferOwnership?: () => void;
  onOpenInvite?: () => void;
}

export const RoomMembersModal: React.FC<RoomMembersModalProps> = ({
  isOpen,
  onClose,
  room,
  currentUser,
  roomMembers,
  allUsers,
  joinRequests,
  onApproveRequest,
  onDeclineRequest,
  onRemoveMember,
  onOpenTransferOwnership,
  onOpenInvite,
}) => {
  const [memberToRemove, setMemberToRemove] = useState<User | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isRoomAdmin =
    roomMembers.some(
      (m) => m.roomId === room.id && m.userId === currentUser.id && m.role === 'ROOM_ADMIN' && m.status === 'ACTIVE'
    ) || room.adminUserId === currentUser.id || room.createdBy === currentUser.id;

  // Active members
  const activeMembers = roomMembers
    .filter((m) => m.roomId === room.id && m.status === 'ACTIVE')
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

  // Split into Admin & Roommates
  const adminMember = activeMembers.find((m) => m.member.role === 'ROOM_ADMIN') || activeMembers[0];
  const roommateMembers = activeMembers.filter((m) => m.member.id !== adminMember?.member.id);

  // Inactive / Departed members
  const inactiveMembers = roomMembers
    .filter((m) => m.roomId === room.id && m.status !== 'ACTIVE')
    .map((m) => {
      const u = allUsers.find((user) => user.id === m.userId);
      return {
        member: m,
        user: u || {
          id: m.userId,
          name: 'Former Roommate',
          email: 'former@roommate.app',
          role: 'STUDENT' as const,
          isSuspended: false,
          createdAt: m.joinedAt,
          updatedAt: m.joinedAt,
        },
      };
    });

  const handleConfirmRemove = async () => {
    if (!memberToRemove || !onRemoveMember) return;
    try {
      setIsRemoving(true);
      setErrorMessage(null);
      await onRemoveMember(memberToRemove.id);
      hapticSuccess();
      setMemberToRemove(null);
    } catch (err: unknown) {
      hapticWarning();
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRemoving(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!onApproveRequest) return;
    try {
      setProcessingRequestId(requestId);
      await onApproveRequest(requestId);
      hapticSuccess();
    } catch (err: unknown) {
      hapticWarning();
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    if (!onDeclineRequest) return;
    try {
      setProcessingRequestId(requestId);
      await onDeclineRequest(requestId);
      hapticImpact('LIGHT');
    } catch (err: unknown) {
      hapticWarning();
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingRequestId(null);
    }
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={() => {
        setMemberToRemove(null);
        setErrorMessage(null);
        onClose();
      }}
      title={`${room.name} Members`}
      subtitle={`${activeMembers.length} active roommates`}
      icon={<Users className="w-4.5 h-4.5 text-indigo-600" />}
    >
      <div className="space-y-4 pb-2">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Removal Confirmation Dialog */}
        {memberToRemove && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-200 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 flex items-center justify-center shrink-0">
                <UserMinus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  Remove {memberToRemove.name} from {room.name}?
                </h4>
                <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5 leading-relaxed">
                  They will lose access to future bills and activities. <strong>Existing shared debts, credits, and ledger history will remain permanently frozen and preserved.</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => setMemberToRemove(null)}
                className="flex-1 h-9 rounded-xl bg-white dark:bg-[#1C1C25] border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300 font-semibold text-xs hover:bg-rose-100 dark:hover:bg-rose-950/60 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleConfirmRemove}
                className="flex-1 h-9 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all"
              >
                <span>{isRemoving ? 'Removing...' : 'Confirm Remove'}</span>
              </button>
            </div>
          </div>
        )}

        {/* PENDING JOIN REQUESTS (Admin Only) */}
        {isRoomAdmin && joinRequests && joinRequests.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/90 dark:border-indigo-800/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Pending Join Requests</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-indigo-200 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-300 text-[10px] font-bold">
                {joinRequests.length} pending
              </span>
            </div>

            <div className="space-y-2">
              {joinRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-2.5 rounded-xl bg-white dark:bg-[#1C1C25] border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs">
                      {req.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{req.user.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[130px]">{req.user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={processingRequestId === req.id}
                      onClick={() => handleDecline(req.id)}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#27354A] bg-white dark:bg-[#20202A] hover:bg-slate-50 dark:hover:bg-[#272738] text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <X className="w-3 h-3" />
                      <span>Decline</span>
                    </button>
                    <button
                      type="button"
                      disabled={processingRequestId === req.id}
                      onClick={() => handleApprove(req.id)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 active:scale-95 shadow-xs transition-all"
                    >
                      <Check className="w-3 h-3" />
                      <span>Approve</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ADMIN SECTION */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1 px-1">
            <Crown className="w-3.5 h-3.5 text-amber-500" />
            <span>Room Admin</span>
          </div>

          {adminMember && (
            <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold text-sm shadow-inner relative">
                  {adminMember.user.name.charAt(0).toUpperCase()}
                  <span className="absolute -top-1 -right-1 text-xs">👑</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{adminMember.user.name}</span>
                    {adminMember.user.id === currentUser.id && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">(You)</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[170px]">{adminMember.user.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                  👑 Admin
                </span>
                {isRoomAdmin && onOpenTransferOwnership && roommateMembers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTransferOwnership();
                    }}
                    className="p-1 text-slate-400 dark:text-slate-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                    title="Transfer Ownership"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ROOMMATES SECTION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Roommates ({roommateMembers.length})
            </span>
            {onOpenInvite && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInvite();
                }}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                <UserPlus className="w-3 h-3" />
                <span>+ Invite</span>
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-[#27354A]/60 rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200 dark:border-[#27354A] overflow-hidden">
            {roommateMembers.length === 0 ? (
              <div className="p-5 text-center text-slate-400 dark:text-slate-500 text-xs">
                No other roommates joined yet. Tap &quot;+ Invite&quot; to add friends!
              </div>
            ) : (
              roommateMembers.map(({ member, user }) => {
                const isSelf = user.id === currentUser.id;
                const canRemove = isRoomAdmin && !isSelf;

                return (
                  <div key={member.id} className="p-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-[#20202A]/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#20202A] text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">{user.name}</span>
                          {isSelf && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">(You)</span>}
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate max-w-[160px]">{user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-[#20202A] text-slate-600 dark:text-slate-300">
                        Member
                      </span>
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => setMemberToRemove(user)}
                          className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Remove Roommate"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* INACTIVE / DEPARTED MEMBERS */}
        {inactiveMembers.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
              Former Roommates (Historical Ledger Preserved)
            </span>
            <div className="divide-y divide-slate-100 dark:divide-[#27354A]/60 rounded-xl bg-slate-50 dark:bg-[#181820] border border-slate-200/80 dark:border-[#27354A]">
              {inactiveMembers.map(({ member, user }) => (
                <div key={member.id} className="p-2.5 flex items-center justify-between opacity-75">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-[#252532] text-slate-500 dark:text-slate-400 flex items-center justify-center text-[10px] font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{user.name}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-slate-200 dark:bg-[#252532] text-slate-600 dark:text-slate-400">
                    {member.status === 'LEFT' ? 'Left' : 'Removed'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
};

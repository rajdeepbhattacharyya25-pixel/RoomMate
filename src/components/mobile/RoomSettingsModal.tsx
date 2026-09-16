import React, { useState } from 'react';
import {
  Settings,
  Users,
  QrCode,
  DoorOpen,
  Check,
  ChevronRight,
} from 'lucide-react';
import { Room, RoomMember, RoomJoinRequest, User, JoinPolicy, InvitePolicy } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  currentUser: User;
  roomMembers: RoomMember[];
  allUsers: User[];
  joinRequests: RoomJoinRequest[];
  onOpenMembers: () => void;
  onOpenInvite: () => void;
  onOpenTransferOwnership: () => void;
  onOpenLeaveRoom: () => void;
  onUpdatePolicies: (policies: { joinPolicy?: JoinPolicy; invitePolicy?: InvitePolicy }) => Promise<void>;
  onArchiveRoom?: () => Promise<void>;
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  isOpen,
  onClose,
  room,
  currentUser,
  roomMembers,
  allUsers,
  joinRequests,
  onOpenMembers,
  onOpenInvite,
  onOpenTransferOwnership,
  onOpenLeaveRoom,
  onUpdatePolicies,
  onArchiveRoom: _onArchiveRoom,
}) => {
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);

  const isRoomAdmin =
    roomMembers.some(
      (m) => m.roomId === room.id && m.userId === currentUser.id && m.role === 'ROOM_ADMIN' && m.status === 'ACTIVE'
    ) || room.adminUserId === currentUser.id || room.createdBy === currentUser.id;

  const activeMembers = roomMembers.filter((m) => m.roomId === room.id && m.status === 'ACTIVE');
  const adminMember = activeMembers.find((m) => m.role === 'ROOM_ADMIN') || activeMembers[0];
  const adminUser = adminMember ? allUsers.find((u) => u.id === adminMember.userId) : null;
  const adminName = adminUser ? adminUser.name : 'Admin';

  const joinPolicy = room.joinPolicy || 'APPROVAL_REQUIRED';
  const invitePolicy = room.invitePolicy || 'ALL_MEMBERS';

  const handleToggleJoinPolicy = async (newPolicy: JoinPolicy) => {
    if (!isRoomAdmin || joinPolicy === newPolicy) return;
    try {
      setIsUpdatingPolicy(true);
      hapticImpact('MEDIUM');
      await onUpdatePolicies({ joinPolicy: newPolicy });
      hapticSuccess();
    } catch (err: unknown) {
      hapticWarning();
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  const handleToggleInvitePolicy = async (newPolicy: InvitePolicy) => {
    if (!isRoomAdmin || invitePolicy === newPolicy) return;
    try {
      setIsUpdatingPolicy(true);
      hapticImpact('MEDIUM');
      await onUpdatePolicies({ invitePolicy: newPolicy });
      hapticSuccess();
    } catch (err: unknown) {
      hapticWarning();
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Room Settings"
      subtitle={room.name}
      icon={<Settings className="w-4.5 h-4.5 text-indigo-600" />}
    >
      <div className="space-y-4 pb-3">
        {/* ROOM INFO */}
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Room Information
          </span>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-bold text-slate-900">{room.name}</p>
              <p className="text-[11px] text-slate-500">
                Created {new Date(room.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold border border-slate-200">
              <span>{activeMembers.length} members</span>
            </div>
          </div>
        </div>

        {/* MEMBERS & INVITES HUB */}
        <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMembers();
            }}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">Room Members</span>
                  {joinRequests.length > 0 && isRoomAdmin && (
                    <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                      {joinRequests.length} pending
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">View roster & manage roommates</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenInvite();
            }}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900">Invite & QR Code</span>
                <p className="text-[11px] text-slate-500">Share scannable QR or invite link</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* INVITATION POLICIES (Admin Only Controls) */}
        {isRoomAdmin && (
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Access & Joining Policies
            </span>

            {/* Who can invite? */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Who can invite new members?</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isUpdatingPolicy}
                  onClick={() => handleToggleInvitePolicy('ALL_MEMBERS')}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    invitePolicy === 'ALL_MEMBERS'
                      ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">All Roommates</span>
                    {invitePolicy === 'ALL_MEMBERS' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Recommended for flats</p>
                </button>

                <button
                  type="button"
                  disabled={isUpdatingPolicy}
                  onClick={() => handleToggleInvitePolicy('ADMIN_ONLY')}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    invitePolicy === 'ADMIN_ONLY'
                      ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Admin Only</span>
                    {invitePolicy === 'ADMIN_ONLY' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Strict control</p>
                </button>
              </div>
            </div>

            {/* Join Mode */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Join Approval Mode</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isUpdatingPolicy}
                  onClick={() => handleToggleJoinPolicy('APPROVAL_REQUIRED')}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    joinPolicy === 'APPROVAL_REQUIRED'
                      ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Admin Approval</span>
                    {joinPolicy === 'APPROVAL_REQUIRED' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Default safe mode</p>
                </button>

                <button
                  type="button"
                  disabled={isUpdatingPolicy}
                  onClick={() => handleToggleJoinPolicy('INSTANT')}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    joinPolicy === 'INSTANT'
                      ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300 text-indigo-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Instant Join</span>
                    {joinPolicy === 'INSTANT' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Direct membership</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ROOM ADMINISTRATION */}
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Room Administration
          </span>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                👑
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">
                  {adminName} {adminMember?.userId === currentUser.id && '(You)'}
                </p>
                <p className="text-[11px] text-slate-500">Current Room Admin</p>
              </div>
            </div>

            {isRoomAdmin && activeMembers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTransferOwnership();
                }}
                className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
              >
                <span>Transfer</span>
              </button>
            )}
          </div>
        </div>

        {/* DANGER ZONE */}
        <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">
            Danger Zone
          </span>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenLeaveRoom();
            }}
            className="w-full p-2.5 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-xs flex items-center justify-between transition-all active:scale-95 shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-rose-600" />
              <span>Leave Room</span>
            </div>
            <ChevronRight className="w-4 h-4 text-rose-400" />
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
};

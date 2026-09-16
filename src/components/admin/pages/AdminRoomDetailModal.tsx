import React, { useState } from 'react';
import {
  X,
  Building2,
  Snowflake,
  Archive,
  RefreshCw,
} from 'lucide-react';
import { Room, RoomMember, SharedExpense, User } from '../../../types';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmationDialog } from '../common/ConfirmationDialog';
import { formatInr, formatRelativeTime, formatFullDateTime } from '../../../lib/utils/currencyFormatter';

interface AdminRoomDetailModalProps {
  room: Room | null;
  onClose: () => void;
  roomMembers: RoomMember[];
  allUsers: User[];
  sharedExpenses: SharedExpense[];
  onToggleFreeze: (roomId: string, freeze: boolean) => void;
  onArchiveRoom: (roomId: string, archive: boolean) => void;
  onResetInviteCode: (roomId: string) => string;
}

export const AdminRoomDetailModal: React.FC<AdminRoomDetailModalProps> = ({
  room,
  onClose,
  roomMembers,
  allUsers,
  sharedExpenses,
  onToggleFreeze,
  onArchiveRoom,
  onResetInviteCode,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'expenses' | 'settings'>('overview');
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [resetCodeNotice, setResetCodeNotice] = useState<string | null>(null);

  if (!room) return null;

  const membersInRoom = roomMembers.filter((m) => m.roomId === room.id);
  const expensesInRoom = sharedExpenses.filter((e) => e.roomId === room.id);
  const totalSpend = expensesInRoom.reduce((sum, e) => sum + e.totalAmount, 0);
  const owner = allUsers.find((u) => u.id === room.createdBy);

  const roomStatusVariant = room.isFrozen ? 'danger' : room.isArchived ? 'neutral' : 'success';
  const roomStatusLabel = room.isFrozen ? 'Frozen' : room.isArchived ? 'Archived' : 'Active';

  const handleResetCode = () => {
    const newCode = onResetInviteCode(room.id);
    setResetCodeNotice(`New invite code generated: ${newCode}`);
    setTimeout(() => setResetCodeNotice(null), 5000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{room.name}</h2>
                <StatusBadge variant={roomStatusVariant} label={roomStatusLabel} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Owner: <span className="font-semibold text-slate-700">{owner?.name || 'Resident Admin'}</span> •{' '}
                {membersInRoom.length} members
              </p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Room ID: {room.id}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="px-6 border-b border-slate-100 flex gap-4 text-xs font-semibold bg-white">
          {(['overview', 'members', 'expenses', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 capitalize transition-all border-b-2 ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab === 'expenses' ? 'Shared Expenses' : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400">Total Members</span>
                  <p className="text-base font-bold text-slate-900 mt-1">{membersInRoom.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
                  <span className="text-[11px] font-semibold text-indigo-700">Total Spend</span>
                  <p className="text-base font-bold text-indigo-900 mt-1 font-mono">{formatInr(totalSpend)}</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-100">
                  <span className="text-[11px] font-semibold text-purple-700">Shared Bills</span>
                  <p className="text-base font-bold text-purple-900 mt-1">{expensesInRoom.length}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Created On</span>
                  <span className="font-semibold text-slate-800">{formatFullDateTime(room.createdAt)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Join Policy</span>
                  <span className="font-semibold text-slate-800">{room.joinPolicy || 'APPROVAL_REQUIRED'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Invite Code Policy</span>
                  <span className="font-semibold text-slate-800">{room.invitePolicy || 'ALL_MEMBERS'}</span>
                </div>
              </div>

              {room.isFrozen && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
                  <Snowflake className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Room is Currently Frozen:</span> Logging new expenses has been
                    temporarily disabled by SuperAdmin during dispute resolution.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-800">
                Active Residents ({membersInRoom.length})
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {membersInRoom.map((m) => {
                  const userObj = allUsers.find((u) => u.id === m.userId);
                  return (
                    <div key={m.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                          {userObj?.name.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{userObj?.name || 'Resident'}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{userObj?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          variant={m.role === 'ROOM_ADMIN' ? 'info' : 'neutral'}
                          label={m.role === 'ROOM_ADMIN' ? 'Room Admin' : 'Member'}
                          size="sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-800">
                Shared Bills in Room ({expensesInRoom.length})
              </div>
              {expensesInRoom.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No shared expenses logged in this room yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {expensesInRoom.map((exp) => {
                    const payer = allUsers.find((u) => u.id === exp.paidBy);
                    return (
                      <div key={exp.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <p className="text-xs font-bold text-slate-900">{exp.title}</p>
                          <p className="text-[11px] text-slate-400">
                            Paid by {payer?.name || 'Resident'} • {exp.category} • {formatRelativeTime(exp.createdAt)}
                          </p>
                        </div>
                        <span className="text-xs font-bold text-slate-900 font-mono">
                          {formatInr(exp.totalAmount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              {resetCodeNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
                  {resetCodeNotice}
                </div>
              )}

              {/* Action 1: Reset Invite Code */}
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Reset Room Invite Code</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Invalidate existing code and generate a fresh 6-character invitation key.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Code</span>
                </button>
              </div>

              {/* Action 2: Freeze / Unfreeze Room */}
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {room.isFrozen ? 'Unfreeze Room' : 'Freeze Room Ledger'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Lock the ledger so residents cannot add or modify expenses during bill disputes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFreezeDialog(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                    room.isFrozen
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'
                  }`}
                >
                  <Snowflake className="w-3.5 h-3.5" />
                  <span>{room.isFrozen ? 'Unfreeze' : 'Freeze Room'}</span>
                </button>
              </div>

              {/* Action 3: Archive Room */}
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    {room.isArchived ? 'Restore Room' : 'Archive Room'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Hide room from active resident dashboard while retaining audit history.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchiveDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>{room.isArchived ? 'Restore' : 'Archive'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Freeze Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={showFreezeDialog}
          onClose={() => setShowFreezeDialog(false)}
          onConfirm={() => {
            onToggleFreeze(room.id, !room.isFrozen);
            setShowFreezeDialog(false);
          }}
          title={room.isFrozen ? 'Unfreeze Room Ledger' : 'Freeze Room Ledger'}
          description={
            room.isFrozen
              ? `Restore normal expense logging for "${room.name}". Residents will be able to split bills again.`
              : `Freeze expense logging for "${room.name}". Residents will be blocked from logging new expenses until resolved.`
          }
          variant={room.isFrozen ? 'primary' : 'danger'}
          confirmLabel={room.isFrozen ? 'Unfreeze Room' : 'Freeze Room'}
        />

        {/* Archive Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={showArchiveDialog}
          onClose={() => setShowArchiveDialog(false)}
          onConfirm={() => {
            onArchiveRoom(room.id, !room.isArchived);
            setShowArchiveDialog(false);
          }}
          title={room.isArchived ? 'Restore Room' : 'Archive Room'}
          description={`Change archival status for "${room.name}".`}
          variant="warning"
          confirmLabel={room.isArchived ? 'Restore Room' : 'Archive Room'}
        />
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  X,
  UserCheck,
  UserX,
  Building2,
  Clock,
  Send,
  LogOut,
  AlertTriangle,
  Receipt,
  CheckCircle2,
} from 'lucide-react';
import { User, Room, RoomMember } from '../../../types';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmationDialog } from '../common/ConfirmationDialog';
import { formatFullDateTime, formatRelativeTime } from '../../../lib/utils/currencyFormatter';

interface AdminUserDetailModalProps {
  user: User | null;
  onClose: () => void;
  rooms: Room[];
  roomMembers: RoomMember[];
  onToggleSuspension: (userId: string, suspend: boolean, reason?: string) => void;
  onRevokeSessions: (userId: string) => void;
  onSendNotification: (userId: string, title: string, message: string) => void;
}

export const AdminUserDetailModal: React.FC<AdminUserDetailModalProps> = ({
  user,
  onClose,
  rooms,
  roomMembers,
  onToggleSuspension,
  onRevokeSessions,
  onSendNotification,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'activity' | 'actions'>('overview');
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifSuccess, setNotifSuccess] = useState(false);

  if (!user) return null;

  // Rooms this user belongs to
  const userRoomMemberships = roomMembers.filter((m) => m.userId === user.id);
  const userRooms = rooms.filter((r) => userRoomMemberships.some((m) => m.roomId === r.id));

  const handleSendDirectNotif = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    onSendNotification(user.id, notifTitle.trim(), notifMessage.trim());
    setNotifTitle('');
    setNotifMessage('');
    setNotifSuccess(true);
    setTimeout(() => setNotifSuccess(false), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{user.name}</h2>
                <StatusBadge
                  variant={user.isSuspended ? 'danger' : 'success'}
                  label={user.isSuspended ? 'Suspended' : 'Active'}
                />
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{user.email}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">User ID: {user.id}</p>
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
          {(['overview', 'rooms', 'activity', 'actions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 capitalize transition-all border-b-2 ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab === 'actions' ? 'Administrative Actions' : tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400">Account Type</span>
                <p className="text-xs font-bold text-slate-800">
                  {user.role === 'SUPER_ADMIN' ? 'Platform SuperAdmin' : 'Resident Student'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400">Phone Verification</span>
                <p className="text-xs font-bold text-slate-800">{user.phone || 'Not verified'}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400">Account Created</span>
                <p className="text-xs font-bold text-slate-800">{formatFullDateTime(user.createdAt)}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400">Last Active</span>
                <p className="text-xs font-bold text-slate-800">{formatRelativeTime(user.updatedAt)}</p>
              </div>

              <div className="col-span-2 p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-slate-600">
                <span className="font-bold text-indigo-900">Privacy Safeguard Notice:</span> Individual personal
                expenses are private to this resident and are strictly protected. The SuperAdmin console only shows
                shared room participation and administrative telemetry.
              </div>
            </div>
          )}

          {activeTab === 'rooms' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-800">
                Room Memberships ({userRooms.length})
              </div>
              {userRooms.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">User does not belong to any rooms yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {userRooms.map((room) => {
                    const membership = userRoomMemberships.find((m) => m.roomId === room.id);
                    const roomTotalMembers = roomMembers.filter((m) => m.roomId === room.id).length;
                    return (
                      <div key={room.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{room.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {roomTotalMembers} members • Joined {formatRelativeTime(membership?.joinedAt)}
                            </p>
                          </div>
                        </div>
                        <StatusBadge
                          variant={membership?.role === 'ROOM_ADMIN' ? 'info' : 'neutral'}
                          label={membership?.role === 'ROOM_ADMIN' ? 'Room Admin' : 'Member'}
                          size="sm"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-800">Non-Sensitive Activity Stream</div>
              <div className="space-y-2.5">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-3 text-xs">
                  <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Signed in to RoomMate Mobile</p>
                    <p className="text-[11px] text-slate-400">{formatRelativeTime(user.updatedAt)}</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-3 text-xs">
                  <Receipt className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Recorded shared expense</p>
                    <p className="text-[11px] text-slate-400">3 days ago</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-3 text-xs">
                  <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Joined room with invite code</p>
                    <p className="text-[11px] text-slate-400">{formatRelativeTime(user.createdAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-6">
              {/* Direct Notification */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-bold text-slate-900">Send Direct In-App Notification</h4>
                </div>
                {notifSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Notification delivered successfully to resident!</span>
                  </div>
                )}
                <form onSubmit={handleSendDirectNotif} className="space-y-2.5">
                  <input
                    type="text"
                    required
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="Notification title (e.g. Account Security Check)"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <textarea
                    rows={2}
                    required
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Enter message to deliver directly to user's notification bell..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                  >
                    Dispatch Notification
                  </button>
                </form>
              </div>

              {/* Dangerous Actions Zone */}
              <div className="p-4 rounded-xl border border-rose-200/80 bg-rose-50/30 space-y-3">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="w-4 h-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Account Governance &amp; Controls</h4>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSuspendDialog(true)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${
                      user.isSuspended
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                        : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600'
                    }`}
                  >
                    {user.isSuspended ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Reactivate Account</span>
                      </>
                    ) : (
                      <>
                        <UserX className="w-3.5 h-3.5" />
                        <span>Suspend Account</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRevokeDialog(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Force Session Revocation</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Suspend Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={showSuspendDialog}
          onClose={() => setShowSuspendDialog(false)}
          onConfirm={(reason) => {
            onToggleSuspension(user.id, !user.isSuspended, reason);
            setShowSuspendDialog(false);
          }}
          title={user.isSuspended ? 'Reactivate Student Account' : 'Suspend Student Account'}
          description={
            user.isSuspended
              ? `Are you sure you want to restore platform access for ${user.name}? They will immediately be able to access rooms and log shared bills.`
              : `Are you sure you want to suspend ${user.name}? They will be blocked from logging into the platform until restored.`
          }
          variant={user.isSuspended ? 'primary' : 'danger'}
          requireReason={!user.isSuspended}
          reasonPlaceholder="Enter reason for suspension (e.g. Violation of hostel ledger terms)..."
          confirmLabel={user.isSuspended ? 'Reactivate Account' : 'Suspend Account'}
        />

        {/* Revoke Sessions Dialog */}
        <ConfirmationDialog
          isOpen={showRevokeDialog}
          onClose={() => setShowRevokeDialog(false)}
          onConfirm={() => {
            onRevokeSessions(user.id);
            setShowRevokeDialog(false);
          }}
          title="Revoke Active Sessions"
          description={`Force log out ${user.name} from all active mobile APK and web client sessions.`}
          variant="warning"
          confirmLabel="Revoke Sessions"
        />
      </div>
    </div>
  );
};

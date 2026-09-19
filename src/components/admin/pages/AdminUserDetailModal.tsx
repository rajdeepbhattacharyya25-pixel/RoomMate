import React, { useState, useMemo } from 'react';
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
  ArrowRightLeft,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import { User, UserRole, Room, RoomMember, SharedExpense, SettlementPayment, AuditLog } from '../../../types';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmationDialog } from '../common/ConfirmationDialog';
import { formatFullDateTime, formatRelativeTime, formatInr } from '../../../lib/utils/currencyFormatter';

interface AdminUserDetailModalProps {
  user: User | null;
  onClose: () => void;
  rooms: Room[];
  roomMembers: RoomMember[];
  sharedExpenses?: SharedExpense[];
  settlementPayments?: SettlementPayment[];
  auditLogs?: AuditLog[];
  currentAdminUser?: User;
  onToggleSuspension: (userId: string, suspend: boolean, reason?: string) => void;
  onRevokeSessions: (userId: string) => void;
  onSendNotification: (userId: string, title: string, message: string) => void;
  onUpdateUserRole?: (userId: string, newRole: UserRole) => Promise<void> | void;
}

export const AdminUserDetailModal: React.FC<AdminUserDetailModalProps> = ({
  user,
  onClose,
  rooms,
  roomMembers,
  sharedExpenses = [],
  settlementPayments = [],
  auditLogs = [],
  currentAdminUser,
  onToggleSuspension,
  onRevokeSessions,
  onSendNotification,
  onUpdateUserRole,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'activity' | 'actions'>('overview');
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifSuccess, setNotifSuccess] = useState(false);

  // Rooms this user belongs to
  const userRoomMemberships = user ? roomMembers.filter((m) => m.userId === user.id) : [];
  const userRooms = user ? rooms.filter((r) => userRoomMemberships.some((m) => m.roomId === r.id)) : [];

  // Synthesize real user activity stream
  const userActivity = useMemo(() => {
    if (!user) return [];
    const items: Array<{
      id: string;
      title: string;
      description?: string;
      timestamp: string;
      icon: 'clock' | 'receipt' | 'building' | 'settlement' | 'shield';
    }> = [];

    // 1. Account registration
    if (user.createdAt) {
      items.push({
        id: `reg-${user.id}`,
        title: 'Student profile verified',
        description: `Registered with ${user.email}`,
        timestamp: user.createdAt,
        icon: 'clock',
      });
    }

    // 2. Room memberships
    userRoomMemberships.forEach((m) => {
      const room = rooms.find((r) => r.id === m.roomId);
      items.push({
        id: `room-${m.id}`,
        title: `Joined room ${room?.name || 'Flat'}`,
        description: `Role assigned: ${m.role === 'ROOM_ADMIN' ? 'Room Admin' : 'Resident'}`,
        timestamp: m.joinedAt,
        icon: 'building',
      });
    });

    // 3. Shared expenses recorded or paid
    sharedExpenses.forEach((e) => {
      if (e.paidBy === user.id) {
        items.push({
          id: `exp-${e.id}`,
          title: `Paid bill: "${e.title}"`,
          description: `Total ${formatInr(e.totalAmount)} (${e.category})`,
          timestamp: e.createdAt,
          icon: 'receipt',
        });
      } else if (e.createdBy === user.id) {
        items.push({
          id: `exp-create-${e.id}`,
          title: `Recorded shared expense: "${e.title}"`,
          description: `${formatInr(e.totalAmount)} &bull; ${e.category}`,
          timestamp: e.createdAt,
          icon: 'receipt',
        });
      }
    });

    // 4. Settlement payments
    settlementPayments.forEach((s) => {
      if (s.payerId === user.id) {
        items.push({
          id: `settle-pay-${s.id}`,
          title: `Settled balance payment`,
          description: `Transferred ${formatInr(s.amount)} via ${s.paymentMethod}`,
          timestamp: s.createdAt,
          icon: 'settlement',
        });
      } else if (s.payeeId === user.id) {
        items.push({
          id: `settle-rec-${s.id}`,
          title: `Received balance reimbursement`,
          description: `Received ${formatInr(s.amount)} via ${s.paymentMethod}`,
          timestamp: s.createdAt,
          icon: 'settlement',
        });
      }
    });

    // 5. Audit logs for this user
    auditLogs.forEach((a) => {
      if (a.userId === user.id || (a.details as any)?.targetUserId === user.id) {
        items.push({
          id: `audit-${a.id}`,
          title: a.action.replace(/_/g, ' '),
          description: a.ipAddress ? `IP: ${a.ipAddress}` : undefined,
          timestamp: a.createdAt,
          icon: 'shield',
        });
      }
    });

    // Sort descending by timestamp
    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);
  }, [user, userRoomMemberships, rooms, sharedExpenses, settlementPayments, auditLogs]);

  if (!user) return null;

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
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Non-Sensitive Activity Stream</span>
                <span className="text-[11px] font-medium text-slate-400">
                  {userActivity.length} events recorded
                </span>
              </div>

              {userActivity.length > 0 ? (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {userActivity.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-100 flex items-center gap-3 text-xs hover:bg-slate-100/60 transition-colors"
                    >
                      {item.icon === 'clock' && <Clock className="w-4 h-4 text-indigo-600 shrink-0" />}
                      {item.icon === 'receipt' && <Receipt className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {item.icon === 'building' && <Building2 className="w-4 h-4 text-purple-600 shrink-0" />}
                      {item.icon === 'settlement' && <ArrowRightLeft className="w-4 h-4 text-teal-600 shrink-0" />}
                      {item.icon === 'shield' && <Shield className="w-4 h-4 text-amber-600 shrink-0" />}

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{item.title}</p>
                        {item.description && (
                          <p className="text-[11px] text-slate-500 truncate">{item.description}</p>
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 shrink-0 whitespace-nowrap">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600">No Activity Recorded</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    This student has not performed any room or billing transactions yet.
                  </p>
                </div>
              )}
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

              {/* Role Authority & Privilege Management Zone */}
              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-800">
                    <Shield className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Platform Role Authority</h4>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      user.role === 'SUPER_ADMIN'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    Current: {user.role === 'SUPER_ADMIN' ? 'SuperAdmin' : 'Resident Student'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-snug">
                  {user.role === 'SUPER_ADMIN'
                    ? 'This user holds SuperAdmin privileges, enabling platform configuration, user governance, room freezes, and security telemetry.'
                    : 'This user is currently a standard Resident Student. Elevating them will grant platform-wide SuperAdmin console access.'}
                </p>

                <div className="pt-1">
                  {user.role === 'STUDENT' ? (
                    <button
                      type="button"
                      onClick={() => setShowRoleDialog(true)}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 border border-purple-600 shadow-2xs transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Promote to SuperAdmin</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(currentAdminUser && currentAdminUser.id === user.id)}
                      onClick={() => setShowRoleDialog(true)}
                      title={
                        currentAdminUser && currentAdminUser.id === user.id
                          ? 'You cannot demote your own active SuperAdmin account.'
                          : undefined
                      }
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>
                        {currentAdminUser && currentAdminUser.id === user.id
                          ? 'Cannot Demote Current Admin (Protected)'
                          : 'Demote to Resident Student'}
                      </span>
                    </button>
                  )}
                </div>
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

        {/* Role Change Confirmation Dialog */}
        <ConfirmationDialog
          isOpen={showRoleDialog}
          onClose={() => setShowRoleDialog(false)}
          onConfirm={() => {
            const nextRole: UserRole = user.role === 'SUPER_ADMIN' ? 'STUDENT' : 'SUPER_ADMIN';
            if (onUpdateUserRole) {
              onUpdateUserRole(user.id, nextRole);
            }
            setShowRoleDialog(false);
          }}
          title={user.role === 'SUPER_ADMIN' ? 'Demote SuperAdmin to Student' : 'Promote Student to SuperAdmin'}
          description={
            user.role === 'SUPER_ADMIN'
              ? `Are you sure you want to revoke administrative privileges for ${user.name}? They will immediately lose access to the SuperAdmin console and revert to a standard student resident account.`
              : `CRITICAL PRIVILEGE ESCALATION: Are you sure you want to promote ${user.name} to SuperAdmin? They will receive full administrative control over all rooms, user accounts, and platform settings.`
          }
          variant={user.role === 'SUPER_ADMIN' ? 'warning' : 'danger'}
          confirmLabel={user.role === 'SUPER_ADMIN' ? 'Demote to Student' : 'Promote to SuperAdmin'}
        />

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

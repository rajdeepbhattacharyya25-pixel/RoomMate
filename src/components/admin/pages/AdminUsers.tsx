import React, { useState, useMemo, useCallback } from 'react';
import {
  UserCheck,
  UserX,
  Shield,
  MoreHorizontal,
  Phone,
  MessageSquare,
  Copy,
  Check,
  ArrowUpDown,
  Users,
  Home,
  AlertCircle,
  FilterX,
  Send,
} from 'lucide-react';
import { User, UserRole, Room, RoomMember, SharedExpense, SettlementPayment, AuditLog } from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { AdminUserDetailModal } from './AdminUserDetailModal';
import { formatRelativeTime } from '../../../lib/utils/currencyFormatter';
import { generateWhatsAppUrl } from '../../../lib/ledger/nudgeService';
import {
  filterAndSortUsers,
  matchesUserOmniSearch,
  SortPreset,
  StatusFilter,
  RoleFilter,
  RoomFilter,
  PhoneFilter,
} from './adminUsersFilters';

interface AdminUsersProps {
  users: User[];
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
  initialSelectedUserId?: string;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({
  users,
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
  initialSelectedUserId,
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(() => {
    if (initialSelectedUserId) {
      return users.find((u) => u.id === initialSelectedUserId) || null;
    }
    return null;
  });

  // Filter & Sort State
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all');
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>('all');
  const [sortPreset, setSortPreset] = useState<SortPreset>('newest');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'phone' | 'id' | null>(null);

  const copyToClipboard = useCallback(async (text: string, id: string, type: 'phone' | 'id') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setCopiedType(type);
      setTimeout(() => {
        setCopiedId(null);
        setCopiedType(null);
      }, 2000);
    } catch (err) {
      console.warn('Failed to copy to clipboard', err);
    }
  }, []);

  // Compute counts for interactive header badges
  const totalCount = users.length;
  const activeCount = useMemo(() => users.filter((u) => !u.isSuspended).length, [users]);
  const suspendedCount = useMemo(() => users.filter((u) => u.isSuspended).length, [users]);
  const unassignedCount = useMemo(
    () => users.filter((u) => roomMembers.filter((m) => m.userId === u.id).length === 0).length,
    [users, roomMembers]
  );
  const missingPhoneCount = useMemo(
    () => users.filter((u) => !u.phone || !u.phone.trim()).length,
    [users]
  );

  // Filter & Sort data using pure helper
  const processedUsers = useMemo(() => {
    return filterAndSortUsers({
      users,
      rooms,
      roomMembers,
      statusFilter,
      roleFilter,
      roomFilter,
      phoneFilter,
      sortPreset,
    });
  }, [users, rooms, roomMembers, statusFilter, roleFilter, roomFilter, phoneFilter, sortPreset]);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    roleFilter !== 'all' ||
    roomFilter !== 'all' ||
    phoneFilter !== 'all' ||
    sortPreset !== 'newest';

  const resetAllFilters = useCallback(() => {
    setStatusFilter('all');
    setRoleFilter('all');
    setRoomFilter('all');
    setPhoneFilter('all');
    setSortPreset('newest');
  }, []);

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Resident',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
            {u.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-slate-900 block truncate">{u.name}</span>
            <span className="text-[11px] text-slate-400 font-mono block truncate">{u.email}</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] text-slate-400 font-mono">
                ID: {u.id.length > 14 ? `${u.id.slice(0, 12)}...` : u.id}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(u.id, u.id, 'id');
                }}
                className="p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                title="Copy full User UUID"
              >
                {copiedId === u.id && copiedType === 'id' ? (
                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                ) : (
                  <Copy className="w-2.5 h-2.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      render: (u) => (
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
            u.role === 'SUPER_ADMIN'
              ? 'bg-purple-50 text-purple-700 border border-purple-200'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {u.role === 'SUPER_ADMIN' && <Shield className="w-3 h-3" />}
          <span>{u.role === 'SUPER_ADMIN' ? 'SuperAdmin' : 'Student'}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (u) => (
        <StatusBadge
          variant={u.isSuspended ? 'danger' : 'success'}
          label={u.isSuspended ? 'Suspended' : 'Active'}
          size="sm"
        />
      ),
    },
    {
      key: 'phone',
      header: 'Phone Number & Contact Hub',
      render: (u) => {
        if (!u.phone || !u.phone.trim()) {
          return (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md font-medium">
                <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                No phone
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedUser(u);
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-1.5 py-0.5 rounded transition-colors"
                title="Open user profile to send reminder notification"
              >
                <Send className="w-2.5 h-2.5" />
                Remind
              </button>
            </div>
          );
        }

        const waUrl = generateWhatsAppUrl(
          u.phone,
          `Hello ${u.name}, this is RoomMate Platform Support reaching out regarding your account.`
        );

        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-700 font-mono font-medium">{u.phone}</span>
            <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200/80 rounded-lg p-0.5">
              {/* WhatsApp 1-tap Shortcut */}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                title={`Chat with ${u.name} on WhatsApp`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              </a>

              {/* Direct Call Shortcut */}
              <a
                href={`tel:${u.phone.replace(/[^0-9+]/g, '')}`}
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title={`Call ${u.name}`}
              >
                <Phone className="w-3.5 h-3.5 text-blue-600" />
              </a>

              {/* Copy Phone Shortcut */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copyToClipboard(u.phone!, u.id, 'phone');
                }}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                title="Copy phone number to clipboard"
              >
                {copiedId === u.id && copiedType === 'phone' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        );
      },
    },
    {
      key: 'rooms',
      header: 'Rooms',
      align: 'center',
      sortable: true,
      sortValue: (u) => roomMembers.filter((m) => m.userId === u.id).length,
      render: (u) => {
        const count = roomMembers.filter((m) => m.userId === u.id).length;
        return (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-md ${
              count > 0 ? 'text-slate-800 bg-slate-100' : 'text-amber-700 bg-amber-50 border border-amber-200/60'
            }`}
          >
            {count} {count === 1 ? 'room' : 'rooms'}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
      sortValue: (u) => new Date(u.createdAt).getTime(),
      render: (u) => (
        <span className="text-xs text-slate-500">{formatRelativeTime(u.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedUser(u);
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Inspect user details"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Page Header & Interactive Summary Badges */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Users Management</h1>
            <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect resident identities, room memberships, and administer account governance.
          </p>
        </div>

        {/* Interactive Click-to-Filter Pills */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Total Pill */}
          <button
            type="button"
            onClick={resetAllFilters}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !hasActiveFilters
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="Show all residents"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{totalCount} Total</span>
          </button>

          {/* Active Pill */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter((prev) => (prev === 'active' ? 'all' : 'active'));
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
            }`}
            title="Filter by Active accounts"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>{activeCount} Active</span>
          </button>

          {/* Suspended Pill */}
          {suspendedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter((prev) => (prev === 'suspended' ? 'all' : 'suspended'));
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                statusFilter === 'suspended'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
              }`}
              title="Filter by Suspended accounts"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>{suspendedCount} Suspended</span>
            </button>
          )}

          {/* Unassigned (0 Rooms) Pill */}
          <button
            type="button"
            onClick={() => {
              setRoomFilter((prev) => (prev === 'unassigned' ? 'all' : 'unassigned'));
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              roomFilter === 'unassigned'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100'
            }`}
            title="Filter by residents without any rooms"
          >
            <Home className="w-3.5 h-3.5" />
            <span>{unassignedCount} No Rooms</span>
          </button>

          {/* Missing Phone Pill */}
          {missingPhoneCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setPhoneFilter((prev) => (prev === 'missing_phone' ? 'all' : 'missing_phone'));
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                phoneFilter === 'missing_phone'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
              }`}
              title="Filter residents without phone numbers"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{missingPhoneCount} No Phone</span>
            </button>
          )}

          {/* Clear Filter Shortcut */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-dashed border-rose-300 transition-colors"
              title="Reset all active filters and sort"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Users DataTable with Omni-Search & Filter Controls */}
      <DataTable
        columns={columns}
        data={processedUsers}
        keyExtractor={(u) => u.id}
        searchPlaceholder="Search by name, phone, email, UPI, room, or ID..."
        searchFilter={(u, query) => matchesUserOmniSearch(u, query, rooms, roomMembers)}
        onRowClick={(u) => setSelectedUser(u)}
        exportFilename="RoomMate_Users_Directory"
        toolbarExtras={
          <div className="flex items-center flex-wrap gap-2">
            {/* Sort Presets Dropdown */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortPreset}
                onChange={(e) => setSortPreset(e.target.value as SortPreset)}
                className="text-xs font-semibold bg-transparent text-slate-700 focus:outline-none cursor-pointer"
                title="Select sort ordering"
              >
                <option value="newest">🕒 Newest First</option>
                <option value="oldest">⏳ Oldest First</option>
                <option value="name_asc">🔤 Name (A → Z)</option>
                <option value="name_desc">🔠 Name (Z → A)</option>
                <option value="rooms_desc">🏠 Most Rooms</option>
                <option value="rooms_asc">🚪 Least Rooms</option>
              </select>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Filter by account status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Filter by platform role"
            >
              <option value="all">All Roles</option>
              <option value="STUDENT">Students</option>
              <option value="SUPER_ADMIN">SuperAdmins</option>
            </select>

            {/* Room Membership Filter */}
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value as RoomFilter)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Filter by room occupancy"
            >
              <option value="all">All Room States</option>
              <option value="in_rooms">In Rooms (1+)</option>
              <option value="unassigned">Unassigned (0 Rooms)</option>
            </select>

            {/* Phone Verification Filter */}
            <select
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value as PhoneFilter)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Filter by phone number status"
            >
              <option value="all">All Phone States</option>
              <option value="has_phone">Has Phone Number</option>
              <option value="missing_phone">Missing Phone Number</option>
            </select>
          </div>
        }
        emptyMessage="No residents match your filters or search"
        emptySubtitle="Try searching a different name, phone, or resetting the dropdown filters."
      />

      {/* User Detail Drawer/Modal */}
      {selectedUser && (
        <AdminUserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          rooms={rooms}
          roomMembers={roomMembers}
          sharedExpenses={sharedExpenses}
          settlementPayments={settlementPayments}
          auditLogs={auditLogs}
          currentAdminUser={currentAdminUser}
          onToggleSuspension={onToggleSuspension}
          onRevokeSessions={onRevokeSessions}
          onSendNotification={onSendNotification}
          onUpdateUserRole={onUpdateUserRole}
        />
      )}
    </div>
  );
};

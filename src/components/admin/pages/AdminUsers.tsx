import React, { useState, useMemo } from 'react';
import { UserCheck, UserX, Shield, MoreHorizontal } from 'lucide-react';
import { User, Room, RoomMember } from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { AdminUserDetailModal } from './AdminUserDetailModal';
import { formatRelativeTime } from '../../../lib/utils/currencyFormatter';

interface AdminUsersProps {
  users: User[];
  rooms: Room[];
  roomMembers: RoomMember[];
  onToggleSuspension: (userId: string, suspend: boolean, reason?: string) => void;
  onRevokeSessions: (userId: string) => void;
  onSendNotification: (userId: string, title: string, message: string) => void;
  initialSelectedUserId?: string;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({
  users,
  rooms,
  roomMembers,
  onToggleSuspension,
  onRevokeSessions,
  onSendNotification,
  initialSelectedUserId,
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(() => {
    if (initialSelectedUserId) {
      return users.find((u) => u.id === initialSelectedUserId) || null;
    }
    return null;
  });

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'STUDENT' | 'SUPER_ADMIN'>('all');

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter === 'active' && u.isSuspended) return false;
      if (statusFilter === 'suspended' && !u.isSuspended) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, statusFilter, roleFilter]);

  const totalCount = users.length;
  const activeCount = users.filter((u) => !u.isSuspended).length;
  const suspendedCount = users.filter((u) => u.isSuspended).length;

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Resident',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
            {u.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{u.name}</span>
            <span className="text-[11px] text-slate-400 font-mono block">{u.email}</span>
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
      header: 'Phone Number',
      render: (u) => (
        <span className="text-xs text-slate-600 font-mono">
          {u.phone ? u.phone : <span className="text-slate-400 italic">No phone</span>}
        </span>
      ),
    },
    {
      key: 'rooms',
      header: 'Rooms',
      align: 'center',
      render: (u) => {
        const count = roomMembers.filter((m) => m.userId === u.id).length;
        return (
          <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
            {count} {count === 1 ? 'room' : 'rooms'}
          </span>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Joined',
      sortable: true,
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
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
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

        {/* Quick Summary Badges */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>{activeCount} Active</span>
          </div>
          {suspendedCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
              <UserX className="w-3.5 h-3.5 text-rose-600" />
              <span>{suspendedCount} Suspended</span>
            </div>
          )}
        </div>
      </div>

      {/* Users DataTable */}
      <DataTable
        columns={columns}
        data={filteredUsers}
        keyExtractor={(u) => u.id}
        searchPlaceholder="Search users by name or email..."
        searchFilter={(u, query) =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase())
        }
        onRowClick={(u) => setSelectedUser(u)}
        exportFilename="RoomMate_Users_Directory"
        toolbarExtras={
          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Roles</option>
              <option value="STUDENT">Students</option>
              <option value="SUPER_ADMIN">SuperAdmins</option>
            </select>
          </div>
        }
        emptyMessage="No residents match your filters"
        emptySubtitle="Try resetting the status or role dropdown filters."
      />

      {/* User Detail Drawer/Modal */}
      {selectedUser && (
        <AdminUserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          rooms={rooms}
          roomMembers={roomMembers}
          onToggleSuspension={onToggleSuspension}
          onRevokeSessions={onRevokeSessions}
          onSendNotification={onSendNotification}
        />
      )}
    </div>
  );
};

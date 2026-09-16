import React, { useState, useMemo } from 'react';
import { Building2, Snowflake, Archive, MoreHorizontal, CheckCircle2 } from 'lucide-react';
import { Room, RoomMember, SharedExpense, User } from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { AdminRoomDetailModal } from './AdminRoomDetailModal';
import { formatInr, formatRelativeTime } from '../../../lib/utils/currencyFormatter';

interface AdminRoomsProps {
  rooms: Room[];
  roomMembers: RoomMember[];
  sharedExpenses: SharedExpense[];
  allUsers: User[];
  onToggleFreeze: (roomId: string, freeze: boolean) => void;
  onArchiveRoom: (roomId: string, archive: boolean) => void;
  onResetInviteCode: (roomId: string) => string;
  initialSelectedRoomId?: string;
}

export const AdminRooms: React.FC<AdminRoomsProps> = ({
  rooms,
  roomMembers,
  sharedExpenses,
  allUsers,
  onToggleFreeze,
  onArchiveRoom,
  onResetInviteCode,
  initialSelectedRoomId,
}) => {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(() => {
    if (initialSelectedRoomId) {
      return rooms.find((r) => r.id === initialSelectedRoomId) || null;
    }
    return null;
  });

  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'frozen' | 'archived'>('all');

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (statusFilter === 'active') return !r.isFrozen && !r.isArchived;
      if (statusFilter === 'frozen') return r.isFrozen;
      if (statusFilter === 'archived') return r.isArchived;
      return true;
    });
  }, [rooms, statusFilter]);

  const activeCount = rooms.filter((r) => !r.isFrozen && !r.isArchived).length;
  const frozenCount = rooms.filter((r) => r.isFrozen).length;
  const archivedCount = rooms.filter((r) => r.isArchived).length;

  const columns: Column<Room>[] = [
    {
      key: 'name',
      header: 'Room Name',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-xs">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{r.name}</span>
            <span className="text-[11px] text-slate-400 font-mono block">
              {r.description || 'Student Room'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (r) => {
        const owner = allUsers.find((u) => u.id === r.createdBy);
        return <span className="text-xs font-semibold text-slate-700">{owner?.name || 'Resident'}</span>;
      },
    },
    {
      key: 'members',
      header: 'Members',
      align: 'center',
      render: (r) => {
        const count = roomMembers.filter((m) => m.roomId === r.id).length;
        return (
          <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
            {count}
          </span>
        );
      },
    },
    {
      key: 'sharedExpenses',
      header: 'Shared Volume',
      align: 'right',
      render: (r) => {
        const total = sharedExpenses
          .filter((e) => e.roomId === r.id)
          .reduce((sum, e) => sum + e.totalAmount, 0);
        return <span className="font-bold font-mono text-slate-900 text-xs">{formatInr(total)}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (r) => {
        const variant = r.isFrozen ? 'danger' : r.isArchived ? 'neutral' : 'success';
        const label = r.isFrozen ? 'Frozen' : r.isArchived ? 'Archived' : 'Active';
        return <StatusBadge variant={variant} label={label} size="sm" />;
      },
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      render: (r) => <span className="text-xs text-slate-500">{formatRelativeTime(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedRoom(r);
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Inspect room details"
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
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Rooms Management</h1>
            <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {rooms.length} Total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor room clusters, inspect shared spending volume, and freeze ledgers during disputes.
          </p>
        </div>

        {/* Quick Summary Badges */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{activeCount} Active</span>
          </div>
          {frozenCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
              <Snowflake className="w-3.5 h-3.5 text-rose-600" />
              <span>{frozenCount} Frozen</span>
            </div>
          )}
          {archivedCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold">
              <Archive className="w-3.5 h-3.5 text-slate-500" />
              <span>{archivedCount} Archived</span>
            </div>
          )}
        </div>
      </div>

      {/* Rooms DataTable */}
      <DataTable
        columns={columns}
        data={filteredRooms}
        keyExtractor={(r) => r.id}
        searchPlaceholder="Search rooms by name or description..."
        searchFilter={(r, query) =>
          r.name.toLowerCase().includes(query.toLowerCase()) ||
          (r.description && r.description.toLowerCase().includes(query.toLowerCase())) ||
          false
        }
        onRowClick={(r) => setSelectedRoom(r)}
        exportFilename="RoomMate_Rooms_Directory"
        toolbarExtras={
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Rooms ({rooms.length})</option>
            <option value="active">Active Only ({activeCount})</option>
            <option value="frozen">Frozen Only ({frozenCount})</option>
            <option value="archived">Archived Only ({archivedCount})</option>
          </select>
        }
        emptyMessage="No rooms match your filter"
        emptySubtitle="Try selecting a different status filter."
      />

      {/* Room Detail Modal */}
      {selectedRoom && (
        <AdminRoomDetailModal
          room={selectedRoom}
          onClose={() => setSelectedRoom(null)}
          roomMembers={roomMembers}
          allUsers={allUsers}
          sharedExpenses={sharedExpenses}
          onToggleFreeze={onToggleFreeze}
          onArchiveRoom={onArchiveRoom}
          onResetInviteCode={onResetInviteCode}
        />
      )}
    </div>
  );
};

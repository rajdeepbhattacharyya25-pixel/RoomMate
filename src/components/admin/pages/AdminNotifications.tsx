import React, { useState } from 'react';
import {
  Megaphone,
  Plus,
  Send,
  Bell,
  Mail,
  Users,
  Home,
  Globe,
} from 'lucide-react';
import {
  PlatformAnnouncement,
  User,
  Room,
} from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { AdminCreateAnnouncementModal } from './AdminCreateAnnouncementModal';
import { formatRelativeTime, formatFullDateTime } from '../../../lib/utils/currencyFormatter';

interface AdminNotificationsProps {
  announcements: PlatformAnnouncement[];
  allUsers: User[];
  rooms: Room[];
  onCreateAnnouncement: (
    announcement: Omit<PlatformAnnouncement, 'id' | 'sentAt' | 'recipientsCount' | 'status'>
  ) => Promise<void> | void;
}

export const AdminNotifications: React.FC<AdminNotificationsProps> = ({
  announcements = [],
  allUsers,
  rooms,
  onCreateAnnouncement,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<PlatformAnnouncement | null>(null);

  const columns: Column<PlatformAnnouncement>[] = [
    {
      key: 'title',
      header: 'Announcement',
      sortable: true,
      render: (a) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
              a.priority === 'CRITICAL'
                ? 'bg-rose-100 text-rose-700'
                : a.priority === 'IMPORTANT'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-indigo-50 text-indigo-700'
            }`}
          >
            <Megaphone className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block truncate max-w-sm">{a.title}</span>
            <span className="text-[11px] text-slate-500 block truncate max-w-sm">{a.message}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'audience',
      header: 'Audience',
      sortable: true,
      render: (a) => {
        const icon =
          a.audience === 'EVERYONE' ? (
            <Globe className="w-3.5 h-3.5 text-indigo-600" />
          ) : a.audience === 'SELECTED_USERS' ? (
            <Users className="w-3.5 h-3.5 text-blue-600" />
          ) : (
            <Home className="w-3.5 h-3.5 text-purple-600" />
          );
        return (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            {icon}
            <span className="capitalize">{a.audience.toLowerCase().replace('_', ' ')}</span>
          </div>
        );
      },
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      render: (a) => (
        <StatusBadge
          variant={
            a.priority === 'CRITICAL' ? 'danger' : a.priority === 'IMPORTANT' ? 'warning' : 'neutral'
          }
          label={a.priority}
          size="sm"
        />
      ),
    },
    {
      key: 'recipientsCount',
      header: 'Reach',
      sortable: true,
      align: 'center',
      render: (a) => (
        <span className="font-bold font-mono text-slate-900 text-xs">{a.recipientsCount}</span>
      ),
    },
    {
      key: 'deliveryChannels',
      header: 'Channels',
      render: (a) => (
        <div className="flex items-center gap-1">
          {a.deliveryChannels.includes('IN_APP') && (
            <span className="p-1 rounded bg-slate-100 text-slate-700" title="In-App">
              <Bell className="w-3 h-3" />
            </span>
          )}
          {a.deliveryChannels.includes('PUSH') && (
            <span className="p-1 rounded bg-slate-100 text-emerald-700" title="Push">
              <Send className="w-3 h-3" />
            </span>
          )}
          {a.deliveryChannels.includes('EMAIL') && (
            <span className="p-1 rounded bg-slate-100 text-purple-700" title="Email">
              <Mail className="w-3 h-3" />
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'sentAt',
      header: 'Sent At',
      sortable: true,
      render: (a) => <span className="text-xs text-slate-500">{formatRelativeTime(a.sentAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (a) => (
        <StatusBadge
          variant={a.status === 'DELIVERED' ? 'success' : a.status === 'FAILED' ? 'danger' : 'neutral'}
          label={a.status}
          size="sm"
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Announcements</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
              {announcements.length} Dispatched
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Broadcast emergency notices, maintenance schedules, or major feature updates directly to student apps.
          </p>
        </div>

        {/* Create Broadcast CTA */}
        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm flex items-center gap-2 self-start transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Broadcast</span>
        </button>
      </div>

      {/* Table of past broadcasts */}
      <DataTable
        data={announcements}
        columns={columns}
        searchPlaceholder="Search announcements by title or content..."
        searchKeys={['title', 'message', 'audience', 'priority']}
        pageSize={10}
        emptyMessage="No platform announcements have been sent yet."
        exportFileName="roommate-announcements.csv"
        onRowClick={(a) => setSelectedAnnouncement(a)}
      />

      {/* Detail Modal for Selected Announcement */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Broadcast Telemetry
              </span>
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                Close
              </button>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{selectedAnnouncement.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sent {formatFullDateTime(selectedAnnouncement.sentAt)} by SuperAdmin
              </p>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
              {selectedAnnouncement.message}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs pt-2">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[11px] block">Confirmed Reach</span>
                <span className="font-bold text-slate-800 font-mono text-sm">
                  {selectedAnnouncement.recipientsCount} Students
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 text-[11px] block">Delivery Status</span>
                <span className="font-bold text-emerald-600 font-mono text-sm">
                  {selectedAnnouncement.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      <AdminCreateAnnouncementModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        allUsers={allUsers}
        rooms={rooms}
        onCreateAnnouncement={async (data) => {
          await onCreateAnnouncement(data);
          setIsCreateOpen(false);
        }}
      />
    </div>
  );
};

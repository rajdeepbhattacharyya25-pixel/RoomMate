import React, { useState, useMemo } from 'react';
import {
  X,
  History,
  Search,
  Calendar,
} from 'lucide-react';
import { InAppNotification } from '../../types';
import { bucketNotificationsByDate } from '../../lib/services/notificationService';
import { NotificationCard } from './NotificationCard';
import { hapticImpact, hapticSelection } from '../../lib/native/haptics';

interface NotificationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: InAppNotification[];
  onAction?: (notification: InAppNotification) => void;
  onToggleRead: (id: string, currentRead: boolean) => void;
  onDelete: (id: string) => void;
}

type HistoryFilterType = 'ALL' | 'PAYMENTS' | 'BILLS' | 'ACTIVITY';

export const NotificationHistoryModal: React.FC<NotificationHistoryModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onAction,
  onToggleRead,
  onDelete,
}) => {
  const [filter, setFilter] = useState<HistoryFilterType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (n.isDeleted) return false;

      // Filter by category
      if (filter === 'PAYMENTS') {
        if (!['PAYMENT_OVERDUE', 'PAYMENT_REQUIRED', 'PAYMENT_DUE_TO_YOU', 'EXPENSE_SETTLED', 'PARTIAL_PAYMENT_RECEIVED'].includes(n.type)) {
          return false;
        }
      } else if (filter === 'BILLS') {
        if (!['EXPENSE_ADDED', 'BILL_ADDED', 'EXPENSE_MODIFIED'].includes(n.type)) {
          return false;
        }
      } else if (filter === 'ACTIVITY') {
        if (!['MEMBER_JOINED', 'ADMIN_APPROVAL_REQUIRED', 'ROOM_JOIN_REQUEST', 'GENERAL_ACTIVITY', 'SYSTEM_INFO'].includes(n.type)) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = n.title.toLowerCase().includes(q);
        const matchesMsg = n.message.toLowerCase().includes(q);
        const matchesRoom = n.metadata?.roomName?.toLowerCase().includes(q) ?? false;
        return matchesTitle || matchesMsg || matchesRoom;
      }

      return true;
    });
  }, [notifications, filter, searchQuery]);

  const buckets = useMemo(() => {
    return bucketNotificationsByDate(filteredNotifications);
  }, [filteredNotifications]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[90vh] max-h-[800px]">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Notification History</h3>
              <p className="text-xs text-slate-500">Chronological archive of past activities</p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticImpact('LIGHT');
              onClose();
            }}
            className="p-2 rounded-full hover:bg-slate-200/60 text-slate-500 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 bg-white border-b border-slate-100 space-y-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search history by bill, person, or room..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => {
                hapticSelection();
                setFilter('ALL');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                filter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All ({notifications.filter((n) => !n.isDeleted).length})
            </button>

            <button
              onClick={() => {
                hapticSelection();
                setFilter('PAYMENTS');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                filter === 'PAYMENTS'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Dues & Payments
            </button>

            <button
              onClick={() => {
                hapticSelection();
                setFilter('BILLS');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                filter === 'BILLS'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Shared Bills
            </button>

            <button
              onClick={() => {
                hapticSelection();
                setFilter('ACTIVITY');
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                filter === 'ACTIVITY'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Room Activity
            </button>
          </div>
        </div>

        {/* Chronological List of Buckets */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-[#F9F9FF]">
          {filteredNotifications.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6">
              <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                <History className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">No Historical Records Found</h4>
              <p className="text-xs text-slate-500 max-w-xs">
                {searchQuery
                  ? `No notifications matched "${searchQuery}".`
                  : 'Your notification archive will organize past bills, settlements, and room events here.'}
              </p>
            </div>
          ) : (
            <>
              {/* Today */}
              {buckets.today.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 px-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Today ({buckets.today.length})
                    </h4>
                  </div>
                  {buckets.today.map((notif) => (
                    <NotificationCard
                      key={notif.id}
                      notification={notif}
                      onAction={onAction}
                      onToggleRead={onToggleRead}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}

              {/* Yesterday */}
              {buckets.yesterday.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 px-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Yesterday ({buckets.yesterday.length})
                    </h4>
                  </div>
                  {buckets.yesterday.map((notif) => (
                    <NotificationCard
                      key={notif.id}
                      notification={notif}
                      onAction={onAction}
                      onToggleRead={onToggleRead}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}

              {/* Earlier this week */}
              {buckets.earlierThisWeek.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 px-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Earlier This Week ({buckets.earlierThisWeek.length})
                    </h4>
                  </div>
                  {buckets.earlierThisWeek.map((notif) => (
                    <NotificationCard
                      key={notif.id}
                      notification={notif}
                      onAction={onAction}
                      onToggleRead={onToggleRead}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}

              {/* Older */}
              {buckets.older.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 px-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Older ({buckets.older.length})
                    </h4>
                  </div>
                  {buckets.older.map((notif) => (
                    <NotificationCard
                      key={notif.id}
                      notification={notif}
                      onAction={onAction}
                      onToggleRead={onToggleRead}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{filteredNotifications.length} notification{filteredNotifications.length === 1 ? '' : 's'} recorded</span>
          <button
            onClick={() => {
              hapticImpact('LIGHT');
              onClose();
            }}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

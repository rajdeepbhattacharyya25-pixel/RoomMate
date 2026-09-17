import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  CheckCheck,
  MoreVertical,
  Trash2,
  History,
  Settings,
  Bell,
  ArrowRight,
} from 'lucide-react';
import { InAppNotification } from '../../types';
import { rankNotifications } from '../../lib/services/notificationService';
import { NotificationCard } from './NotificationCard';
import { NotificationHistoryModal } from './NotificationHistoryModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { hapticImpact, hapticSelection, hapticSuccess } from '../../lib/native/haptics';

interface NotificationCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: InAppNotification[];
  onAction?: (notification: InAppNotification) => void;
  onToggleRead: (id: string, currentRead: boolean) => void;
  onMarkAllRead: (ids?: string[]) => void;
  onDeleteNotification: (id: string) => void;
  onClearReadNotifications: (ids?: string[]) => void;
}

export const NotificationCenterDrawer: React.FC<NotificationCenterDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onAction,
  onToggleRead,
  onMarkAllRead,
  onDeleteNotification,
  onClearReadNotifications,
}) => {
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    };
    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOverflowMenu]);

  // Filter out deleted items and intelligently rank
  const activeNotifications = useMemo(() => {
    const nonDeleted = notifications.filter((n) => !n.isDeleted);
    return rankNotifications(nonDeleted);
  }, [notifications]);

  const unreadCount = activeNotifications.filter((n) => !n.isRead).length;
  const readCount = activeNotifications.filter((n) => n.isRead).length;

  if (!isOpen) return null;

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;
    const unreadIds = activeNotifications.filter((n) => !n.isRead).map((n) => n.id);
    hapticSuccess();
    onMarkAllRead(unreadIds);
    setShowOverflowMenu(false);
  };

  const handleClearRead = () => {
    if (readCount === 0) return;
    const readIds = activeNotifications.filter((n) => n.isRead).map((n) => n.id);
    hapticImpact('MEDIUM');
    onClearReadNotifications(readIds);
    setShowOverflowMenu(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        {/* Backdrop click to dismiss */}
        <div className="absolute inset-0" onClick={onClose} />

        {/* Slide-Up Drawer Surface */}
        <div
          className="relative z-10 w-full max-w-lg mx-auto bg-white rounded-t-[32px] shadow-2xl border-t border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-300"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}
        >
          {/* Top Handle Drag Indicator */}
          <div className="w-full flex items-center justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
          </div>

          {/* Drawer Header */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Notifications</h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-2xs">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Mark all as read button */}
              {unreadCount > 0 ? (
                <button
                  onClick={handleMarkAllRead}
                  className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 active:scale-95"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              ) : (
                <span className="text-xs font-medium text-slate-400 px-2 py-1 flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>All read</span>
                </span>
              )}

              {/* Overflow Menu */}
              <div className="relative" ref={overflowRef}>
                <button
                  onClick={() => {
                    hapticSelection();
                    setShowOverflowMenu(!showOverflowMenu);
                  }}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showOverflowMenu && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-20 animate-in fade-in slide-in-from-top-2 duration-150">
                    <button
                      onClick={handleMarkAllRead}
                      disabled={unreadCount === 0}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CheckCheck className="w-4 h-4 text-indigo-600" />
                      <span>Mark all as read</span>
                    </button>

                    <button
                      onClick={handleClearRead}
                      disabled={readCount === 0}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4 text-slate-500" />
                      <span>Clear read notifications</span>
                    </button>

                    <div className="my-1 border-t border-slate-100" />

                    <button
                      onClick={() => {
                        hapticImpact('LIGHT');
                        setShowOverflowMenu(false);
                        setShowHistoryModal(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <History className="w-4 h-4 text-indigo-600" />
                      <span>View history</span>
                    </button>

                    <button
                      onClick={() => {
                        hapticImpact('LIGHT');
                        setShowOverflowMenu(false);
                        setShowSettingsModal(true);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                    >
                      <Settings className="w-4 h-4 text-slate-600" />
                      <span>Notification settings</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  hapticImpact('LIGHT');
                  onClose();
                }}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Swipe Hint Tip */}
          {activeNotifications.length > 0 && (
            <div className="px-5 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>👉 Swipe left to delete • Swipe right to toggle read</span>
              <button
                onClick={() => setShowHistoryModal(true)}
                className="font-semibold text-indigo-600 hover:underline flex items-center gap-0.5"
              >
                <span>History</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Notifications Scrollable List */}
          <div className="flex-1 overflow-y-auto px-4 py-3 bg-[#F9F9FF] min-h-[260px]">
            {activeNotifications.length === 0 ? (
              /* Clean Empty State */
              <div className="h-64 flex flex-col items-center justify-center text-center p-6">
                <div className="w-14 h-14 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3.5 shadow-2xs">
                  <Bell className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">You're all caught up</h3>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-4">
                  You don't have any new notifications. When room bills, debt settlements, or join requests happen, they will appear here.
                </p>
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-indigo-600" />
                  <span>View Notification History</span>
                </button>
              </div>
            ) : (
              /* Ranked List */
              <div>
                {activeNotifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onAction={(notif) => {
                      if (!notif.isRead) {
                        onToggleRead(notif.id, false);
                      }
                      onClose();
                      if (onAction) onAction(notif);
                    }}
                    onToggleRead={onToggleRead}
                    onDelete={onDeleteNotification}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Drawer Footer with History Link */}
          <div className="px-5 py-3 border-t border-slate-100 bg-white flex items-center justify-between">
            <button
              onClick={() => {
                hapticImpact('LIGHT');
                setShowSettingsModal(true);
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Settings</span>
            </button>

            <button
              onClick={() => {
                hapticImpact('LIGHT');
                setShowHistoryModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <History className="w-3.5 h-3.5 text-indigo-600" />
              <span>View History</span>
            </button>
          </div>
        </div>
      </div>

      {/* History Modal */}
      <NotificationHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        notifications={notifications}
        onAction={(notif) => {
          if (!notif.isRead) {
            onToggleRead(notif.id, false);
          }
          setShowHistoryModal(false);
          onClose();
          if (onAction) onAction(notif);
        }}
        onToggleRead={onToggleRead}
        onDelete={onDeleteNotification}
      />

      {/* Settings Modal */}
      <NotificationSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </>
  );
};

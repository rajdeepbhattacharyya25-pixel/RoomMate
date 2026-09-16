import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  Receipt,
  CheckCircle2,
  Trash2,
  Check,
  Mail,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { InAppNotification, NotificationPriority } from '../../types';
import { formatRelativeTime } from '../../lib/services/notificationService';
import { hapticImpact, hapticSelection } from '../../lib/native/haptics';

interface NotificationCardProps {
  notification: InAppNotification;
  onAction?: (notification: InAppNotification) => void;
  onToggleRead: (id: string, currentRead: boolean) => void;
  onDelete: (id: string) => void;
}

export const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onAction,
  onToggleRead,
  onDelete,
}) => {
  // Swipe State
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const AUTO_TRIGGER_THRESHOLD = 130;

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;

    const diffX = e.touches[0].clientX - startXRef.current;
    const diffY = e.touches[0].clientY - startYRef.current;

    // Detect direction on first few pixels
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalSwipeRef.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    // Only scroll horizontally if it's a genuine horizontal swipe
    if (isHorizontalSwipeRef.current) {
      // Damped rubber-band effect
      const damped = Math.sign(diffX) * Math.min(160, Math.pow(Math.abs(diffX), 0.9));
      setSwipeOffset(damped);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (swipeOffset < -AUTO_TRIGGER_THRESHOLD) {
      // Swiped far left: trigger Delete
      hapticImpact('MEDIUM');
      onDelete(notification.id);
    } else if (swipeOffset > AUTO_TRIGGER_THRESHOLD) {
      // Swiped far right: trigger Toggle Read
      hapticSelection();
      onToggleRead(notification.id, notification.isRead);
    }

    // Snap back
    setSwipeOffset(0);
  };

  const handleTouchCancel = () => {
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  // Visual Priority Tokens
  const getPriorityConfig = (priority: NotificationPriority) => {
    switch (priority) {
      case 'HIGH':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />,
          border: 'border-l-4 border-l-rose-500 border-slate-200/80',
          bgUnread: 'bg-rose-50/25',
          tagBg: 'bg-rose-100 text-rose-800 border-rose-200',
          tagText: 'URGENT',
          ariaPriority: 'High Priority Alert',
        };
      case 'MEDIUM':
        return {
          icon: <Receipt className="w-4 h-4 text-amber-600 shrink-0" />,
          border: 'border-l-4 border-l-amber-500 border-slate-200/80',
          bgUnread: 'bg-amber-50/20',
          tagBg: 'bg-amber-100 text-amber-800 border-amber-200',
          tagText: 'SHARED BILL',
          ariaPriority: 'Medium Priority',
        };
      case 'LOW':
      default:
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
          border: 'border-l-4 border-l-emerald-500 border-slate-200/80',
          bgUnread: 'bg-emerald-50/20',
          tagBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          tagText: 'ACTIVITY',
          ariaPriority: 'Information',
        };
    }
  };

  const config = getPriorityConfig(notification.priority);

  // Action Button Label & Style
  const getActionButton = () => {
    if (!notification.actionType || notification.actionType === 'NONE') return null;

    let label = 'View';
    let btnClass = 'bg-slate-100 text-slate-800 hover:bg-slate-200';

    switch (notification.actionType) {
      case 'PAY_NOW':
        label = 'Settle Now';
        btnClass = 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs';
        break;
      case 'VIEW_EXPENSE':
        label = 'View Expense';
        btnClass = 'bg-slate-900 text-white hover:bg-slate-800';
        break;
      case 'REVIEW':
        label = 'Review Request';
        btnClass = 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs';
        break;
      case 'VIEW_DETAILS':
        label = 'Details';
        btnClass = 'bg-slate-100 text-slate-800 hover:bg-slate-200';
        break;
      case 'VIEW_BALANCE':
        label = 'View Balance';
        btnClass = 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100';
        break;
    }

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          hapticImpact('LIGHT');
          if (onAction) onAction(notification);
        }}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-transform active:scale-95 shrink-0 ${btnClass}`}
      >
        <span>{label}</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-xl mb-2.5 touch-pan-y">
      {/* Background Swipe Action Trays */}
      <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
        {/* Right Swipe Tray (Mark Read / Unread) */}
        <div
          className={`h-full w-1/2 flex items-center pl-4 bg-indigo-600 text-white text-xs font-bold transition-opacity ${
            swipeOffset > 20 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {notification.isRead ? <Mail className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            <span>{notification.isRead ? 'Mark Unread' : 'Mark Read'}</span>
          </div>
        </div>

        {/* Left Swipe Tray (Delete) */}
        <div
          className={`h-full w-1/2 flex items-center justify-end pr-4 bg-rose-600 text-white text-xs font-bold transition-opacity ${
            swipeOffset < -20 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </div>
        </div>
      </div>

      {/* Main Card Surface */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`relative z-10 p-3.5 rounded-xl border bg-white shadow-2xs transition-colors select-none ${
          config.border
        } ${!notification.isRead ? `${config.bgUnread} ring-1 ring-black/5` : 'bg-white'}`}
      >
        {/* Top Meta Row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {config.icon}
            {/* Multi-modal priority tag (never relies on color alone) */}
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border ${config.tagBg}`}
              aria-label={config.ariaPriority}
            >
              {config.tagText}
            </span>

            {/* Room Name if present */}
            {notification.metadata?.roomName && (
              <span className="text-[11px] font-medium text-slate-500 truncate max-w-[120px]">
                • {notification.metadata.roomName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Timestamp */}
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{formatRelativeTime(notification.createdAt)}</span>
            </div>

            {/* Unread indicator dot */}
            {!notification.isRead && (
              <span
                className="w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-indigo-200"
                title="Unread"
              />
            )}
          </div>
        </div>

        {/* Title */}
        <h4
          className={`text-sm mb-1 leading-snug ${
            !notification.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
          }`}
        >
          {notification.title}
        </h4>

        {/* Description Message */}
        <p className="text-xs text-slate-600 leading-relaxed mb-3">
          {notification.message}
        </p>

        {/* Bottom Actions Row */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {/* Toggle Read/Unread small button */}
            <button
              onClick={() => {
                hapticSelection();
                onToggleRead(notification.id, notification.isRead);
              }}
              className="text-[11px] text-slate-500 hover:text-indigo-600 font-medium py-1 px-1.5 rounded hover:bg-slate-50 transition-colors flex items-center gap-1"
              title={notification.isRead ? 'Mark as unread' : 'Mark as read'}
            >
              {notification.isRead ? (
                <>
                  <Mail className="w-3 h-3" />
                  <span>Mark unread</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  <span>Mark read</span>
                </>
              )}
            </button>

            {/* Delete button */}
            <button
              onClick={() => {
                hapticImpact('LIGHT');
                onDelete(notification.id);
              }}
              className="text-[11px] text-slate-400 hover:text-rose-600 font-medium py-1 px-1.5 rounded hover:bg-rose-50 transition-colors flex items-center gap-1"
              title="Delete notification"
            >
              <Trash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>

          {/* Contextual Action Button */}
          {getActionButton()}
        </div>
      </div>
    </div>
  );
};

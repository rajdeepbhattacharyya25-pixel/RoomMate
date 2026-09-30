import React, { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { InAppNotification } from '../../types';
import { formatBadgeCount } from '../../lib/services/notificationService';
import { hapticImpact } from '../../lib/native/haptics';

interface NotificationBellProps {
  notifications: InAppNotification[];
  onClick: () => void;
  className?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onClick,
  className = '',
}) => {
  const unreadNotifications = notifications.filter((n) => !n.isRead && !n.isDeleted);
  const unreadCount = unreadNotifications.length;
  const hasHighPriorityUnread = unreadNotifications.some((n) => n.priority === 'HIGH');
  const badgeLabel = formatBadgeCount(unreadCount);

  // Animation trigger states
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationType, setAnimationType] = useState<'normal' | 'urgent'>('normal');
  const prevCountRef = useRef<number>(unreadCount);

  useEffect(() => {
    // Trigger animation only when count increases (new notification arrived)
    if (unreadCount > prevCountRef.current) {
      if (hasHighPriorityUnread) {
        setAnimationType('urgent');
      } else {
        setAnimationType('normal');
      }
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 600);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount, hasHighPriorityUnread]);

  const handleClick = () => {
    hapticImpact('LIGHT');
    onClick();
  };

  const bellAnimationClass = isAnimating
    ? animationType === 'urgent'
      ? 'animate-bell-urgent'
      : 'animate-bell-shake'
    : '';

  return (
    <button
      onClick={handleClick}
      aria-label={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}. Tap to open notifications panel.`
          : 'Notifications, no unread notifications.'
      }
      className={`relative p-2 rounded-full border transition-all active:scale-95 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
        hasHighPriorityUnread
          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 shadow-2xs'
          : unreadCount > 0
          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 shadow-2xs'
          : 'bg-white dark:bg-[#1C1C25] border-slate-200 dark:border-[#27354A] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#20202A] hover:text-slate-900 dark:hover:text-white shadow-2xs'
      } ${className}`}
      title={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
    >
      {/* Bell Icon with dynamic wiggle / urgent shake */}
      <Bell
        className={`w-4 h-4 transition-transform ${bellAnimationClass} ${
          hasHighPriorityUnread
            ? 'text-rose-600 dark:text-rose-400'
            : unreadCount > 0
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-slate-600 dark:text-slate-300'
        }`}
      />

      {/* High-priority pulse ring */}
      {hasHighPriorityUnread && (
        <span className="absolute -inset-0.5 rounded-full border border-rose-400 animate-ping opacity-35 pointer-events-none" />
      )}

      {/* Unread Badge */}
      {badgeLabel && (
        <span
          key={badgeLabel}
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center border shadow-xs animate-badge-pop tabular-nums ${
            hasHighPriorityUnread
              ? 'bg-rose-600 text-white border-white dark:border-[#12121A] animate-urgent-pulse'
              : 'bg-indigo-600 text-white border-white dark:border-[#12121A]'
          }`}
        >
          {badgeLabel}
        </span>
      )}
    </button>
  );
};

import { InAppNotification, NotificationPriority } from '../../types';
import { isNotificationSoundEnabled, setNotificationSoundEnabled } from '../native/notificationSound';

export interface NotificationSettings {
  sharedBills: boolean;
  settlements: boolean;
  nudges: boolean;
  soundEnabled: boolean;
  highPriorityAlerts: boolean; // Always true (locked)
}

const SETTINGS_KEY = 'roommate_notification_preferences';

/**
 * Retrieves the user's notification preferences.
 */
export function getNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      sharedBills: true,
      settlements: true,
      nudges: true,
      soundEnabled: true,
      highPriorityAlerts: true,
    };
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        sharedBills: true,
        settlements: true,
        nudges: true,
        soundEnabled: isNotificationSoundEnabled(),
        highPriorityAlerts: true,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      sharedBills: parsed.sharedBills ?? true,
      settlements: parsed.settlements ?? true,
      nudges: parsed.nudges ?? true,
      soundEnabled: isNotificationSoundEnabled(),
      highPriorityAlerts: true, // Always locked on for security and financial integrity
    };
  } catch {
    return {
      sharedBills: true,
      settlements: true,
      nudges: true,
      soundEnabled: true,
      highPriorityAlerts: true,
    };
  }
}

/**
 * Persists updated notification settings.
 */
export function saveNotificationSettings(settings: Partial<NotificationSettings>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const current = getNotificationSettings();
    const updated = {
      ...current,
      ...settings,
      highPriorityAlerts: true, // Safeguard: cannot disable high-priority financial events
    };

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));

    if (settings.soundEnabled !== undefined && settings.soundEnabled !== isNotificationSoundEnabled()) {
      setNotificationSoundEnabled(settings.soundEnabled);
    }
  } catch (err) {
    console.warn('[NotificationService] Failed to save settings:', err);
  }
}

/**
 * Formats the unread badge count according to strict rules:
 * - 0 -> null (no badge)
 * - 1–9 -> '1'..'9'
 * - 10+ -> '9+'
 */
export function formatBadgeCount(count: number): string | null {
  if (!count || count <= 0) return null;
  if (count <= 9) return String(count);
  return '9+';
}

/**
 * Intelligent Ranking Algorithm:
 * - 1st: Unread HIGH priority (newest first)
 * - 2nd: Unread MEDIUM priority (newest first)
 * - 3rd: Unread LOW priority (newest first)
 * - 4th: Read / older notifications (sorted by createdAt desc, age-based decay)
 */
export function rankNotifications(notifications: InAppNotification[]): InAppNotification[] {
  const priorityWeight: Record<NotificationPriority, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  return [...notifications].sort((a, b) => {
    // 1. Unread items come before read items
    if (!a.isRead && b.isRead) return -1;
    if (a.isRead && !b.isRead) return 1;

    // 2. Both unread: rank by priority (HIGH > MEDIUM > LOW)
    if (!a.isRead && !b.isRead) {
      const weightA = priorityWeight[a.priority] || 1;
      const weightB = priorityWeight[b.priority] || 1;
      if (weightA !== weightB) {
        return weightB - weightA;
      }
    }

    // 3. Within same category / read state: newest first
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
}

/**
 * Formats relative timestamp for notification cards (e.g., "Just now", "5m ago", "2h ago", "Yesterday")
 */
export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diffMs = now - date;

  if (diffMs < 0 || diffMs < 45 * 1000) {
    return 'Just now';
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Date(dateString).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Groups notifications by date buckets for the history view:
 * - Today
 * - Yesterday
 * - Earlier this week
 * - Older
 */
export interface NotificationHistoryBuckets {
  today: InAppNotification[];
  yesterday: InAppNotification[];
  earlierThisWeek: InAppNotification[];
  older: InAppNotification[];
}

export function bucketNotificationsByDate(notifications: InAppNotification[]): NotificationHistoryBuckets {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const buckets: NotificationHistoryBuckets = {
    today: [],
    yesterday: [],
    earlierThisWeek: [],
    older: [],
  };

  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const n of sorted) {
    const time = new Date(n.createdAt).getTime();
    if (time >= startOfToday) {
      buckets.today.push(n);
    } else if (time >= startOfYesterday) {
      buckets.yesterday.push(n);
    } else if (time >= startOfWeek) {
      buckets.earlierThisWeek.push(n);
    } else {
      buckets.older.push(n);
    }
  }

  return buckets;
}

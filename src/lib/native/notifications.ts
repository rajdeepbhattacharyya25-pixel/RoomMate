import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { playNotificationSound, playSuccessSound } from './notificationSound';

export const EXPENSES_CHANNEL_ID = 'roommate_expenses_channel';
export const SETTLEMENTS_CHANNEL_ID = 'roommate_settlements_channel';
export const NUDGES_CHANNEL_ID = 'roommate_nudges_channel';
export const REQUESTS_CHANNEL_ID = 'roommate_requests_channel';

let isChannelsInitialized = false;

/**
 * Initializes notification channels on Android and attaches push listeners.
 */
export async function initNativeNotifications(): Promise<void> {
  if (isChannelsInitialized) return;

  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Create Android Notification Channels
      await LocalNotifications.createChannel({
        id: EXPENSES_CHANNEL_ID,
        name: 'Room Shared Expenses',
        description: 'Instant alerts when a roommate records a new shared bill or split',
        importance: 4, // High
        visibility: 1, // Public
        sound: 'notification.mp3',
        vibration: true,
        lights: true,
        lightColor: '#6366F1',
      });

      await LocalNotifications.createChannel({
        id: SETTLEMENTS_CHANNEL_ID,
        name: 'UPI & Cash Settlements',
        description: 'Confirmations when a roommate settles debt via UPI or cash',
        importance: 4,
        visibility: 1,
        sound: 'notification.mp3',
        vibration: true,
        lights: true,
        lightColor: '#10B981',
      });

      await LocalNotifications.createChannel({
        id: NUDGES_CHANNEL_ID,
        name: 'Roommate WhatsApp Nudges',
        description: 'Reminders and nudges from flatmates for pending balances',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#25D366',
      });

      isChannelsInitialized = true;
    } catch (err) {
      console.warn('Failed to initialize native notifications:', err);
    }
  }
}

/**
 * Requests permissions for both local notifications and push tokens.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      const localStatus = await LocalNotifications.requestPermissions();
      return localStatus.display === 'granted';
    } catch (err) {
      console.warn('Notification permission request error:', err);
      return false;
    }
  }

  // Web Browser fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Dispatches an instant native local notification when a new shared expense is added.
 */
export async function sendLocalExpenseNotification(data: {
  title: string;
  totalAmount: number;
  paidByName: string;
  roomName?: string;
}): Promise<void> {
  const notifTitle = `New Bill: ${data.title}`;
  const notifBody = `${data.paidByName} added ₹${data.totalAmount.toFixed(2)}${
    data.roomName ? ` in ${data.roomName}` : ''
  }. Check your share.`;

  // Play in-app notification chime
  playNotificationSound();

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 100000),
            title: notifTitle,
            body: notifBody,
            channelId: EXPENSES_CHANNEL_ID,
            smallIcon: 'ic_stat_icon_config_sample',
            extra: { type: 'expense', amount: data.totalAmount },
          },
        ],
      });
      return;
    } catch (err) {
      console.warn('Failed to schedule native expense notification:', err);
    }
  }

  // Web Notification fallback
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(notifTitle, {
        body: notifBody,
        icon: '/icons/icon-192.png',
      });
    } catch {
      // Ignore web notification error
    }
  }
}

/**
 * Dispatches an instant native local notification when a debt settlement is recorded.
 */
export async function sendLocalSettlementNotification(data: {
  amount: number;
  payerName: string;
  payeeName: string;
  paymentMethod: string;
}): Promise<void> {
  const notifTitle = `Settlement Recorded: ₹${data.amount.toFixed(2)}`;
  const notifBody = `${data.payerName} paid ${data.payeeName} via ${data.paymentMethod}. All balances updated.`;

  // Play success chime for settlements
  playSuccessSound();

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 100000),
            title: notifTitle,
            body: notifBody,
            channelId: SETTLEMENTS_CHANNEL_ID,
            smallIcon: 'ic_stat_icon_config_sample',
            extra: { type: 'settlement', amount: data.amount },
          },
        ],
      });
      return;
    } catch (err) {
      console.warn('Failed to schedule native settlement notification:', err);
    }
  }

  // Web Notification fallback
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(notifTitle, {
        body: notifBody,
        icon: '/icons/icon-192.png',
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * Dispatches a notification when a roommate triggers a WhatsApp nudge.
 */
export async function sendLocalNudgeNotification(data: {
  fromName: string;
  amount: number;
  tone: string;
}): Promise<void> {
  const notifTitle = `Payment Reminder from ${data.fromName}`;
  const notifBody = `Hey! Outstanding balance of ₹${data.amount.toFixed(2)} is due. Settle seamlessly with UPI.`;

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 100000),
            title: notifTitle,
            body: notifBody,
            channelId: NUDGES_CHANNEL_ID,
            smallIcon: 'ic_stat_icon_config_sample',
          },
        ],
      });
      return;
    } catch (err) {
      console.warn('Failed to schedule native nudge notification:', err);
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(notifTitle, {
        body: notifBody,
        icon: '/icons/icon-192.png',
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * Dispatches an instant native local notification when a new join request arrives.
 */
export async function sendLocalJoinRequestNotification(data: {
  requesterName: string;
  requesterEmail: string;
  roomName: string;
}): Promise<void> {
  const notifTitle = `🔔 Join Request: ${data.roomName}`;
  const notifBody = `${data.requesterName} (${data.requesterEmail}) wants to join ${data.roomName}. Tap to review.`;
  playNotificationSound();

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 100000),
            title: notifTitle,
            body: notifBody,
            channelId: REQUESTS_CHANNEL_ID,
            smallIcon: 'ic_stat_icon_config_sample',
            extra: { type: 'join_request', roomName: data.roomName },
          },
        ],
      });
      return;
    } catch (err) {
      console.warn('Failed to schedule native join request notification:', err);
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(notifTitle, {
        body: notifBody,
        icon: '/icons/icon-192.png',
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * Dispatches an instant notification to the user when their join request is approved.
 */
export async function sendLocalJoinApprovalNotification(data: {
  roomName: string;
  adminName: string;
}): Promise<void> {
  const notifTitle = `🎉 You're in! Welcome to ${data.roomName}`;
  const notifBody = `${data.adminName} approved your request. Tap to enter your shared room ledger.`;
  playSuccessSound();

  if (Capacitor.isNativePlatform()) {
    try {
      await initNativeNotifications();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 100000),
            title: notifTitle,
            body: notifBody,
            channelId: REQUESTS_CHANNEL_ID,
            smallIcon: 'ic_stat_icon_config_sample',
            extra: { type: 'join_approval', roomName: data.roomName },
          },
        ],
      });
      return;
    } catch (err) {
      console.warn('Failed to schedule native join approval notification:', err);
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(notifTitle, {
        body: notifBody,
        icon: '/icons/icon-192.png',
      });
    } catch {
      // Ignore
    }
  }
}

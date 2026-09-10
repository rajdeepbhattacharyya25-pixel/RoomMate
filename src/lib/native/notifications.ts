import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications, PushNotificationSchema } from '@capacitor/push-notifications';

export const EXPENSES_CHANNEL_ID = 'campusflow_expenses_channel';
export const SETTLEMENTS_CHANNEL_ID = 'campusflow_settlements_channel';
export const NUDGES_CHANNEL_ID = 'campusflow_nudges_channel';

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
        sound: 'beep.wav',
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
        sound: 'beep.wav',
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

      // 2. Setup Push Notification Listeners
      PushNotifications.addListener('registration', (token) => {
        console.log('[Push] Device registered token:', token.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.warn('[Push] Registration error:', error);
      });

      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        console.log('[Push] Notification received in foreground:', notification);
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
      const pushStatus = await PushNotifications.requestPermissions();

      if (pushStatus.receive === 'granted') {
        await PushNotifications.register();
      }

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

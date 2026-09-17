import { getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getFirebaseMessaging, isFirebaseConfigured, firebaseConfig } from './config';
import { playNotificationSound, playSuccessSound } from '../native/notificationSound';
import { updateFcmTokenCloud, deactivateFcmTokenCloud } from '../storage/cloudStorageAdapter';
import { supabase } from '../supabase/client';

export const EXPENSES_CHANNEL_ID = 'roommate_expenses_channel';
export const SETTLEMENTS_CHANNEL_ID = 'roommate_settlements_channel';
export const NUDGES_CHANNEL_ID = 'roommate_nudges_channel';
export const REQUESTS_CHANNEL_ID = 'roommate_requests_channel';

const PRIMARY_FCM_TOKEN_STORAGE_KEY = 'roommate_fcm_token';
const LEGACY_FCM_TOKEN_STORAGE_KEY = 'campusflow_fcm_token';
const DEVICE_ID_STORAGE_KEY = 'roommate_device_id';

let areChannelsInitialized = false;

/**
 * Returns a persistent device identifier across sessions to support multi-device push tracking.
 */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'browser_unknown';
  let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!deviceId) {
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Checks current notification permission status without prompting.
 */
export async function getNotificationPermissionStatus(): Promise<'prompt' | 'granted' | 'denied'> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications')) {
    try {
      const status = await PushNotifications.checkPermissions();
      if (status.receive === 'granted') return 'granted';
      if (status.receive === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'denied';
    }
  }
  if (typeof window !== 'undefined' && 'Notification' in window && window.Notification) {
    const perm = window.Notification.permission;
    if (perm === 'granted') return 'granted';
    if (perm === 'denied') return 'denied';
    return 'prompt';
  }
  return 'denied';
}

/**
 * Initializes Android notification channels on native PushNotifications plugin.
 */
export async function createPushNotificationChannels(): Promise<void> {
  if (areChannelsInitialized || !Capacitor.isNativePlatform()) return;

  try {
    if (Capacitor.isPluginAvailable('PushNotifications')) {
      await PushNotifications.createChannel({
        id: EXPENSES_CHANNEL_ID,
        name: 'Room Shared Expenses',
        description: 'Instant alerts when a roommate records a new shared bill or split',
        importance: 4, // High importance
        visibility: 1, // Public
        sound: 'notification.mp3',
        vibration: true,
        lights: true,
        lightColor: '#6366F1',
      });

      await PushNotifications.createChannel({
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

      await PushNotifications.createChannel({
        id: NUDGES_CHANNEL_ID,
        name: 'Roommate WhatsApp Nudges',
        description: 'Reminders and nudges from flatmates for pending balances',
        importance: 4,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#25D366',
      });

      await PushNotifications.createChannel({
        id: REQUESTS_CHANNEL_ID,
        name: 'Room Join Requests & Approvals',
        description: 'Alerts when members request or join a shared room ledger',
        importance: 4,
        visibility: 1,
        sound: 'notification.mp3',
        vibration: true,
        lights: true,
        lightColor: '#6366F1',
      });

      areChannelsInitialized = true;
    }
  } catch (err) {
    console.warn('[Push] Channel creation notice:', err);
  }
}

/**
 * Get cached FCM token from local storage
 */
export function getCachedFcmToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return (
    localStorage.getItem(PRIMARY_FCM_TOKEN_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_FCM_TOKEN_STORAGE_KEY)
  );
}

/**
 * Requests push notification permissions, initializes channels, and retrieves FCM Device Token.
 * Seamlessly handles both Native Capacitor push and Web FCM push with multi-device tracking.
 */
export async function registerPushNotifications(userId?: string): Promise<string | null> {
  const deviceId = getOrCreateDeviceId();

  // 1. Native Mobile (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      if (!Capacitor.isPluginAvailable('PushNotifications')) {
        console.warn('[Push] PushNotifications plugin is not available on this platform.');
        return null;
      }

      await createPushNotificationChannels();

      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('[Push] Native notification permission was not granted.');
        return null;
      }

      try {
        await PushNotifications.register();
      } catch (regErr) {
        console.warn('[Push] PushNotifications.register native call failed:', regErr);
        return null;
      }

      return new Promise((resolve) => {
        let isResolved = false;

        const cleanup = (tokenVal: string | null) => {
          if (isResolved) return;
          isResolved = true;
          resolve(tokenVal);
        };

        PushNotifications.addListener('registration', async (token) => {
          console.log('[Push] Native device registered token:', token.value);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(PRIMARY_FCM_TOKEN_STORAGE_KEY, token.value);
          }
          if (userId) {
            await updateFcmTokenCloud(userId, token.value, deviceId, Capacitor.getPlatform());
          }
          cleanup(token.value);
        });

        PushNotifications.addListener('registrationError', (err) => {
          console.error('[Push] Native device registration error:', err);
          cleanup(null);
        });

        // 6 second safety timeout so UI never hangs if network or FCM rejects
        setTimeout(() => {
          if (!isResolved) {
            console.warn('[Push] Registration listener timed out (service unconfigured or offline).');
            cleanup(null);
          }
        }, 6000);
      });
    } catch (err) {
      console.warn('[Push] Native Push Registration failed:', err);
      return null;
    }
  }

  // 2. Web Browser PWA Push (Firebase Cloud Messaging)
  if (!isFirebaseConfigured) {
    console.log('[FCM] Firebase not configured with credentials. Push in fallback/local mode.');
    return null;
  }

  try {
    if (!('Notification' in window)) {
      console.warn('[FCM] Browser does not support desktop notifications.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] User denied notification permission.');
      return null;
    }

    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    // Register service worker if available
    let registration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      } catch (swErr) {
        console.warn('[FCM] Service worker registration notice:', swErr);
      }
    }

    const token = await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey || undefined,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      console.log('[FCM] Retrieved Web push token:', token);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PRIMARY_FCM_TOKEN_STORAGE_KEY, token);
      }
      if (userId) {
        await updateFcmTokenCloud(userId, token, deviceId, 'web');
      }
      return token;
    }
    return null;
  } catch (error) {
    console.warn('[FCM] Failed to retrieve FCM token:', error);
    return null;
  }
}

/**
 * Deactivates this device's token when the user signs out.
 */
export async function deactivateCurrentDevicePush(userId: string): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();
  return deactivateFcmTokenCloud(userId, deviceId);
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushActionPayload {
  actionId: string;
  data?: Record<string, unknown>;
}

/**
 * Attach push listeners to handle foreground alerts and tap actions.
 */
export async function initPushListeners(callbacks?: {
  onForegroundNotification?: (payload: PushNotificationPayload) => void;
  onNotificationActionPerformed?: (action: PushActionPayload) => void;
}): Promise<() => void> {
  const cleanups: Array<() => void> = [];

  // Native listener
  if (Capacitor.isNativePlatform()) {
    try {
      await createPushNotificationChannels();

      const receiveHandle = await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification) => {
          const title = notification.title || 'Room Ledger Update';
          if (title.toLowerCase().includes('settled') || title.toLowerCase().includes('paid')) {
            playSuccessSound();
          } else {
            playNotificationSound();
          }

          if (callbacks?.onForegroundNotification) {
            callbacks.onForegroundNotification({
              title,
              body: notification.body || '',
              data: notification.data as Record<string, unknown>,
            });
          }
        }
      );
      cleanups.push(() => receiveHandle.remove());

      // Handle user tapping notification in system tray
      const actionHandle = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (notificationAction) => {
          console.log('[Push] Notification tapped:', notificationAction);
          if (callbacks?.onNotificationActionPerformed) {
            callbacks.onNotificationActionPerformed({
              actionId: notificationAction.actionId,
              data: notificationAction.notification.data as Record<string, unknown>,
            });
          }
        }
      );
      cleanups.push(() => actionHandle.remove());

      return () => {
        cleanups.forEach((fn) => fn());
      };
    } catch {
      return () => {};
    }
  }

  // Web listener
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  try {
    const unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
      console.log('[FCM] Received foreground push payload:', payload);

      const title = payload.notification?.title || 'RoomMate Update';
      const body = payload.notification?.body || '';

      if (title.toLowerCase().includes('settled') || title.toLowerCase().includes('paid')) {
        playSuccessSound();
      } else {
        playNotificationSound();
      }

      if (callbacks?.onForegroundNotification) {
        callbacks.onForegroundNotification({
          title,
          body,
          data: payload.data as Record<string, unknown>,
        });
      }
    });

    return unsubscribe;
  } catch {
    return () => {};
  }
}

/**
 * Dispatches a push notification to specific room members via Supabase Edge Function
 */
export async function sendPushNotificationToMembers(params: {
  recipientUserIds: string[];
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, string>;
}): Promise<boolean> {
  if (!params.recipientUserIds || params.recipientUserIds.length === 0) {
    return false;
  }
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        ...params,
        channelId: params.channelId || EXPENSES_CHANNEL_ID,
      },
    });

    if (error) {
      console.warn('[PushService] send-push edge function invoke error:', error.message);
      return false;
    }

    console.log('[PushService] Push dispatch response:', data);
    return true;
  } catch (err) {
    console.warn('[PushService] Push dispatch failed:', err);
    return false;
  }
}

export type RoommatePushEventType =
  | 'NEW_SHARED_EXPENSE'
  | 'EXPENSE_UPDATED'
  | 'SETTLEMENT_RECORDED'
  | 'PAYMENT_REMINDER'
  | 'ROOM_INVITATION'
  | 'JOIN_REQUEST'
  | 'JOIN_APPROVED';

export interface RoommatePushEventParams {
  eventType: RoommatePushEventType;
  recipientUserIds: string[];
  roomId: string;
  roomName?: string;
  senderName: string;
  title: string;
  body: string;
  extraData?: Record<string, string>;
}

/**
 * Standardized RoomMate push event dispatcher.
 * Maps event types to logical channels and packages contextual data for tap handling.
 */
export async function sendRoommatePushEvent(params: RoommatePushEventParams): Promise<boolean> {
  let channelId = EXPENSES_CHANNEL_ID;
  if (params.eventType === 'SETTLEMENT_RECORDED') {
    channelId = SETTLEMENTS_CHANNEL_ID;
  } else if (params.eventType === 'PAYMENT_REMINDER') {
    channelId = NUDGES_CHANNEL_ID;
  } else if (
    params.eventType === 'ROOM_INVITATION' ||
    params.eventType === 'JOIN_REQUEST' ||
    params.eventType === 'JOIN_APPROVED'
  ) {
    channelId = REQUESTS_CHANNEL_ID;
  }

  return sendPushNotificationToMembers({
    recipientUserIds: params.recipientUserIds,
    title: params.title,
    body: params.body,
    channelId,
    data: {
      type: params.eventType,
      roomId: params.roomId,
      roomName: params.roomName || '',
      senderName: params.senderName,
      ...params.extraData,
    },
  });
}

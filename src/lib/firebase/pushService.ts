import { getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getFirebaseMessaging, isFirebaseConfigured, firebaseConfig } from './config';
import { playNotificationSound, playSuccessSound } from '../native/notificationSound';
import { updateFcmTokenCloud } from '../storage/cloudStorageAdapter';
import { supabase } from '../supabase/client';

const PRIMARY_FCM_TOKEN_STORAGE_KEY = 'roommate_fcm_token';
const LEGACY_FCM_TOKEN_STORAGE_KEY = 'campusflow_fcm_token';

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
 * Requests push notification permissions and retrieves FCM Device Token.
 * Seamlessly handles both Native Capacitor push and Web FCM push.
 */
export async function registerPushNotifications(userId?: string): Promise<string | null> {
  // 1. Native Mobile (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      if (!Capacitor.isPluginAvailable('PushNotifications')) {
        console.warn('[Push] PushNotifications plugin is not available on this platform.');
        return null;
      }

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
            await updateFcmTokenCloud(userId, token.value);
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
        await updateFcmTokenCloud(userId, token);
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
 * Attach foreground push listeners to display in-app banner/chime when received while app is active.
 */
export async function initPushListeners(
  onForegroundNotification?: (payload: { title: string; body: string; data?: unknown }) => void
): Promise<() => void> {
  // Native listener
  if (Capacitor.isNativePlatform()) {
    try {
      const receiveHandle = await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification) => {
          playNotificationSound();
          if (onForegroundNotification) {
            onForegroundNotification({
              title: notification.title || 'Room Ledger Update',
              body: notification.body || '',
              data: notification.data,
            });
          }
        }
      );

      return () => {
        receiveHandle.remove();
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

      if (onForegroundNotification) {
        onForegroundNotification({ title, body, data: payload.data });
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
  data?: Record<string, string>;
}): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: params,
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

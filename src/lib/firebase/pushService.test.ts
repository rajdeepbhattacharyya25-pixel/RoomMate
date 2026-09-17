import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import {
  getOrCreateDeviceId,
  getNotificationPermissionStatus,
  createPushNotificationChannels,
  deactivateCurrentDevicePush,
  sendRoommatePushEvent,
  EXPENSES_CHANNEL_ID,
  SETTLEMENTS_CHANNEL_ID,
  NUDGES_CHANNEL_ID,
  REQUESTS_CHANNEL_ID,
} from './pushService';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from '../supabase/client';
import * as cloudStorageAdapter from '../storage/cloudStorageAdapter';

// Polyfill localStorage in test environment
const mockStorageMap: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorageMap[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorageMap[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorageMap[key];
  },
  clear: () => {
    Object.keys(mockStorageMap).forEach((k) => delete mockStorageMap[k]);
  },
};

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    isPluginAvailable: vi.fn(),
    getPlatform: vi.fn(() => 'android'),
  },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(),
    createChannel: vi.fn(),
    addListener: vi.fn(),
  },
}));

vi.mock('../supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('../storage/cloudStorageAdapter', () => ({
  updateFcmTokenCloud: vi.fn().mockResolvedValue(true),
  deactivateFcmTokenCloud: vi.fn().mockResolvedValue(true),
}));

describe('FCM Push Service Suite', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {
        localStorage: mockLocalStorage,
      };
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  describe('Device Identifier Persistence', () => {
    it('generates and stores a unique persistent device ID when none exists', () => {
      expect(globalThis.localStorage.getItem('roommate_device_id')).toBeNull();
      const devId1 = getOrCreateDeviceId();
      expect(devId1).toMatch(/^dev_\d+_/);
      expect(globalThis.localStorage.getItem('roommate_device_id')).toBe(devId1);

      // Subsequent call returns the exact same persisted device ID
      const devId2 = getOrCreateDeviceId();
      expect(devId2).toBe(devId1);
    });

    it('reuses existing device ID from localStorage', () => {
      globalThis.localStorage.setItem('roommate_device_id', 'dev_custom_device_999');
      const devId = getOrCreateDeviceId();
      expect(devId).toBe('dev_custom_device_999');
    });
  });

  describe('Notification Channels Configuration', () => {
    it('defines distinct channel IDs for expense, settlement, nudge, and request categories', () => {
      expect(EXPENSES_CHANNEL_ID).toBe('roommate_expenses_channel');
      expect(SETTLEMENTS_CHANNEL_ID).toBe('roommate_settlements_channel');
      expect(NUDGES_CHANNEL_ID).toBe('roommate_nudges_channel');
      expect(REQUESTS_CHANNEL_ID).toBe('roommate_requests_channel');
    });

    it('creates all required Android channels on native platform', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(true);

      await createPushNotificationChannels();

      expect(PushNotifications.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: EXPENSES_CHANNEL_ID,
          importance: 4,
          vibration: true,
        })
      );
      expect(PushNotifications.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: SETTLEMENTS_CHANNEL_ID,
          importance: 4,
        })
      );
      expect(PushNotifications.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: NUDGES_CHANNEL_ID,
          importance: 4,
        })
      );
      expect(PushNotifications.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: REQUESTS_CHANNEL_ID,
          importance: 4,
        })
      );
    });
  });

  describe('Permission Status Inquiries', () => {
    it('returns native permission status without triggering intrusive prompt', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(Capacitor.isPluginAvailable).mockReturnValue(true);
      vi.mocked(PushNotifications.checkPermissions).mockResolvedValue({
        receive: 'granted',
      });

      const status = await getNotificationPermissionStatus();
      expect(status).toBe('granted');
      expect(PushNotifications.requestPermissions).not.toHaveBeenCalled();
    });

    it('returns web Notification.permission in browser environment', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

      (globalThis.window as any).Notification = {
        permission: 'denied',
      };

      const status = await getNotificationPermissionStatus();
      expect(status).toBe('denied');
    });
  });

  describe('Token Deactivation Lifecycle', () => {
    it('calls cloud storage adapter to mark current device inactive on logout', async () => {
      globalThis.localStorage.setItem('roommate_device_id', 'dev_logout_test');
      const spy = vi.spyOn(cloudStorageAdapter, 'deactivateFcmTokenCloud');

      const success = await deactivateCurrentDevicePush('user_resident_123');
      expect(success).toBe(true);
      expect(spy).toHaveBeenCalledWith('user_resident_123', 'dev_logout_test');
    });
  });

  describe('Server-Side Event Dispatching', () => {
    it('dispatches structured notification payload via Supabase send-push function', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValue({
        data: { success: true, delivered: 2, totalTokens: 2 },
        error: null,
      });

      const result = await sendRoommatePushEvent({
        eventType: 'NEW_SHARED_EXPENSE',
        senderName: 'Alice',
        title: 'New Shared Dinner',
        body: 'Alice added ₹450 for groceries',
        recipientUserIds: ['user_bob', 'user_charlie'],
        roomId: 'room_green_villa',
      });

      expect(result).toBe(true);
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'send-push',
        expect.objectContaining({
          body: expect.objectContaining({
            recipientUserIds: ['user_bob', 'user_charlie'],
            title: 'New Shared Dinner',
            body: 'Alice added ₹450 for groceries',
            channelId: EXPENSES_CHANNEL_ID,
            data: expect.objectContaining({
              type: 'NEW_SHARED_EXPENSE',
              roomId: 'room_green_villa',
              senderName: 'Alice',
            }),
          }),
        })
      );
    });

    it('safely handles empty recipient lists without network calls', async () => {
      const result = await sendRoommatePushEvent({
        eventType: 'ROOM_INVITATION',
        senderName: 'Alice',
        title: 'Welcome',
        body: 'Joined room',
        roomId: 'room_green_villa',
        recipientUserIds: [],
      });

      expect(result).toBe(false);
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });
  });
});

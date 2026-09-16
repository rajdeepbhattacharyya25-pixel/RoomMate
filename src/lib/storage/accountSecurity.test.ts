import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from './mockStorage';
import {
  signOutOtherDevicesCloud,
  signOutAllDevicesCloud,
  deleteUserAccountCloud,
} from './cloudStorageAdapter';
import { storeResidentSession, getStoredResidentSession, createResidentToken } from '../auth/jwtService';

// Polyfill localStorage & sessionStorage in node test environment
const mockStorageMap: Record<string, string> = {};
const mockStorage = {
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

describe('Account Security & Session Management Test Suite', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockStorage;
    }
    if (typeof globalThis.sessionStorage === 'undefined') {
      (globalThis as any).sessionStorage = mockStorage;
    }
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {
        localStorage: mockStorage,
        sessionStorage: mockStorage,
        location: { origin: 'http://localhost:5173', href: 'http://localhost:5173/' },
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    } else if (!(globalThis as any).window.location) {
      (globalThis as any).window.location = { origin: 'http://localhost:5173', href: 'http://localhost:5173/' };
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
  });

  describe('Local Database Account Deletion (db.deleteUserAccount)', () => {
    it('permanently deletes user, their personal vault, and notifications', () => {
      const testUserId = 'test-resident-to-delete';
      db.getState().users.push({
        id: testUserId,
        name: 'Test Deleter',
        email: 'deleter@example.com',
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      db.getState().personalExpenses = db.getState().personalExpenses || [];
      db.getState().personalExpenses.push({
        id: 'pe-delete-1',
        userId: testUserId,
        title: 'Snacks',
        amount: 250,
        category: 'Food',
        expenseDate: '2026-09-16',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      db.getState().notifications = db.getState().notifications || [];
      db.getState().notifications.push({
        id: 'notif-delete-1',
        userId: testUserId,
        type: 'SYSTEM_INFO',
        title: 'Welcome',
        message: 'Hello',
        priority: 'LOW',
        isRead: false,
        actionType: 'NONE',
        createdAt: new Date().toISOString(),
      });

      expect(db.getState().users.some((u) => u.id === testUserId)).toBe(true);
      expect(db.getState().personalExpenses.some((e) => e.userId === testUserId)).toBe(true);
      expect(db.getState().notifications.some((n) => n.userId === testUserId)).toBe(true);

      db.deleteUserAccount(testUserId);

      expect(db.getState().users.some((u) => u.id === testUserId)).toBe(false);
      expect(db.getState().personalExpenses.some((e) => e.userId === testUserId)).toBe(false);
      expect(db.getState().notifications.some((n) => n.userId === testUserId)).toBe(false);
    });

    it('deletes empty rooms where deleting user is sole member', () => {
      const soleUserId = 'sole-user-123';
      const soleRoomId = 'sole-room-xyz';

      db.getState().users.push({
        id: soleUserId,
        name: 'Sole User',
        email: 'sole@example.com',
        role: 'STUDENT',
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      db.getState().rooms.push({
        id: soleRoomId,
        name: 'Solo Apartment',
        createdBy: soleUserId,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      db.getState().roomMembers.push({
        id: 'rm-sole-1',
        roomId: soleRoomId,
        userId: soleUserId,
        role: 'ROOM_ADMIN',
        status: 'ACTIVE',
        joinedAt: new Date().toISOString(),
      });

      expect(db.getState().rooms.some((r) => r.id === soleRoomId)).toBe(true);

      db.deleteUserAccount(soleUserId);

      expect(db.getState().rooms.some((r) => r.id === soleRoomId)).toBe(false);
      expect(db.getState().roomMembers.some((m) => m.roomId === soleRoomId)).toBe(false);
    });

    it('transfers room admin to remaining roommate when room has multiple members', () => {
      const adminUserId = 'leaving-admin-user';
      const roommateId = 'remaining-roommate-user';
      const sharedRoomId = 'shared-flat-99';

      db.getState().users.push(
        {
          id: adminUserId,
          name: 'Leaving Admin',
          email: 'admin@flat.com',
          role: 'STUDENT',
          isSuspended: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: roommateId,
          name: 'Staying Roommate',
          email: 'staying@flat.com',
          role: 'STUDENT',
          isSuspended: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );

      db.getState().rooms.push({
        id: sharedRoomId,
        name: 'Shared Flat 99',
        createdBy: adminUserId,
        adminUserId: adminUserId,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      db.getState().roomMembers.push(
        {
          id: 'rm-admin',
          roomId: sharedRoomId,
          userId: adminUserId,
          role: 'ROOM_ADMIN',
          status: 'ACTIVE',
          joinedAt: new Date(Date.now() - 10000).toISOString(),
        },
        {
          id: 'rm-roommate',
          roomId: sharedRoomId,
          userId: roommateId,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: new Date(Date.now() - 5000).toISOString(),
        }
      );

      db.deleteUserAccount(adminUserId);

      const room = db.getState().rooms.find((r) => r.id === sharedRoomId);
      expect(room).toBeDefined();
      expect(room?.adminUserId).toBe(roommateId);

      const remainingMember = db.getState().roomMembers.find((m) => m.roomId === sharedRoomId && m.userId === roommateId);
      expect(remainingMember?.role).toBe('ROOM_ADMIN');

      expect(db.getState().roomMembers.some((m) => m.roomId === sharedRoomId && m.userId === adminUserId)).toBe(false);
    });
  });

  describe('Session Management Actions', () => {
    it('signOutAllDevicesCloud purges local resident JWT credentials', async () => {
      const user = {
        id: 'usr-sess-1',
        name: 'Sess User',
        email: 'sess@example.com',
        role: 'STUDENT' as const,
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const token = createResidentToken(user);
      storeResidentSession(token, true);
      expect(getStoredResidentSession()).not.toBeNull();

      const res = await signOutAllDevicesCloud();
      expect(res.success).toBe(true);
      expect(getStoredResidentSession()).toBeNull();
    });

    it('signOutOtherDevicesCloud succeeds and leaves local token intact', async () => {
      const user = {
        id: 'usr-sess-2',
        name: 'Sess Stay',
        email: 'stay@example.com',
        role: 'STUDENT' as const,
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const token = createResidentToken(user);
      storeResidentSession(token, true);
      expect(getStoredResidentSession()).not.toBeNull();

      const res = await signOutOtherDevicesCloud();
      expect(res.success).toBe(true);
      expect(getStoredResidentSession()).not.toBeNull();
    });

    it('deleteUserAccountCloud wipes all tokens, pin settings, and biometrics', async () => {
      const delUserId = 'del-user-full-wipe';
      const user = {
        id: delUserId,
        name: 'Full Wipe User',
        email: 'wipe@example.com',
        role: 'STUDENT' as const,
        isSuspended: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.getState().users.push(user);

      const token = createResidentToken(user);
      storeResidentSession(token, true);
      globalThis.localStorage.setItem('roommate_app_lock_pin', '1234');
      globalThis.localStorage.setItem('roommate_app_lock_enabled', 'true');
      globalThis.localStorage.setItem('roommate_biometric_enrolled', 'true');

      const res = await deleteUserAccountCloud(delUserId);
      expect(res.success).toBe(true);

      expect(getStoredResidentSession()).toBeNull();
      expect(globalThis.localStorage.getItem('roommate_app_lock_pin')).toBeNull();
      expect(globalThis.localStorage.getItem('roommate_app_lock_enabled')).toBeNull();
      expect(globalThis.localStorage.getItem('roommate_biometric_enrolled')).toBeNull();
      expect(db.getState().users.some((u) => u.id === delUserId)).toBe(false);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../storage/mockStorage';
import { markAllNotificationsReadCloud, clearReadNotificationsCloud } from '../storage/cloudStorageAdapter';
import { rankNotifications } from './notificationService';
import { InAppNotification } from '../../types';

describe('Mobile In-App Notification Center & Mark All Read Test Suite', () => {
  const testUserId = 'usr-test-student-42';
  const testDifferentUserId = 'usr-google-oauth-uuid-99';

  beforeEach(() => {
    // Seed test notifications
    const state = db.getState();
    state.notifications = [
      {
        id: 'notif-test-1',
        userId: testUserId,
        roomId: 'room-1',
        type: 'PAYMENT_REQUIRED',
        title: 'Electricity Bill Due',
        message: 'You owe ₹250 to Sneha',
        priority: 'HIGH',
        isRead: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
      {
        id: 'notif-test-2',
        userId: testUserId,
        roomId: 'room-1',
        type: 'EXPENSE_ADDED',
        title: 'New Shared Expense',
        message: 'Groceries bill added',
        priority: 'MEDIUM',
        isRead: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      },
      {
        id: 'notif-test-3',
        userId: testUserId,
        roomId: 'room-1',
        type: 'EXPENSE_SETTLED',
        title: 'Expense Settled',
        message: 'Settled ₹300 with Amit',
        priority: 'LOW',
        isRead: true,
        readAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      },
    ];
  });

  it('marks all visible unread notifications as read when specific IDs are provided (resolves User ID mismatch)', async () => {
    const unreadIds = ['notif-test-1', 'notif-test-2'];

    // Call markAllNotificationsRead with a DIFFERENT user ID (e.g. Google auth UUID) but with explicit IDs
    await markAllNotificationsReadCloud(testDifferentUserId, unreadIds);

    const notif1 = db.getState().notifications.find((n) => n.id === 'notif-test-1');
    const notif2 = db.getState().notifications.find((n) => n.id === 'notif-test-2');
    const notif3 = db.getState().notifications.find((n) => n.id === 'notif-test-3');

    expect(notif1?.isRead).toBe(true);
    expect(notif1?.readAt).toBeDefined();
    expect(notif2?.isRead).toBe(true);
    expect(notif2?.readAt).toBeDefined();
    expect(notif3?.isRead).toBe(true);
  });

  it('marks all notifications read when userId is supplied without explicit IDs', async () => {
    await markAllNotificationsReadCloud(testUserId);

    const notifs = db.getState().notifications.filter((n) => n.userId === testUserId);
    expect(notifs.every((n) => n.isRead)).toBe(true);
  });

  it('clears read notifications when specific IDs are provided', async () => {
    const readIds = ['notif-test-3'];
    await clearReadNotificationsCloud(testDifferentUserId, readIds);

    const notif3 = db.getState().notifications.find((n) => n.id === 'notif-test-3');
    expect(notif3?.isDeleted).toBe(true);
  });

  it('ranks notifications intelligently: unread high priority before unread medium before read items', () => {
    const notifications: InAppNotification[] = [
      {
        id: 'n-low-unread',
        userId: 'u1',
        type: 'MEMBER_JOINED',
        title: 'Member joined',
        message: 'Joined flat',
        priority: 'LOW',
        isRead: false,
        createdAt: '2026-09-17T10:00:00Z',
      },
      {
        id: 'n-read-old',
        userId: 'u1',
        type: 'EXPENSE_SETTLED',
        title: 'Settled',
        message: 'Settled',
        priority: 'HIGH',
        isRead: true,
        createdAt: '2026-09-17T11:00:00Z',
      },
      {
        id: 'n-high-unread',
        userId: 'u1',
        type: 'PAYMENT_REQUIRED',
        title: 'Urgent Rent',
        message: 'Pay rent now',
        priority: 'HIGH',
        isRead: false,
        createdAt: '2026-09-17T09:00:00Z',
      },
    ];

    const ranked = rankNotifications(notifications);
    expect(ranked[0].id).toBe('n-high-unread');
    expect(ranked[1].id).toBe('n-low-unread');
    expect(ranked[2].id).toBe('n-read-old');
  });
});

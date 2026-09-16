import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueOfflineItem,
  getOfflineQueue,
  getPendingQueueCount,
  removeOfflineItem,
  clearOfflineQueue,
} from './offlineQueue';

describe('Offline Queue & Mutation Persistence Test Suite', () => {
  beforeEach(() => {
    clearOfflineQueue();
  });

  it('enqueues an ADD_SHARED_EXPENSE mutation and increments count', () => {
    expect(getPendingQueueCount()).toBe(0);

    const item = enqueueOfflineItem('ADD_SHARED_EXPENSE', {
      roomId: 'room-101',
      paidBy: 'user-1',
      createdBy: 'user-1',
      title: 'Groceries & Milk',
      totalAmount: 350,
      category: 'Groceries',
      participantUserIds: ['user-1', 'user-2'],
    });

    expect(item.id).toBeDefined();
    expect(item.type).toBe('ADD_SHARED_EXPENSE');
    expect(getPendingQueueCount()).toBe(1);

    const queue = getOfflineQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe(item.id);
    expect((queue[0].payload as { title?: string }).title).toBe('Groceries & Milk');
  });

  it('maintains strict FIFO sequence across multiple queued mutations', () => {
    const item1 = enqueueOfflineItem('ADD_PERSONAL_EXPENSE', {
      userId: 'user-1',
      title: 'Coffee',
      amount: 120,
      category: 'Food',
    });

    const item2 = enqueueOfflineItem('RECORD_SETTLEMENT', {
      roomId: 'room-101',
      payerId: 'user-2',
      payeeId: 'user-1',
      amount: 175,
      paymentMethod: 'UPI',
    });

    const queue = getOfflineQueue();
    expect(queue.length).toBe(2);
    expect(queue[0].id).toBe(item1.id);
    expect(queue[1].id).toBe(item2.id);
  });

  it('removes a processed mutation from the queue by ID', () => {
    const item1 = enqueueOfflineItem('DELETE_PERSONAL_EXPENSE', { id: 'p-exp-1' });
    const item2 = enqueueOfflineItem('DELETE_PERSONAL_EXPENSE', { id: 'p-exp-2' });

    expect(getPendingQueueCount()).toBe(2);

    removeOfflineItem(item1.id);
    expect(getPendingQueueCount()).toBe(1);

    const remaining = getOfflineQueue();
    expect(remaining[0].id).toBe(item2.id);
  });

  it('clears all items in the queue when requested', () => {
    enqueueOfflineItem('CREATE_ROOM', {
      ownerId: 'user-1',
      name: 'Flat 402',
      inviteCode: 'FLAT402',
    });

    expect(getPendingQueueCount()).toBe(1);

    clearOfflineQueue();
    expect(getPendingQueueCount()).toBe(0);
    expect(getOfflineQueue()).toEqual([]);
  });
});

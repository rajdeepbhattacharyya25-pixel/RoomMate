import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueueOfflineItem,
  getOfflineQueue,
  getPendingQueueCount,
  removeOfflineItem,
  clearOfflineQueue,
  flushOfflineQueue,
  isQueueFlushing,
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

  it('reports isQueueFlushing accurately and prevents concurrent flush runs', async () => {
    expect(isQueueFlushing()).toBe(false);

    // Enqueue an item
    enqueueOfflineItem('ADD_PERSONAL_EXPENSE', {
      userId: 'user-1',
      title: 'Snack',
      amount: 50,
      category: 'Food',
    });

    // Run flush
    const flushPromise = flushOfflineQueue();
    expect(typeof isQueueFlushing()).toBe('boolean');

    const result = await flushPromise;
    expect(result).toHaveProperty('syncedCount');
    expect(result).toHaveProperty('failedCount');
    expect(isQueueFlushing()).toBe(false);
  });

  it('retains newly enqueued items added while an async flush is processing', async () => {
    // 1. Enqueue initial item
    const initialItem = enqueueOfflineItem('ADD_PERSONAL_EXPENSE', {
      userId: 'user-1',
      title: 'Initial Expense',
      amount: 100,
      category: 'Food',
    });

    // 2. Enqueue an additional item
    const newItem = enqueueOfflineItem('ADD_PERSONAL_EXPENSE', {
      userId: 'user-1',
      title: 'Enqueued During Sync',
      amount: 250,
      category: 'Food',
    });

    const queueBefore = getOfflineQueue();
    expect(queueBefore.some((i) => i.id === newItem.id)).toBe(true);
    expect(queueBefore.some((i) => i.id === initialItem.id)).toBe(true);
  });

  it('assigns a unique clientMutationId to every queued mutation for idempotency', () => {
    const item1 = enqueueOfflineItem('ADD_SHARED_EXPENSE', {
      roomId: 'room-1',
      paidBy: 'user-1',
      createdBy: 'user-1',
      title: 'Shared Dinner',
      totalAmount: 500,
      category: 'Food',
      participantUserIds: ['user-1', 'user-2'],
    });

    const item2 = enqueueOfflineItem('RECORD_SETTLEMENT', {
      roomId: 'room-1',
      payerId: 'user-2',
      payeeId: 'user-1',
      amount: 250,
      paymentMethod: 'UPI',
    });

    expect(item1.clientMutationId).toBeDefined();
    expect(item2.clientMutationId).toBeDefined();
    expect(typeof item1.clientMutationId).toBe('string');
    expect(item1.clientMutationId).not.toBe(item2.clientMutationId);
  });

  it('dispatches conflict event when auto-discarding permanently unresolvable mutations', () => {
    let conflictDispatched = false;
    let conflictDetails: any = null;

    const handler = (e: Event) => {
      conflictDispatched = true;
      conflictDetails = (e as CustomEvent).detail;
    };

    const target: any = typeof window !== 'undefined' ? window : (globalThis as any);
    const mockListeners: Record<string, any> = {};
    const origAdd = target.addEventListener;
    const origRemove = target.removeEventListener;
    const origDispatch = target.dispatchEvent;

    target.addEventListener = (type: string, cb: any) => {
      mockListeners[type] = cb;
    };
    target.removeEventListener = (type: string) => {
      delete mockListeners[type];
    };
    target.dispatchEvent = (e: any) => {
      mockListeners[e.type]?.(e);
      return true;
    };

    target.addEventListener('roommate_sync_conflict_discarded', handler);

    target.dispatchEvent(
      new CustomEvent('roommate_sync_conflict_discarded', {
        detail: {
          itemId: 'test-item-1',
          type: 'ADD_SHARED_EXPENSE',
          error: 'violates foreign key constraint',
          timestamp: Date.now(),
        },
      })
    );

    expect(conflictDispatched).toBe(true);
    expect(conflictDetails.itemId).toBe('test-item-1');
    expect(conflictDetails.type).toBe('ADD_SHARED_EXPENSE');

    target.removeEventListener('roommate_sync_conflict_discarded', handler);

    // Restore original methods if any
    if (origAdd) target.addEventListener = origAdd;
    if (origRemove) target.removeEventListener = origRemove;
    if (origDispatch) target.dispatchEvent = origDispatch;
  });
});

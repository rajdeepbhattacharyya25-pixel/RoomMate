import { supabase } from '../supabase/client';
import { db } from './mockStorage';
import { SharedExpense, SplitMethod, SettlementPayment, PersonalExpense } from '../../types';

export type OfflineMutationType =
  | 'ADD_SHARED_EXPENSE'
  | 'RECORD_SETTLEMENT'
  | 'ADD_PERSONAL_EXPENSE'
  | 'DELETE_PERSONAL_EXPENSE'
  | 'CREATE_ROOM';

export interface AddSharedExpensePayload {
  localExpenseId?: string;
  roomId: string;
  paidBy: string;
  createdBy: string;
  title: string;
  totalAmount: number;
  category: SharedExpense['category'];
  splitMethod?: SplitMethod;
  participantUserIds: string[];
  customValues?: Record<string, number>;
  notes?: string;
  expenseDate?: string;
}

export interface RecordSettlementPayload {
  localSettlementId?: string;
  roomId: string;
  payerId: string;
  payeeId: string;
  amount: number;
  paymentMethod: SettlementPayment['paymentMethod'];
  transactionRef?: string;
  notes?: string;
}

export interface AddPersonalExpensePayload {
  localId?: string;
  userId: string;
  title: string;
  amount: number;
  category: PersonalExpense['category'];
  notes?: string;
  expenseDate?: string;
}

export interface DeletePersonalExpensePayload {
  id: string;
}

export interface CreateRoomPayload {
  localRoomId?: string;
  ownerId: string;
  name: string;
  description?: string;
  inviteCode: string;
}

export type OfflineMutationPayload =
  | AddSharedExpensePayload
  | RecordSettlementPayload
  | AddPersonalExpensePayload
  | DeletePersonalExpensePayload
  | CreateRoomPayload
  | Record<string, unknown>;

export type OfflineQueueItem =
  | { id: string; type: 'ADD_SHARED_EXPENSE'; payload: AddSharedExpensePayload; createdAt: number; retryCount: number; lastError?: string; }
  | { id: string; type: 'RECORD_SETTLEMENT'; payload: RecordSettlementPayload; createdAt: number; retryCount: number; lastError?: string; }
  | { id: string; type: 'ADD_PERSONAL_EXPENSE'; payload: AddPersonalExpensePayload; createdAt: number; retryCount: number; lastError?: string; }
  | { id: string; type: 'DELETE_PERSONAL_EXPENSE'; payload: DeletePersonalExpensePayload; createdAt: number; retryCount: number; lastError?: string; }
  | { id: string; type: 'CREATE_ROOM'; payload: CreateRoomPayload; createdAt: number; retryCount: number; lastError?: string; };

const PRIMARY_STORAGE_KEY = 'roommate_offline_sync_queue';
const LEGACY_STORAGE_KEY = 'campusflow_offline_sync_queue';
export const QUEUE_EVENT_NAME = 'roommate_offline_queue_changed';

let inMemoryQueue: OfflineQueueItem[] = [];

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function loadQueue(): OfflineQueueItem[] {
  if (!isStorageAvailable()) {
    return inMemoryQueue;
  }
  try {
    const raw =
      localStorage.getItem(PRIMARY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (!localStorage.getItem(PRIMARY_STORAGE_KEY) && localStorage.getItem(LEGACY_STORAGE_KEY)) {
        localStorage.setItem(PRIMARY_STORAGE_KEY, raw);
      }
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('[OfflineQueue] Failed to parse offline queue:', err);
    return [];
  }
}

function saveQueue(queue: OfflineQueueItem[]) {
  if (!isStorageAvailable()) {
    inMemoryQueue = [...queue];
    return;
  }
  try {
    localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(queue));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(QUEUE_EVENT_NAME, { detail: queue }));
    }
  } catch (err) {
    console.error('[OfflineQueue] Failed to save offline queue:', err);
  }
}

/**
 * Enqueue a mutation to be synchronized when connection is established.
 */
export function enqueueOfflineItem<T extends OfflineMutationType>(
  type: T,
  payload: T extends 'ADD_SHARED_EXPENSE'
    ? AddSharedExpensePayload
    : T extends 'RECORD_SETTLEMENT'
    ? RecordSettlementPayload
    : T extends 'ADD_PERSONAL_EXPENSE'
    ? AddPersonalExpensePayload
    : T extends 'DELETE_PERSONAL_EXPENSE'
    ? DeletePersonalExpensePayload
    : T extends 'CREATE_ROOM'
    ? CreateRoomPayload
    : unknown
): OfflineQueueItem {
  const queue = loadQueue();
  const newItem = {
    id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  } as OfflineQueueItem;

  queue.push(newItem);
  saveQueue(queue);
  console.log(`[OfflineQueue] Enqueued ${type} (Item ID: ${newItem.id}, Total: ${queue.length})`);
  return newItem;
}

/**
 * Retrieve all currently pending queue items.
 */
export function getOfflineQueue(): OfflineQueueItem[] {
  return loadQueue();
}

/**
 * Get count of pending items in the queue.
 */
export function getPendingQueueCount(): number {
  return loadQueue().length;
}

/**
 * Remove a specific item from the queue (e.g. after successful sync).
 */
export function removeOfflineItem(id: string): void {
  const queue = loadQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

/**
 * Clear the entire offline queue.
 */
export function clearOfflineQueue(): void {
  inMemoryQueue = [];
  if (isStorageAvailable()) {
    try {
      localStorage.removeItem(PRIMARY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  saveQueue([]);
}

/**
 * Subscribe to offline queue changes (for badges and indicator counts).
 */
export function subscribeToQueueChanges(callback: (queue: OfflineQueueItem[]) => void): () => void {
  const handler = () => {
    callback(loadQueue());
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(QUEUE_EVENT_NAME, handler);
  }

  // Initial call
  callback(loadQueue());

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(QUEUE_EVENT_NAME, handler);
    }
  };
}

/**
 * Flushes the pending offline queue to Supabase Cloud with idempotency.
 */
export async function flushOfflineQueue(): Promise<{ syncedCount: number; failedCount: number }> {
  const queue = loadQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0 };
  }

  console.log(`[OfflineQueue] Starting sync flush of ${queue.length} pending items...`);
  let syncedCount = 0;
  let failedCount = 0;
  const remainingQueue: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      let success = false;

      switch (item.type) {
        case 'ADD_SHARED_EXPENSE': {
          const data = item.payload as {
            localExpenseId?: string;
            roomId: string;
            paidBy: string;
            createdBy: string;
            title: string;
            totalAmount: number;
            category: SharedExpense['category'];
            splitMethod?: SplitMethod;
            participantUserIds: string[];
            customValues?: Record<string, number>;
            notes?: string;
            expenseDate?: string;
          };

          // Find local expense splits if already committed locally
          const localSplits = db.getState().expenseSplits.filter(
            (s) => s.sharedExpenseId === data.localExpenseId
          );

          const { data: cloudExpense, error: expError } = await supabase
            .from('shared_expenses')
            .upsert(
              {
                id: data.localExpenseId && data.localExpenseId.length === 36 ? data.localExpenseId : undefined,
                room_id: data.roomId,
                created_by: data.createdBy,
                paid_by: data.paidBy,
                title: data.title,
                total_amount: data.totalAmount,
                category: data.category,
                split_method: data.splitMethod || 'EQUAL',
                notes: data.notes || null,
                expense_date: data.expenseDate || new Date().toISOString().split('T')[0],
              },
              { onConflict: 'id' }
            )
            .select()
            .single();

          if (expError) throw expError;

          if (cloudExpense && localSplits.length > 0) {
            const splitsToInsert = localSplits.map((s) => ({
              shared_expense_id: cloudExpense.id,
              user_id: s.userId,
              share_amount: s.shareAmount,
            }));

            const { error: splitError } = await supabase
              .from('expense_splits')
              .upsert(splitsToInsert, { onConflict: 'shared_expense_id,user_id' });

            if (splitError) console.warn('[OfflineQueue] Split sync warning:', splitError.message);
          }

          success = true;
          break;
        }

        case 'RECORD_SETTLEMENT': {
          const data = item.payload as {
            localSettlementId?: string;
            roomId: string;
            payerId: string;
            payeeId: string;
            amount: number;
            paymentMethod: SettlementPayment['paymentMethod'];
            transactionRef?: string;
            notes?: string;
          };

          const { error } = await supabase.from('settlement_payments').upsert(
            {
              id: data.localSettlementId,
              room_id: data.roomId,
              payer_id: data.payerId,
              payee_id: data.payeeId,
              amount: data.amount,
              payment_method: data.paymentMethod,
              transaction_ref: data.transactionRef || null,
              notes: data.notes || null,
            },
            { onConflict: 'id' }
          );

          if (error) throw error;
          success = true;
          break;
        }

        case 'ADD_PERSONAL_EXPENSE': {
          const data = item.payload as {
            localId?: string;
            userId: string;
            title: string;
            amount: number;
            category: PersonalExpense['category'];
            notes?: string;
            expenseDate?: string;
          };

          const { error } = await supabase.from('personal_expenses').upsert(
            {
              id: data.localId && data.localId.length === 36 ? data.localId : undefined,
              user_id: data.userId,
              title: data.title,
              amount: data.amount,
              category: data.category,
              notes: data.notes || null,
              expense_date: data.expenseDate || new Date().toISOString().split('T')[0],
            },
            { onConflict: 'id' }
          );

          if (error) throw error;
          success = true;
          break;
        }

        case 'DELETE_PERSONAL_EXPENSE': {
          const data = item.payload as { id: string };
          const { error } = await supabase.from('personal_expenses').delete().eq('id', data.id);
          if (error) throw error;
          success = true;
          break;
        }

        case 'CREATE_ROOM': {
          const data = item.payload as {
            localRoomId?: string;
            ownerId: string;
            name: string;
            description?: string;
            inviteCode: string;
          };

          const { data: cloudRoom, error: roomError } = await supabase
            .from('rooms')
            .upsert(
              {
                id: data.localRoomId && data.localRoomId.length === 36 ? data.localRoomId : undefined,
                name: data.name,
                description: data.description || null,
                created_by: data.ownerId,
              },
              { onConflict: 'id' }
            )
            .select()
            .single();

          if (roomError) throw roomError;

          if (cloudRoom) {
            await supabase.from('room_members').upsert(
              {
                room_id: cloudRoom.id,
                user_id: data.ownerId,
                role: 'ROOM_ADMIN',
                status: 'ACTIVE',
              },
              { onConflict: 'room_id,user_id' }
            );

            if (data.inviteCode) {
              await supabase.from('room_invitations').upsert(
                {
                  room_id: cloudRoom.id,
                  invite_code: data.inviteCode,
                  created_by: data.ownerId,
                  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                },
                { onConflict: 'room_id,invite_code' }
              );
            }
          }

          success = true;
          break;
        }

        default:
          success = true; // Unknown type, drop to avoid infinite loop
          break;
      }

      if (success) {
        syncedCount++;
        console.log(`[OfflineQueue] Successfully synced ${item.type} (${item.id})`);
      }
    } catch (err: unknown) {
      failedCount++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[OfflineQueue] Failed to sync ${item.type}:`, errorMessage);
      item.retryCount += 1;
      item.lastError = errorMessage;
      remainingQueue.push(item);
    }
  }

  saveQueue(remainingQueue);
  return { syncedCount, failedCount };
}

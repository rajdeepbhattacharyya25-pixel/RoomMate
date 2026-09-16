import { describe, it, expect } from 'vitest';
import {
  getCurrentNetworkStatus,
  setSimulatedOffline,
  isSimulatedOfflineMode,
  subscribeToNetworkChanges,
} from './network';
import {
  enqueueOfflineItem,
  getOfflineQueue,
  getPendingQueueCount,
  removeOfflineItem,
  clearOfflineQueue,
} from '../storage/offlineQueue';

export interface NetworkTestResult {
  testName: string;
  passed: boolean;
  error?: string;
}

export async function runNetworkEngineTests(): Promise<{
  passedCount: number;
  failedCount: number;
  results: NetworkTestResult[];
}> {
  const results: NetworkTestResult[] = [];

  const assert = (testName: string, condition: boolean, errorDetail?: string) => {
    results.push({
      testName,
      passed: Boolean(condition),
      error: condition ? undefined : errorDetail || 'Assertion failed',
    });
  };

  try {
    // Reset state before tests
    try {
      localStorage.clear();
    } catch {
      // Ignore
    }
    setSimulatedOffline(false);
    clearOfflineQueue();

    // Test 1: Initial network status resolution
    const status = await getCurrentNetworkStatus();
    assert(
      'Test 1: Initial online status resolution',
      typeof status.isOnline === 'boolean' && status.isSimulated === false && isSimulatedOfflineMode() === false,
      `Expected isOnline boolean, got ${status.isOnline}`
    );

    // Test 2: Simulated offline mode transition
    setSimulatedOffline(true);
    const offlineStatus = await getCurrentNetworkStatus();
    assert(
      'Test 2: Simulated offline activation',
      isSimulatedOfflineMode() === true && offlineStatus.isOnline === false && offlineStatus.connectionType === 'none' && offlineStatus.isSimulated === true,
      `Expected offlineStatus.isOnline=false, got ${offlineStatus.isOnline}`
    );

    // Test 3: Subscriber notification on state toggle
    const recordedStates: boolean[] = [];
    const unsubscribe = subscribeToNetworkChanges((state) => {
      recordedStates.push(state.isOnline);
    });

    setSimulatedOffline(true);
    setSimulatedOffline(false);
    unsubscribe();

    assert(
      'Test 3: Network change subscriber notification',
      recordedStates.length >= 2 && recordedStates.includes(false) && recordedStates.includes(true),
      `Expected toggled states, got ${JSON.stringify(recordedStates)}`
    );

    // Test 4: Offline queue operations
    assert(
      'Test 4: Initial queue is empty',
      getPendingQueueCount() === 0,
      `Expected 0, got ${getPendingQueueCount()}`
    );

    const item1 = enqueueOfflineItem('ADD_SHARED_EXPENSE', {
      roomId: 'room-test-1',
      paidBy: 'user-a',
      createdBy: 'user-a',
      category: 'Wi-Fi',
      participantUserIds: ['user-a', 'user-b'],
      title: 'Dorm Wi-Fi Split',
      totalAmount: 999,
    });

    const item2 = enqueueOfflineItem('RECORD_SETTLEMENT', {
      roomId: 'room-test-1',
      payerId: 'user-b',
      payeeId: 'user-a',
      amount: 499,
      paymentMethod: 'UPI',
    });

    assert(
      'Test 5: Offline queue item enqueuing',
      getPendingQueueCount() === 2 && getOfflineQueue().length === 2 && getOfflineQueue()[0].id === item1.id,
      `Expected 2 items in queue, got ${getPendingQueueCount()}`
    );

    removeOfflineItem(item1.id);
    assert(
      'Test 6: Single item queue removal',
      getPendingQueueCount() === 1 && getOfflineQueue()[0].id === item2.id,
      `Expected 1 item, got ${getPendingQueueCount()}`
    );

    clearOfflineQueue();
    assert(
      'Test 7: Full queue clear',
      getPendingQueueCount() === 0 && getOfflineQueue().length === 0,
      `Expected 0 items, got ${getPendingQueueCount()}`
    );
  } catch (err: unknown) {
    results.push({
      testName: 'Test Execution Exception',
      passed: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    // Restore default state
    setSimulatedOffline(false);
    clearOfflineQueue();
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return { passedCount, failedCount, results };
}

describe('Network & Offline Queue Engine Test Suite', () => {
  it('runs all network and offline queue simulation tests with 100% pass rate', async () => {
    const summary = await runNetworkEngineTests();
    for (const result of summary.results) {
      expect(result.passed, `${result.testName}: ${result.error || ''}`).toBe(true);
    }
    expect(summary.failedCount).toBe(0);
  });
});

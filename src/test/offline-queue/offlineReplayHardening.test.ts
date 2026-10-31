import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  enqueueOfflineItem,
  flushOfflineQueue,
  clearOfflineQueue,
  getOfflineQueue,
} from '../../lib/storage/offlineQueue';
import {
  confirmSettlementCloud,
  disputeSettlementCloud,
  cancelSettlementCloud,
  submitSettlementEvidenceCloud,
} from '../../lib/storage/cloudStorageAdapter';
import { supabaseService } from '../../lib/supabase/supabaseService';
import { db } from '../../lib/storage/mockStorage';
import { SettlementPayment, Room, User, RoomMember } from '../../types';

describe('Track 3: Offline Mutation Queue & Edge-Case Replay Hardening Suite', () => {
  const TEST_ROOM_ID = 'room-offline-hardened-123';
  const USER_PAYER_ID = 'user-payer-1';
  const USER_PAYEE_ID = 'user-payee-2';

  beforeEach(() => {
    clearOfflineQueue();
    vi.restoreAllMocks();

    // Seed mock database state
    const state = db.getState();
    const mockPayer: User = {
      id: USER_PAYER_ID,
      name: 'Alice Debtor',
      email: 'alice@test.com',
      avatarUrl: 'https://alice.png',
      createdAt: new Date().toISOString(),
    };
    const mockPayee: User = {
      id: USER_PAYEE_ID,
      name: 'Bob Creditor',
      email: 'bob@test.com',
      avatarUrl: 'https://bob.png',
      createdAt: new Date().toISOString(),
    };
    const mockRoom: Room = {
      id: TEST_ROOM_ID,
      name: 'Apartment 4B',
      createdBy: USER_PAYEE_ID,
      createdAt: new Date().toISOString(),
    };
    const mockMembers: RoomMember[] = [
      { roomId: TEST_ROOM_ID, userId: USER_PAYER_ID, role: 'ROOM_MEMBER', status: 'ACTIVE', joinedAt: new Date().toISOString() },
      { roomId: TEST_ROOM_ID, userId: USER_PAYEE_ID, role: 'ROOM_ADMIN', status: 'ACTIVE', joinedAt: new Date().toISOString() },
    ];

    state.users = [mockPayer, mockPayee];
    state.rooms = [mockRoom];
    state.roomMembers = mockMembers;
    state.settlementPayments = [];
  });

  afterEach(() => {
    clearOfflineQueue();
    vi.restoreAllMocks();
  });

  // OQ-1
  it('OQ-1: enqueues and replays CONFIRM_SETTLEMENT on reconnection', async () => {
    const confirmSpy = vi.spyOn(supabaseService, 'confirmRoomSettlement').mockResolvedValue({
      success: true,
      status: 'CONFIRMED',
    });

    enqueueOfflineItem('CONFIRM_SETTLEMENT', {
      settlementId: 'stl-rec-1',
      userId: USER_PAYEE_ID,
      roomId: TEST_ROOM_ID,
    });

    expect(getOfflineQueue()).toHaveLength(1);

    const result = await flushOfflineQueue();
    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(confirmSpy).toHaveBeenCalledWith('stl-rec-1');
    expect(getOfflineQueue()).toHaveLength(0);
  });

  // OQ-2
  it('OQ-2: enqueues and replays DISPUTE_SETTLEMENT on reconnection', async () => {
    const disputeSpy = vi.spyOn(supabaseService, 'disputeRoomSettlement').mockResolvedValue({
      success: true,
      status: 'DISPUTED',
    });

    enqueueOfflineItem('DISPUTE_SETTLEMENT', {
      settlementId: 'stl-rec-2',
      userId: USER_PAYEE_ID,
      reason: 'UPI UTR was invalid',
      roomId: TEST_ROOM_ID,
    });

    expect(getOfflineQueue()).toHaveLength(1);

    const result = await flushOfflineQueue();
    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(disputeSpy).toHaveBeenCalledWith('stl-rec-2', 'UPI UTR was invalid');
    expect(getOfflineQueue()).toHaveLength(0);
  });

  // OQ-3
  it('OQ-3: enqueues and replays CANCEL_SETTLEMENT on reconnection', async () => {
    const cancelSpy = vi.spyOn(supabaseService, 'cancelRoomSettlement').mockResolvedValue({
      success: true,
      status: 'CANCELLED',
    });

    enqueueOfflineItem('CANCEL_SETTLEMENT', {
      settlementId: 'stl-rec-3',
      userId: USER_PAYER_ID,
      roomId: TEST_ROOM_ID,
    });

    expect(getOfflineQueue()).toHaveLength(1);

    const result = await flushOfflineQueue();
    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(cancelSpy).toHaveBeenCalledWith('stl-rec-3');
    expect(getOfflineQueue()).toHaveLength(0);
  });

  // OQ-4
  it('OQ-4: enqueues and replays SUBMIT_SETTLEMENT_EVIDENCE on reconnection', async () => {
    const evidenceSpy = vi.spyOn(supabaseService, 'submitSettlementEvidence').mockResolvedValue({
      success: true,
      evidenceUtr: 'AXIS123456789012',
    });

    enqueueOfflineItem('SUBMIT_SETTLEMENT_EVIDENCE', {
      settlementId: 'stl-rec-4',
      userId: USER_PAYER_ID,
      utr: 'AXIS123456789012',
      evidenceUrl: 'https://storage/proof.jpg',
      roomId: TEST_ROOM_ID,
    });

    expect(getOfflineQueue()).toHaveLength(1);

    const result = await flushOfflineQueue();
    expect(result.syncedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(evidenceSpy).toHaveBeenCalledWith('stl-rec-4', 'AXIS123456789012', 'https://storage/proof.jpg');
    expect(getOfflineQueue()).toHaveLength(0);
  });

  // OQ-5
  it('OQ-5: reverts local optimistic settlement and dispatches warning event on OVERSETTLEMENT_EXCEEDS_DEBT', async () => {
    // 1. Add optimistic local settlement
    const localSettlement = db.recordSettlementPayment(USER_PAYER_ID, {
      id: 'stl-over-1',
      roomId: TEST_ROOM_ID,
      payerId: USER_PAYER_ID,
      payeeId: USER_PAYEE_ID,
      amount: 500,
      paymentMethod: 'UPI',
    });
    expect(db.getState().settlementPayments.find((s) => s.id === 'stl-over-1')).toBeDefined();

    // 2. Mock V2 RPC rejection
    vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValue({
      success: false,
      error: 'OVERSETTLEMENT_EXCEEDS_DEBT: Attempted 50000 paise, debtor owes 0 paise',
      errorCode: 'OVERSETTLEMENT_EXCEEDS_DEBT',
    });

    // 3. Listen for discard event via mock window
    const mockDispatchEvent = vi.fn();
    (globalThis as any).window = {
      dispatchEvent: mockDispatchEvent,
    };

    // 4. Enqueue and flush
    enqueueOfflineItem('RECORD_SETTLEMENT', {
      localSettlementId: localSettlement.id,
      roomId: TEST_ROOM_ID,
      payerId: USER_PAYER_ID,
      payeeId: USER_PAYEE_ID,
      amount: 500,
      paymentMethod: 'UPI',
    });

    const result = await flushOfflineQueue();
    delete (globalThis as any).window;

    expect(result.failedCount).toBe(1);
    expect(mockDispatchEvent).toHaveBeenCalled();
    const dispatchedEvent = mockDispatchEvent.mock.calls[0][0];
    expect(dispatchedEvent.type).toBe('roommate_sync_conflict_discarded');
    expect(dispatchedEvent.detail.localSettlementId).toBe('stl-over-1');
    expect(dispatchedEvent.detail.error).toContain('OVERSETTLEMENT_EXCEEDS_DEBT');

    // 5. Assert optimistic settlement was removed from local storage
    expect(db.getState().settlementPayments.find((s) => s.id === 'stl-over-1')).toBeUndefined();
    // 6. Assert permanently conflicting mutation was discarded from queue
    expect(getOfflineQueue()).toHaveLength(0);
  });

  // OQ-6
  it('OQ-6: reverts local optimistic settlement on PAYER_IS_NOT_A_DEBTOR rejection', async () => {
    const localSettlement = db.recordSettlementPayment(USER_PAYER_ID, {
      id: 'stl-not-debtor-1',
      roomId: TEST_ROOM_ID,
      payerId: USER_PAYER_ID,
      payeeId: USER_PAYEE_ID,
      amount: 250,
      paymentMethod: 'CASH',
    });

    vi.spyOn(supabaseService, 'recordRoomSettlementV2').mockResolvedValue({
      success: false,
      error: 'INVALID_SETTLEMENT: PAYER_IS_NOT_A_DEBTOR - member has net balance 0',
      errorCode: 'INVALID_SETTLEMENT',
    });

    enqueueOfflineItem('RECORD_SETTLEMENT', {
      localSettlementId: localSettlement.id,
      roomId: TEST_ROOM_ID,
      payerId: USER_PAYER_ID,
      payeeId: USER_PAYEE_ID,
      amount: 250,
      paymentMethod: 'CASH',
    });

    const result = await flushOfflineQueue();
    expect(result.failedCount).toBe(1);

    // Assert settlement was removed locally
    expect(db.getState().settlementPayments.find((s) => s.id === 'stl-not-debtor-1')).toBeUndefined();
    expect(getOfflineQueue()).toHaveLength(0);
  });

  // OQ-7
  it('OQ-7: applies jittered exponential backoff and skips items before nextRetryAt elapses', async () => {
    const flakySpy = vi.spyOn(supabaseService, 'confirmRoomSettlement').mockResolvedValue({
      success: false,
      error: 'Failed to fetch: network connection timed out',
    });

    enqueueOfflineItem('CONFIRM_SETTLEMENT', {
      settlementId: 'stl-retry-test',
      userId: USER_PAYEE_ID,
      roomId: TEST_ROOM_ID,
    });

    // 1. First flush fails with transient error
    const firstResult = await flushOfflineQueue();
    expect(firstResult.failedCount).toBe(1);
    expect(flakySpy).toHaveBeenCalledTimes(1);

    const queueAfterFirst = getOfflineQueue();
    expect(queueAfterFirst).toHaveLength(1);
    expect(queueAfterFirst[0].retryCount).toBe(1);
    expect(queueAfterFirst[0].nextRetryAt).toBeGreaterThan(Date.now());

    // 2. Immediate second flush while backoff window is active -> item is skipped
    const secondResult = await flushOfflineQueue();
    expect(secondResult.syncedCount).toBe(0);
    expect(secondResult.failedCount).toBe(0);
    // spy must NOT have been called a second time
    expect(flakySpy).toHaveBeenCalledTimes(1);
  });

  // OQ-8
  it('OQ-8: handles offline fallback in cloudStorageAdapter settlement lifecycle functions', async () => {
    // Seed a pending settlement
    const initialSettlement: SettlementPayment = {
      id: 'stl-offline-lifecycle',
      roomId: TEST_ROOM_ID,
      payerId: USER_PAYER_ID,
      payeeId: USER_PAYEE_ID,
      amount: 400,
      paymentMethod: 'UPI',
      paymentDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      status: 'PENDING_CONFIRMATION',
    };
    db.getState().settlementPayments = [initialSettlement];

    // Mock network error from cloud
    vi.spyOn(supabaseService, 'confirmRoomSettlement').mockResolvedValue({
      success: false,
      error: 'TypeError: Failed to fetch (network is offline)',
    });

    // Call confirmSettlementCloud
    const confirmed = await confirmSettlementCloud(USER_PAYEE_ID, 'stl-offline-lifecycle');
    expect(confirmed.status).toBe('CONFIRMED');

    // Assert mutation was enqueued offline
    let queue = getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('CONFIRM_SETTLEMENT');
    expect((queue[0].payload as any).settlementId).toBe('stl-offline-lifecycle');

    // 2. Test disputeSettlementCloud offline fallback
    clearOfflineQueue();
    const disputeTarget: SettlementPayment = {
      id: 'stl-dispute-test',
      roomId: TEST_ROOM_ID,
      payerId: USER_PAYER_ID,
      payeeId: USER_PAYEE_ID,
      amount: 300,
      paymentMethod: 'UPI',
      paymentDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      status: 'PENDING_CONFIRMATION',
    };
    db.getState().settlementPayments.push(disputeTarget);
    vi.spyOn(supabaseService, 'disputeRoomSettlement').mockResolvedValue({
      success: false,
      error: 'Network connection failed',
    });
    const disputed = await disputeSettlementCloud(USER_PAYEE_ID, 'stl-dispute-test', 'Not received');
    expect(disputed.status).toBe('DISPUTED');
    queue = getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('DISPUTE_SETTLEMENT');

    // 3. Test cancelSettlementCloud offline fallback
    clearOfflineQueue();
    const cancelTarget: SettlementPayment = {
      id: 'stl-cancel-test',
      roomId: TEST_ROOM_ID,
      payerId: USER_PAYER_ID,
      payeeId: USER_PAYEE_ID,
      amount: 150,
      paymentMethod: 'CASH',
      paymentDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      status: 'PENDING_CONFIRMATION',
    };
    db.getState().settlementPayments.push(cancelTarget);
    vi.spyOn(supabaseService, 'cancelRoomSettlement').mockResolvedValue({
      success: false,
      error: 'Network connection timed out',
    });
    const cancelled = await cancelSettlementCloud(USER_PAYER_ID, 'stl-cancel-test');
    expect(cancelled.status).toBe('CANCELLED');
    queue = getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('CANCEL_SETTLEMENT');

    // 4. Test submitSettlementEvidenceCloud offline fallback
    clearOfflineQueue();
    disputed.status = 'DISPUTED';
    vi.spyOn(supabaseService, 'submitSettlementEvidence').mockResolvedValue({
      success: false,
      error: 'Failed to fetch (offline blip)',
    });
    const withProof = await submitSettlementEvidenceCloud(USER_PAYER_ID, 'stl-dispute-test', 'UTR998877665544');
    expect(withProof.evidenceUtr).toBe('UTR998877665544');
    queue = getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('SUBMIT_SETTLEMENT_EVIDENCE');
  });
});

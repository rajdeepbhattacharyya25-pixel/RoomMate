import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendRoommatePushEvent,
  SETTLEMENTS_CHANNEL_ID,
  EXPENSES_CHANNEL_ID,
} from '../../lib/firebase/pushService';
import {
  playNotificationSoundThrottled,
  playSuccessSoundThrottled,
} from '../../lib/native/notificationSound';
import { calculateCanonicalRoomSummary } from '../../lib/ledger/financialIntegrationService';
import { db } from '../../lib/storage/mockStorage';
import { supabase } from '../../lib/supabase/client';
import { SharedExpense, ExpenseSplit, User } from '../../types';

vi.mock('../../lib/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    channel: vi.fn(),
  },
  isSupabaseConfigured: true,
}));

describe('Track 2: Real-Time Room Ledger Synchronization & FCM Push Integration Suite', () => {
  const userA: User = { id: 'usr-alice-1111-1111-1111-111111111111', name: 'Alice', email: 'alice@flat.com' };
  const userB: User = { id: 'usr-bob-2222-2222-2222-222222222222', name: 'Bob', email: 'bob@flat.com' };
  const userC: User = { id: 'usr-charlie-3333-3333-3333-333333333333', name: 'Charlie', email: 'charlie@flat.com' };
  const allUsers = [userA, userB, userC];
  const roomId = 'room-sync-flat-303';

  beforeEach(() => {
    vi.clearAllMocks();
    const state = db.getState();
    state.users = [...allUsers];
    state.roomMembers = allUsers.map((u) => ({
      id: `rm-${u.id}`,
      roomId,
      userId: u.id,
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
    }));
    state.sharedExpenses = [];
    state.expenseSplits = [];
    state.settlementPayments = [];
    db.save(state);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // RT-1: Live Expense Insertion & Canonical Recalculation
  it('RT-1: correctly recalculates room net balances when a new expense arrives via live sync', () => {
    // 1. Initial State: Zero expenses
    const initialSummary = calculateCanonicalRoomSummary(roomId, userA.id, [], [], [], allUsers);
    expect(initialSummary.myNetBalance).toBe(0);

    // 2. Simulated incoming real-time shared expense (Alice paid ₹900, split 3 ways)
    const incomingExpense: SharedExpense = {
      id: 'exp-groceries-rt',
      roomId,
      paidBy: userA.id,
      title: 'Monthly Groceries',
      totalAmount: 900,
      category: 'Groceries',
      splitMethod: 'EQUAL',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const incomingSplits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: incomingExpense.id, userId: userA.id, shareAmount: 300, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: incomingExpense.id, userId: userB.id, shareAmount: 300, createdAt: new Date().toISOString() },
      { id: 'sp-3', sharedExpenseId: incomingExpense.id, userId: userC.id, shareAmount: 300, createdAt: new Date().toISOString() },
    ];

    // 3. Recompute summary as would occur on live sync payload
    const updatedSummary = calculateCanonicalRoomSummary(
      roomId,
      userA.id,
      [incomingExpense],
      incomingSplits,
      [],
      allUsers
    );

    expect(updatedSummary.isZeroSumVerified).toBe(true);
    expect(updatedSummary.myNetBalance).toBe(600); // Alice paid 900, share 300 -> +600

    const bobPos = updatedSummary.v2Summary.members.find((m) => m.userId === userB.id);
    const charliePos = updatedSummary.v2Summary.members.find((m) => m.userId === userC.id);
    expect(bobPos?.netPositionPaise).toBe(-30000); // Bob owes ₹300
    expect(charliePos?.netPositionPaise).toBe(-30000); // Charlie owes ₹300
  });

  // RT-2: Settlement Confirmation Sync
  it('RT-2: transitions settlement to CONFIRMED and updates authoritative ledger state', () => {
    const expense: SharedExpense = {
      id: 'exp-wifi-rt',
      roomId,
      paidBy: userA.id,
      title: 'Fiber Internet',
      totalAmount: 600,
      category: 'Wi-Fi',
      splitMethod: 'EQUAL',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-wifi-rt', userId: userA.id, shareAmount: 300, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: 'exp-wifi-rt', userId: userB.id, shareAmount: 300, createdAt: new Date().toISOString() },
    ];

    // Bob settles ₹300 in PENDING_CONFIRMATION state
    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 300,
      paymentMethod: 'UPI',
    });
    expect(settlement.status).toBe('PENDING_CONFIRMATION');

    // Alice confirms receipt
    const confirmed = db.confirmSettlementPayment(userA.id, settlement.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmedBy).toBe(userA.id);

    // Summary calculation incorporates confirmed settlement
    const summary = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [confirmed], allUsers);
    expect(summary.myNetBalance).toBe(0); // Settled
    expect(summary.isZeroSumVerified).toBe(true);
  });

  // RT-3: Dispute Realtime Reversal
  it('RT-3: immediately restores outstanding obligation when a payee disputes a settlement', () => {
    const expense: SharedExpense = {
      id: 'exp-elec-rt',
      roomId,
      paidBy: userA.id,
      title: 'Electricity',
      totalAmount: 400,
      category: 'Electricity',
      splitMethod: 'EQUAL',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-elec-rt', userId: userA.id, shareAmount: 200, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: 'exp-elec-rt', userId: userB.id, shareAmount: 200, createdAt: new Date().toISOString() },
    ];

    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 200,
      paymentMethod: 'UPI',
    });

    // Alice disputes the payment
    const disputed = db.disputeSettlementPayment(userA.id, settlement.id, 'Payment not credited');
    expect(disputed.status).toBe('DISPUTED');

    // Canonical engine excludes disputed settlements from net position reductions
    const summary = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [disputed], allUsers);
    expect(summary.myNetBalance).toBe(-200); // Debt reinstated!
  });

  // RT-4: Member Removal / Leave Room Realtime
  it('RT-4: reflects member departure in room members cache', () => {
    const leaveRes = db.leaveRoom(userC.id, roomId);
    expect(leaveRes.success).toBe(true);

    const members = db.getState().roomMembers.filter((rm) => rm.roomId === roomId && rm.status === 'ACTIVE');
    expect(members.map((m) => m.userId)).not.toContain(userC.id);
    expect(members).toHaveLength(2);
  });

  // RT-5: FCM Push Payload Formatting & Channel Routing
  it('RT-5: routes settlement events to SETTLEMENTS_CHANNEL_ID and shared expense events to EXPENSES_CHANNEL_ID', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, delivered: 1, totalTokens: 1 },
      error: null,
    });

    // 1. Settlement event
    await sendRoommatePushEvent({
      eventType: 'SETTLEMENT_CONFIRMED',
      recipientUserIds: [userB.id],
      roomId,
      senderName: 'Alice',
      title: 'Settlement Confirmed',
      body: 'Alice confirmed receipt of ₹300',
    });

    expect(supabase.functions.invoke).toHaveBeenLastCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({
          channelId: SETTLEMENTS_CHANNEL_ID,
          title: 'Settlement Confirmed',
        }),
      })
    );

    // 2. Shared expense event
    await sendRoommatePushEvent({
      eventType: 'NEW_SHARED_EXPENSE',
      recipientUserIds: [userB.id, userC.id],
      roomId,
      senderName: 'Alice',
      title: 'New Bill Added',
      body: 'Alice added ₹600 for Wi-Fi',
    });

    expect(supabase.functions.invoke).toHaveBeenLastCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({
          channelId: EXPENSES_CHANNEL_ID,
          title: 'New Bill Added',
        }),
      })
    );
  });

  // RT-6: Actor Suppression & Multi-Device Filtering (Edge Case 1)
  it('RT-6: strictly suppresses push dispatch to the actor who initiated the action', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, delivered: 1, totalTokens: 1 },
      error: null,
    });

    // Alice is the actor, recipient list includes Alice and Bob
    const result = await sendRoommatePushEvent({
      eventType: 'NEW_SHARED_EXPENSE',
      recipientUserIds: [userA.id, userB.id],
      actorId: userA.id, // Actor is Alice
      roomId,
      senderName: 'Alice',
      title: 'Chai Bill',
      body: '₹60 spent on tea',
    });

    expect(result).toBe(true);
    // Verified that Alice was filtered out and only Bob receives push!
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({
          recipientUserIds: [userB.id],
        }),
      })
    );

    // If only the actor was in the recipient list, no network call should be dispatched
    vi.mocked(supabase.functions.invoke).mockClear();
    const selfOnlyResult = await sendRoommatePushEvent({
      eventType: 'NEW_SHARED_EXPENSE',
      recipientUserIds: [userA.id],
      actorId: userA.id,
      roomId,
      senderName: 'Alice',
      title: 'Solo',
      body: 'Solo note',
    });
    expect(selfOnlyResult).toBe(true);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  // RT-7: Audio Throttle & Burst Coalescing (Edge Case 2)
  it('RT-7: throttles audio pings to at most once per 2000ms window during rapid event bursts', () => {
    const play1 = playNotificationSoundThrottled(2000);
    expect(play1).toBe(true); // First play succeeds

    // Immediate second play within 2000ms must be throttled
    const play2 = playNotificationSoundThrottled(2000);
    expect(play2).toBe(false); // Suppressed!

    const success1 = playSuccessSoundThrottled(2000);
    expect(success1).toBe(false); // Suppressed within the same 2000ms window!
  });

  // RT-8: Safe Failure & Offline Fallback Handling
  it('RT-8: safely handles edge function errors without crashing or throwing unhandled rejections', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: { message: 'Network connection refused', name: 'FunctionsHttpError' } as any,
    });

    const result = await sendRoommatePushEvent({
      eventType: 'SETTLEMENT_RECORDED',
      recipientUserIds: [userB.id],
      roomId,
      senderName: 'Alice',
      title: 'Settlement',
      body: 'Attempt',
    });

    // Returns false on failure without raising unhandled rejection
    expect(result).toBe(false);
  });
});

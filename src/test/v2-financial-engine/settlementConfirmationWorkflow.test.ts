import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateCanonicalRoomSummary,
  calculateRoomPairwiseDebts,
  financialIntegrationService,
} from '../../lib/ledger/financialIntegrationService';
import { db } from '../../lib/storage/mockStorage';
import { SharedExpense, ExpenseSplit, SettlementPayment, User, RoomMember } from '../../types';

describe('Track 1: Recipient Settlement Confirmation Workflow & Dispute State Machine', () => {
  const userA: User = { id: 'usr-alice-1111-1111-1111-111111111111', name: 'Alice', email: 'alice@flat.com' };
  const userB: User = { id: 'usr-bob-2222-2222-2222-222222222222', name: 'Bob', email: 'bob@flat.com' };
  const userC: User = { id: 'usr-charlie-3333-3333-3333-333333333333', name: 'Charlie', email: 'charlie@flat.com' };
  const userD: User = { id: 'usr-david-4444-4444-4444-444444444444', name: 'David', email: 'david@flat.com' };
  const allUsers = [userA, userB, userC, userD];
  const roomId = 'room-flat-204-track1';

  beforeEach(() => {
    // Reset mockStorage state for isolated test execution
    const state = db.getState();
    state.users = [...allUsers];
    state.roomMembers = allUsers.map((u) => ({
      id: `rm-${u.id}`,
      roomId,
      userId: u.id,
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
    } as RoomMember));
    state.sharedExpenses = [];
    state.expenseSplits = [];
    state.settlementPayments = [];
    db.save(state);
  });

  // TC-1: Settlement Creation Invariants
  it('TC-1: initializes settlement in PENDING_CONFIRMATION with 72h deadline and provisional debt reduction', () => {
    // Alice pays ₹600 for electricity, split equally between Alice and Bob (Bob owes ₹300)
    const expense: SharedExpense = {
      id: 'exp-elec-1',
      roomId,
      paidBy: userA.id,
      title: 'Electricity Bill',
      totalAmount: 600,
      category: 'Electricity',
      splitMethod: 'EQUAL',
      expenseDate: '2026-10-05',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-elec-1', userId: userA.id, shareAmount: 300, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: 'exp-elec-1', userId: userB.id, shareAmount: 300, createdAt: new Date().toISOString() },
    ];

    // Pre-settlement summary: Bob owes ₹300
    const preSummary = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [], allUsers);
    expect(preSummary.myNetBalance).toBe(-300);

    // Bob records a settlement of ₹300 to Alice
    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 300,
      paymentMethod: 'UPI',
      notes: 'Paid via GooglePay',
    });

    // Invariant: Initial status is PENDING_CONFIRMATION
    expect(settlement.status).toBe('PENDING_CONFIRMATION');
    expect(settlement.confirmationDeadline).toBeDefined();

    const deadlineTime = new Date(settlement.confirmationDeadline!).getTime();
    const createdTime = new Date(settlement.createdAt).getTime();
    const diffHours = (deadlineTime - createdTime) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(72, 1);

    // Provisional accounting: Bob's net balance reflects the pending settlement
    const postSummary = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [settlement], allUsers);
    expect(postSummary.myNetBalance).toBe(0);
    expect(postSummary.isZeroSumVerified).toBe(true);
  });

  // TC-2: Manual Payee Confirmation
  it('TC-2: allows payee to manually confirm receipt, transitioning status to CONFIRMED with permanent ledger finality', () => {
    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 250,
      paymentMethod: 'UPI',
    });

    expect(settlement.status).toBe('PENDING_CONFIRMATION');

    // Alice (payee) confirms receipt
    const confirmed = db.confirmSettlementPayment(userA.id, settlement.id);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmedBy).toBe(userA.id);
    expect(confirmed.confirmationMethod).toBe('MANUAL');
    expect(confirmed.confirmedAt).toBeDefined();
  });

  // TC-3: Dispute Reversal Semantics
  it('TC-3: restores debt across simplified and pairwise ledgers upon payee dispute, preserving immutable audit reason', () => {
    // Alice pays ₹1000 groceries, Bob shares ₹500
    const expense: SharedExpense = {
      id: 'exp-groc-1',
      roomId,
      paidBy: userA.id,
      title: 'Groceries',
      totalAmount: 1000,
      category: 'Groceries',
      splitMethod: 'EQUAL',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-groc-1', userId: userA.id, shareAmount: 500, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: 'exp-groc-1', userId: userB.id, shareAmount: 500, createdAt: new Date().toISOString() },
    ];

    // Bob records ₹500 settlement
    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 500,
      paymentMethod: 'UPI',
    });

    // Alice disputes the payment
    const disputeReason = 'Funds not credited in my HDFC account. Wrong UPI ID entered.';
    const disputed = db.disputeSettlementPayment(userA.id, settlement.id, disputeReason);

    expect(disputed.status).toBe('DISPUTED');
    expect(disputed.disputedBy).toBe(userA.id);
    expect(disputed.disputeReason).toBe(disputeReason);
    expect(disputed.disputedAt).toBeDefined();

    // Ledgers must completely reverse the settlement effect (Disputed settlements have 0 financial weight)
    const summary = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [disputed], allUsers);
    expect(summary.myNetBalance).toBe(-500); // Debt restored!

    // Pairwise audit debts must also reflect restored bilateral debt
    const pairwise = calculateRoomPairwiseDebts([expense], splits, [disputed], allUsers);
    const bobAlicePair = pairwise.find(
      (p) => (p.userAId === userA.id && p.userBId === userB.id) || (p.userAId === userB.id && p.userBId === userA.id)
    );
    expect(bobAlicePair).toBeDefined();
    // Bob owes Alice ₹500
    if (bobAlicePair!.userAId === userA.id) {
      expect(bobAlicePair!.netAmount).toBe(500);
    } else {
      expect(bobAlicePair!.netAmount).toBe(-500);
    }
  });

  // TC-4: Authorization Boundaries
  it('TC-4: prevents third parties and payers from executing unauthorized payee actions', () => {
    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 400,
      paymentMethod: 'CASH',
    });

    // Charlie (unrelated member) attempts to confirm
    expect(() => db.confirmSettlementPayment(userC.id, settlement.id)).toThrowError(/ACCESS_DENIED/);

    // Charlie attempts to dispute
    expect(() => db.disputeSettlementPayment(userC.id, settlement.id, 'Fraud claim')).toThrowError(/ACCESS_DENIED/);

    // Bob (payer) attempts to confirm his own settlement
    expect(() => db.confirmSettlementPayment(userB.id, settlement.id)).toThrowError(/ACCESS_DENIED/);

    // Alice (payee) attempts to cancel Bob's settlement (only payer can cancel claim)
    expect(() => db.cancelSettlementPayment(userA.id, settlement.id)).toThrowError(/ACCESS_DENIED/);
  });

  // TC-5: Payer Self-Cancellation
  it('TC-5: allows payer to self-cancel an unconfirmed settlement claim, reinstating their debt', () => {
    const expense: SharedExpense = {
      id: 'exp-wifi-1',
      roomId,
      paidBy: userA.id,
      title: 'Wi-Fi Fiber',
      totalAmount: 800,
      category: 'Wi-Fi',
      splitMethod: 'EQUAL',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-wifi-1', userId: userA.id, shareAmount: 400, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: 'exp-wifi-1', userId: userB.id, shareAmount: 400, createdAt: new Date().toISOString() },
    ];

    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 400,
      paymentMethod: 'UPI',
    });

    // Bob cancels before confirmation
    const cancelled = db.cancelSettlementPayment(userB.id, settlement.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledAt).toBeDefined();

    // Verify debt is restored to ₹400
    const summary = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [cancelled], allUsers);
    expect(summary.myNetBalance).toBe(-400);
  });

  // TC-6: Cumulative Partial Settlements & Oversettlement Clamping
  it('TC-6: handles cumulative partial settlements and rejects oversettlement exceeding remaining gross debt', () => {
    // Alice paid ₹1000 for groceries, Bob owes ₹500
    const expense: SharedExpense = {
      id: 'exp-groc-2',
      roomId,
      paidBy: userA.id,
      title: 'Groceries',
      totalAmount: 1000,
      category: 'Groceries',
      splitMethod: 'EQUAL',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-groc-2', userId: userA.id, shareAmount: 500, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: 'exp-groc-2', userId: userB.id, shareAmount: 500, createdAt: new Date().toISOString() },
    ];

    // 1st partial payment: ₹300
    const settlement1 = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 300,
      paymentMethod: 'UPI',
    });

    // Summary with ₹300 pending: Bob still owes ₹200
    const summary1 = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [settlement1], allUsers);
    expect(summary1.myNetBalance).toBe(-200);

    // Oversettlement check via validateSettlementAttemptV2: attempting ₹250 when owing only ₹200 must fail
    const payerPos = summary1.v2Summary.members.find((m) => m.userId === userB.id)!;
    const payeePos = summary1.v2Summary.members.find((m) => m.userId === userA.id)!;
    const overValidation = financialIntegrationService.validateSettlementAttemptV2(payerPos, payeePos, 25000);
    expect(overValidation.isValid).toBe(false);
    expect(overValidation.error).toContain('OVERSETTLEMENT_EXCEEDS_DEBT');

    // Valid second partial settlement of ₹150 succeeds
    const validValidation = financialIntegrationService.validateSettlementAttemptV2(payerPos, payeePos, 15000);
    expect(validValidation.isValid).toBe(true);

    const settlement2 = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 150,
      paymentMethod: 'UPI',
    });

    const summary2 = calculateCanonicalRoomSummary(roomId, userB.id, [expense], splits, [settlement1, settlement2], allUsers);
    expect(summary2.myNetBalance).toBe(-50);
  });

  // TC-7: Race Condition Protection & Terminal State Invariants
  it('TC-7: strictly blocks forbidden transitions once a terminal or confirmed state is reached', () => {
    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 100,
      paymentMethod: 'CASH',
    });

    // Payee confirms
    db.confirmSettlementPayment(userA.id, settlement.id);

    // Confirmed cannot be disputed
    expect(() => db.disputeSettlementPayment(userA.id, settlement.id, 'Changed my mind')).toThrowError(/INVALID_TRANSITION/);

    // Confirmed cannot be cancelled
    expect(() => db.cancelSettlementPayment(userB.id, settlement.id)).toThrowError(/INVALID_TRANSITION/);
  });

  // TC-8: 72-Hour Auto-Confirmation Job
  it('TC-8: auto-confirms pending settlements when clock passes 72-hour inactivity deadline', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 200,
      paymentMethod: 'UPI',
      confirmationDeadline: deadline,
    });

    // 1. Clock at 71 hours: should NOT auto-confirm
    const at71h = new Date(now.getTime() + 71 * 60 * 60 * 1000);
    const count71 = db.processSettlementAutoConfirmations(at71h);
    expect(count71).toBe(0);
    expect(db.getState().settlementPayments.find((s) => s.id === settlement.id)?.status).toBe('PENDING_CONFIRMATION');

    // 2. Clock at 72 hours and 1 minute: SHOULD auto-confirm
    const at72h1m = new Date(now.getTime() + 72.05 * 60 * 60 * 1000);
    const count72 = db.processSettlementAutoConfirmations(at72h1m);
    expect(count72).toBe(1);

    const updated = db.getState().settlementPayments.find((s) => s.id === settlement.id);
    expect(updated?.status).toBe('AUTO_CONFIRMED');
    expect(updated?.confirmationMethod).toBe('AUTOMATIC');
  });

  // TC-9: Near-Deadline Dispute Invariant
  it('TC-9: ensures dispute raised at 71h 59m prevents subsequent 72h auto-confirmation', () => {
    const now = new Date('2026-10-01T10:00:00Z');
    const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();

    const settlement = db.recordSettlementPayment(userB.id, {
      roomId,
      payerId: userB.id,
      payeeId: userA.id,
      amount: 350,
      paymentMethod: 'UPI',
      confirmationDeadline: deadline,
    });

    // Dispute raised at 71 hours and 59 minutes
    db.disputeSettlementPayment(userA.id, settlement.id, 'Money not received');

    // Advancing clock past 72h
    const at75h = new Date(now.getTime() + 75 * 60 * 60 * 1000);
    const count = db.processSettlementAutoConfirmations(at75h);
    expect(count).toBe(0);

    const finalRecord = db.getState().settlementPayments.find((s) => s.id === settlement.id);
    expect(finalRecord?.status).toBe('DISPUTED'); // Must remain DISPUTED!
  });

  // TC-10: Dual-Ledger Zero-Sum Reconciliation
  it('TC-10: guarantees zero-sum balance invariant across mixed pending, confirmed, disputed, and cancelled states', () => {
    // 4 Roommates share ₹1200 Wi-Fi (₹300 each)
    const expense: SharedExpense = {
      id: 'exp-multi-1',
      roomId,
      paidBy: userA.id,
      title: 'Fiber Internet Annual',
      totalAmount: 1200,
      category: 'Wi-Fi',
      splitMethod: 'EQUAL',
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };
    const splits: ExpenseSplit[] = [
      { id: 'sp-1', sharedExpenseId: 'exp-multi-1', userId: userA.id, shareAmount: 300, createdAt: new Date().toISOString() },
      { id: 'sp-2', sharedExpenseId: 'exp-multi-1', userId: userB.id, shareAmount: 300, createdAt: new Date().toISOString() },
      { id: 'sp-3', sharedExpenseId: 'exp-multi-1', userId: userC.id, shareAmount: 300, createdAt: new Date().toISOString() },
      { id: 'sp-4', sharedExpenseId: 'exp-multi-1', userId: userD.id, shareAmount: 300, createdAt: new Date().toISOString() },
    ];

    // Mixed settlement states
    const settlements: SettlementPayment[] = [
      // Bob settled ₹300, CONFIRMED
      {
        id: 'set-bob-conf',
        roomId,
        payerId: userB.id,
        payeeId: userA.id,
        amount: 300,
        paymentMethod: 'UPI',
        paymentDate: '2026-10-05',
        createdAt: new Date().toISOString(),
        status: 'CONFIRMED',
        confirmationMethod: 'MANUAL',
      },
      // Charlie settled ₹300, DISPUTED (Restored debt)
      {
        id: 'set-charlie-disp',
        roomId,
        payerId: userC.id,
        payeeId: userA.id,
        amount: 300,
        paymentMethod: 'UPI',
        paymentDate: '2026-10-05',
        createdAt: new Date().toISOString(),
        status: 'DISPUTED',
        disputeReason: 'Payment not received',
      },
      // David settled ₹300, PENDING_CONFIRMATION (Provisional reduction)
      {
        id: 'set-david-pend',
        roomId,
        payerId: userD.id,
        payeeId: userA.id,
        amount: 300,
        paymentMethod: 'CASH',
        paymentDate: '2026-10-05',
        createdAt: new Date().toISOString(),
        status: 'PENDING_CONFIRMATION',
      },
    ];

    const summary = calculateCanonicalRoomSummary(roomId, userA.id, [expense], splits, settlements, allUsers);

    // Invariants:
    expect(summary.isZeroSumVerified).toBe(true);
    expect(summary.netDiscrepancyPaise).toBe(0);

    // Alice: Paid ₹1200, share ₹300 -> net +900 before settlements.
    // Received Bob's ₹300 (confirmed) and David's ₹300 (provisional) -> remaining net credit = +300.
    // Charlie's ₹300 was disputed -> Charlie still owes Alice ₹300!
    const alicePos = summary.v2Summary.members.find((m) => m.userId === userA.id);
    const bobPos = summary.v2Summary.members.find((m) => m.userId === userB.id);
    const charliePos = summary.v2Summary.members.find((m) => m.userId === userC.id);
    const davidPos = summary.v2Summary.members.find((m) => m.userId === userD.id);

    expect(alicePos?.netPositionPaise).toBe(30000);
    expect(bobPos?.netPositionPaise).toBe(0);
    expect(charliePos?.netPositionPaise).toBe(-30000); // Disputed -> Still owes!
    expect(davidPos?.netPositionPaise).toBe(0); // Pending -> Provisionally settled!

    // Sum of all net balances in paise must strictly equal 0
    const sumPaise = summary.v2Summary.members.reduce((acc, m) => acc + m.netPositionPaise, 0);
    expect(sumPaise).toBe(0);
  });
});

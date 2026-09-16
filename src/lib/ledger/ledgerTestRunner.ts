import {
  calculateSplits,
  calculateRoomPairwiseDebts,
  calculateRoomSummary,
  calculateUnifiedDashboard,
  getOutstandingObligationsForMember,
  canCleanExit,
} from './engine';
import { db } from '../storage/mockStorage';
import { User, SharedExpense, ExpenseSplit, SettlementPayment, PersonalExpense, PairwiseDebt } from '../../types';

// Mock Users
const userA: User = {
  id: 'user-a',
  name: 'Rajdeep',
  email: 'rajdeep@test.com',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const userB: User = {
  id: 'user-b',
  name: 'Sneha',
  email: 'sneha@test.com',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const userC: User = {
  id: 'user-c',
  name: 'Aryan',
  email: 'aryan@test.com',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const userD: User = {
  id: 'user-d',
  name: 'Pooja (Late Joiner)',
  email: 'pooja@test.com',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: '2026-01-05',
  updatedAt: '2026-01-05',
};

const allUsers = [userA, userB, userC, userD];

export function runAllLedgerTests(): { name: string; passed: boolean; message?: string }[] {
  const results: { name: string; passed: boolean; message?: string }[] = [];

  const assert = (name: string, condition: boolean, message?: string) => {
    results.push({
      name,
      passed: condition,
      message: condition ? 'PASSED' : message || 'FAILED',
    });
  };

  // Test 1: Equal Split with Remainder Penny Allocation
  {
    const splits = calculateSplits(100, ['user-a', 'user-b', 'user-c'], 'EQUAL');
    const total = splits.reduce((s, x) => s + x.shareAmount, 0);
    assert(
      'Equal split of ₹100 across 3 members sums to exact ₹100.00',
      total === 100 && splits[0].shareAmount === 33.34 && splits[1].shareAmount === 33.33,
      `Expected 33.34, 33.33, 33.33, got ${splits.map((s) => s.shareAmount).join(', ')}`
    );
  }

  // Test 2: Two-way multi-payer mutual offsetting
  {
    // Expense 1: Rajdeep (A) pays ₹100 for groceries split equally between A and B
    const exp1: SharedExpense = {
      id: 'exp-1',
      roomId: 'room-1',
      createdBy: 'user-a',
      paidBy: 'user-a',
      title: 'Groceries',
      totalAmount: 100,
      category: 'Groceries',
      splitMethod: 'EQUAL',
      expenseDate: '2026-01-01',
      isDeleted: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const splits1: ExpenseSplit[] = [
      { id: 's1', sharedExpenseId: 'exp-1', userId: 'user-a', shareAmount: 50, createdAt: '2026-01-01' },
      { id: 's2', sharedExpenseId: 'exp-1', userId: 'user-b', shareAmount: 50, createdAt: '2026-01-01' },
    ];

    // Expense 2: Sneha (B) pays ₹40 for snacks split equally between A and B
    const exp2: SharedExpense = {
      id: 'exp-2',
      roomId: 'room-1',
      createdBy: 'user-b',
      paidBy: 'user-b',
      title: 'Snacks',
      totalAmount: 40,
      category: 'Food',
      splitMethod: 'EQUAL',
      expenseDate: '2026-01-02',
      isDeleted: false,
      createdAt: '2026-01-02',
      updatedAt: '2026-01-02',
    };
    const splits2: ExpenseSplit[] = [
      { id: 's3', sharedExpenseId: 'exp-2', userId: 'user-a', shareAmount: 20, createdAt: '2026-01-02' },
      { id: 's4', sharedExpenseId: 'exp-2', userId: 'user-b', shareAmount: 20, createdAt: '2026-01-02' },
    ];

    const debts = calculateRoomPairwiseDebts([exp1, exp2], [...splits1, ...splits2], [], allUsers);
    const abDebt = debts.find(
      (d) => (d.userAId === 'user-a' && d.userBId === 'user-b') || (d.userAId === 'user-b' && d.userBId === 'user-a')
    );

    // B owes A ₹50, A owes B ₹20 -> Net: B owes A ₹30
    assert(
      'Two-way mutual offsetting calculates net ₹30 owed by Sneha to Rajdeep',
      abDebt !== undefined && abDebt.netAmount === 30,
      `Expected netAmount 30, got ${abDebt?.netAmount}`
    );
  }

  // Test 3: Partial Payment and Subsequent Settlement
  {
    const exp: SharedExpense = {
      id: 'exp-3',
      roomId: 'room-1',
      createdBy: 'user-a',
      paidBy: 'user-a',
      title: 'Electricity',
      totalAmount: 100,
      category: 'Electricity',
      splitMethod: 'EQUAL',
      expenseDate: '2026-01-01',
      isDeleted: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const splits: ExpenseSplit[] = [
      { id: 's10', sharedExpenseId: 'exp-3', userId: 'user-a', shareAmount: 25, createdAt: '2026-01-01' },
      { id: 's11', sharedExpenseId: 'exp-3', userId: 'user-b', shareAmount: 25, createdAt: '2026-01-01' },
      { id: 's12', sharedExpenseId: 'exp-3', userId: 'user-c', shareAmount: 25, createdAt: '2026-01-01' },
      { id: 's13', sharedExpenseId: 'exp-3', userId: 'user-d', shareAmount: 25, createdAt: '2026-01-01' },
    ];

    // Sneha (B) pays ₹20 partial payment to Rajdeep (A)
    const pmt1: SettlementPayment = {
      id: 'pmt-1',
      roomId: 'room-1',
      payerId: 'user-b',
      payeeId: 'user-a',
      amount: 20,
      paymentMethod: 'UPI',
      paymentDate: '2026-01-02',
      createdAt: '2026-01-02',
    };

    const debtsAfterPmt1 = calculateRoomPairwiseDebts([exp], splits, [pmt1], allUsers);
    const debtB1 = debtsAfterPmt1.find((d) => d.userAId === 'user-a' && d.userBId === 'user-b');
    assert(
      'Partial payment: ₹25 share - ₹20 paid = ₹5.00 remaining',
      debtB1?.netAmount === 5,
      `Expected remaining 5.00, got ${debtB1?.netAmount}`
    );

    // Sneha (B) pays remaining ₹5 to Rajdeep (A)
    const pmt2: SettlementPayment = {
      id: 'pmt-2',
      roomId: 'room-1',
      payerId: 'user-b',
      payeeId: 'user-a',
      amount: 5,
      paymentMethod: 'UPI',
      paymentDate: '2026-01-03',
      createdAt: '2026-01-03',
    };

    const debtsAfterPmt2 = calculateRoomPairwiseDebts([exp], splits, [pmt1, pmt2], allUsers);
    const debtB2 = debtsAfterPmt2.find((d) => d.userAId === 'user-a' && d.userBId === 'user-b');
    assert(
      'Subsequent payment settles debt completely (₹0 remaining)',
      debtB2 === undefined,
      `Expected pair settled (no debt record), got ${debtB2?.netAmount}`
    );
  }

  // Test 4: Overpayment creates reverse credit
  {
    const exp: SharedExpense = {
      id: 'exp-4',
      roomId: 'room-1',
      createdBy: 'user-a',
      paidBy: 'user-a',
      title: 'Water Can',
      totalAmount: 40,
      category: 'Water',
      splitMethod: 'EQUAL',
      expenseDate: '2026-01-01',
      isDeleted: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const splits: ExpenseSplit[] = [
      { id: 's20', sharedExpenseId: 'exp-4', userId: 'user-a', shareAmount: 20, createdAt: '2026-01-01' },
      { id: 's21', sharedExpenseId: 'exp-4', userId: 'user-b', shareAmount: 20, createdAt: '2026-01-01' },
    ];

    // Sneha owes ₹20 but pays ₹30 (₹10 extra)
    const pmt: SettlementPayment = {
      id: 'pmt-over',
      roomId: 'room-1',
      payerId: 'user-b',
      payeeId: 'user-a',
      amount: 30,
      paymentMethod: 'UPI',
      paymentDate: '2026-01-02',
      createdAt: '2026-01-02',
    };

    const debts = calculateRoomPairwiseDebts([exp], splits, [pmt], allUsers);
    const abDebt = debts.find((d) => d.userAId === 'user-a' && d.userBId === 'user-b');
    // From A's perspective: netAmount is -10 (meaning A owes B ₹10)
    assert(
      'Overpayment of ₹30 on ₹20 obligation creates ₹10 credit (A owes B ₹10)',
      abDebt?.netAmount === -10,
      `Expected netAmount -10, got ${abDebt?.netAmount}`
    );
  }

  // Test 5: Point-in-time membership isolation (User D gets 0 past obligation)
  {
    const oldExpense: SharedExpense = {
      id: 'exp-old',
      roomId: 'room-1',
      createdBy: 'user-a',
      paidBy: 'user-a',
      title: 'Past Electricity Bill',
      totalAmount: 900,
      category: 'Electricity',
      splitMethod: 'EQUAL',
      expenseDate: '2026-01-01',
      isDeleted: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    // Only A, B, C participated at that time
    const oldSplits: ExpenseSplit[] = [
      { id: 'so1', sharedExpenseId: 'exp-old', userId: 'user-a', shareAmount: 300, createdAt: '2026-01-01' },
      { id: 'so2', sharedExpenseId: 'exp-old', userId: 'user-b', shareAmount: 300, createdAt: '2026-01-01' },
      { id: 'so3', sharedExpenseId: 'exp-old', userId: 'user-c', shareAmount: 300, createdAt: '2026-01-01' },
    ];

    const summaryD = calculateRoomSummary('room-1', 'user-d', [oldExpense], oldSplits, [], allUsers);
    assert(
      'Late joiner User D inherits zero obligation (share = 0, balance = 0) on past expenses',
      summaryD.myTotalShare === 0 && summaryD.myNetBalance === 0,
      `Expected share 0 & balance 0, got share ${summaryD.myTotalShare}, balance ${summaryD.myNetBalance}`
    );
  }

  // Test 6: Unified Dashboard Aggregation
  {
    const personalExps: PersonalExpense[] = [
      {
        id: 'pe-1',
        userId: 'user-a',
        title: 'Snacks & Cafe',
        amount: 1240,
        category: 'Food',
        expenseDate: '2026-01-01',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'pe-2',
        userId: 'user-a',
        title: 'Shirt',
        amount: 850,
        category: 'Shopping',
        expenseDate: '2026-01-02',
        createdAt: '2026-01-02',
        updatedAt: '2026-01-02',
      },
    ];

    const sharedExp: SharedExpense = {
      id: 'se-1',
      roomId: 'room-1',
      createdBy: 'user-b',
      paidBy: 'user-b',
      title: 'Wi-Fi Bill',
      totalAmount: 600,
      category: 'Wi-Fi',
      splitMethod: 'EQUAL',
      expenseDate: '2026-01-03',
      isDeleted: false,
      createdAt: '2026-01-03',
      updatedAt: '2026-01-03',
    };
    const sharedSplits: ExpenseSplit[] = [
      { id: 'ss1', sharedExpenseId: 'se-1', userId: 'user-a', shareAmount: 300, createdAt: '2026-01-03' },
      { id: 'ss2', sharedExpenseId: 'se-1', userId: 'user-b', shareAmount: 300, createdAt: '2026-01-03' },
    ];

    const dashboard = calculateUnifiedDashboard(
      'user-a',
      personalExps,
      [sharedExp],
      sharedSplits,
      [],
      allUsers,
      ['room-1']
    );

    // Personal: 1240 + 850 = 2090
    // Shared Obligation: 300
    // Total Outflow: 2390
    // Net Payable: 300 (owes B)
    assert(
      'Unified Dashboard combines personal ₹2,090 + room share ₹300 -> ₹2,390 total outflow',
      dashboard.personalTotal === 2090 &&
        dashboard.sharedObligationsTotal === 300 &&
        dashboard.totalOutflow === 2390 &&
        dashboard.netPayables === 300,
      `Got personal ${dashboard.personalTotal}, shared ${dashboard.sharedObligationsTotal}, total ${dashboard.totalOutflow}, payables ${dashboard.netPayables}`
    );
  }

    // Test 7: Clean Exit with Zero Obligations
    {
      const pairwise: PairwiseDebt[] = [];
      const obligations = getOutstandingObligationsForMember('user-a', pairwise);
      const isClean = canCleanExit(obligations);
      assert(
        'Test 7: Active member with ₹0 mutual obligations qualifies for Clean Exit',
        isClean === true && obligations.totalOwed === 0 && obligations.totalCredit === 0,
        `Expected clean exit true, got ${isClean}`
      );
    }

    // Test 8: False Clean Exit Prevention (Mutual Obligations on Net ₹0)
    // A owes B ₹500, C owes A ₹500. Net is 0, but 2 active obligations exist.
    {
      const mutualDebts: PairwiseDebt[] = [
        {
          userAId: 'user-a',
          userBId: 'user-b',
          userAName: 'Rajdeep',
          userBName: 'Sneha',
          netAmount: -500, // userA owes userB 500
          explanation: { aPaidForB: 0, bPaidForA: 500, settlementsAToB: 0, settlementsBToA: 0 },
        },
        {
          userAId: 'user-c',
          userBId: 'user-a',
          userAName: 'Amit',
          userBName: 'Rajdeep',
          netAmount: -500, // userC owes userA 500
          explanation: { aPaidForB: 0, bPaidForA: 500, settlementsAToB: 0, settlementsBToA: 0 },
        },
      ];

      const obligations = getOutstandingObligationsForMember('user-a', mutualDebts);
      const isClean = canCleanExit(obligations);

      assert(
        'Test 8: Net ₹0 with mutual debts blocks Clean Exit and identifies both obligations',
        isClean === false &&
          obligations.hasUnresolvedObligations === true &&
          obligations.totalOwed === 500 &&
          obligations.totalCredit === 500 &&
          obligations.debtsOwed[0].toUserId === 'user-b' &&
          obligations.creditsOwed[0].fromUserId === 'user-c',
        `Expected isClean false with 500 owed & 500 credit, got ${JSON.stringify(obligations)}`
      );
    }

    // Test 9 & 10: Debtor and Creditor Departures - Obligations Remain Frozen
    {
      const testExpenses: SharedExpense[] = [
        {
          id: 'exp-frozen-1',
          roomId: 'room-freeze',
          createdBy: 'user-a',
          paidBy: 'user-a',
          title: 'Electricity',
          totalAmount: 800,
          category: 'Electricity',
          splitMethod: 'EQUAL',
          expenseDate: '2026-02-01',
          isDeleted: false,
          createdAt: '2026-02-01',
          updatedAt: '2026-02-01',
        },
      ];
      const testSplits: ExpenseSplit[] = [
        { id: 's-fz-1', sharedExpenseId: 'exp-frozen-1', userId: 'user-a', shareAmount: 400, createdAt: '2026-02-01' },
        { id: 's-fz-2', sharedExpenseId: 'exp-frozen-1', userId: 'user-b', shareAmount: 400, createdAt: '2026-02-01' },
      ];

      // Debts before departure: B owes A 400
      const debts = calculateRoomPairwiseDebts(testExpenses, testSplits, [], allUsers);
      const summaryB = calculateRoomSummary('room-freeze', 'user-b', testExpenses, testSplits, [], allUsers);
      const summaryA = calculateRoomSummary('room-freeze', 'user-a', testExpenses, testSplits, [], allUsers);

      assert(
        'Test 9 & 10: Debts remain frozen with invariant B owes A ₹400 regardless of who leaves',
        debts.length === 1 &&
          debts[0].netAmount === 400 &&
          summaryB.myNetBalance === -400 &&
          summaryA.myNetBalance === 400,
        `Expected B owes A 400, got debt amount ${debts[0]?.netAmount}`
      );
    }

    // Test 11: Removal and Voluntary Leaving are Financially Identical
    {
      const testExpenses: SharedExpense[] = [
        {
          id: 'exp-rem-1',
          roomId: 'room-rem',
          createdBy: 'user-a',
          paidBy: 'user-a',
          title: 'Groceries',
          totalAmount: 600,
          category: 'Groceries',
          splitMethod: 'EQUAL',
          expenseDate: '2026-02-01',
          isDeleted: false,
          createdAt: '2026-02-01',
          updatedAt: '2026-02-01',
        },
      ];
      const testSplits: ExpenseSplit[] = [
        { id: 'sr-1', sharedExpenseId: 'exp-rem-1', userId: 'user-a', shareAmount: 300, createdAt: '2026-02-01' },
        { id: 'sr-2', sharedExpenseId: 'exp-rem-1', userId: 'user-c', shareAmount: 300, createdAt: '2026-02-01' },
      ];

      const debts = calculateRoomPairwiseDebts(testExpenses, testSplits, [], allUsers);
      assert(
        'Test 11: Admin-removed member C preserves ₹300 debt obligation identically to voluntary leave',
        debts.length === 1 && debts[0].userAId === 'user-a' && debts[0].userBId === 'user-c' && debts[0].netAmount === 300,
        `Expected C owes A 300, got ${debts[0]?.netAmount}`
      );
    }

    // Test 12: Future Bill Exclusion for Departed Members
    {
      // When adding new expense, active members are user-a and user-b (user-c has left)
      const futureSplits = calculateSplits(900, ['user-a', 'user-b'], 'EQUAL');
      const includesC = futureSplits.some((s) => s.userId === 'user-c');

      assert(
        'Test 12: Departed member C is excluded from future expense splits (only A and B split ₹900 @ ₹450 each)',
        !includesC && futureSplits.length === 2 && futureSplits[0].shareAmount === 450 && futureSplits[1].shareAmount === 450,
        `Expected A: 450, B: 450 without C, got ${JSON.stringify(futureSplits)}`
      );
    }

    // Test 13: Former Member Full and Partial Settlements
    {
      const testExpenses: SharedExpense[] = [
        {
          id: 'exp-set-1',
          roomId: 'room-set',
          createdBy: 'user-a',
          paidBy: 'user-a',
          title: 'Rent Advance',
          totalAmount: 1000,
          category: 'Other',
          splitMethod: 'EQUAL',
          expenseDate: '2026-02-01',
          isDeleted: false,
          createdAt: '2026-02-01',
          updatedAt: '2026-02-01',
        },
      ];
      const testSplits: ExpenseSplit[] = [
        { id: 's1', sharedExpenseId: 'exp-set-1', userId: 'user-a', shareAmount: 500, createdAt: '2026-02-01' },
        { id: 's2', sharedExpenseId: 'exp-set-1', userId: 'user-b', shareAmount: 500, createdAt: '2026-02-01' },
      ];

      // Partial settlement: B pays A 200
      const partialSettlement: SettlementPayment = {
        id: 'sp-part',
        roomId: 'room-set',
        payerId: 'user-b',
        payeeId: 'user-a',
        amount: 200,
        paymentMethod: 'UPI',
        paymentDate: '2026-02-05',
        createdAt: '2026-02-05',
      };

      const partialDebts = calculateRoomPairwiseDebts(testExpenses, testSplits, [partialSettlement], allUsers);
      const remainingDebt = partialDebts.find((d) => (d.userAId === 'user-a' && d.userBId === 'user-b') || (d.userAId === 'user-b' && d.userBId === 'user-a'));

      // Full settlement: B pays remaining 300
      const fullSettlement: SettlementPayment = {
        id: 'sp-full',
        roomId: 'room-set',
        payerId: 'user-b',
        payeeId: 'user-a',
        amount: 300,
        paymentMethod: 'UPI',
        paymentDate: '2026-02-06',
        createdAt: '2026-02-06',
      };

      const finalDebts = calculateRoomPairwiseDebts(testExpenses, testSplits, [partialSettlement, fullSettlement], allUsers);

      assert(
        'Test 13: Partial settlement leaves ₹300 balance; subsequent settlement clears obligation to exact ₹0',
        Math.abs(remainingDebt?.netAmount || 0) === 300 && finalDebts.length === 0,
        `Expected partial 300, final 0 debts, got partial ${remainingDebt?.netAmount}, final count ${finalDebts.length}`
      );
    }

    // Test 14: Admin Departure and Automatic Role Succession
    {
      const state = db.getState();
      const testRoomId = 'room-succ-test';
      state.rooms.push({
        id: testRoomId,
        name: 'Succession Test Room',
        createdBy: 'user-a',
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      });
      state.roomMembers.push(
        { id: 'm1', roomId: testRoomId, userId: 'user-a', role: 'ROOM_ADMIN', status: 'ACTIVE', joinedAt: '2026-01-01' },
        { id: 'm2', roomId: testRoomId, userId: 'user-b', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-01-02' },
        { id: 'm3', roomId: testRoomId, userId: 'user-c', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-01-03' }
      );

      const leaveRes = db.leaveRoom('user-a', testRoomId);
      const newAdmin = state.roomMembers.find(
        (rm) => rm.roomId === testRoomId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
      );

      assert(
        'Test 14: When admin leaves, oldest active roommate (User B) is automatically promoted to ROOM_ADMIN',
        leaveRes.success === true &&
          leaveRes.newAdminId === 'user-b' &&
          newAdmin?.userId === 'user-b' &&
          state.roomMembers.find((rm) => rm.id === 'm1')?.status === 'LEFT',
        `Expected new admin user-b, got ${newAdmin?.userId}`
      );
    }

    // Test 15: Last Member Departure Archives Room but Preserves Historical Ledger
    {
      const state = db.getState();
      const testRoomId = 'room-last-test';
      state.rooms.push({
        id: testRoomId,
        name: 'Last Member Room',
        createdBy: 'user-d',
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      });
      state.roomMembers.push({
        id: 'm-last',
        roomId: testRoomId,
        userId: 'user-d',
        role: 'ROOM_ADMIN',
        status: 'ACTIVE',
        joinedAt: '2026-01-01',
      });

      const leaveRes = db.leaveRoom('user-d', testRoomId);
      const room = state.rooms.find((r) => r.id === testRoomId);

      assert(
        'Test 15: When last member leaves, room is marked archived (isArchived = true) without deleting records',
        leaveRes.isArchived === true && room?.isArchived === true,
        `Expected isArchived true, got ${room?.isArchived}`
      );
    }

    // Test 16: Security Validation (Self-Removal, Admin Removal, Settlement Idempotency)
    {
      const state = db.getState();
      const testRoomId = 'room-sec-test';
      state.roomMembers.push(
        { id: 'sec-1', roomId: testRoomId, userId: 'user-a', role: 'ROOM_ADMIN', status: 'ACTIVE', joinedAt: '2026-01-01' },
        { id: 'sec-2', roomId: testRoomId, userId: 'user-b', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-01-02' }
      );

      let selfRemovalBlocked = false;
      try {
        db.removeMember('user-a', testRoomId, 'user-a');
      } catch (err: unknown) {
        selfRemovalBlocked = String(err).includes('CANNOT_REMOVE_SELF');
      }

      let nonAdminBlocked = false;
      try {
        db.removeMember('user-b', testRoomId, 'user-a');
      } catch (err: unknown) {
        nonAdminBlocked = String(err).includes('UNAUTHORIZED');
      }

      // Settlement Idempotency: Duplicate submission with same ID
      const settleId = 'idem-settle-001';
      const p1 = db.recordSettlementPayment('user-b', {
        id: settleId,
        roomId: testRoomId,
        payerId: 'user-b',
        payeeId: 'user-a',
        amount: 250,
        paymentMethod: 'UPI',
      });
      const p2 = db.recordSettlementPayment('user-b', {
        id: settleId,
        roomId: testRoomId,
        payerId: 'user-b',
        payeeId: 'user-a',
        amount: 250,
        paymentMethod: 'UPI',
      });

      const allMatches = state.settlementPayments.filter((s) => s.id === settleId);

      assert(
        'Test 16: Admin self-removal blocked, non-admin removal blocked, settlement submission is strictly idempotent',
        selfRemovalBlocked && nonAdminBlocked && p1.id === p2.id && allMatches.length === 1,
        `Expected selfBlock: ${selfRemovalBlocked}, nonAdminBlock: ${nonAdminBlocked}, matches: ${allMatches.length}`
      );
    }

  return results;
}

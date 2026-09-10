import {
  calculateSplits,
  calculateRoomPairwiseDebts,
  calculateRoomSummary,
  calculateUnifiedDashboard,
} from './engine';
import { User, SharedExpense, ExpenseSplit, SettlementPayment, PersonalExpense } from '../../types';

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

  return results;
}

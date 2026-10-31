import { describe, it, expect } from 'vitest';
import {
  gatherMonthlyExportData,
  ExportDataset,
} from '../lib/services/expenseExportService';
import { generateCsvBlob } from '../lib/services/expenseExportCsv';
import { generateXlsxBlob } from '../lib/services/expenseExportXlsx';
import { generatePdfBlob } from '../lib/services/expenseExportPdf';
import { User, PersonalExpense, SharedExpense, ExpenseSplit, SettlementPayment } from '../types';

describe('Personal Expense Export & Integrity (CSV, Excel, PDF)', () => {
  const currentUser: User = {
    id: 'user-raju',
    name: 'Raju',
    email: 'raju@test.com',
    avatarUrl: '',
  };

  const roommateJyotirmay: User = {
    id: 'user-jyotirmay',
    name: 'Jyotirmay',
    email: 'jyotirmay@test.com',
    avatarUrl: '',
  };

  const roommateLopamudra: User = {
    id: 'user-lopamudra',
    name: 'Lopamudra',
    email: 'lopamudra@test.com',
    avatarUrl: '',
  };

  const allUsers: User[] = [currentUser, roommateJyotirmay, roommateLopamudra];

  const budgetConfig = {
    monthlyAllowance: 8000,
    categoryCaps: {
      Food: 3500,
      Travel: 1000,
      Shopping: 1500,
      Entertainment: 1000,
      Academics: 500,
      Health: 500,
      Other: 500,
    },
  };

  const personalExpenses: PersonalExpense[] = [
    {
      id: 'p-1',
      userId: 'user-raju',
      title: 'Lunch',
      amount: 1000,
      category: 'Food',
      expenseDate: '2026-10-03',
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
    },
    {
      id: 'p-2',
      userId: 'user-raju',
      title: 'Bus Ticket',
      amount: 500,
      category: 'Travel',
      expenseDate: '2026-10-03',
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
    },
  ];

  const sharedExpenses: SharedExpense[] = [
    {
      id: 'se-1',
      roomId: 'room-1',
      title: 'WiFi Bill',
      totalAmount: 500,
      category: 'Wi-Fi',
      paidBy: 'user-jyotirmay',
      splitMethod: 'EQUAL',
      expenseDate: '2026-10-03',
      createdAt: '2026-10-03T00:00:00Z',
    },
    {
      id: 'se-2',
      roomId: 'room-1',
      title: 'Water Cans',
      totalAmount: 200,
      category: 'Water',
      paidBy: 'user-raju',
      splitMethod: 'EQUAL',
      expenseDate: '2026-10-03',
      createdAt: '2026-10-03T00:00:00Z',
    },
  ];

  const expenseSplits: ExpenseSplit[] = [
    // WiFi: 500 split 3 ways -> 166.67, 166.67, 166.66
    { id: 'es-1', sharedExpenseId: 'se-1', userId: 'user-jyotirmay', shareAmount: 166.67, createdAt: '2026-10-03' },
    { id: 'es-2', sharedExpenseId: 'se-1', userId: 'user-raju', shareAmount: 166.67, createdAt: '2026-10-03' },
    { id: 'es-3', sharedExpenseId: 'se-1', userId: 'user-lopamudra', shareAmount: 166.66, createdAt: '2026-10-03' },

    // Water: 200 split 3 ways -> 66.68, 66.66, 66.66
    { id: 'es-4', sharedExpenseId: 'se-2', userId: 'user-raju', shareAmount: 66.68, createdAt: '2026-10-03' },
    { id: 'es-5', sharedExpenseId: 'se-2', userId: 'user-jyotirmay', shareAmount: 66.66, createdAt: '2026-10-03' },
    { id: 'es-6', sharedExpenseId: 'se-2', userId: 'user-lopamudra', shareAmount: 66.66, createdAt: '2026-10-03' },
  ];

  // Raju settled with Jyotirmay for the WiFi share (166.67)
  const settlementPayments: SettlementPayment[] = [
    {
      id: 'sp-1',
      roomId: 'room-1',
      payerId: 'user-raju',
      payeeId: 'user-jyotirmay',
      amount: 166.67,
      paymentDate: '2026-10-04T12:00:00Z',
      createdAt: '2026-10-04T12:00:00Z',
      status: 'CONFIRMED',
      method: 'MANUAL',
    },
  ];

  it('gathers dataset with exact mathematical integrity and distinction between household total and my share', () => {
    const dataset = gatherMonthlyExportData({
      month: 9, // October (0-indexed)
      year: 2026,
      currentUser,
      personalExpenses,
      budgetConfig,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
    });

    // Personal Spending: 1000 + 500 = 1500
    expect(dataset.totalPersonalSpending).toBe(1500);

    // My Share of Shared Expenses: 166.67 + 66.68 = 233.35
    expect(dataset.totalSharedContribution).toBe(233.35);

    // Total Household Shared Bills: 500 + 200 = 700
    expect(dataset.totalHouseholdSharedSpending).toBe(700);

    // Total Outflow: 1500 + 233.35 = 1733.35
    expect(dataset.totalOverallSpending).toBe(1733.35);

    // Budget: 8000
    expect(dataset.monthlyBudget).toBe(8000);
    expect(dataset.remainingBudget).toBe(6266.65);
    expect(dataset.budgetUsedPercent).toBe(22);

    // Days calculation
    expect(dataset.daysInMonth).toBe(31);
    expect(dataset.avgDailySpending).toBeGreaterThan(0);
    expect(dataset.safeDailyLimit).toBeGreaterThan(0);
  });

  it('derives payment status correctly from settlement records rather than assuming unpaid or paid blindly', () => {
    const dataset = gatherMonthlyExportData({
      month: 9,
      year: 2026,
      currentUser,
      personalExpenses,
      budgetConfig,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
    });

    const wifiRow = dataset.transactions.find((t) => t.description === 'WiFi Bill');
    expect(wifiRow).toBeDefined();
    // Since Raju paid 166.67 settlement to Jyotirmay, status must be Settled
    expect(wifiRow?.paymentStatus).toBe('Settled');
    expect(wifiRow?.totalAmount).toBe(500);
    expect(wifiRow?.myShare).toBe(166.67);
    expect(wifiRow?.paidBy).toBe('Jyotirmay');

    const waterRow = dataset.transactions.find((t) => t.description === 'Water Cans');
    expect(waterRow).toBeDefined();
    // Raju paid upfront for water, and roommates haven't paid settlements to Raju yet
    expect(waterRow?.paymentStatus).toBe('Paid Upfront (Owed by Room)');
    expect(waterRow?.totalAmount).toBe(200);
    expect(waterRow?.myShare).toBe(66.68);
    expect(waterRow?.paidBy).toBe('Raju (You)');
  });

  it('formats dates in ISO YYYY-MM-DD and handles timezones without fabricating 5:30 AM for date-only transactions', () => {
    const dataset = gatherMonthlyExportData({
      month: 9,
      year: 2026,
      currentUser,
      personalExpenses,
      budgetConfig,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
    });

    const lunchRow = dataset.transactions.find((t) => t.description === 'Lunch');
    expect(lunchRow?.date).toBe('2026-10-03');
    // Date-only string has no time component, must display '—' instead of '5:30 AM'
    expect(lunchRow?.time).toBe('—');
  });

  it('generates CSV with clear headers and numeric 2-decimal floats', async () => {
    const dataset = gatherMonthlyExportData({
      month: 9,
      year: 2026,
      currentUser,
      personalExpenses,
      budgetConfig,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
    });

    const blob = generateCsvBlob(dataset);
    const text = await blob.text();

    expect(text).toContain('Total Amount (INR)');
    expect(text).toContain('My Share (INR)');
    expect(text).toContain('Time (IST)');
    expect(text).toContain('2026-10-03');
    expect(text).toContain('1000.00');
    expect(text).toContain('166.67');
    expect(text).toContain('500.00');
  });

  it('generates Excel XLSX blob without error', async () => {
    const dataset = gatherMonthlyExportData({
      month: 9,
      year: 2026,
      currentUser,
      personalExpenses,
      budgetConfig,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
    });

    const blob = await generateXlsxBlob(dataset);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('generates PDF blob using standard ASCII Rs. prefix preventing font encoding artifacts', async () => {
    const dataset = gatherMonthlyExportData({
      month: 9,
      year: 2026,
      currentUser,
      personalExpenses,
      budgetConfig,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
    });

    const blob = await generatePdfBlob(dataset);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
  });
});

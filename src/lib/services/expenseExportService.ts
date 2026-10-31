/**
 * Expense Export Service — Data Gathering & Download Orchestrator
 *
 * Single source of truth: gathers authorized monthly data into an ExportDataset
 * that all format generators (PDF/CSV/XLSX) consume for consistency.
 *
 * Privacy: Only includes the current user's personal expenses and shared expense
 * contributions. Never exposes another user's private data.
 */

import {
  PersonalExpense,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  User,
  Room,
} from '../../types';
import { UserBudgetConfig } from '../storage/budgetService';
import { saveFileToDevice } from './fileDownloadService';

// ─── Types ──────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

export interface CategoryBreakdownRow {
  name: string;
  spent: number;
  cap: number;
  percentUsed: number;
  status: 'Within limit' | 'Near limit' | 'Exceeded' | 'No target';
}

export interface SharedContributionRow {
  title: string;
  category: string;
  expenseDate: string;
  totalAmount: number;
  myShare: number;
  paidByName: string;
  paidByMe: boolean;
  paymentStatus: string;
}

export interface SettlementSummary {
  totalIOwe: number;
  totalOwedToMe: number;
  totalSettled: number;
  totalOutstanding: number;
}

export interface TransactionRow {
  date: string;
  time: string;
  description: string;
  category: string;
  expenseType: 'Personal' | 'Shared';
  amount: number;
  totalAmount: number;
  myShare: number;
  paidBy: string;
  paymentStatus: string;
  rawDate: string;
}

export interface ExportDataset {
  // Identity
  userName: string;
  month: number;        // 0-indexed
  year: number;
  monthLabel: string;   // "September 2026"

  // Personal Expenses
  personalExpenses: PersonalExpense[];
  totalPersonalSpending: number;

  // Shared Contributions
  sharedContributions: SharedContributionRow[];
  totalSharedContribution: number;
  totalHouseholdSharedSpending: number;

  // Totals
  totalOverallSpending: number;

  // Budget
  monthlyBudget: number;
  budgetUsedPercent: number;
  remainingBudget: number;
  avgDailySpending: number;
  safeDailyLimit: number;
  elapsedDays: number;
  daysLeft: number;
  daysInMonth: number;
  transactionCount: number;

  // Category Breakdown
  categoryBreakdown: CategoryBreakdownRow[];

  // Settlement
  settlementSummary: SettlementSummary;

  // Merged chronological transaction list (for tables)
  transactions: TransactionRow[];
}

// ─── Constants ──────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ALL_CATEGORIES = ['Food', 'Shopping', 'Travel', 'Entertainment', 'Academics', 'Health', 'Other'];

const toPaise = (n: number) => Math.round((n + Number.EPSILON) * 100);
const fromPaise = (p: number) => Math.round(p) / 100;

// ─── Data Gathering ─────────────────────────────────────────────

export function gatherMonthlyExportData(params: {
  month: number;
  year: number;
  currentUser: User;
  personalExpenses: PersonalExpense[];
  budgetConfig: UserBudgetConfig;
  sharedExpenses?: SharedExpense[];
  expenseSplits?: ExpenseSplit[];
  settlementPayments?: SettlementPayment[];
  allUsers?: User[];
  rooms?: Room[];
}): ExportDataset {
  const {
    month, year, currentUser, personalExpenses, budgetConfig,
    sharedExpenses = [], expenseSplits = [], settlementPayments = [],
    allUsers = [],
  } = params;

  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  // ── Date boundaries for the selected month ──
  const startOfMonth = new Date(year, month, 1);
  startOfMonth.setHours(0, 0, 0, 0);
  const endOfMonth = new Date(year, month + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  // ── 1. Filter personal expenses ──
  const myPersonal = personalExpenses.filter((p) => {
    if (p.userId !== currentUser.id) return false;
    const rawDate = p.expenseDate || p.createdAt;
    if (!rawDate) return false;
    const d = new Date(rawDate);
    return d >= startOfMonth && d <= endOfMonth;
  });

  const totalPersonalSpendingPaise = myPersonal.reduce((sum, p) => sum + toPaise(p.amount), 0);
  const totalPersonalSpending = fromPaise(totalPersonalSpendingPaise);

  // ── 2. Filter shared expense contributions ──
  const monthSharedExpenses = sharedExpenses.filter((se) => {
    if (se.isDeleted) return false;
    const rawDate = se.expenseDate || se.createdAt;
    if (!rawDate) return false;
    const d = new Date(rawDate);
    return d >= startOfMonth && d <= endOfMonth;
  });

  const totalHouseholdSharedSpendingPaise = monthSharedExpenses.reduce(
    (sum, se) => sum + toPaise(se.totalAmount),
    0
  );
  const totalHouseholdSharedSpending = fromPaise(totalHouseholdSharedSpendingPaise);

  const userNameMap = new Map<string, string>();
  allUsers.forEach((u) => userNameMap.set(u.id, u.name));

  // ── 3. Settlement pool tracking (FIFO in paise) ──
  const monthSettlements = settlementPayments.filter((sp) => {
    const rawDate = sp.paymentDate || sp.createdAt;
    if (!rawDate) return false;
    const d = new Date(rawDate);
    if (d < startOfMonth || d > endOfMonth) return false;
    return sp.payerId === currentUser.id || sp.payeeId === currentUser.id;
  });

  const settlementPool = new Map<string, number>();
  for (const sp of monthSettlements) {
    if (sp.status === 'CANCELLED' || sp.status === 'DISPUTED') continue;
    const key = `${sp.payeeId}:::${sp.payerId}`;
    settlementPool.set(key, (settlementPool.get(key) || 0) + toPaise(sp.amount));
  }
  const remainingSettlementPool = new Map<string, number>(settlementPool);

  // Sort shared expenses chronologically ascending for deterministic FIFO settlement allocation
  const chronologicalShared = [...monthSharedExpenses].sort((a, b) => {
    const ta = new Date(a.expenseDate || a.createdAt).getTime();
    const tb = new Date(b.expenseDate || b.createdAt).getTime();
    return ta - tb;
  });

  const sharedContributions: SharedContributionRow[] = [];
  let totalSharedContributionPaise = 0;

  for (const se of chronologicalShared) {
    const mySplit = expenseSplits.find(
      (es) => es.sharedExpenseId === se.id && es.userId === currentUser.id
    );
    if (!mySplit) continue; // User is not a participant — skip

    const isPaidByMe = se.paidBy === currentUser.id;
    const payerDisplayName = isPaidByMe
      ? `${currentUser.name} (You)`
      : (userNameMap.get(se.paidBy) || 'Roommate');
    const mySharePaise = toPaise(mySplit.shareAmount);
    totalSharedContributionPaise += mySharePaise;

    let paymentStatus: string;

    if (isPaidByMe) {
      // User paid merchant upfront. Check if other roommates settled their shares back to user.
      const otherSplits = expenseSplits.filter(
        (es) => es.sharedExpenseId === se.id && es.userId !== currentUser.id
      );
      let otherOwedPaise = 0;
      let otherSettledPaise = 0;

      for (const os of otherSplits) {
        const neededPaise = toPaise(os.shareAmount);
        otherOwedPaise += neededPaise;
        const poolKey = `${currentUser.id}:::${os.userId}`;
        const availPaise = remainingSettlementPool.get(poolKey) || 0;
        if (availPaise >= neededPaise) {
          otherSettledPaise += neededPaise;
          remainingSettlementPool.set(poolKey, availPaise - neededPaise);
        } else if (availPaise > 0) {
          otherSettledPaise += availPaise;
          remainingSettlementPool.set(poolKey, 0);
        }
      }

      if (otherOwedPaise === 0 || otherSettledPaise >= otherOwedPaise) {
        paymentStatus = 'Settled';
      } else if (otherSettledPaise > 0) {
        paymentStatus = 'Partially Settled';
      } else {
        paymentStatus = 'Paid Upfront (Owed by Room)';
      }
    } else {
      // Someone else paid. User owes their share to payer.
      const poolKey = `${se.paidBy}:::${currentUser.id}`;
      const availPaise = remainingSettlementPool.get(poolKey) || 0;
      if (availPaise >= mySharePaise) {
        paymentStatus = 'Settled';
        remainingSettlementPool.set(poolKey, availPaise - mySharePaise);
      } else if (availPaise > 0) {
        paymentStatus = 'Partially Settled';
        remainingSettlementPool.set(poolKey, 0);
      } else {
        paymentStatus = `Owed to ${payerDisplayName}`;
      }
    }

    const row: SharedContributionRow = {
      title: se.title,
      category: se.category,
      expenseDate: se.expenseDate || se.createdAt,
      totalAmount: fromPaise(toPaise(se.totalAmount)),
      myShare: fromPaise(mySharePaise),
      paidByName: payerDisplayName,
      paidByMe: isPaidByMe,
      paymentStatus,
    };
    sharedContributions.push(row);
  }

  const totalSharedContribution = fromPaise(totalSharedContributionPaise);

  // ── 4. Settlement summary for the month ──
  let totalIOwePaise = 0;
  let totalOwedToMePaise = 0;
  let totalSettledPaise = 0;

  for (const sc of sharedContributions) {
    if (!sc.paidByMe) {
      totalIOwePaise += toPaise(sc.myShare);
    }
  }

  for (const se of monthSharedExpenses) {
    if (se.paidBy !== currentUser.id) continue;
    const otherSplits = expenseSplits.filter(
      (es) => es.sharedExpenseId === se.id && es.userId !== currentUser.id
    );
    for (const os of otherSplits) {
      totalOwedToMePaise += toPaise(os.shareAmount);
    }
  }

  for (const sp of monthSettlements) {
    if (sp.status === 'CANCELLED' || sp.status === 'DISPUTED') continue;
    totalSettledPaise += toPaise(sp.amount);
  }

  const mySettlementPaymentsPaise = monthSettlements
    .filter((sp) => sp.payerId === currentUser.id && sp.status !== 'CANCELLED' && sp.status !== 'DISPUTED')
    .reduce((s, sp) => s + toPaise(sp.amount), 0);

  const totalOutstandingPaise = Math.max(0, totalIOwePaise - mySettlementPaymentsPaise);

  const settlementSummary: SettlementSummary = {
    totalIOwe: fromPaise(totalIOwePaise),
    totalOwedToMe: fromPaise(totalOwedToMePaise),
    totalSettled: fromPaise(totalSettledPaise),
    totalOutstanding: fromPaise(totalOutstandingPaise),
  };

  // ── 5. Category breakdown ──
  const catSpentPaiseMap: Record<string, number> = {};
  for (const p of myPersonal) {
    catSpentPaiseMap[p.category] = (catSpentPaiseMap[p.category] || 0) + toPaise(p.amount);
  }

  const categoryBreakdown: CategoryBreakdownRow[] = ALL_CATEGORIES.map((cat) => {
    const spentPaise = catSpentPaiseMap[cat] || 0;
    const spent = fromPaise(spentPaise);
    const cap = budgetConfig.categoryCaps[cat] || 0;
    const percentUsed = cap > 0 ? Math.round((spent / cap) * 100) : 0;
    let status: CategoryBreakdownRow['status'] = 'No target';
    if (cap > 0) {
      if (spent > cap) status = 'Exceeded';
      else if (percentUsed >= 80) status = 'Near limit';
      else status = 'Within limit';
    }
    return { name: cat, spent, cap, percentUsed, status };
  });

  // ── 6. Budget calculations ──
  const totalOverallSpending = fromPaise(totalPersonalSpendingPaise + totalSharedContributionPaise);
  const monthlyBudget = budgetConfig.monthlyAllowance;
  const budgetUsedPercent = monthlyBudget > 0 ? Math.round((totalOverallSpending / monthlyBudget) * 100) : 0;
  const remainingBudget = fromPaise(Math.max(0, toPaise(monthlyBudget) - toPaise(totalOverallSpending)));

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;
  const elapsedDays = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  const daysLeft = isCurrentMonth ? Math.max(1, daysInMonth - now.getDate() + 1) : 0;

  const avgDailySpending = elapsedDays > 0
    ? fromPaise(Math.round(toPaise(totalOverallSpending) / elapsedDays))
    : 0;
  const safeDailyLimit = daysLeft > 0
    ? fromPaise(Math.round(toPaise(remainingBudget) / daysLeft))
    : 0;

  // ── 7. Merged transaction list ──
  const transactions: TransactionRow[] = [];

  for (const p of myPersonal) {
    const rawDate = p.expenseDate || p.createdAt;
    transactions.push({
      date: formatDate(rawDate),
      time: formatTime(rawDate),
      description: p.title,
      category: p.category,
      expenseType: 'Personal',
      amount: fromPaise(toPaise(p.amount)),
      totalAmount: fromPaise(toPaise(p.amount)),
      myShare: fromPaise(toPaise(p.amount)),
      paidBy: `${currentUser.name} (You)`,
      paymentStatus: 'Paid',
      rawDate,
    });
  }

  for (const sc of sharedContributions) {
    transactions.push({
      date: formatDate(sc.expenseDate),
      time: formatTime(sc.expenseDate),
      description: sc.title,
      category: sc.category,
      expenseType: 'Shared',
      amount: sc.totalAmount,
      totalAmount: sc.totalAmount,
      myShare: sc.myShare,
      paidBy: sc.paidByName,
      paymentStatus: sc.paymentStatus,
      rawDate: sc.expenseDate,
    });
  }

  // Sort chronologically (newest first)
  transactions.sort((a, b) => {
    const ta = new Date(a.rawDate).getTime();
    const tb = new Date(b.rawDate).getTime();
    return tb - ta;
  });

  const transactionCount = transactions.length;

  return {
    userName: currentUser.name,
    month,
    year,
    monthLabel,
    personalExpenses: myPersonal,
    totalPersonalSpending,
    sharedContributions,
    totalSharedContribution,
    totalHouseholdSharedSpending,
    totalOverallSpending,
    monthlyBudget,
    budgetUsedPercent,
    remainingBudget,
    avgDailySpending,
    safeDailyLimit,
    elapsedDays,
    daysLeft,
    daysInMonth,
    transactionCount,
    categoryBreakdown,
    settlementSummary,
    transactions,
  };
}

// ─── Download Trigger ───────────────────────────────────────────

export async function downloadFile(blob: Blob, filename: string): Promise<void> {
  await saveFileToDevice({
    blob,
    filename,
    shareTitle: filename,
    shareText: `RoomMate Expense Report: ${filename}`,
    autoShareOnMobile: true,
  });
}

// ─── Filename Generator ─────────────────────────────────────────

export function generateFilename(monthLabel: string, format: ExportFormat): string {
  const sanitized = monthLabel.replace(/\s+/g, '_');
  const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
  return `RoomMate_Expense_Report_${sanitized}.${ext}`;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(rawDateStr: string | undefined): string {
  if (!rawDateStr) return '—';
  const trimmed = rawDateStr.trim();
  // If already standard ISO date YYYY-MM-DD, preserve it directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return '—';
  // Format in Asia/Kolkata timezone to avoid off-by-one date shift
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatTime(rawDateStr: string | undefined): string {
  if (!rawDateStr) return '—';
  const trimmed = rawDateStr.trim();
  // If date-only string without time, do not fabricate 5:30 AM
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return '—';
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Format-Specific Export Orchestrators (dynamic imports) ─────

export async function exportToFormat(dataset: ExportDataset, format: ExportFormat): Promise<void> {
  let blob: Blob;
  let filename: string;

  switch (format) {
    case 'pdf': {
      const { generatePdfBlob } = await import('./expenseExportPdf');
      blob = await generatePdfBlob(dataset);
      break;
    }
    case 'csv': {
      const { generateCsvBlob } = await import('./expenseExportCsv');
      blob = generateCsvBlob(dataset);
      break;
    }
    case 'xlsx': {
      const { generateXlsxBlob } = await import('./expenseExportXlsx');
      blob = await generateXlsxBlob(dataset);
      break;
    }
  }

  filename = generateFilename(dataset.monthLabel, format);
  await downloadFile(blob, filename);
}

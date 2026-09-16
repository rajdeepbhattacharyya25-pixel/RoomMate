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
import { isNativeApp } from '../platform/deviceDetector';

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
  sharedTotal?: number;
  myShare?: number;
  paidBy?: string;
  paymentStatus?: string;
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

  // Totals
  totalOverallSpending: number;

  // Budget
  monthlyBudget: number;
  budgetUsedPercent: number;
  remainingBudget: number;
  avgDailySpending: number;
  safeDailyLimit: number;
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
    const d = new Date(p.expenseDate || p.createdAt);
    return d >= startOfMonth && d <= endOfMonth;
  });

  const totalPersonalSpending = myPersonal.reduce((sum, p) => sum + p.amount, 0);

  // ── 2. Filter shared expense contributions ──
  const monthSharedExpenses = sharedExpenses.filter((se) => {
    if (se.isDeleted) return false;
    const d = new Date(se.expenseDate || se.createdAt);
    return d >= startOfMonth && d <= endOfMonth;
  });

  const userNameMap = new Map<string, string>();
  allUsers.forEach((u) => userNameMap.set(u.id, u.name));

  const sharedContributions: SharedContributionRow[] = [];
  let totalSharedContribution = 0;

  for (const se of monthSharedExpenses) {
    // Find user's split for this shared expense
    const mySplit = expenseSplits.find(
      (es) => es.sharedExpenseId === se.id && es.userId === currentUser.id
    );
    if (!mySplit) continue; // User is not a participant — skip

    const row: SharedContributionRow = {
      title: se.title,
      category: se.category,
      expenseDate: se.expenseDate || se.createdAt,
      totalAmount: se.totalAmount,
      myShare: mySplit.shareAmount,
      paidByName: userNameMap.get(se.paidBy) || 'Unknown',
      paidByMe: se.paidBy === currentUser.id,
    };
    sharedContributions.push(row);
    totalSharedContribution += mySplit.shareAmount;
  }

  // ── 3. Settlement summary for the month ──
  const monthSettlements = settlementPayments.filter((sp) => {
    const d = new Date(sp.paymentDate || sp.createdAt);
    if (d < startOfMonth || d > endOfMonth) return false;
    return sp.payerId === currentUser.id || sp.payeeId === currentUser.id;
  });

  let totalIOwe = 0;
  let totalOwedToMe = 0;
  let totalSettled = 0;

  // Calculate what user owes from shared expenses (where someone else paid)
  for (const sc of sharedContributions) {
    if (!sc.paidByMe) {
      totalIOwe += sc.myShare;
    }
  }
  // Calculate what others owe user (where user paid)
  for (const se of monthSharedExpenses) {
    if (se.paidBy !== currentUser.id) continue;
    const otherSplits = expenseSplits.filter(
      (es) => es.sharedExpenseId === se.id && es.userId !== currentUser.id
    );
    for (const os of otherSplits) {
      totalOwedToMe += os.shareAmount;
    }
  }

  // Sum settlements
  for (const sp of monthSettlements) {
    totalSettled += sp.amount;
  }

  const totalOutstanding = Math.max(0, totalIOwe - monthSettlements
    .filter((sp) => sp.payerId === currentUser.id)
    .reduce((s, sp) => s + sp.amount, 0));

  const settlementSummary: SettlementSummary = {
    totalIOwe,
    totalOwedToMe,
    totalSettled,
    totalOutstanding,
  };

  // ── 4. Category breakdown ──
  const catSpentMap: Record<string, number> = {};
  for (const p of myPersonal) {
    catSpentMap[p.category] = (catSpentMap[p.category] || 0) + p.amount;
  }

  const categoryBreakdown: CategoryBreakdownRow[] = ALL_CATEGORIES.map((cat) => {
    const spent = catSpentMap[cat] || 0;
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

  // ── 5. Budget calculations ──
  const totalOverallSpending = totalPersonalSpending + totalSharedContribution;
  const monthlyBudget = budgetConfig.monthlyAllowance;
  const budgetUsedPercent = monthlyBudget > 0 ? Math.round((totalOverallSpending / monthlyBudget) * 100) : 0;
  const remainingBudget = Math.max(0, monthlyBudget - totalOverallSpending);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const isCurrentMonth = now.getMonth() === month && now.getFullYear() === year;
  const elapsedDays = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
  const daysLeft = isCurrentMonth ? Math.max(1, daysInMonth - now.getDate() + 1) : 0;

  const avgDailySpending = elapsedDays > 0 ? Math.round(totalOverallSpending / elapsedDays) : 0;
  const safeDailyLimit = daysLeft > 0 ? Math.round(remainingBudget / daysLeft) : 0;

  // ── 6. Merged transaction list ──
  const transactions: TransactionRow[] = [];

  for (const p of myPersonal) {
    const d = new Date(p.expenseDate || p.createdAt);
    transactions.push({
      date: formatDate(d),
      time: formatTime(d),
      description: p.title,
      category: p.category,
      expenseType: 'Personal',
      amount: p.amount,
    });
  }

  for (const sc of sharedContributions) {
    const d = new Date(sc.expenseDate);
    transactions.push({
      date: formatDate(d),
      time: formatTime(d),
      description: sc.title,
      category: sc.category,
      expenseType: 'Shared',
      amount: sc.myShare,
      sharedTotal: sc.totalAmount,
      myShare: sc.myShare,
      paidBy: sc.paidByName,
      paymentStatus: sc.paidByMe ? 'I Paid' : 'Owed',
    });
  }

  // Sort chronologically (newest first)
  transactions.sort((a, b) => {
    const da = parseFormattedDate(a.date);
    const db = parseFormattedDate(b.date);
    return db.getTime() - da.getTime();
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
    totalOverallSpending,
    monthlyBudget,
    budgetUsedPercent,
    remainingBudget,
    avgDailySpending,
    safeDailyLimit,
    transactionCount,
    categoryBreakdown,
    settlementSummary,
    transactions,
  };
}

// ─── Download Trigger ───────────────────────────────────────────

export async function downloadFile(blob: Blob, filename: string): Promise<void> {
  if (isNativeApp()) {
    // On Capacitor (Android/iOS), try to use Share API for native share sheet
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return;
      }
    } catch {
      // Fallback to standard download if share fails
    }
  }

  // Standard web download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup after a short delay
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 250);
}

// ─── Filename Generator ─────────────────────────────────────────

export function generateFilename(monthLabel: string, format: ExportFormat): string {
  const sanitized = monthLabel.replace(/\s+/g, '_');
  const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
  return `RoomMate_Expense_Report_${sanitized}.${ext}`;
}

// ─── Helpers ────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[d.getMonth()].substring(0, 3);
  const yr = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function parseFormattedDate(formatted: string): Date {
  // "05 Sep 2026" → Date
  const parts = formatted.split(' ');
  const day = parseInt(parts[0], 10);
  const monIdx = MONTH_NAMES.findIndex((m) => m.startsWith(parts[1]));
  const year = parseInt(parts[2], 10);
  return new Date(year, monIdx >= 0 ? monIdx : 0, day);
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

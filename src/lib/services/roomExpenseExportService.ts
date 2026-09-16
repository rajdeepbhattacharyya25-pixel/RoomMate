/**
 * Room Shared Expense Export Service — Data Gathering & Download Orchestrator
 *
 * Single source of truth for Room Shared Expenses:
 * Gathers authorized monthly data for a room into a RoomExportDataset
 * that all format generators (PDF/CSV/XLSX) consume for consistency.
 *
 * Privacy: Only includes shared room expenses and settlement information
 * belonging to the selected room. Personal Vault expenses are strictly excluded.
 */

import {
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  User,
  Room,
} from '../../types';
import { round2 } from '../ledger/engine';
import { isNativeApp } from '../platform/deviceDetector';

// ─── Types ──────────────────────────────────────────────────────

export type RoomExportFormat = 'pdf' | 'csv' | 'xlsx';

export interface RoommateSettlementRow {
  userId: string;
  name: string;
  totalPaid: number;          // Out-of-pocket bills paid
  fairShare: number;          // Assigned share across all bills
  settlementsPaid: number;    // Direct transfers paid to others
  settlementsReceived: number;// Direct transfers received from others
  netBalance: number;         // (totalPaid - fairShare) + settlementsPaid - settlementsReceived
  status: 'Receive' | 'Pay' | 'Settled';
}

export interface DetailedSplitRow {
  expenseId: string;
  expenseTitle: string;
  expenseCategory: string;
  expenseDate: string;
  totalAmount: number;
  paidById: string;
  paidByName: string;
  splitMethod: string;
  roommateId: string;
  roommateName: string;
  shareAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'Settled' | 'Partially Paid' | 'Outstanding';
}

export interface RoomMonthlySummary {
  totalSharedSpending: number;
  myShare: number;
  iPaid: number;
  iOwe: number;
  othersOweMe: number;
  sharedBillsCount: number;
  settledBillsCount: number;
  partiallySettledBillsCount: number;
  outstandingSettlementsCount: number;
}

export interface RoomExportDataset {
  roomId: string;
  roomName: string;
  month: number;          // 0-indexed
  year: number;
  monthLabel: string;     // "September 2026"
  currentUserId: string;
  currentUserName: string;
  summary: RoomMonthlySummary;
  settlements: RoommateSettlementRow[];
  expenses: SharedExpense[];
  detailedSplits: DetailedSplitRow[];
}

// ─── Constants ──────────────────────────────────────────────────

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Helpers ────────────────────────────────────────────────────

export function isExpenseInMonth(dateStr: string, monthIndex: number, year: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() === monthIndex;
}

export function sanitizeRoomName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'Room';
}

// ─── Data Gathering ─────────────────────────────────────────────

export interface GatherRoomDataParams {
  roomId: string;
  monthIndex: number; // 0-indexed
  year: number;
  currentUser: User;
  activeRoom?: Room | null;
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  allUsers: User[];
}

export function gatherRoomExportData(params: GatherRoomDataParams): RoomExportDataset {
  const {
    roomId,
    monthIndex,
    year,
    currentUser,
    activeRoom,
    sharedExpenses = [],
    expenseSplits = [],
    settlementPayments = [],
    allUsers = [],
  } = params;

  const roomName = activeRoom?.name || 'Room';
  const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

  // 1. Filter shared expenses strictly for this room & month (and not deleted)
  const roomMonthExpenses = sharedExpenses.filter(
    (e) =>
      e.roomId === roomId &&
      !e.isDeleted &&
      isExpenseInMonth(e.expenseDate || e.createdAt, monthIndex, year)
  ).sort((a, b) => new Date(b.expenseDate || b.createdAt).getTime() - new Date(a.expenseDate || a.createdAt).getTime());

  const monthExpenseIds = new Set(roomMonthExpenses.map((e) => e.id));

  // 2. Filter splits for these expenses
  const monthSplits = expenseSplits.filter((s) => monthExpenseIds.has(s.sharedExpenseId));

  // 3. Filter settlements strictly for this room & month
  const roomMonthSettlements = settlementPayments.filter(
    (s) =>
      s.roomId === roomId &&
      isExpenseInMonth(s.paymentDate || s.createdAt, monthIndex, year)
  );

  // Identify all members involved in this room (or participants in splits/expenses)
  const memberIdSet = new Set<string>();
  memberIdSet.add(currentUser.id);
  roomMonthExpenses.forEach((e) => memberIdSet.add(e.paidBy));
  monthSplits.forEach((s) => memberIdSet.add(s.userId));
  roomMonthSettlements.forEach((s) => {
    memberIdSet.add(s.payerId);
    memberIdSet.add(s.payeeId);
  });

  const memberIds = Array.from(memberIdSet);
  const userMap = new Map<string, User>(allUsers.map((u) => [u.id, u]));

  // 4. Calculate pairwise settlement pool for partial payment allocation
  // Map key: `${payerId}:::${debtorId}` -> available settlement amount from debtor to payer
  const settlementPool = new Map<string, number>();
  for (const s of roomMonthSettlements) {
    const key = `${s.payeeId}:::${s.payerId}`; // debtor=payerId paid payeeId
    settlementPool.set(key, round2((settlementPool.get(key) || 0) + s.amount));
  }

  // Clone settlement pool for consumption tracking
  const remainingSettlementPool = new Map<string, number>(settlementPool);

  // 5. Generate Detailed Splits with Partial Payment Support
  // Sort expenses chronologically ascending to allocate settlements in FIFO order
  const chronologicalExpenses = [...roomMonthExpenses].sort(
    (a, b) => new Date(a.expenseDate || a.createdAt).getTime() - new Date(b.expenseDate || b.createdAt).getTime()
  );

  const detailedSplitsMap = new Map<string, DetailedSplitRow[]>();
  const detailedSplits: DetailedSplitRow[] = [];

  for (const exp of chronologicalExpenses) {
    const expSplits = monthSplits.filter((s) => s.sharedExpenseId === exp.id);
    const rowsForThisExp: DetailedSplitRow[] = [];

    for (const split of expSplits) {
      const payerUser = userMap.get(exp.paidBy);
      const debtorUser = userMap.get(split.userId);
      const isPayer = split.userId === exp.paidBy;

      let paidAmount = 0;
      let remainingAmount = 0;
      let status: 'Settled' | 'Partially Paid' | 'Outstanding' = 'Outstanding';

      if (isPayer) {
        // Payer's own share is inherently settled
        paidAmount = split.shareAmount;
        remainingAmount = 0;
        status = 'Settled';
      } else {
        // Debtor owes Payer
        const poolKey = `${exp.paidBy}:::${split.userId}`;
        const availableSettle = remainingSettlementPool.get(poolKey) || 0;

        if (availableSettle >= split.shareAmount) {
          paidAmount = split.shareAmount;
          remainingAmount = 0;
          status = 'Settled';
          remainingSettlementPool.set(poolKey, round2(availableSettle - split.shareAmount));
        } else if (availableSettle > 0) {
          paidAmount = availableSettle;
          remainingAmount = round2(split.shareAmount - availableSettle);
          status = 'Partially Paid';
          remainingSettlementPool.set(poolKey, 0);
        } else {
          paidAmount = 0;
          remainingAmount = split.shareAmount;
          status = 'Outstanding';
        }
      }

      const row: DetailedSplitRow = {
        expenseId: exp.id,
        expenseTitle: exp.title,
        expenseCategory: exp.category,
        expenseDate: exp.expenseDate || exp.createdAt,
        totalAmount: exp.totalAmount,
        paidById: exp.paidBy,
        paidByName: payerUser?.name || 'Roommate',
        splitMethod: exp.splitMethod,
        roommateId: split.userId,
        roommateName: debtorUser?.name || 'Roommate',
        shareAmount: split.shareAmount,
        paidAmount,
        remainingAmount,
        status,
      };

      rowsForThisExp.push(row);
      detailedSplits.push(row);
    }
    detailedSplitsMap.set(exp.id, rowsForThisExp);
  }

  // 6. Calculate Roommate Settlement Breakdown
  const settlements: RoommateSettlementRow[] = memberIds.map((uid) => {
    const memberUser = userMap.get(uid);
    const memberName = uid === currentUser.id ? `${memberUser?.name || 'You'} (You)` : memberUser?.name || 'Roommate';

    // Total bills paid out-of-pocket by this member
    const totalPaid = round2(
      roomMonthExpenses.filter((e) => e.paidBy === uid).reduce((sum, e) => sum + e.totalAmount, 0)
    );

    // Total fair share assigned to this member
    const fairShare = round2(
      monthSplits.filter((s) => s.userId === uid).reduce((sum, s) => sum + s.shareAmount, 0)
    );

    // Direct settlement payments sent by this member
    const settlementsPaid = round2(
      roomMonthSettlements.filter((s) => s.payerId === uid).reduce((sum, s) => sum + s.amount, 0)
    );

    // Direct settlement payments received by this member
    const settlementsReceived = round2(
      roomMonthSettlements.filter((s) => s.payeeId === uid).reduce((sum, s) => sum + s.amount, 0)
    );

    // Net balance: Positive means member should receive, Negative means member owes
    // Balance = (totalPaid - fairShare) + settlementsPaid - settlementsReceived
    const netBalance = round2((totalPaid - fairShare) + settlementsPaid - settlementsReceived);

    let status: 'Receive' | 'Pay' | 'Settled' = 'Settled';
    if (netBalance >= 0.5) {
      status = 'Receive';
    } else if (netBalance <= -0.5) {
      status = 'Pay';
    }

    return {
      userId: uid,
      name: memberName,
      totalPaid,
      fairShare,
      settlementsPaid,
      settlementsReceived,
      netBalance,
      status,
    };
  }).sort((a, b) => b.totalPaid - a.totalPaid);

  // 7. Calculate Room-Level Monthly Summary KPIs
  const totalSharedSpending = round2(roomMonthExpenses.reduce((sum, e) => sum + e.totalAmount, 0));

  const myShare = round2(
    monthSplits.filter((s) => s.userId === currentUser.id).reduce((sum, s) => sum + s.shareAmount, 0)
  );

  const iPaid = round2(
    roomMonthExpenses.filter((e) => e.paidBy === currentUser.id).reduce((sum, e) => sum + e.totalAmount, 0)
  );

  const mySettlementRow = settlements.find((s) => s.userId === currentUser.id);
  const myNetBalance = mySettlementRow ? mySettlementRow.netBalance : 0;

  const iOwe = myNetBalance < 0 ? round2(Math.abs(myNetBalance)) : 0;
  const othersOweMe = myNetBalance > 0 ? round2(myNetBalance) : 0;

  // Count bill statuses
  let settledBillsCount = 0;
  let partiallySettledBillsCount = 0;
  let outstandingSettlementsCount = 0;

  for (const exp of roomMonthExpenses) {
    const splitsForExp = detailedSplitsMap.get(exp.id) || [];
    if (splitsForExp.length === 0) continue;

    const allSettled = splitsForExp.every((s) => s.status === 'Settled');
    const somePaid = splitsForExp.some((s) => s.status === 'Partially Paid' || (s.paidAmount > 0 && s.remainingAmount > 0));

    if (allSettled) {
      settledBillsCount++;
    } else if (somePaid) {
      partiallySettledBillsCount++;
      outstandingSettlementsCount++;
    } else {
      outstandingSettlementsCount++;
    }
  }

  const summary: RoomMonthlySummary = {
    totalSharedSpending,
    myShare,
    iPaid,
    iOwe,
    othersOweMe,
    sharedBillsCount: roomMonthExpenses.length,
    settledBillsCount,
    partiallySettledBillsCount,
    outstandingSettlementsCount,
  };

  return {
    roomId,
    roomName,
    month: monthIndex,
    year,
    monthLabel,
    currentUserId: currentUser.id,
    currentUserName: currentUser.name || 'User',
    summary,
    settlements,
    expenses: roomMonthExpenses,
    detailedSplits,
  };
}

// ─── Filename Generator ─────────────────────────────────────────

export function generateRoomFilename(roomName: string, monthLabel: string, format: RoomExportFormat): string {
  const cleanRoom = sanitizeRoomName(roomName);
  const cleanMonth = monthLabel.replace(/\s+/g, '_');
  const ext = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx';
  return `RoomMate_${cleanRoom}_Shared_Expenses_${cleanMonth}.${ext}`;
}

// ─── Native / Browser Download Trigger ──────────────────────────

export async function downloadRoomFile(blob: Blob, filename: string): Promise<void> {
  const isAndroidOrMobile = isNativeApp() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isAndroidOrMobile && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: `Shared room expense report from RoomMate: ${filename}`,
        });
        return;
      }
    } catch {
      // User cancelled share or share failed; fallback to direct download below
    }
  }

  // Standard web browser download fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 250);
}

// ─── Format-Specific Export Orchestrator ────────────────────────

export async function exportRoomToFormat(dataset: RoomExportDataset, format: RoomExportFormat): Promise<void> {
  let blob: Blob;
  let filename: string;

  switch (format) {
    case 'pdf': {
      const { generateRoomPdfBlob } = await import('./roomExpenseExportPdf');
      blob = await generateRoomPdfBlob(dataset);
      break;
    }
    case 'csv': {
      const { generateRoomCsvBlob } = await import('./roomExpenseExportCsv');
      blob = generateRoomCsvBlob(dataset);
      break;
    }
    case 'xlsx': {
      const { generateRoomXlsxBlob } = await import('./roomExpenseExportXlsx');
      blob = await generateRoomXlsxBlob(dataset);
      break;
    }
  }

  filename = generateRoomFilename(dataset.roomName, dataset.monthLabel, format);
  await downloadRoomFile(blob, filename);
}

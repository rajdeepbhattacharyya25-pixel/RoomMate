/**
 * Room Excel (.xlsx) Export Generator
 *
 * Generates a structured multi-sheet Excel workbook using SheetJS (xlsx).
 * Sheet 1: Monthly Summary
 * Sheet 2: Shared Expenses
 * Sheet 3: Roommate Settlements
 * Sheet 4: Detailed Splits
 *
 * Dynamically imported to avoid bundle bloat on initial page load.
 */

import type { RoomExportDataset } from './roomExpenseExportService';

export async function generateRoomXlsxBlob(dataset: RoomExportDataset): Promise<Blob> {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // ═══════════════════════════════════════════════════════
  // Sheet 1 — Monthly Summary
  // ═══════════════════════════════════════════════════════
  const summary = dataset.summary;
  const summaryData = [
    ['RoomMate — Room Shared Expense Report'],
    [''],
    ['Room', dataset.roomName],
    ['Month', dataset.monthLabel],
    ['Report Generated For', dataset.currentUserName],
    ['Generated On', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
    [''],
    ['── Financial KPIs (INR) ──'],
    ['Total Shared Spending', summary.totalSharedSpending],
    ['My Assigned Share', summary.myShare],
    ['I Paid Out-of-Pocket', summary.iPaid],
    ['I Currently Owe', summary.iOwe],
    ['Others Owe Me', summary.othersOweMe],
    [''],
    ['── Bill Status Counts ──'],
    ['Total Shared Bills', summary.sharedBillsCount],
    ['Fully Settled Bills', summary.settledBillsCount],
    ['Partially Settled Bills', summary.partiallySettledBillsCount],
    ['Outstanding Settlements', summary.outstandingSettlementsCount],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // ═══════════════════════════════════════════════════════
  // Sheet 2 — Shared Expenses
  // ═══════════════════════════════════════════════════════
  const expenseHeaders = [
    'Date',
    'Expense Title',
    'Category',
    'Paid By',
    'Total Amount',
    'Split Method',
    'My Share',
    'Status',
  ];

  const expenseRows = dataset.expenses.map((exp) => {
    const mySplit = dataset.detailedSplits.find(
      (ds) => ds.expenseId === exp.id && ds.roommateId === dataset.currentUserId
    );
    return [
      (exp.expenseDate || exp.createdAt).split('T')[0],
      exp.title,
      exp.category,
      mySplit?.paidByName || 'Roommate',
      exp.totalAmount,
      exp.splitMethod,
      mySplit ? mySplit.shareAmount : '',
      mySplit ? mySplit.status : 'Not in Split',
    ];
  });

  const wsExpenses = XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseRows]);
  wsExpenses['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Shared Expenses');

  // ═══════════════════════════════════════════════════════
  // Sheet 3 — Roommate Settlements
  // ═══════════════════════════════════════════════════════
  const settlementHeaders = [
    'Roommate',
    'Total Paid for Bills',
    'Fair Share',
    'Settlements Paid',
    'Settlements Received',
    'Net Balance',
    'Status',
  ];

  const settlementRows = dataset.settlements.map((s) => [
    s.name,
    s.totalPaid,
    s.fairShare,
    s.settlementsPaid,
    s.settlementsReceived,
    s.netBalance,
    s.status,
  ]);

  const wsSettlements = XLSX.utils.aoa_to_sheet([settlementHeaders, ...settlementRows]);
  wsSettlements['!cols'] = [
    { wch: 24 },
    { wch: 20 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSettlements, 'Roommate Settlements');

  // ═══════════════════════════════════════════════════════
  // Sheet 4 — Detailed Splits
  // ═══════════════════════════════════════════════════════
  const splitHeaders = [
    'Date',
    'Expense Title',
    'Category',
    'Total Bill',
    'Paid By',
    'Roommate Name',
    'Roommate Share',
    'Paid Amount',
    'Remaining Amount',
    'Payment Status',
  ];

  const splitRows = dataset.detailedSplits.map((ds) => [
    ds.expenseDate.split('T')[0],
    ds.expenseTitle,
    ds.expenseCategory,
    ds.totalAmount,
    ds.paidByName,
    ds.roommateName,
    ds.shareAmount,
    ds.paidAmount,
    ds.remainingAmount,
    ds.status,
  ]);

  const wsSplits = XLSX.utils.aoa_to_sheet([splitHeaders, ...splitRows]);
  wsSplits['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSplits, 'Detailed Splits');

  // Write out binary workbook
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Room CSV Export Generator
 *
 * Generates a UTF-8 BOM CSV file optimized for Excel / Google Sheets analysis.
 * Contains Room Summary, Roommate Settlement Balances, and Detailed Itemized Splits.
 * Pure TypeScript / JavaScript — no heavy external dependencies.
 */

import type { RoomExportDataset } from './roomExpenseExportService';

function escapeCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function generateRoomCsvBlob(dataset: RoomExportDataset): Blob {
  const lines: string[] = [];

  // 1. Header Metadata Section
  lines.push(escapeCell('RoomMate — Room Shared Expense Report'));
  lines.push(`${escapeCell('Room:')},${escapeCell(dataset.roomName)}`);
  lines.push(`${escapeCell('Month:')},${escapeCell(dataset.monthLabel)}`);
  lines.push(`${escapeCell('Report Generated For:')},${escapeCell(dataset.currentUserName)}`);
  lines.push(`${escapeCell('Total Shared Spending (INR):')},${dataset.summary.totalSharedSpending}`);
  lines.push(`${escapeCell('My Assigned Share (INR):')},${dataset.summary.myShare}`);
  lines.push(`${escapeCell('I Paid Out-of-Pocket (INR):')},${dataset.summary.iPaid}`);
  lines.push(`${escapeCell('I Currently Owe (INR):')},${dataset.summary.iOwe}`);
  lines.push(`${escapeCell('Others Owe Me (INR):')},${dataset.summary.othersOweMe}`);
  lines.push(''); // Blank row separator

  // 2. Roommate Settlement Summary Table
  lines.push(escapeCell('--- ROOMMATE SETTLEMENT SUMMARY ---'));
  const settlementHeaders = ['Roommate', 'Total Paid for Bills (INR)', 'Fair Share (INR)', 'Settlements Paid (INR)', 'Settlements Received (INR)', 'Net Balance (INR)', 'Status'];
  lines.push(settlementHeaders.map(escapeCell).join(','));

  for (const s of dataset.settlements) {
    lines.push([
      s.name,
      String(s.totalPaid),
      String(s.fairShare),
      String(s.settlementsPaid),
      String(s.settlementsReceived),
      String(s.netBalance),
      s.status,
    ].map(escapeCell).join(','));
  }
  lines.push(''); // Blank row separator

  // 3. Itemized Roommate Splits Ledger Table
  lines.push(escapeCell('--- DETAILED EXPENSES & ROOMMATE SPLITS ---'));
  const splitHeaders = [
    'Date',
    'Room',
    'Expense ID',
    'Expense Title',
    'Category',
    'Total Bill (INR)',
    'Paid By',
    'Split Method',
    'Roommate Name',
    'Roommate Share (INR)',
    'Roommate Paid (INR)',
    'Roommate Outstanding (INR)',
    'Payment Status',
  ];
  lines.push(splitHeaders.map(escapeCell).join(','));

  if (dataset.detailedSplits.length > 0) {
    for (const ds of dataset.detailedSplits) {
      lines.push([
        ds.expenseDate.split('T')[0],
        dataset.roomName,
        ds.expenseId,
        ds.expenseTitle,
        ds.expenseCategory,
        String(ds.totalAmount),
        ds.paidByName,
        ds.splitMethod,
        ds.roommateName,
        String(ds.shareAmount),
        String(ds.paidAmount),
        String(ds.remainingAmount),
        ds.status,
      ].map(escapeCell).join(','));
    }
  } else {
    // If no expenses, keep headers and add informational row
    lines.push([
      '',
      dataset.roomName,
      '',
      'No shared expenses recorded for this month',
      '',
      '0',
      '',
      '',
      '',
      '0',
      '0',
      '0',
      'Settled',
    ].map(escapeCell).join(','));
  }

  const csvContent = lines.join('\r\n');

  // UTF-8 BOM for Microsoft Excel / Numbers
  const BOM = '\uFEFF';
  return new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
}

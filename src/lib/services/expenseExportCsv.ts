/**
 * CSV Export Generator
 *
 * Generates a UTF-8 BOM CSV file optimized for spreadsheet usage.
 * Pure JavaScript — no external dependencies.
 */

import type { ExportDataset } from './expenseExportService';

export function generateCsvBlob(dataset: ExportDataset): Blob {
  const headers = [
    'Date',
    'Time',
    'Description',
    'Category',
    'Expense Type',
    'Amount',
    'Shared Total',
    'My Share',
    'Paid By',
    'Payment Status',
  ];

  const rows: string[][] = [];

  for (const t of dataset.transactions) {
    rows.push([
      t.date,
      t.time,
      t.description,
      t.category,
      t.expenseType,
      String(t.amount),
      t.sharedTotal != null ? String(t.sharedTotal) : '',
      t.myShare != null ? String(t.myShare) : '',
      t.paidBy || '',
      t.paymentStatus || '',
    ]);
  }

  // Build CSV string
  const csvLines: string[] = [];
  csvLines.push(headers.map(escapeCell).join(','));

  for (const row of rows) {
    csvLines.push(row.map(escapeCell).join(','));
  }

  const csvString = csvLines.join('\r\n');

  // UTF-8 BOM for Excel to detect encoding correctly
  const BOM = '\uFEFF';
  return new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8' });
}

/**
 * Escape a CSV cell value:
 * - Wrap in quotes if it contains comma, quote, or newline
 * - Double any existing quotes
 */
function escapeCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

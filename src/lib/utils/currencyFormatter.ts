/**
 * RoomMate Indian Currency & Formatter Utilities
 * Provides standard Indian Numbering system formatting (Lakhs / Crores)
 * as well as relative dates and table data export.
 */

export function formatInr(amount: number, compact = false): string {
  if (isNaN(amount)) return '₹0';
  
  if (compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 10000000) {
      const val = abs / 10000000;
      return `${sign}₹${val >= 10 ? val.toFixed(1) : val.toFixed(2)}Cr`;
    }
    if (abs >= 100000) {
      const val = abs / 100000;
      return `${sign}₹${val >= 10 ? val.toFixed(1) : val.toFixed(2)}L`;
    }
    if (abs >= 1000) {
      const val = abs / 1000;
      return `${sign}₹${val.toFixed(1)}K`;
    }
    return `${sign}₹${abs.toLocaleString('en-IN')}`;
  }

  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatInrExact(amount: number): string {
  if (isNaN(amount)) return '₹0.00';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Never';
  const timestamp = new Date(isoString).getTime();
  if (isNaN(timestamp)) return 'Invalid date';

  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'Just now';
  if (diffSec < 90) return '1 min ago';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mins ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function formatFullDateTime(isoString?: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function exportToCsv(filename: string, data: Record<string, unknown>[]): void {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  // Header row
  csvRows.push(headers.join(','));

  // Data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const val = row[header];
      if (val === null || val === undefined) return '""';
      const escaped = String(val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToJson(filename: string, data: unknown): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

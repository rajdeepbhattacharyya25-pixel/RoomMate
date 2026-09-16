/**
 * PDF Export Generator
 *
 * Generates a professionally formatted PDF expense report using jsPDF + autoTable.
 * Dynamically imported to avoid bundle bloat on initial page load.
 */

import type { ExportDataset } from './expenseExportService';

export async function generatePdfBlob(dataset: ExportDataset): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  if (typeof (autoTableModule as any).applyPlugin === 'function') {
    (autoTableModule as any).applyPlugin(jsPDF);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Colors ──
  const purple = [79, 70, 229] as const;     // indigo-600
  const darkText = [15, 23, 42] as const;    // slate-900
  const medText = [71, 85, 105] as const;    // slate-500
  const lightBg = [248, 250, 252] as const;  // slate-50

  // ── Helper: check page overflow ──
  const checkPageBreak = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      y = margin;
    }
  };

  // ═══════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════
  doc.setFontSize(20);
  doc.setTextColor(...purple);
  doc.setFont('helvetica', 'bold');
  doc.text('RoomMate', margin, y + 7);

  doc.setFontSize(10);
  doc.setTextColor(...medText);
  doc.setFont('helvetica', 'normal');
  doc.text('Personal Expense Report', margin, y + 13);

  doc.setFontSize(14);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text(dataset.monthLabel, margin, y + 22);

  // Separator line
  y += 27;
  doc.setDrawColor(...purple);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ═══════════════════════════════════════════════════════
  // SUMMARY SECTION
  // ═══════════════════════════════════════════════════════
  checkPageBreak(55);

  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', margin, y);
  y += 7;

  const formatINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const summaryRows = [
    ['Personal Spending', formatINR(dataset.totalPersonalSpending)],
    ['Shared Expenses', formatINR(dataset.totalSharedContribution)],
    ['Total Spending', formatINR(dataset.totalOverallSpending)],
    ['', ''],
    ['Monthly Budget', formatINR(dataset.monthlyBudget)],
    ['Budget Used', `${dataset.budgetUsedPercent}%`],
    ['Remaining Budget', formatINR(dataset.remainingBudget)],
    ['', ''],
    ['Average Daily Spend', formatINR(dataset.avgDailySpending)],
    ...(dataset.safeDailyLimit > 0 ? [['Safe Daily Limit', `${formatINR(dataset.safeDailyLimit)}/day`]] : []),
    ['Total Transactions', String(dataset.transactionCount)],
  ].filter(([a]) => a !== '' || true); // keep spacers

  for (const [label, value] of summaryRows) {
    if (label === '' && value === '') {
      y += 2;
      continue;
    }
    checkPageBreak(6);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...medText);
    doc.text(label, margin + 2, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkText);
    doc.text(value, margin + contentWidth - 2, y, { align: 'right' });
    y += 5;
  }

  y += 5;

  // ═══════════════════════════════════════════════════════
  // CATEGORY BREAKDOWN
  // ═══════════════════════════════════════════════════════
  checkPageBreak(30);

  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text('Category Breakdown', margin, y);
  y += 3;

  const catRows = dataset.categoryBreakdown
    .filter((c) => c.spent > 0 || c.cap > 0)
    .map((c) => [
      c.name,
      formatINR(c.spent),
      c.cap > 0 ? formatINR(c.cap) : '—',
      c.cap > 0 ? `${c.percentUsed}%` : '—',
      c.status,
    ]);

  if (catRows.length > 0) {
    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Category', 'Spent', 'Target', '% Used', 'Status']],
      body: catRows,
      theme: 'grid',
      headStyles: {
        fillColor: purple as unknown as number[],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: darkText as unknown as number[],
      },
      alternateRowStyles: {
        fillColor: lightBg as unknown as number[],
      },
      columnStyles: {
        0: { cellWidth: 30 },
        4: { fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  } else {
    y += 3;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...medText);
    doc.text('No category spending recorded this month.', margin + 2, y);
  }

  y += 10;

  // ═══════════════════════════════════════════════════════
  // TRANSACTION HISTORY
  // ═══════════════════════════════════════════════════════
  checkPageBreak(20);

  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text('Transaction History', margin, y);
  y += 3;

  if (dataset.transactions.length > 0) {
    const txnRows = dataset.transactions.map((t) => [
      t.date.split(' ').slice(0, 2).join(' '),
      t.description,
      t.category,
      t.expenseType,
      formatINR(t.amount),
    ]);

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Description', 'Category', 'Type', 'Amount']],
      body: txnRows,
      theme: 'grid',
      headStyles: {
        fillColor: purple as unknown as number[],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: darkText as unknown as number[],
      },
      alternateRowStyles: {
        fillColor: lightBg as unknown as number[],
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 50 },
        4: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  } else {
    y += 3;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...medText);
    doc.text('No expenses recorded this month.', margin + 2, y);
    y += 7;
    doc.setFontSize(9);
    doc.text(`Total Spending: ₹0`, margin + 2, y);
    y += 5;
    doc.text(`Budget: ${formatINR(dataset.monthlyBudget)}`, margin + 2, y);
    y += 5;
    doc.text(`Remaining: ${formatINR(dataset.monthlyBudget)}`, margin + 2, y);
  }

  y += 10;

  // ═══════════════════════════════════════════════════════
  // SHARED EXPENSES DETAIL (if any)
  // ═══════════════════════════════════════════════════════
  if (dataset.sharedContributions.length > 0) {
    checkPageBreak(25);

    doc.setFontSize(12);
    doc.setTextColor(...darkText);
    doc.setFont('helvetica', 'bold');
    doc.text('Shared Expenses', margin, y);
    y += 3;

    const sharedRows = dataset.sharedContributions.map((sc) => [
      sc.title,
      formatINR(sc.totalAmount),
      formatINR(sc.myShare),
      sc.paidByName,
      sc.paidByMe ? 'I Paid' : 'Owed',
    ]);

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Title', 'Total', 'My Share', 'Paid By', 'Status']],
      body: sharedRows,
      theme: 'grid',
      headStyles: {
        fillColor: purple as unknown as number[],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: darkText as unknown as number[],
      },
      alternateRowStyles: {
        fillColor: lightBg as unknown as number[],
      },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
    y += 8;

    // Settlement summary
    checkPageBreak(25);
    doc.setFontSize(11);
    doc.setTextColor(...darkText);
    doc.setFont('helvetica', 'bold');
    doc.text('Settlement Summary', margin, y);
    y += 6;

    const settleRows = [
      ['Amount I Need To Pay', formatINR(dataset.settlementSummary.totalIOwe)],
      ['Amount Others Owe Me', formatINR(dataset.settlementSummary.totalOwedToMe)],
      ['Settled', formatINR(dataset.settlementSummary.totalSettled)],
      ['Outstanding', formatINR(dataset.settlementSummary.totalOutstanding)],
    ];

    for (const [label, value] of settleRows) {
      checkPageBreak(6);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...medText);
      doc.text(label, margin + 2, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkText);
      doc.text(value, margin + contentWidth - 2, y, { align: 'right' });
      y += 5;
    }
  }

  // ═══════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);

    const genDate = new Date().toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    doc.text(
      `Generated on ${genDate} • This report is private to ${dataset.userName}`,
      margin,
      footerY
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY, { align: 'right' });
  }

  return doc.output('blob');
}

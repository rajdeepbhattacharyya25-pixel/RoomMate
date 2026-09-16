/**
 * Room PDF Export Generator
 *
 * Generates a professionally formatted Room Shared Expense Report using jsPDF + autoTable.
 * Dynamically imported to avoid bundle bloat on initial page load.
 */

import type { RoomExportDataset } from './roomExpenseExportService';

export async function generateRoomPdfBlob(dataset: RoomExportDataset): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  if (typeof (autoTableModule as any).applyPlugin === 'function') {
    (autoTableModule as any).applyPlugin(jsPDF);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Colors ──
  const indigo = [79, 70, 229] as const;     // indigo-600
  const darkText = [15, 23, 42] as const;    // slate-900
  const medText = [71, 85, 105] as const;    // slate-500
  const lightBg = [248, 250, 252] as const;  // slate-50

  const formatINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  // ── Helper: check page overflow ──
  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = margin;
    }
  };

  // ═══════════════════════════════════════════════════════
  // 1. BRANDED HEADER
  // ═══════════════════════════════════════════════════════
  doc.setFontSize(22);
  doc.setTextColor(...indigo);
  doc.setFont('helvetica', 'bold');
  doc.text('RoomMate', margin, y + 7);

  doc.setFontSize(10);
  doc.setTextColor(...medText);
  doc.setFont('helvetica', 'normal');
  doc.text('Room Shared Expense Report', margin, y + 13);

  doc.setFontSize(14);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text(`${dataset.roomName} • ${dataset.monthLabel}`, margin, y + 22);

  // Generation metadata on the right
  const now = new Date();
  const genDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const genTimeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...medText);
  doc.text(`Generated for: ${dataset.currentUserName}`, pageWidth - margin, y + 13, { align: 'right' });
  doc.text(`Generated on: ${genDateStr} at ${genTimeStr}`, pageWidth - margin, y + 18, { align: 'right' });
  doc.text(`Strictly Private Room Ledger`, pageWidth - margin, y + 23, { align: 'right' });

  // Divider Line
  y += 27;
  doc.setDrawColor(...indigo);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ═══════════════════════════════════════════════════════
  // 2. MONTHLY SUMMARY (EXECUTIVE KPI BOX)
  // ═══════════════════════════════════════════════════════
  checkPageBreak(50);

  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text('Room Monthly Summary', margin, y);
  y += 6;

  const summary = dataset.summary;
  const summaryRows: [string, string][] = [
    ['Total Shared Spending', formatINR(summary.totalSharedSpending)],
    ['My Assigned Share', formatINR(summary.myShare)],
    ['I Paid Out-of-Pocket', formatINR(summary.iPaid)],
    ['I Currently Owe', formatINR(summary.iOwe)],
    ['Others Owe Me', formatINR(summary.othersOweMe)],
    ['Total Shared Bills', String(summary.sharedBillsCount)],
    ['Fully Settled Bills', String(summary.settledBillsCount)],
    ['Partially Settled Bills', String(summary.partiallySettledBillsCount)],
    ['Outstanding Settlements', String(summary.outstandingSettlementsCount)],
  ];

  for (const [label, value] of summaryRows) {
    checkPageBreak(6);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...medText);
    doc.text(label, margin + 2, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkText);
    doc.text(value, margin + contentWidth - 2, y, { align: 'right' });
    y += 5;
  }

  y += 6;

  // ═══════════════════════════════════════════════════════
  // 3. ROOMMATE SETTLEMENT SUMMARY TABLE
  // ═══════════════════════════════════════════════════════
  checkPageBreak(35);

  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text('Roommate Settlement Breakdown', margin, y);
  y += 4;

  const settlementRows = dataset.settlements.map((s) => {
    const netBalStr = s.netBalance > 0
      ? `+${formatINR(s.netBalance)}`
      : s.netBalance < 0
      ? `-${formatINR(Math.abs(s.netBalance))}`
      : '₹0';
    return [
      s.name,
      formatINR(s.totalPaid),
      formatINR(s.fairShare),
      netBalStr,
      s.status,
    ];
  });

  (doc as any).autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Roommate', 'Paid (Bills)', 'Fair Share', 'Net Balance', 'Status']],
    body: settlementRows,
    theme: 'grid',
    headStyles: {
      fillColor: indigo as unknown as number[],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: darkText as unknown as number[],
    },
    alternateRowStyles: {
      fillColor: lightBg as unknown as number[],
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'center', fontStyle: 'bold' },
    },
  });

  y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  y += 10;

  // ═══════════════════════════════════════════════════════
  // 4. SHARED EXPENSES HISTORY
  // ═══════════════════════════════════════════════════════
  checkPageBreak(30);

  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text('Shared Expenses History', margin, y);
  y += 4;

  if (dataset.expenses.length > 0) {
    const expenseRows = dataset.expenses.map((exp) => {
      const mySplit = dataset.detailedSplits.find(
        (ds) => ds.expenseId === exp.id && ds.roommateId === dataset.currentUserId
      );
      const myShareStr = mySplit ? formatINR(mySplit.shareAmount) : '—';
      const myStatusStr = mySplit ? mySplit.status : 'Not in Split';

      const d = new Date(exp.expenseDate || exp.createdAt);
      const dateStr = !isNaN(d.getTime())
        ? `${String(d.getDate()).padStart(2, '0')} ${dataset.monthLabel.substring(0, 3)}`
        : '';

      return [
        dateStr,
        exp.title,
        exp.category,
        mySplit?.paidByName || 'Roommate',
        formatINR(exp.totalAmount),
        exp.splitMethod,
        myShareStr,
        myStatusStr,
      ];
    });

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Expense', 'Category', 'Paid By', 'Total', 'Split', 'My Share', 'My Status']],
      body: expenseRows,
      theme: 'grid',
      headStyles: {
        fillColor: indigo as unknown as number[],
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
        0: { cellWidth: 18 },
        1: { cellWidth: 40 },
        4: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' },
        7: { halign: 'center', fontStyle: 'bold' },
      },
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  } else {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...medText);
    doc.text(`No shared expenses were recorded for ${dataset.monthLabel}.`, margin + 2, y + 2);
    y += 10;
  }

  y += 10;

  // ═══════════════════════════════════════════════════════
  // 5. DETAILED ROOMMATE SPLITS (ITEMIZED AUDIT LEDGER)
  // ═══════════════════════════════════════════════════════
  if (dataset.detailedSplits.length > 0) {
    checkPageBreak(35);

    doc.setFontSize(12);
    doc.setTextColor(...darkText);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed Roommate Splits Ledger', margin, y);
    y += 4;

    const splitRows = dataset.detailedSplits.map((ds) => {
      const d = new Date(ds.expenseDate);
      const dateStr = !isNaN(d.getTime())
        ? `${String(d.getDate()).padStart(2, '0')} ${dataset.monthLabel.substring(0, 3)}`
        : '';
      return [
        dateStr,
        ds.expenseTitle,
        ds.roommateName,
        formatINR(ds.shareAmount),
        formatINR(ds.paidAmount),
        formatINR(ds.remainingAmount),
        ds.status,
      ];
    });

    (doc as any).autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Date', 'Expense', 'Roommate', 'Share', 'Paid', 'Remaining', 'Status']],
      body: splitRows,
      theme: 'grid',
      headStyles: {
        fillColor: indigo as unknown as number[],
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
        0: { cellWidth: 18 },
        1: { cellWidth: 40 },
        2: { cellWidth: 35 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'center', fontStyle: 'bold' },
      },
    });

    y = (doc as any).lastAutoTable?.finalY ?? y + 30;
  }

  // ═══════════════════════════════════════════════════════
  // 6. RUNNING FOOTER ON ALL PAGES
  // ═══════════════════════════════════════════════════════
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...medText);
    doc.setFont('helvetica', 'normal');

    // Left footer
    doc.text(
      `RoomMate • ${dataset.roomName} • Shared Expenses • Confidential Room Ledger`,
      margin,
      pageHeight - 8
    );

    // Right footer
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: 'right' }
    );
  }

  return doc.output('blob');
}

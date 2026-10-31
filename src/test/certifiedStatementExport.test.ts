import { describe, it, expect } from 'vitest';
import { generateRoomPdfBlob } from '../lib/services/roomExpenseExportPdf';
import { generateRoomXlsxBlob } from '../lib/services/roomExpenseExportXlsx';
import { generateRoomCsvBlob } from '../lib/services/roomExpenseExportCsv';
import { RoomExportDataset } from '../lib/services/roomExpenseExportService';
import { validateFileHeader } from '../lib/services/fileDownloadService';

describe('Certified Statement Export (Track 4)', () => {
  const mockDataset: RoomExportDataset = {
    roomId: 'room-101',
    roomName: 'Apartment 4B',
    month: 9, // October (0-indexed)
    year: 2026,
    monthLabel: 'October 2026',
    currentUserId: 'user-1',
    currentUserName: 'Aditya (Admin)',
    summary: {
      totalSharedSpending: 12500,
      myShare: 4166.67,
      iPaid: 8000,
      iOwe: 0,
      othersOweMe: 3833.33,
      sharedBillsCount: 4,
      settledBillsCount: 2,
      partiallySettledBillsCount: 2,
      outstandingSettlementsCount: 1,
    },
    settlements: [
      {
        userId: 'user-1',
        name: 'Aditya (Admin)',
        totalPaid: 8000,
        fairShare: 4166.67,
        settlementsPaid: 0,
        settlementsReceived: 2000,
        netBalance: 1833.33,
        status: 'Receive',
      },
      {
        userId: 'user-2',
        name: 'Priya',
        totalPaid: 4500,
        fairShare: 4166.67,
        settlementsPaid: 1000,
        settlementsReceived: 0,
        netBalance: 1333.33,
        status: 'Receive',
      },
      {
        userId: 'user-3',
        name: 'Rahul',
        totalPaid: 0,
        fairShare: 4166.66,
        settlementsPaid: 1000,
        settlementsReceived: 0,
        netBalance: -3166.66,
        status: 'Pay',
      },
    ],
    expenses: [
      {
        id: 'exp-1',
        roomId: 'room-101',
        createdBy: 'user-1',
        paidBy: 'user-1',
        title: 'October Wi-Fi Fiber',
        totalAmount: 1500,
        category: 'Wi-Fi',
        splitMethod: 'EQUAL',
        expenseDate: '2026-10-02T10:00:00Z',
        isDeleted: false,
        createdAt: '2026-10-02T10:00:00Z',
        updatedAt: '2026-10-02T10:00:00Z',
      },
      {
        id: 'exp-2',
        roomId: 'room-101',
        createdBy: 'user-1',
        paidBy: 'user-1',
        title: 'Groceries & Milk',
        totalAmount: 6500,
        category: 'Groceries',
        splitMethod: 'EQUAL',
        expenseDate: '2026-10-10T12:00:00Z',
        isDeleted: false,
        createdAt: '2026-10-10T12:00:00Z',
        updatedAt: '2026-10-10T12:00:00Z',
      },
      {
        id: 'exp-3',
        roomId: 'room-101',
        createdBy: 'user-2',
        paidBy: 'user-2',
        title: 'Electricity Bill',
        totalAmount: 4500,
        category: 'Electricity',
        splitMethod: 'EQUAL',
        expenseDate: '2026-10-15T16:00:00Z',
        isDeleted: false,
        createdAt: '2026-10-15T16:00:00Z',
        updatedAt: '2026-10-15T16:00:00Z',
      },
    ],
    detailedSplits: [
      {
        expenseId: 'exp-1',
        expenseTitle: 'October Wi-Fi Fiber',
        expenseCategory: 'Wi-Fi',
        expenseDate: '2026-10-02T10:00:00Z',
        totalAmount: 1500,
        paidById: 'user-1',
        paidByName: 'Aditya (Admin)',
        splitMethod: 'EQUAL',
        roommateId: 'user-1',
        roommateName: 'Aditya (Admin)',
        shareAmount: 500,
        paidAmount: 500,
        remainingAmount: 0,
        status: 'Settled',
      },
      {
        expenseId: 'exp-1',
        expenseTitle: 'October Wi-Fi Fiber',
        expenseCategory: 'Wi-Fi',
        expenseDate: '2026-10-02T10:00:00Z',
        totalAmount: 1500,
        paidById: 'user-1',
        paidByName: 'Aditya (Admin)',
        splitMethod: 'EQUAL',
        roommateId: 'user-2',
        roommateName: 'Priya',
        shareAmount: 500,
        paidAmount: 500,
        remainingAmount: 0,
        status: 'Settled',
      },
      {
        expenseId: 'exp-1',
        expenseTitle: 'October Wi-Fi Fiber',
        expenseCategory: 'Wi-Fi',
        expenseDate: '2026-10-02T10:00:00Z',
        totalAmount: 1500,
        paidById: 'user-1',
        paidByName: 'Aditya (Admin)',
        splitMethod: 'EQUAL',
        roommateId: 'user-3',
        roommateName: 'Rahul',
        shareAmount: 500,
        paidAmount: 0,
        remainingAmount: 500,
        status: 'Outstanding',
      },
    ],
    reconciliation: {
      isCertified: true,
      sealHash: 'a9f24c8b0e7d56a123fbc9102837465abcde1234567890abcdef1234567890ab',
      period: {
        id: 'period-room-101-2026-10',
        roomId: 'room-101',
        periodYear: 2026,
        periodMonth: 10,
        status: 'CERTIFIED',
        lockedAt: '2026-10-31T18:00:00Z',
        lockedBy: 'user-1',
        revisionCount: 1,
        certifiedAt: '2026-10-31T20:00:00Z',
        certifiedSealHash: 'a9f24c8b0e7d56a123fbc9102837465abcde1234567890abcdef1234567890ab',
        createdAt: '2026-10-31T18:00:00Z',
        updatedAt: '2026-10-31T20:00:00Z',
      },
      signoffs: [
        {
          id: 'sign-1',
          periodId: 'period-room-101-2026-10',
          roomId: 'room-101',
          userId: 'user-1',
          userName: 'Aditya (Admin)',
          status: 'SIGNED',
          signedAt: '2026-10-31T18:30:00Z',
          signatureStamp: 'STAMP-USER1-1234',
          createdAt: '2026-10-31T18:00:00Z',
          updatedAt: '2026-10-31T18:30:00Z',
        },
        {
          id: 'sign-2',
          periodId: 'period-room-101-2026-10',
          roomId: 'room-101',
          userId: 'user-2',
          userName: 'Priya',
          status: 'SIGNED',
          signedAt: '2026-10-31T19:00:00Z',
          signatureStamp: 'STAMP-USER2-5678',
          createdAt: '2026-10-31T18:00:00Z',
          updatedAt: '2026-10-31T19:00:00Z',
        },
        {
          id: 'sign-3',
          periodId: 'period-room-101-2026-10',
          roomId: 'room-101',
          userId: 'user-3',
          userName: 'Rahul',
          status: 'SIGNED',
          signedAt: '2026-10-31T20:00:00Z',
          signatureStamp: 'STAMP-USER3-9012',
          createdAt: '2026-10-31T18:00:00Z',
          updatedAt: '2026-10-31T20:00:00Z',
        },
      ],
    },
  };

  it('generates certified PDF with valid %PDF- header and non-empty size', async () => {
    const pdfBlob = await generateRoomPdfBlob(mockDataset);
    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.size).toBeGreaterThan(1000);

    const isValidPdf = await validateFileHeader(pdfBlob, 'pdf');
    expect(isValidPdf).toBe(true);
  });

  it('generates certified Excel workbook with valid PK\\x03\\x04 zip header', async () => {
    const xlsxBlob = await generateRoomXlsxBlob(mockDataset);
    expect(xlsxBlob).toBeDefined();
    expect(xlsxBlob.size).toBeGreaterThan(1000);

    const isValidXlsx = await validateFileHeader(xlsxBlob, 'xlsx');
    expect(isValidXlsx).toBe(true);

    // Verify Audit Certificate sheet exists
    const XLSX = await import('xlsx');
    const buffer = await xlsxBlob.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Audit Certificate');
    expect(wb.SheetNames).toContain('Summary');
    expect(wb.SheetNames).toContain('Shared Expenses');
    expect(wb.SheetNames).toContain('Roommate Settlements');
  });

  it('generates CSV report with valid content', () => {
    const csvBlob = generateRoomCsvBlob(mockDataset);
    expect(csvBlob).toBeDefined();
    expect(csvBlob.size).toBeGreaterThan(100);
  });
});

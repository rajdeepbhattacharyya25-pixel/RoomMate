import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  validateFileHeader,
  saveFileToDevice,
} from '../lib/services/fileDownloadService';

describe('fileDownloadService', () => {
  it('formats file sizes accurately', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('validates PDF magic bytes correctly (%PDF-)', async () => {
    // Valid PDF starts with %PDF-
    const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const validPdfBlob = new Blob([pdfData], { type: 'application/pdf' });
    const isPdfValid = await validateFileHeader(validPdfBlob, 'pdf');
    expect(isPdfValid).toBe(true);

    // Corrupted PDF
    const invalidPdfData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const invalidPdfBlob = new Blob([invalidPdfData], { type: 'application/pdf' });
    const isInvalid = await validateFileHeader(invalidPdfBlob, 'pdf');
    expect(isInvalid).toBe(false);
  });

  it('validates Excel XLSX magic bytes correctly (PK\\x03\\x04)', async () => {
    // Valid ZIP/XLSX starts with PK\x03\x04
    const xlsxData = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    const validXlsxBlob = new Blob([xlsxData], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const isXlsxValid = await validateFileHeader(validXlsxBlob, 'xlsx');
    expect(isXlsxValid).toBe(true);
  });

  it('saves file via browser anchor in web environment', async () => {
    const fakeBlob = new Blob(['RoomMate Audit Data'], { type: 'text/plain' });
    const result = await saveFileToDevice({
      blob: fakeBlob,
      filename: 'test-audit.txt',
    });

    expect(result.success).toBe(true);
    expect(result.destination).toBe('BROWSER_DOWNLOAD');
    expect(result.fileSizeBytes).toBe(fakeBlob.size);
  });

  it('converts blob to base64 correctly', async () => {
    const { blobToBase64 } = await import('../lib/services/fileDownloadService');
    const testBlob = new Blob(['Hello RoomMate'], { type: 'text/plain' });
    const base64 = await blobToBase64(testBlob);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);
  });
});

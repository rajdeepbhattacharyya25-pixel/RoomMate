import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  scanAndParseReceipt,
  setMockTesseractRecognizer,
  terminateWorker,
} from '../../lib/ocr/tesseractService';

describe('Phase 1: Tesseract OCR Service & Background Worker Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    setMockTesseractRecognizer(null);
    await terminateWorker();
  });

  it('runs full scan pipeline with progress reports and structured extraction', async () => {
    const mockReceiptText = `
      D-Mart Hypermarket
      Date: 26/10/2026

      Basmati Rice 5kg 450.00
      Toor Dal 1kg 160.00
      Sugar 1kg 45.00

      Sub Total: 655.00
      Total: 655.00
    `;

    // Inject mock recognizer for deterministic testing
    setMockTesseractRecognizer(async () => ({
      text: mockReceiptText,
      confidence: 92,
    }));

    const progressUpdates: Array<{ progress: number; status: string }> = [];

    const result = await scanAndParseReceipt('data:image/jpeg;base64,sampleFakeImage', (p) => {
      progressUpdates.push(p);
    });

    expect(result.ocrConfidence).toBe(92);
    expect(result.parsedData.vendor).toBe('D-Mart Hypermarket');
    expect(result.parsedData.date).toBe('2026-10-26');
    expect(result.parsedData.items.length).toBe(3);
    expect(result.parsedData.totalPaise).toBe(65500);

    // Verify progress progression
    expect(progressUpdates.length).toBeGreaterThanOrEqual(3);
    expect(progressUpdates[0].progress).toBe(5);
    expect(progressUpdates[progressUpdates.length - 1].progress).toBe(100);
  });

  it('safely handles OCR recognition errors without crashing', async () => {
    setMockTesseractRecognizer(async () => {
      throw new Error('WebAssembly memory allocation failure');
    });

    await expect(
      scanAndParseReceipt('data:image/jpeg;base64,invalid')
    ).rejects.toThrow('WebAssembly memory allocation failure');
  });
});

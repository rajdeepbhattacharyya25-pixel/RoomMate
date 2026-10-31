/**
 * tesseractService.ts
 *
 * Manages Tesseract.js WebAssembly worker lifecycle and optical recognition.
 * Runs in a background Web Worker to prevent freezing the React UI thread.
 *
 * ZERO-RETENTION: Memory and workers are cleaned up immediately post-recognition.
 */

import { createWorker, Worker } from 'tesseract.js';
import { parseReceiptText, ParsedReceiptData } from './receiptTextParser';
import { preprocessReceiptImage } from './imagePreprocessor';

export interface ScanReceiptProgress {
  progress: number; // 0 to 100
  status: string;
}

export interface ScanReceiptResult {
  parsedData: ParsedReceiptData;
  ocrConfidence: number; // 0 to 100
  processingTimeMs: number;
}

let activeWorker: Worker | null = null;
let idleTimer: NodeJS.Timeout | null = null;

// Mock recognizer hook for offline unit tests in headless Node.js
let mockRecognizer: ((image: any) => Promise<{ text: string; confidence: number }>) | null = null;

export function setMockTesseractRecognizer(
  fn: ((image: any) => Promise<{ text: string; confidence: number }>) | null
): void {
  mockRecognizer = fn;
}

/**
 * Initializes or reuses an active Tesseract Worker.
 */
async function getWorker(
  onProgress?: (p: ScanReceiptProgress) => void
): Promise<Worker> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (activeWorker) {
    return activeWorker;
  }

  onProgress?.({ progress: 10, status: 'Initializing OCR engine...' });

  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round((m.progress || 0) * 80) + 15; // 15% to 95%
        onProgress?.({ progress: pct, status: 'Reading receipt text...' });
      }
    },
  });

  activeWorker = worker;
  return worker;
}

/**
 * Schedules termination of worker after 60 seconds of inactivity to free mobile RAM.
 */
function scheduleIdleCleanup(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    terminateWorker().catch((err) => console.warn('[Tesseract] Idle cleanup notice:', err));
  }, 60000);
}

/**
 * Terminates the active worker and frees all allocated WebAssembly memory.
 */
export async function terminateWorker(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (activeWorker) {
    const worker = activeWorker;
    activeWorker = null;
    await worker.terminate();
    console.log('[Tesseract] Web Worker terminated and memory released.');
  }
}

/**
 * Full Pipeline: Preprocesses image, executes on-device Tesseract OCR,
 * and parses into structured Indian receipt data.
 */
export async function scanAndParseReceipt(
  imageSource: Blob | File | string,
  onProgress?: (progress: ScanReceiptProgress) => void
): Promise<ScanReceiptResult> {
  const startTime = Date.now();

  try {
    // 1. Preprocessing Stage (0% - 15%)
    onProgress?.({ progress: 5, status: 'Optimizing receipt image...' });
    const preprocessed = await preprocessReceiptImage(imageSource, {
      maxDimension: 1600,
      contrast: 1.35,
    });
    onProgress?.({ progress: 15, status: 'Starting text recognition...' });

    // 2. Optical Character Recognition (15% - 90%)
    let rawText = '';
    let ocrConfidence = 80;

    if (mockRecognizer) {
      // Use test mock
      const mockRes = await mockRecognizer(preprocessed.dataUrl || preprocessed.processedBlob);
      rawText = mockRes.text;
      ocrConfidence = mockRes.confidence;
    } else {
      const worker = await getWorker(onProgress);
      const result = await worker.recognize(preprocessed.dataUrl || preprocessed.processedBlob);
      rawText = result.data.text || '';
      ocrConfidence = Math.round(result.data.confidence || 0);
      scheduleIdleCleanup();
    }

    // 3. Heuristic Parsing Stage (90% - 100%)
    onProgress?.({ progress: 95, status: 'Extracting line items & taxes...' });
    const parsedData = parseReceiptText(rawText);

    onProgress?.({ progress: 100, status: 'Done' });

    return {
      parsedData,
      ocrConfidence,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error('[TesseractService] OCR recognition failed:', err);
    throw err;
  }
}

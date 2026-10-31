import { describe, it, expect } from 'vitest';
import { preprocessReceiptImage } from '../../lib/ocr/imagePreprocessor';

describe('Phase 1: Image Preprocessor', () => {
  it('returns valid result object in node test environment without throwing', async () => {
    const fakeBlob = new Blob(['fake image bytes'], { type: 'image/jpeg' });
    const result = await preprocessReceiptImage(fakeBlob, {
      maxDimension: 1200,
      contrast: 1.4,
    });

    expect(result).toBeDefined();
    expect(result.processedBlob).toBeDefined();
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});

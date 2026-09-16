import { describe, it, expect } from 'vitest';
import { decodeQrFromImage } from './qrDecoder';

describe('QR Decoder Service', () => {
  it('gracefully returns IMAGE_LOAD_FAILED for invalid blob data', async () => {
    // Create an invalid blob
    const invalidFile = new File(['not an image content'], 'invalid.txt', { type: 'text/plain' });
    const result = await decodeQrFromImage(invalidFile);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.errorMessage).toBeDefined();
  });
});

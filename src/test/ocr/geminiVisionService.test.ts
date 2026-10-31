import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseReceiptWithGemini, fileToBase64 } from '../../lib/ocr/geminiVisionService';
import { supabase } from '../../lib/supabase/client';

// Mock Supabase client
vi.mock('../../lib/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('geminiVisionService (Cloud AI Fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly converts Blob to base64 DataURL', async () => {
    const blob = new Blob(['hello receipt'], { type: 'text/plain' });
    const base64 = await fileToBase64(blob);
    expect(base64).toMatch(/^data:text\/plain;base64,/);
  });

  it('successfully invokes parse-receipt-gemini edge function and returns parsed data', async () => {
    const mockResponseData = {
      vendor: 'Zepto Groceries',
      date: '2026-03-20',
      items: [
        {
          id: 'ai_item_1',
          name: 'Amul Taaza Milk 1L',
          quantity: 2,
          unitPricePaise: 3300,
          totalPricePaise: 6600,
          confidence: 'HIGH',
          rawLine: 'Amul Taaza Milk 1L 66.00',
        },
      ],
      subtotalPaise: 6600,
      taxPaise: 330,
      deliveryPaise: 1500,
      discountPaise: 500,
      totalPaise: 7930,
      confidence: 'HIGH',
      rawText: 'Zepto Groceries\nAmul Taaza Milk 1L 66.00',
    };

    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: mockResponseData,
      error: null,
    } as any);

    const fakeImage = new Blob(['fake image bytes'], { type: 'image/jpeg' });
    const result = await parseReceiptWithGemini(fakeImage, 'room-123');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('parse-receipt-gemini', {
      body: expect.objectContaining({
        imageBase64: expect.stringMatching(/^data:image\/jpeg;base64,/),
        mimeType: 'image/jpeg',
        roomId: 'room-123',
      }),
    });

    expect(result.vendor).toBe('Zepto Groceries');
    expect(result.totalPaise).toBe(7930);
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toBe('Amul Taaza Milk 1L');
  });

  it('maps 429 error into RATE_LIMITED code with informative message', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Rate limit exceeded',
        context: { status: 429 },
      },
    } as any);

    const fakeImage = new Blob(['image'], { type: 'image/jpeg' });
    await expect(parseReceiptWithGemini(fakeImage)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('maps 503 error into KEY_NOT_CONFIGURED code', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Gemini Vision key not configured',
        context: { status: 503 },
      },
    } as any);

    const fakeImage = new Blob(['image'], { type: 'image/jpeg' });
    await expect(parseReceiptWithGemini(fakeImage)).rejects.toMatchObject({
      code: 'KEY_NOT_CONFIGURED',
    });
  });
});

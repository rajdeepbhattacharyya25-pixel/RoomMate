/**
 * geminiVisionService.ts
 *
 * Client-side integration for Gemini 1.5 Flash Vision OCR via Supabase Edge Function.
 * Provides cloud AI enhancement with automatic fallback to on-device Tesseract OCR.
 *
 * Implements strict zero-retention: images are converted to base64 in-memory,
 * processed via the edge function, and immediately freed.
 */

import { supabase } from '../supabase/client';
import { ParsedReceiptData } from './receiptTextParser';

export interface GeminiOcrError extends Error {
  code: 'RATE_LIMITED' | 'KEY_NOT_CONFIGURED' | 'NETWORK_ERROR' | 'UNAUTHORIZED' | 'SERVER_ERROR';
  retryAfterMinutes?: number;
}

/**
 * Converts a File or Blob into a base64 string.
 * Supports both Browser (FileReader) and Node/Testing (arrayBuffer) environments.
 */
export async function fileToBase64(file: File | Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read image as base64 string'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('FileReader encountered an error'));
      reader.readAsDataURL(file);
    });
  }

  // Node.js / Headless environment fallback
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = file.type || 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Parses a receipt image using the Supabase `parse-receipt-gemini` Edge Function.
 *
 * @param imageFile The receipt image File or Blob.
 * @param roomId Optional room ID to verify room membership.
 * @returns ParsedReceiptData structured output.
 */
export async function parseReceiptWithGemini(
  imageFile: File | Blob,
  roomId?: string
): Promise<ParsedReceiptData> {
  const base64Data = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  try {
    const { data, error } = await supabase.functions.invoke('parse-receipt-gemini', {
      body: {
        imageBase64: base64Data,
        mimeType,
        roomId,
      },
    });

    if (error) {
      const err = new Error(error.message || 'Gemini Vision extraction failed') as GeminiOcrError;

      // Extract specific status or response data if available
      const status = (error as unknown as { context?: { status?: number } })?.context?.status;
      if (status === 429) {
        err.code = 'RATE_LIMITED';
        err.message = 'AI rate limit exceeded (10 scans/hour). Falling back to on-device scanner.';
      } else if (status === 503) {
        err.code = 'KEY_NOT_CONFIGURED';
        err.message = 'Cloud AI is not configured on this server. Falling back to on-device scanner.';
      } else if (status === 401 || status === 403) {
        err.code = 'UNAUTHORIZED';
      } else {
        err.code = 'SERVER_ERROR';
      }
      throw err;
    }

    if (!data || !Array.isArray(data.items)) {
      const err = new Error('Invalid response structure received from Gemini Edge Function') as GeminiOcrError;
      err.code = 'SERVER_ERROR';
      throw err;
    }

    return data as ParsedReceiptData;
  } catch (err: unknown) {
    if ((err as GeminiOcrError).code) {
      throw err;
    }

    const networkErr = new Error(
      err instanceof Error ? err.message : 'Network error during AI extraction'
    ) as GeminiOcrError;
    networkErr.code = 'NETWORK_ERROR';
    throw networkErr;
  }
}

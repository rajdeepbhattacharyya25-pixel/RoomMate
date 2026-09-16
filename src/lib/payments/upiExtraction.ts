/**
 * UPI ID (VPA) Extraction and Validation Service
 *
 * Strictly parses and validates UPI Virtual Payment Addresses (VPAs) from
 * decoded QR code payloads according to NPCI specifications.
 */

export interface ExtractedUpiDetails {
  upiId: string;
  payeeName?: string;
  amount?: number;
  note?: string;
  rawPayload: string;
}

export interface UpiValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Standard UPI VPA format:
 * - username: 2 to 256 alphanumeric characters, dots, underscores, or hyphens
 * - @ symbol
 * - handle: 2 to 64 alphanumeric characters
 */
const UPI_VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/;

/**
 * Validates a standalone UPI ID string.
 */
export function validateUpiId(input: string): UpiValidationResult {
  if (!input || typeof input !== 'string') {
    return { isValid: false, error: 'UPI ID cannot be empty.' };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { isValid: false, error: 'UPI ID cannot be empty.' };
  }

  if (!trimmed.includes('@')) {
    return { isValid: false, error: 'UPI ID must contain "@" (e.g. name@okaxis).' };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { isValid: false, error: 'UPI ID must contain exactly one "@".' };
  }

  const [username, handle] = parts;
  if (!username) {
    return { isValid: false, error: 'Username before "@" cannot be empty.' };
  }
  if (!handle) {
    return { isValid: false, error: 'Provider handle after "@" cannot be empty.' };
  }

  const normalized = trimmed.toLowerCase();
  if (!UPI_VPA_REGEX.test(normalized)) {
    return {
      isValid: false,
      error: 'Invalid format. Use letters, numbers, dots, or hyphens (e.g. username@okaxis).',
    };
  }

  return { isValid: true, normalized };
}

/**
 * Strictly extracts the UPI ID (pa parameter) from a decoded QR code payload.
 *
 * Requirements:
 * 1. Payload MUST be a UPI payment URI (e.g. upi://pay?...)
 * 2. Only the 'pa' parameter is the authoritative source of truth.
 * 3. Handles URL percent-encoding (e.g. user%40oksbi -> user@oksbi).
 * 4. Normalizes and validates against UPI VPA constraints.
 * 5. Returns null for non-UPI QRs, arbitrary text, or QRs without a valid 'pa'.
 */
export function extractUpiIdFromQrPayload(rawPayload: string): ExtractedUpiDetails | null {
  if (!rawPayload || typeof rawPayload !== 'string') {
    return null;
  }

  const trimmed = rawPayload.trim();

  // Strict check: payload must start with standard upi://pay URI scheme
  // (case-insensitive check to allow UPI://PAY or upi://pay)
  if (!/^[uU][pP][iI]:\/\/[pP][aA][yY](\?.*)?$/i.test(trimmed)) {
    return null;
  }

  let rawPa: string | null = null;
  let rawPn: string | null = null;
  let rawAm: string | null = null;
  let rawTn: string | null = null;

  try {
    // Convert to dummy HTTP URL for robust standard searchParams parsing
    const dummyUrlString = trimmed.replace(/^[uU][pP][iI]:\/\/[pP][aA][yY]\??/i, 'https://upi.dummy/?');
    const url = new URL(dummyUrlString);
    for (const [key, value] of url.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'pa' && !rawPa) rawPa = value;
      else if (lowerKey === 'pn' && !rawPn) rawPn = value;
      else if (lowerKey === 'am' && !rawAm) rawAm = value;
      else if (lowerKey === 'tn' && !rawTn) rawTn = value;
    }
  } catch {
    // Fallback: regex search on query parameters if URL parsing fails
    const paMatch = trimmed.match(/[?&]pa=([^&]+)/i);
    if (paMatch) rawPa = paMatch[1];
    const pnMatch = trimmed.match(/[?&]pn=([^&]+)/i);
    if (pnMatch) rawPn = pnMatch[1];
    const amMatch = trimmed.match(/[?&]am=([^&]+)/i);
    if (amMatch) rawAm = amMatch[1];
    const tnMatch = trimmed.match(/[?&]tn=([^&]+)/i);
    if (tnMatch) rawTn = tnMatch[1];
  }

  if (!rawPa) {
    return null;
  }

  // Handle URL percent-decoding safely (e.g. user%40oksbi -> user@oksbi)
  let decodedPa = rawPa;
  try {
    decodedPa = decodeURIComponent(rawPa);
  } catch {
    // If malformed URI sequence, keep rawPa as-is
  }

  // Validate the extracted pa parameter
  const validation = validateUpiId(decodedPa);
  if (!validation.isValid || !validation.normalized) {
    return null;
  }

  // Parse payee name if present
  let decodedPn: string | undefined;
  if (rawPn) {
    try {
      decodedPn = decodeURIComponent(rawPn).trim();
    } catch {
      decodedPn = rawPn.trim();
    }
  }

  // Parse optional amount
  let parsedAmount: number | undefined;
  if (rawAm) {
    const num = parseFloat(rawAm);
    if (!isNaN(num) && num > 0) {
      parsedAmount = num;
    }
  }

  // Parse optional note
  let decodedNote: string | undefined;
  if (rawTn) {
    try {
      decodedNote = decodeURIComponent(rawTn).replace(/_/g, ' ').trim();
    } catch {
      decodedNote = rawTn.replace(/_/g, ' ').trim();
    }
  }

  return {
    upiId: validation.normalized,
    payeeName: decodedPn || undefined,
    amount: parsedAmount,
    note: decodedNote || undefined,
    rawPayload: trimmed,
  };
}

/**
 * RoomMate Shared Expense Engine V2 — Canonical Money Utilities
 * Phase 3 Implementation
 * 
 * Strict Invariants:
 * - Integer Paise is the sole authoritative currency unit.
 * - Zero floating-point arithmetic permitted in financial calculations.
 * - String parsing handles whole and 2-decimal fractional inputs losslessly.
 */

import { Paise } from './types';

/**
 * Asserts that a value is an integer Paise.
 */
export function assertIntegerPaise(amount: number, context = 'Currency'): void {
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`FINANCIAL_INVARIANT_VIOLATION: ${context} amount must be a safe integer Paise, got ${amount}`);
  }
}

/**
 * Parses an INR string (e.g. "66.67", "₹200", "10,000.50", "0.01") into exact integer Paise.
 * Uses string manipulation to avoid binary floating-point representation errors.
 */
export function parseInrToPaise(val: string | number): Paise {
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      // If integer passed directly, convert to string
      val = val.toString();
    } else {
      // Floating number passed: convert with 2 decimals
      val = val.toFixed(2);
    }
  }

  const clean = val.trim().replace(/^₹/, '').replace(/,/g, '');
  if (!clean || clean === '0' || clean === '0.00' || clean === '-0' || clean === '-0.00') {
    return 0;
  }

  const isNegative = clean.startsWith('-');
  const unsignedStr = isNegative ? clean.substring(1) : clean;

  const parts = unsignedStr.split('.');
  if (parts.length > 2) {
    throw new Error(`INVALID_CURRENCY_INPUT: Multiple decimal separators in "${val}"`);
  }

  const wholeStr = parts[0] || '0';
  if (!/^\d+$/.test(wholeStr)) {
    throw new Error(`INVALID_CURRENCY_INPUT: Non-numeric digits in "${val}"`);
  }

  const whole = parseInt(wholeStr, 10);
  if (isNaN(whole) || !Number.isSafeInteger(whole)) {
    throw new Error(`INVALID_CURRENCY_INPUT: Integer overflow in "${val}"`);
  }

  let fraction = 0;
  if (parts.length === 2) {
    const rawFrac = parts[1];
    if (rawFrac.length > 0 && !/^\d+$/.test(rawFrac)) {
      throw new Error(`INVALID_CURRENCY_FRACTION: Non-numeric fractional digits in "${val}"`);
    }
    // Pad or slice to exactly 2 digits
    const twoDigitFrac = (rawFrac + '00').substring(0, 2);
    fraction = parseInt(twoDigitFrac, 10);
  }

  const result = (whole * 100 + fraction) * (isNegative ? -1 : 1);
  assertIntegerPaise(result, 'Parsed');
  return result;
}

/**
 * Formats integer Paise to INR display string.
 * Example: 6667 -> "₹66.67", 20000 -> "₹200.00", -5000 -> "-₹50.00"
 */
export function formatPaiseToInr(paise: Paise, options?: { showSymbol?: boolean }): string {
  assertIntegerPaise(paise, 'formatPaiseToInr');
  const showSymbol = options?.showSymbol !== false;
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const remStr = remainder < 10 ? `0${remainder}` : `${remainder}`;
  const sym = showSymbol ? '₹' : '';
  return `${sign}${sym}${rupees}.${remStr}`;
}

/**
 * Formats integer Paise to exact two-decimal string compliant with NPCI UPI URI standard.
 * Example: 16667 -> "166.67", 20000 -> "200.00"
 * Negative values are strictly forbidden for UPI payment URIs.
 */
export function formatPaiseToUpiAmount(paise: Paise): string {
  assertIntegerPaise(paise, 'formatPaiseToUpiAmount');
  if (paise < 0) {
    throw new Error('NEGATIVE_UPI_AMOUNT_PROHIBITED: UPI transactions cannot have negative amount');
  }
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  const remStr = remainder < 10 ? `0${remainder}` : `${remainder}`;
  return `${rupees}.${remStr}`;
}

/**
 * Boundary conversion: converts database NUMERIC(12,2) float into safe integer Paise.
 */
export function inrFloatToPaise(inr: number): Paise {
  if (typeof inr !== 'number' || isNaN(inr)) {
    throw new Error(`INVALID_INR_FLOAT: Expected number, got ${inr}`);
  }
  return parseInrToPaise(inr.toFixed(2));
}

/**
 * Boundary conversion: converts integer Paise to floating INR number for legacy APIs or DB payloads.
 */
export function paiseToInrFloat(paise: Paise): number {
  assertIntegerPaise(paise, 'paiseToInrFloat');
  return paise / 100;
}

/**
 * Adds multiple Paise amounts safely with integer overflow checking.
 */
export function addPaise(...amounts: Paise[]): Paise {
  let sum = 0;
  for (const amt of amounts) {
    assertIntegerPaise(amt, 'addPaise');
    sum += amt;
    assertIntegerPaise(sum, 'addPaise cumulative');
  }
  return sum;
}

/**
 * Subtracts amount b from a safely in integer Paise.
 */
export function subPaise(a: Paise, b: Paise): Paise {
  assertIntegerPaise(a, 'subPaise a');
  assertIntegerPaise(b, 'subPaise b');
  const diff = a - b;
  assertIntegerPaise(diff, 'subPaise result');
  return diff;
}

/**
 * Compares two Paise amounts: returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function comparePaise(a: Paise, b: Paise): number {
  assertIntegerPaise(a, 'comparePaise a');
  assertIntegerPaise(b, 'comparePaise b');
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

/**
 * Checks whether an amount is exactly zero Paise.
 */
export function isZeroPaise(a: Paise): boolean {
  return a === 0;
}

// Ergonomic aliases
export const rupeesToPaise = inrFloatToPaise;
export const paiseToRupees = paiseToInrFloat;


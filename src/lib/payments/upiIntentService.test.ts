import { describe, it, expect } from 'vitest';
import {
  generateUpiAppIntent,
  parseUpiQrString,
  generateSettlementToken,
  UpiIntentOptions,
} from './upiIntentService';

describe('UPI Intent & Deep Link Generation Test Suite', () => {
  const options: UpiIntentOptions = {
    pa: 'rajdeep@okaxis',
    pn: 'Rajdeep Bhattacharyya',
    am: 450.5,
    tn: 'Hostel Groceries Dinner',
    tr: 'CF-2026-TR1234',
  };

  it('generates standard NPCI generic UPI deep link', () => {
    const uri = generateUpiAppIntent('generic', options);
    expect(uri.startsWith('upi://pay?')).toBe(true);
    expect(uri).toContain('pa=rajdeep@okaxis');
    expect(uri).toContain('am=450.50');
    expect(uri).toContain('cu=INR');
    expect(uri).toContain('tr=CF-2026-TR1234');
  });

  it('generates Google Pay Tez deep link scheme', () => {
    const uri = generateUpiAppIntent('gpay', options);
    expect(uri.startsWith('tez://upi/pay?')).toBe(true);
    expect(uri).toContain('pa=rajdeep@okaxis');
  });

  it('generates PhonePe mobile payment scheme', () => {
    const uri = generateUpiAppIntent('phonepe', options);
    expect(uri.startsWith('phonepe://pay?')).toBe(true);
    expect(uri).toContain('pa=rajdeep@okaxis');
  });

  it('generates Paytm mobile payment scheme', () => {
    const uri = generateUpiAppIntent('paytm', options);
    expect(uri.startsWith('paytmmp://pay?')).toBe(true);
    expect(uri).toContain('pa=rajdeep@okaxis');
  });

  it('generates a branded unique settlement reference token', () => {
    const token1 = generateSettlementToken();
    const token2 = generateSettlementToken();
    expect(token1.startsWith('CF-')).toBe(true);
    expect(token1).not.toBe(token2);
  });

  it('parses valid UPI QR code payloads correctly', () => {
    const rawQr = 'upi://pay?pa=sneha@okhdfcbank&pn=Sneha%20Patel&am=750.00&cu=INR&tn=Electricity_Bill';
    const parsed = parseUpiQrString(rawQr);

    expect(parsed).not.toBeNull();
    expect(parsed?.vpa).toBe('sneha@okhdfcbank');
    expect(parsed?.name).toBe('Sneha Patel');
    expect(parsed?.amount).toBe(750);
    expect(parsed?.note).toBe('Electricity Bill');
  });

  it('returns null for non-UPI or malformed QR strings', () => {
    expect(parseUpiQrString('https://example.com/not-upi')).toBeNull();
    expect(parseUpiQrString('random text barcode')).toBeNull();
    expect(parseUpiQrString('')).toBeNull();
  });
});

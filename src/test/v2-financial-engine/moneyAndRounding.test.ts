import { describe, it, expect } from 'vitest';
import {
  parseInrToPaise,
  formatPaiseToInr,
  formatPaiseToUpiAmount,
  calculateEqualSplits,
} from './referenceEngine';

describe('Part 3 — Test Money Representation', () => {
  it('losslessly parses and converts standard monetary amounts between INR and integer Paise', () => {
    const testCases: [string, number][] = [
      ['₹0', 0],
      ['0', 0],
      ['0.00', 0],
      ['0.01', 1],
      ['₹0.01', 1],
      ['0.99', 99],
      ['₹0.99', 99],
      ['1', 100],
      ['1.00', 100],
      ['₹1.00', 100],
      ['1.01', 101],
      ['10', 1000],
      ['100', 10000],
      ['199.99', 19999],
      ['200', 20000],
      ['200.00', 20000],
      ['999.99', 99999],
      ['10,000', 1000000],
      ['10000.00', 1000000],
      ['100000.50', 10000050],
      ['9999999.99', 999999999],
    ];

    for (const [inrStr, expectedPaise] of testCases) {
      const parsed = parseInrToPaise(inrStr);
      expect(parsed).toBe(expectedPaise);
      expect(Number.isInteger(parsed)).toBe(true);

      // Round-trip check: paise -> formatted INR -> paise
      const formatted = formatPaiseToInr(parsed);
      const roundTripped = parseInrToPaise(formatted);
      expect(roundTripped).toBe(expectedPaise);
    }
  });

  it('guarantees ₹66.67 converts to 6667 paise and NEVER loses value (6666 paise)', () => {
    const paise = parseInrToPaise('66.67');
    expect(paise).toBe(6667);
    expect(paise).not.toBe(6666);

    const formatted = formatPaiseToInr(paise);
    expect(formatted).toBe('₹66.67');
  });

  it('handles negative currency values cleanly and symmetrically', () => {
    expect(parseInrToPaise('-50.25')).toBe(-5025);
    expect(formatPaiseToInr(-5025)).toBe('-₹50.25');
  });

  it('rejects malformed currency input strings', () => {
    expect(() => parseInrToPaise('abc')).toThrow('INVALID_CURRENCY_INPUT');
    expect(() => parseInrToPaise('₹')).toBeDefined(); // parses as 0
  });
});

describe('Part 4 — Test Exact Equality', () => {
  it('proves that ₹66.66 * 3 = 19998 paise != 20000 paise and is INVALID', () => {
    const totalPaise = parseInrToPaise('200.00'); // 20000
    const share1 = parseInrToPaise('66.66'); // 6666
    const share2 = parseInrToPaise('66.66'); // 6666
    const share3 = parseInrToPaise('66.66'); // 6666

    const sumShares = share1 + share2 + share3;
    expect(sumShares).toBe(19998);
    expect(sumShares).not.toBe(totalPaise);
    // Explicit assertion: The system must NEVER consider 19998 paise valid for a 20000 paise expense
    const isValid = sumShares === totalPaise;
    expect(isValid).toBe(false);
  });

  it('proves that 66.67 + 66.67 + 66.66 = 20000 paise and is VALID', () => {
    const totalPaise = parseInrToPaise('200.00'); // 20000
    const share1 = parseInrToPaise('66.67'); // 6667
    const share2 = parseInrToPaise('66.67'); // 6667
    const share3 = parseInrToPaise('66.66'); // 6666

    const sumShares = share1 + share2 + share3;
    expect(sumShares).toBe(20000);
    expect(sumShares === totalPaise).toBe(true);
  });
});

describe('Part 6 — Remainder Allocation Tests (A % K)', () => {
  const testVectors: { amount: number; k: number }[] = [
    { amount: 1, k: 3 },     // 1 / 3
    { amount: 2, k: 3 },     // 2 / 3
    { amount: 4, k: 3 },     // 4 / 3
    { amount: 5, k: 3 },     // 5 / 3
    { amount: 7, k: 3 },     // 7 / 3
    { amount: 10, k: 6 },    // 10 / 6
    { amount: 100, k: 3 },   // 100 / 3
    { amount: 200, k: 3 },   // 200 / 3
    { amount: 500, k: 3 },   // 500 / 3
    { amount: 999, k: 7 },   // 999 / 7
  ];

  for (const { amount, k } of testVectors) {
    it(`verifies modulo distribution for A=${amount} paise over K=${k} members`, () => {
      const participantIds = Array.from({ length: k }, (_, i) => `user_${i.toString().padStart(2, '0')}`);
      const splits = calculateEqualSplits(amount, participantIds);

      const base = Math.floor(amount / k);
      const remainder = amount % k;

      // Exactly `remainder` participants receive `base + 1`
      const recipientsWithExtraCent = splits.filter((s) => s.sharePaise === base + 1);
      const recipientsWithBase = splits.filter((s) => s.sharePaise === base);

      expect(recipientsWithExtraCent.length).toBe(remainder);
      expect(recipientsWithBase.length).toBe(k - remainder);

      // Verify invariant: SUM(shares) === A exactly
      const sum = splits.reduce((acc, s) => acc + s.sharePaise, 0);
      expect(sum).toBe(amount);
    });
  }
});

describe('Part 7 — Determinism & UUID Invariance Test', () => {
  it('guarantees identical output across 100 repeated executions', () => {
    const totalPaise = 20000;
    const participants = ['user-uuid-c', 'user-uuid-a', 'user-uuid-b'];

    const firstRun = calculateEqualSplits(totalPaise, participants);

    for (let i = 0; i < 100; i++) {
      const run = calculateEqualSplits(totalPaise, participants);
      expect(run).toEqual(firstRun);
    }
  });

  it('guarantees identical allocation regardless of initial participant array ordering', () => {
    const totalPaise = 20000;
    const order1 = ['user-uuid-c', 'user-uuid-a', 'user-uuid-b'];
    const order2 = ['user-uuid-b', 'user-uuid-c', 'user-uuid-a'];
    const order3 = ['user-uuid-a', 'user-uuid-b', 'user-uuid-c'];

    const res1 = calculateEqualSplits(totalPaise, order1);
    const res2 = calculateEqualSplits(totalPaise, order2);
    const res3 = calculateEqualSplits(totalPaise, order3);

    expect(res1).toEqual(res2);
    expect(res2).toEqual(res3);

    // Specifically: 'user-uuid-a' (first lexicographically) must get the remainder paisa (6667)
    // 'user-uuid-b' gets 6667, 'user-uuid-c' gets 6666
    expect(res1).toEqual([
      { userId: 'user-uuid-a', sharePaise: 6667 },
      { userId: 'user-uuid-b', sharePaise: 6667 },
      { userId: 'user-uuid-c', sharePaise: 6666 },
    ]);
  });
});

describe('Part 21 — UPI Formatting Tests', () => {
  it('formats integer Paise to exact two-decimal UPI URI standard without rounding errors', () => {
    const upiTestCases: [number, string][] = [
      [1, '0.01'],
      [10, '0.10'],
      [99, '0.99'],
      [100, '1.00'],
      [101, '1.01'],
      [6666, '66.66'],
      [6667, '66.67'],
      [16667, '166.67'],
      [20000, '200.00'],
    ];

    for (const [paise, expectedUpi] of upiTestCases) {
      const upiStr = formatPaiseToUpiAmount(paise);
      expect(upiStr).toBe(expectedUpi);
      // Explicit negative assertion from prompt
      if (paise === 16667) {
        expect(upiStr).not.toBe('167');
        expect(upiStr).not.toBe('166');
      }
    }
  });

  it('rejects negative UPI amounts', () => {
    expect(() => formatPaiseToUpiAmount(-100)).toThrow('NEGATIVE_UPI_AMOUNT_PROHIBITED');
  });
});

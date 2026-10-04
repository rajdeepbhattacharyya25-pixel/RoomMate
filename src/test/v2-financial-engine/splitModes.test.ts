import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  validateAndCalculateExactSplits,
  calculatePercentageSplits,
  calculateSharesSplits,
} from './referenceEngine';

describe('Part 5 — Equal Split Tests (E001–E007)', () => {
  it('TEST E001: ₹100 / 2 members', () => {
    const participants = ['u1', 'u2'];
    const splits = calculateEqualSplits(10000, participants);
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 5000 },
      { userId: 'u2', sharePaise: 5000 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(10000);
  });

  it('TEST E002: ₹100 / 3 members', () => {
    const participants = ['u1', 'u2', 'u3'];
    const splits = calculateEqualSplits(10000, participants);
    // 10000 / 3 = 3333 with remainder 1
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 3334 },
      { userId: 'u2', sharePaise: 3333 },
      { userId: 'u3', sharePaise: 3333 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(10000);
  });

  it('TEST E003: ₹200 / 3 members', () => {
    const participants = ['u1', 'u2', 'u3'];
    const splits = calculateEqualSplits(20000, participants);
    // 20000 / 3 = 6666 with remainder 2
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 6667 },
      { userId: 'u2', sharePaise: 6667 },
      { userId: 'u3', sharePaise: 6666 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(20000);
  });

  it('TEST E004: ₹1 / 3 members (100 paise)', () => {
    const participants = ['u1', 'u2', 'u3'];
    const splits = calculateEqualSplits(100, participants);
    // 100 / 3 = 33 with remainder 1
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 34 },
      { userId: 'u2', sharePaise: 33 },
      { userId: 'u3', sharePaise: 33 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(100);
  });

  it('TEST E005: ₹10 / 6 members (1000 paise)', () => {
    const participants = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
    const splits = calculateEqualSplits(1000, participants);
    // 1000 / 6 = 166 with remainder 4
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 167 },
      { userId: 'u2', sharePaise: 167 },
      { userId: 'u3', sharePaise: 167 },
      { userId: 'u4', sharePaise: 167 },
      { userId: 'u5', sharePaise: 166 },
      { userId: 'u6', sharePaise: 166 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(1000);
  });

  it('TEST E006: ₹500 / 3 members (50000 paise)', () => {
    const participants = ['u1', 'u2', 'u3'];
    const splits = calculateEqualSplits(50000, participants);
    // 50000 / 3 = 16666 with remainder 2
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 16667 },
      { userId: 'u2', sharePaise: 16667 },
      { userId: 'u3', sharePaise: 16666 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(50000);
  });

  it('TEST E007: ₹700 / 3 members (70000 paise)', () => {
    const participants = ['u1', 'u2', 'u3'];
    const splits = calculateEqualSplits(70000, participants);
    // 70000 / 3 = 23333 with remainder 1
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 23334 },
      { userId: 'u2', sharePaise: 23333 },
      { userId: 'u3', sharePaise: 23333 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(70000);
  });
});

describe('Part 8 — Exact Split Tests', () => {
  it('accepts ₹200 split: 5000 + 7500 + 7500 paise (VALID)', () => {
    const shares = { u1: 5000, u2: 7500, u3: 7500 };
    const result = validateAndCalculateExactSplits(20000, shares);
    expect(result).toHaveLength(3);
    expect(result.reduce((acc, s) => acc + s.sharePaise, 0)).toBe(20000);
  });

  it('accepts ₹200 split: 6667 + 6667 + 6666 paise (VALID)', () => {
    const shares = { u1: 6667, u2: 6667, u3: 6666 };
    const result = validateAndCalculateExactSplits(20000, shares);
    expect(result).toHaveLength(3);
    expect(result.reduce((acc, s) => acc + s.sharePaise, 0)).toBe(20000);
  });

  it('rejects ₹200 split: 6666 + 6666 + 6666 paise (INVALID sum mismatch 19998 != 20000)', () => {
    const shares = { u1: 6666, u2: 6666, u3: 6666 };
    expect(() => validateAndCalculateExactSplits(20000, shares)).toThrow('EXACT_SPLIT_SUM_MISMATCH');
  });

  it('rejects ₹200 split: 10000 + 10000 + 100 paise (INVALID sum mismatch 20100 != 20000)', () => {
    const shares = { u1: 10000, u2: 10000, u3: 100 };
    expect(() => validateAndCalculateExactSplits(20000, shares)).toThrow('EXACT_SPLIT_SUM_MISMATCH');
  });

  it('rejects ₹0 total expense (INVALID: total must be > 0)', () => {
    const shares = { u1: 0, u2: 0, u3: 0 };
    expect(() => validateAndCalculateExactSplits(0, shares)).toThrow('INVALID_AMOUNT');
  });

  it('rejects negative or zero individual shares', () => {
    expect(() => validateAndCalculateExactSplits(20000, { u1: 25000, u2: -5000 })).toThrow('NON_POSITIVE_SHARE');
    expect(() => validateAndCalculateExactSplits(20000, { u1: 20000, u2: 0 })).toThrow('NON_POSITIVE_SHARE');
  });
});

describe('Part 9 — Percentage Split Tests', () => {
  it('accepts valid 25% + 25% + 50% = 100% split', () => {
    // 2500, 2500, 5000 basis points
    const percentagesBp = { u1: 2500, u2: 2500, u3: 5000 };
    const splits = calculatePercentageSplits(20000, percentagesBp);
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 5000 },
      { userId: 'u2', sharePaise: 5000 },
      { userId: 'u3', sharePaise: 10000 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(20000);
  });

  it('accepts valid 33.33% + 33.33% + 33.34% = 100% split (3333, 3333, 3334 bp)', () => {
    const percentagesBp = { u1: 3333, u2: 3333, u3: 3334 };
    const splits = calculatePercentageSplits(20000, percentagesBp);
    // 20000 * 3333 / 10000 = 6666, 20000 * 3334 / 10000 = 6668.
    // Sum is 6666 + 6666 + 6668 = 20000.
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(20000);
  });

  it('rejects 33.33% + 33.33% + 33.33% = 99.99% (9999 bp != 10000 bp)', () => {
    const percentagesBp = { u1: 3333, u2: 3333, u3: 3333 };
    expect(() => calculatePercentageSplits(20000, percentagesBp)).toThrow('PERCENTAGE_SUM_MISMATCH');
  });

  it('rejects negative percentages, percentages > 100%, and total > 100%', () => {
    expect(() => calculatePercentageSplits(20000, { u1: -1000, u2: 11000 })).toThrow('INVALID_PERCENTAGE');
    expect(() => calculatePercentageSplits(20000, { u1: 6000, u2: 5000 })).toThrow('PERCENTAGE_SUM_MISMATCH'); // 110%
    expect(() => calculatePercentageSplits(20000, { u1: 4000, u2: 4000 })).toThrow('PERCENTAGE_SUM_MISMATCH'); // 80%
    expect(() => calculatePercentageSplits(20000, { u1: 0, u2: 10000 })).toThrow('INVALID_PERCENTAGE'); // 0%
  });
});

describe('Part 10 — Shares Split Tests', () => {
  it('correctly calculates 1 : 1 : 2 split for ₹200 (50, 50, 100)', () => {
    const weights = { u1: 1, u2: 1, u3: 2 };
    const splits = calculateSharesSplits(20000, weights);
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 5000 },
      { userId: 'u2', sharePaise: 5000 },
      { userId: 'u3', sharePaise: 10000 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(20000);
  });

  it('correctly calculates 1 : 1 : 1 split for ₹200 with deterministic remainder handling', () => {
    const weights = { u1: 1, u2: 1, u3: 1 };
    const splits = calculateSharesSplits(20000, weights);
    expect(splits).toEqual([
      { userId: 'u1', sharePaise: 6667 },
      { userId: 'u2', sharePaise: 6667 },
      { userId: 'u3', sharePaise: 6666 },
    ]);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(20000);
  });

  it('rejects 0 shares or negative shares', () => {
    expect(() => calculateSharesSplits(20000, { u1: 0, u2: 2 })).toThrow('INVALID_SHARE_WEIGHT');
    expect(() => calculateSharesSplits(20000, { u1: -1, u2: 3 })).toThrow('INVALID_SHARE_WEIGHT');
  });

  it('handles extremely large share ratios without precision failure', () => {
    const weights = { u1: 1000000, u2: 1 };
    const splits = calculateSharesSplits(100000, weights);
    expect(splits.reduce((s, x) => s + x.sharePaise, 0)).toBe(100000);
  });
});

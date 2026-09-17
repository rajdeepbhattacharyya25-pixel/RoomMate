import { describe, it, expect } from 'vitest';
import { extractTenDigits, formatPhoneDisplay } from './phoneFormat';
import { PhoneInput } from './PhoneInput';
import { CurrencyInput } from './CurrencyInput';
import { PrefixInput } from './PrefixInput';

describe('Mobile Input Primitives Test Suite', () => {
  describe('PhoneInput Logic & Formatting', () => {
    it('extracts exactly 10 digits from standard numbers', () => {
      expect(extractTenDigits('9876543210')).toBe('9876543210');
    });

    it('extracts digits and strips +91 country prefix', () => {
      expect(extractTenDigits('+91 98765 43210')).toBe('9876543210');
      expect(extractTenDigits('+919876543210')).toBe('9876543210');
      expect(extractTenDigits('919876543210')).toBe('9876543210');
    });

    it('handles pasted numbers with spaces, hyphens, and parentheses', () => {
      expect(extractTenDigits('+91 (98765) 43-210')).toBe('9876543210');
      expect(extractTenDigits('  98765-43210  ')).toBe('9876543210');
    });

    it('limits to 10 digits max', () => {
      expect(extractTenDigits('9876543210999')).toBe('9876543210');
    });

    it('returns empty string on empty or invalid input', () => {
      expect(extractTenDigits('')).toBe('');
      expect(extractTenDigits('   ')).toBe('');
      expect(extractTenDigits('abc')).toBe('');
    });

    it('formats 10 digits into 5-5 grouping', () => {
      expect(formatPhoneDisplay('9876543210')).toBe('98765 43210');
    });

    it('does not insert space if 5 or fewer digits typed', () => {
      expect(formatPhoneDisplay('98765')).toBe('98765');
      expect(formatPhoneDisplay('987')).toBe('987');
      expect(formatPhoneDisplay('')).toBe('');
    });
  });

  describe('Component Exports & Definitions', () => {
    it('exports CurrencyInput forwardRef component', () => {
      expect(CurrencyInput).toBeDefined();
      expect(CurrencyInput.displayName).toBe('CurrencyInput');
    });

    it('exports PhoneInput forwardRef component', () => {
      expect(PhoneInput).toBeDefined();
      expect(PhoneInput.displayName).toBe('PhoneInput');
    });

    it('exports PrefixInput forwardRef component', () => {
      expect(PrefixInput).toBeDefined();
      expect(PrefixInput.displayName).toBe('PrefixInput');
    });
  });
});

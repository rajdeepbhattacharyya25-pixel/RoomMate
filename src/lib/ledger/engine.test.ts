import { describe, it, expect } from 'vitest';
import { runAllLedgerTests } from './ledgerTestRunner';

describe('Ledger Engine Financial Math & Member Lifecycle Test Suite', () => {
  const tests = runAllLedgerTests();
  tests.forEach((t) => {
    it(t.name, () => {
      expect(t.passed, t.message).toBe(true);
    });
  });
});

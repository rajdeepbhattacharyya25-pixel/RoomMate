import { describe, it, expect } from 'vitest';
import {
  formatDateString,
  parseDateString,
  getLastDayOfMonth,
  generateCycleToken,
  isRuleDue,
  computeNextExecutionDate,
  detectAmountAnomaly,
  RecurringRule,
} from '../../lib/recurring/scheduleCalculator';

describe('Phase 1: Mathematical Engine & Schedule Parser for Recurring Bills', () => {
  describe('Date Serialization & Boundary Utilities', () => {
    it('round-trips date string format without timezone drift', () => {
      const d = new Date(2026, 9, 31, 0, 0, 0, 0); // Oct 31, 2026
      const str = formatDateString(d);
      expect(str).toBe('2026-10-31');

      const parsed = parseDateString('2026-10-31');
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(9); // 0-indexed month for October
      expect(parsed.getDate()).toBe(31);
    });

    it('correctly returns last day of month including February leap years', () => {
      expect(getLastDayOfMonth(2024, 1)).toBe(29); // 2024 is leap year
      expect(getLastDayOfMonth(2025, 1)).toBe(28); // 2025 is standard year
      expect(getLastDayOfMonth(2026, 3)).toBe(30); // April has 30 days
      expect(getLastDayOfMonth(2026, 4)).toBe(31); // May has 31 days
    });

    it('generates deterministic idempotency cycle tokens', () => {
      const token1 = generateCycleToken('rule-abc-123', '2026-11-01');
      const token2 = generateCycleToken('rule-abc-123', '2026-11-01');
      const token3 = generateCycleToken('rule-abc-123', '2026-12-01');

      expect(token1).toBe('rule-abc-123_2026-11-01');
      expect(token1).toBe(token2);
      expect(token1).not.toBe(token3);
    });
  });

  describe('Monthly Schedule Calculations', () => {
    it('advances to same day of next month under normal conditions', () => {
      const rule = {
        frequency: 'MONTHLY' as const,
        dayOfMonth: 5,
        startDate: '2026-08-01',
      };

      const next = computeNextExecutionDate(rule, '2026-09-05');
      expect(next).toBe('2026-10-05');
    });

    it('handles year crossover from December to January', () => {
      const rule = {
        frequency: 'MONTHLY' as const,
        dayOfMonth: 1,
        startDate: '2026-01-01',
      };

      const next = computeNextExecutionDate(rule, '2026-12-01');
      expect(next).toBe('2027-01-01');
    });

    it('clamps 31st of month to 30th for months with 30 days', () => {
      const rule = {
        frequency: 'MONTHLY' as const,
        dayOfMonth: 31,
        startDate: '2026-01-01',
      };

      // March 31 -> April has 30 days -> clamped to April 30
      const nextFromMarch = computeNextExecutionDate(rule, '2026-03-31');
      expect(nextFromMarch).toBe('2026-04-30');
    });

    it('clamps 31st of month to 28th/29th for February', () => {
      const rule = {
        frequency: 'MONTHLY' as const,
        dayOfMonth: 31,
        startDate: '2026-01-01',
      };

      // Jan 31, 2026 -> Feb 2026 has 28 days -> clamped to Feb 28
      const nextFromJan = computeNextExecutionDate(rule, '2026-01-31');
      expect(nextFromJan).toBe('2026-02-28');
    });

    it('calculates exact last day of month when isLastDayOfMonth is enabled', () => {
      const rule = {
        frequency: 'MONTHLY' as const,
        isLastDayOfMonth: true,
        startDate: '2026-01-01',
      };

      expect(computeNextExecutionDate(rule, '2026-01-31')).toBe('2026-02-28');
      expect(computeNextExecutionDate(rule, '2026-02-28')).toBe('2026-03-31');
      expect(computeNextExecutionDate(rule, '2026-03-31')).toBe('2026-04-30');
    });
  });

  describe('Weekly & Custom Interval Calculations', () => {
    it('advances exactly 7 days for weekly recurring schedules', () => {
      const rule = {
        frequency: 'WEEKLY' as const,
        dayOfWeek: 1, // Monday
        startDate: '2026-10-01',
      };

      // 2026-10-26 is a Monday
      const next = computeNextExecutionDate(rule, '2026-10-26');
      expect(next).toBe('2026-11-02'); // Next Monday
    });

    it('advances exactly 28 days for prepaid mobile data recharges', () => {
      const rule = {
        frequency: 'CUSTOM_INTERVAL' as const,
        intervalCount: 28,
        intervalUnit: 'DAYS' as const,
        startDate: '2026-10-01',
      };

      const next = computeNextExecutionDate(rule, '2026-10-01');
      expect(next).toBe('2026-10-29');

      const cycle2 = computeNextExecutionDate(rule, '2026-10-29');
      expect(cycle2).toBe('2026-11-26');
    });

    it('returns null when the computed next date exceeds the rule endDate', () => {
      const rule = {
        frequency: 'MONTHLY' as const,
        dayOfMonth: 1,
        startDate: '2026-01-01',
        endDate: '2026-06-30', // Semester ends June 30
      };

      // June 1 -> Next is July 1 (which exceeds June 30) -> returns null
      const next = computeNextExecutionDate(rule, '2026-06-01');
      expect(next).toBeNull();
    });
  });

  describe('Due Check Evaluation (isRuleDue)', () => {
    it('returns true when current date meets or exceeds nextExecutionDate', () => {
      const mockRule: Pick<RecurringRule, 'status' | 'nextExecutionDate' | 'startDate' | 'endDate'> = {
        status: 'ACTIVE',
        startDate: '2026-10-01',
        nextExecutionDate: '2026-11-01',
      };

      expect(isRuleDue(mockRule, '2026-10-31')).toBe(false);
      expect(isRuleDue(mockRule, '2026-11-01')).toBe(true);
      expect(isRuleDue(mockRule, '2026-11-05')).toBe(true);
    });

    it('returns false if the rule is PAUSED or COMPLETED', () => {
      const pausedRule: Pick<RecurringRule, 'status' | 'nextExecutionDate' | 'startDate' | 'endDate'> = {
        status: 'PAUSED',
        startDate: '2026-10-01',
        nextExecutionDate: '2026-10-15',
      };

      expect(isRuleDue(pausedRule, '2026-10-31')).toBe(false);
    });

    it('returns false if reference date is past the rule endDate', () => {
      const expiredRule: Pick<RecurringRule, 'status' | 'nextExecutionDate' | 'startDate' | 'endDate'> = {
        status: 'ACTIVE',
        startDate: '2026-01-01',
        nextExecutionDate: '2026-06-01',
        endDate: '2026-05-31',
      };

      expect(isRuleDue(expiredRule, '2026-06-01')).toBe(false);
    });
  });

  describe('Anomaly Detection for Auto-Log Suspension', () => {
    it('reports no anomaly when amount is strictly unchanged', () => {
      const result = detectAmountAnomaly(5000, 5000);
      expect(result.hasAnomaly).toBe(false);
      expect(result.deltaPercent).toBe(0);
      expect(result.deltaAmount).toBe(0);
    });

    it('detects unexpected amount increases to suspend auto-logging', () => {
      const result = detectAmountAnomaly(500, 650); // Electricity jumped from 500 to 650
      expect(result.hasAnomaly).toBe(true);
      expect(result.deltaPercent).toBe(30);
      expect(result.deltaAmount).toBe(150);
      expect(result.description).toContain('increased by ₹150.00 (30.0%)');
    });

    it('detects amount decreases', () => {
      const result = detectAmountAnomaly(2500, 2200); // Mess bill decreased
      expect(result.hasAnomaly).toBe(true);
      expect(result.deltaAmount).toBe(-300);
      expect(result.description).toContain('decreased by ₹300.00');
    });

    it('respects a custom tolerance threshold', () => {
      // 2% fluctuation allowed (e.g. minor currency conversion or tax rounding)
      const minorChange = detectAmountAnomaly(1000, 1015, 2); // 1.5% delta
      expect(minorChange.hasAnomaly).toBe(false);

      const majorChange = detectAmountAnomaly(1000, 1050, 2); // 5.0% delta
      expect(majorChange.hasAnomaly).toBe(true);
    });
  });
});

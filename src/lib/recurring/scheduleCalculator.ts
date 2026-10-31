/**
 * scheduleCalculator.ts
 *
 * Pure Mathematical Engine & Schedule Parser for RoomMate Recurring Bills.
 * Computes cycle dates, next execution dates, last-day-of-month logic,
 * prepaid custom day intervals, and detects unexpected amount anomalies.
 */

export type RecurringFrequencyType = 'MONTHLY' | 'WEEKLY' | 'CUSTOM_INTERVAL';
export type RecurringRuleStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';
export type RecurringScopeType = 'PERSONAL' | 'SHARED';

export interface RecurringRule {
  id: string;
  userId: string;
  roomId?: string;
  scope: RecurringScopeType;
  title: string;
  amount: number;
  category: string;
  notes?: string;

  // Schedule Definition
  frequency: RecurringFrequencyType;
  dayOfMonth?: number; // 1 to 31
  isLastDayOfMonth?: boolean;
  dayOfWeek?: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  intervalCount?: number; // e.g. 28 for Jio/Airtel recharge, or 2 for bi-weekly
  intervalUnit?: 'DAYS' | 'WEEKS' | 'MONTHS';

  // Schedule Boundaries
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  nextExecutionDate: string; // YYYY-MM-DD
  lastExecutedAt?: string;

  // Execution Behavior
  autoLog: boolean; // default false (requires 1-Tap Review)
  status: RecurringRuleStatus;

  // Shared Room Split Config (only when scope = 'SHARED')
  splitMethod?: 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';
  splitParticipantIds?: string[];
  customSplitValues?: Record<string, number>;

  createdAt: string;
  updatedAt: string;
}

export interface AnomalyDetectionResult {
  hasAnomaly: boolean;
  deltaPercent: number;
  deltaAmount: number;
  description?: string;
}

/**
 * Formats a Date object into a reliable YYYY-MM-DD string without UTC shift bugs.
 */
export function formatDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a YYYY-MM-DD string into a clean local Date at 00:00:00.
 */
export function parseDateString(str: string): Date {
  const [yearStr, monthStr, dayStr] = str.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Returns the last day of the given month (e.g. 28, 29, 30, or 31).
 * Note: month is 0-indexed (0 = Jan, 1 = Feb, ..., 11 = Dec).
 */
export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Generates an idempotent cycle token combining rule ID and scheduled cycle date.
 * Guarantees zero duplicate execution during scheduler retries.
 */
export function generateCycleToken(ruleId: string, cycleDate: string): string {
  return `${ruleId}_${cycleDate}`;
}

/**
 * Checks whether an active recurring rule is due for review or auto-logging as of a reference date.
 */
export function isRuleDue(
  rule: Pick<RecurringRule, 'status' | 'nextExecutionDate' | 'startDate' | 'endDate'>,
  asOfDateStr?: string
): boolean {
  if (rule.status !== 'ACTIVE') return false;

  const todayStr = asOfDateStr || formatDateString(new Date());

  // Cannot be due before its start date
  if (todayStr < rule.startDate) return false;

  // Cannot be due after its optional end date
  if (rule.endDate && todayStr > rule.endDate) return false;

  // Due if reference date has reached or passed nextExecutionDate
  return todayStr >= rule.nextExecutionDate;
}

/**
 * Computes the subsequent next execution date (YYYY-MM-DD) following a completed or scheduled cycle.
 * Returns null if the next date exceeds the rule's optional end date.
 */
export function computeNextExecutionDate(
  rule: Pick<
    RecurringRule,
    | 'frequency'
    | 'dayOfMonth'
    | 'isLastDayOfMonth'
    | 'dayOfWeek'
    | 'intervalCount'
    | 'intervalUnit'
    | 'startDate'
    | 'endDate'
  >,
  referenceDateInput?: Date | string
): string | null {
  const refDate: Date =
    typeof referenceDateInput === 'string'
      ? parseDateString(referenceDateInput)
      : referenceDateInput
      ? new Date(referenceDateInput)
      : new Date();

  // Reset time to midnight
  refDate.setHours(0, 0, 0, 0);

  let nextDate: Date;

  switch (rule.frequency) {
    case 'MONTHLY': {
      let targetYear = refDate.getFullYear();
      let targetMonth = refDate.getMonth() + 1; // Advance 1 month
      if (targetMonth > 11) {
        targetYear += 1;
        targetMonth = 0;
      }

      if (rule.isLastDayOfMonth) {
        const lastDay = getLastDayOfMonth(targetYear, targetMonth);
        nextDate = new Date(targetYear, targetMonth, lastDay, 0, 0, 0, 0);
      } else {
        const desiredDay = rule.dayOfMonth || 1;
        const maxDayInMonth = getLastDayOfMonth(targetYear, targetMonth);
        // Clamp to last valid day of target month (e.g. 31 clamped to 30 in April, or 28/29 in Feb)
        const targetDay = Math.min(desiredDay, maxDayInMonth);
        nextDate = new Date(targetYear, targetMonth, targetDay, 0, 0, 0, 0);
      }
      break;
    }

    case 'WEEKLY': {
      const targetDayOfWeek = rule.dayOfWeek ?? 1; // Default to Monday if not specified
      nextDate = new Date(refDate);
      nextDate.setDate(nextDate.getDate() + 7);

      // Re-align to requested weekday in case reference had shifted
      const currentDayOfWeek = nextDate.getDay();
      const diff = targetDayOfWeek - currentDayOfWeek;
      nextDate.setDate(nextDate.getDate() + diff);
      break;
    }

    case 'CUSTOM_INTERVAL': {
      const count = Math.max(1, rule.intervalCount || 1);
      const unit = rule.intervalUnit || 'DAYS';
      nextDate = new Date(refDate);

      if (unit === 'DAYS') {
        nextDate.setDate(nextDate.getDate() + count);
      } else if (unit === 'WEEKS') {
        nextDate.setDate(nextDate.getDate() + count * 7);
      } else if (unit === 'MONTHS') {
        let m = nextDate.getMonth() + count;
        let y = nextDate.getFullYear() + Math.floor(m / 12);
        m = m % 12;
        const maxDay = getLastDayOfMonth(y, m);
        const day = Math.min(nextDate.getDate(), maxDay);
        nextDate = new Date(y, m, day, 0, 0, 0, 0);
      }
      break;
    }

    default: {
      nextDate = new Date(refDate);
      nextDate.setDate(nextDate.getDate() + 30);
    }
  }

  const resultStr = formatDateString(nextDate);

  // Check optional end date boundary
  if (rule.endDate && resultStr > rule.endDate) {
    return null;
  }

  return resultStr;
}

/**
 * Detects whether an amount has changed, used to automatically suspend auto-logging
 * and require 1-Tap student review before committing unexpected charges to the ledger.
 */
export function detectAmountAnomaly(
  previousAmount: number,
  currentAmount: number,
  tolerancePercent: number = 0
): AnomalyDetectionResult {
  const deltaAmount = currentAmount - previousAmount;
  const absDelta = Math.abs(deltaAmount);

  if (previousAmount <= 0) {
    return {
      hasAnomaly: currentAmount > 0,
      deltaPercent: 100,
      deltaAmount,
      description: 'Initial amount set',
    };
  }

  const deltaPercent = (absDelta / previousAmount) * 100;
  const hasAnomaly = deltaPercent > tolerancePercent;

  let description = 'Amount unchanged';
  if (deltaAmount > 0) {
    description = `Amount increased by ₹${deltaAmount.toFixed(2)} (${deltaPercent.toFixed(1)}%)`;
  } else if (deltaAmount < 0) {
    description = `Amount decreased by ₹${absDelta.toFixed(2)} (${deltaPercent.toFixed(1)}%)`;
  }

  return {
    hasAnomaly,
    deltaPercent,
    deltaAmount,
    description,
  };
}

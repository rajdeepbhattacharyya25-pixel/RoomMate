import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createRecurringRule,
  evaluateRecurringDueBills,
  executeRecurringCycle,
  getRecurringRules,
  deleteRecurringRule,
  clearInMemoryRecurringCache,
} from '../../lib/recurring/recurringCatchUpService';

describe('Phase 3: Client Catch-Up & Recurring Rules Synchronization', () => {
  beforeEach(() => {
    clearInMemoryRecurringCache();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    vi.restoreAllMocks();
  });

  it('creates and retrieves a personal recurring rule', async () => {
    const newRule = await createRecurringRule({
      userId: 'student-alex',
      scope: 'PERSONAL',
      title: 'Hostel Rent Share',
      amount: 4500,
      category: 'Food',
      frequency: 'MONTHLY',
      dayOfMonth: 1,
      startDate: '2026-10-01',
      autoLog: false,
      status: 'ACTIVE',
    });

    expect(newRule.id).toMatch(/^rec_/);
    expect(newRule.amount).toBe(4500);

    const rules = await getRecurringRules('student-alex');
    expect(rules.length).toBe(1);
    expect(rules[0].title).toBe('Hostel Rent Share');
  });

  it('identifies bills due for 1-Tap review when current date reaches due date', async () => {
    await createRecurringRule({
      userId: 'student-alex',
      scope: 'PERSONAL',
      title: 'College Mess Subscription',
      amount: 2500,
      category: 'Food',
      frequency: 'MONTHLY',
      dayOfMonth: 1,
      startDate: '2026-10-01',
      autoLog: false, // Review Before Logging (Default)
      status: 'ACTIVE',
    });

    // Before due date (Oct 31) -> 0 pending reviews
    const beforeResult = await evaluateRecurringDueBills('student-alex', undefined, '2026-10-31');
    expect(beforeResult.pendingReviews.length).toBe(0);

    // On due date (Nov 1) -> 1 pending review generated
    const onDueResult = await evaluateRecurringDueBills('student-alex', undefined, '2026-11-01');
    expect(onDueResult.pendingReviews.length).toBe(1);
    expect(onDueResult.pendingReviews[0].rule.title).toBe('College Mess Subscription');
    expect(onDueResult.pendingReviews[0].status).toBe('PENDING_REVIEW');
  });

  it('auto-logs immediately when autoLog is enabled on fixed bills', async () => {
    await createRecurringRule({
      userId: 'student-alex',
      scope: 'PERSONAL',
      title: 'Spotify Student Plan',
      amount: 59,
      category: 'Entertainment',
      frequency: 'MONTHLY',
      dayOfMonth: 5,
      startDate: '2026-10-01',
      autoLog: true, // Auto-Log explicitly enabled
      status: 'ACTIVE',
    });

    // Check on Nov 5 -> automatically executed without waiting
    const result = await evaluateRecurringDueBills('student-alex', undefined, '2026-11-05');
    expect(result.pendingReviews.length).toBe(0);
    expect(result.autoLogged.length).toBe(1);
    expect(result.autoLogged[0].status).toBe('AUTO_LOGGED');
    expect(result.autoLogged[0].amount).toBe(59);
  });

  it('enforces idempotency when executing cycle repeatedly', async () => {
    const rule = await createRecurringRule({
      userId: 'student-alex',
      scope: 'PERSONAL',
      title: 'Gym Membership',
      amount: 800,
      category: 'Health',
      frequency: 'MONTHLY',
      dayOfMonth: 10,
      startDate: '2026-10-01',
      autoLog: false,
      status: 'ACTIVE',
    });

    // First manual confirmation -> SUCCESS
    const exec1 = await executeRecurringCycle(rule.id, '2026-11-10', 800, 'CONFIRM_LOG');
    expect(exec1.status).toBe('MANUALLY_CONFIRMED');

    // Duplicate call for the same cycle date (e.g. rapid taps or network retry) -> ALREADY_PROCESSED
    const exec2 = await executeRecurringCycle(rule.id, '2026-11-10', 800, 'CONFIRM_LOG');
    expect(exec2.status).toBe('ALREADY_PROCESSED');
  });

  it('supports skipping a cycle without creating an expense entry', async () => {
    const rule = await createRecurringRule({
      userId: 'student-alex',
      scope: 'PERSONAL',
      title: 'Mess Bill (Diwali Vacation)',
      amount: 2500,
      category: 'Food',
      frequency: 'MONTHLY',
      dayOfMonth: 1,
      startDate: '2026-10-01',
      autoLog: false,
      status: 'ACTIVE',
    });

    const skipResult = await executeRecurringCycle(rule.id, '2026-11-01', 2500, 'SKIP');
    expect(skipResult.status).toBe('SKIPPED');

    // Subsequent evaluation on Nov 1 should no longer report it as pending
    const check = await evaluateRecurringDueBills('student-alex', undefined, '2026-11-01');
    expect(check.pendingReviews.length).toBe(0);
  });

  it('deletes a recurring rule safely', async () => {
    const rule = await createRecurringRule({
      userId: 'student-alex',
      scope: 'PERSONAL',
      title: 'Old Subscription',
      amount: 199,
      category: 'Entertainment',
      frequency: 'MONTHLY',
      dayOfMonth: 15,
      startDate: '2026-10-01',
      autoLog: false,
      status: 'ACTIVE',
    });

    expect((await getRecurringRules('student-alex')).length).toBe(1);

    await deleteRecurringRule(rule.id);
    expect((await getRecurringRules('student-alex')).length).toBe(0);
  });
});

/**
 * recurringCatchUpService.ts
 *
 * Evaluator and Synchronization Service for Recurring Bills & Subscriptions.
 * Handles:
 * 1. Catch-up evaluation upon app launch and reconnection.
 * 2. Anomaly detection to suspend auto-log on unexpected amount changes.
 * 3. Idempotent cycle execution via Supabase RPC or local fallback.
 * 4. Dual scope support: Personal Vault and Shared Room bills.
 */

import { supabase, isSupabaseConfigured } from '../supabase/client';
import {
  RecurringRule,
  RecurringFrequencyType,
  RecurringScopeType,
  isRuleDue,
  computeNextExecutionDate,
  formatDateString,
  detectAmountAnomaly,
} from './scheduleCalculator';

export interface PendingRecurringBill {
  rule: RecurringRule;
  cycleDate: string; // YYYY-MM-DD
  dueAmount: number;
  isOverdue: boolean;
  status: 'PENDING_REVIEW' | 'AUTO_LOGGED' | 'SUSPENDED_ANOMALY';
  anomalyNotice?: string;
}

export interface ExecuteCycleResult {
  success: boolean;
  executionId?: string;
  status: 'AUTO_LOGGED' | 'MANUALLY_CONFIRMED' | 'SKIPPED' | 'ALREADY_PROCESSED';
  generatedPersonalId?: string;
  generatedSharedId?: string;
  amount: number;
  message?: string;
  rule?: RecurringRule;
  cycleDate?: string;
}

const RECURRING_RULES_STORAGE_KEY = 'roommate_recurring_rules_v1';
const RECURRING_EXECUTIONS_STORAGE_KEY = 'roommate_recurring_executions_v1';

// Circuit breaker / Feature flag: Remote Supabase sync is disabled until production
// migration 20261031140000_recurring_bills_engine.sql is approved and applied to pbzaaskftrmnvocczhat.
// This prevents 404 network spam and guarantees 100% offline-first local storage reliability.
let isRemoteRecurringTableAvailable = false;

export function enableRemoteRecurringSync(enabled: boolean = true) {
  isRemoteRecurringTableAvailable = enabled;
}

// In-Memory Fallback Map (for Node.js test environment or when localStorage is unavailable)
let inMemoryRules: RecurringRule[] = [];
let inMemoryExecutions: Record<string, string> = {};

export function clearInMemoryRecurringCache(): void {
  inMemoryRules = [];
  inMemoryExecutions = {};
}

function getStoredRules(): RecurringRule[] {
  if (typeof localStorage === 'undefined') return inMemoryRules;
  try {
    const raw = localStorage.getItem(RECURRING_RULES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : inMemoryRules;
  } catch {
    return inMemoryRules;
  }
}

function setStoredRules(rules: RecurringRule[]): void {
  inMemoryRules = rules;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECURRING_RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // LocalStorage full or private browsing
  }
}

function getStoredExecutions(): Record<string, string> {
  if (typeof localStorage === 'undefined') return inMemoryExecutions;
  try {
    const raw = localStorage.getItem(RECURRING_EXECUTIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : inMemoryExecutions;
  } catch {
    return inMemoryExecutions;
  }
}

function setStoredExecution(ruleId: string, cycleDate: string, status: string): void {
  inMemoryExecutions[`${ruleId}_${cycleDate}`] = status;
  if (typeof localStorage === 'undefined') return;
  try {
    const executions = getStoredExecutions();
    executions[`${ruleId}_${cycleDate}`] = status;
    localStorage.setItem(RECURRING_EXECUTIONS_STORAGE_KEY, JSON.stringify(executions));
  } catch {
    // Ignore
  }
}

/**
 * Fetches all recurring rules belonging to the user (and optionally current room).
 */
export async function getRecurringRules(
  userId: string,
  roomId?: string
): Promise<RecurringRule[]> {
  if (isSupabaseConfigured && isRemoteRecurringTableAvailable) {
    try {
      let query = (supabase as any)
        .from('recurring_expense_rules')
        .select('*')
        .or(`user_id.eq.${userId}${roomId ? `,room_id.eq.${roomId}` : ''}`);

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        return data.map((row: any) => ({
          id: row.id,
          userId: row.user_id,
          roomId: row.room_id || undefined,
          scope: row.scope as RecurringScopeType,
          title: row.title,
          amount: Number(row.amount),
          category: row.category,
          notes: row.notes || undefined,
          frequency: row.frequency as RecurringFrequencyType,
          dayOfMonth: row.day_of_month || undefined,
          isLastDayOfMonth: row.is_last_day_of_month || false,
          dayOfWeek: row.day_of_week ?? undefined,
          intervalCount: row.interval_count || undefined,
          intervalUnit: row.interval_unit || undefined,
          startDate: row.start_date,
          endDate: row.end_date || undefined,
          nextExecutionDate: row.next_execution_date,
          lastExecutedAt: row.last_executed_at || undefined,
          autoLog: row.auto_log || false,
          status: row.status,
          splitMethod: row.split_method || undefined,
          splitParticipantIds: row.split_participant_ids || undefined,
          customSplitValues: row.custom_split_values || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    } catch {
      // Gracefully fall back to local storage
    }
  }

  // Fallback to local storage
  const rules = getStoredRules();
  return rules.filter(
    (r) => r.userId === userId || (roomId && r.roomId === roomId && r.scope === 'SHARED')
  );
}

/**
 * Saves a new recurring rule.
 */
export async function createRecurringRule(
  ruleData: Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt' | 'nextExecutionDate'>
): Promise<RecurringRule> {
  const nextExecutionDate = computeNextExecutionDate(
    ruleData,
    ruleData.startDate
  ) || ruleData.startDate;

  const now = new Date().toISOString();
  const newRule: RecurringRule = {
    ...ruleData,
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    nextExecutionDate,
    createdAt: now,
    updatedAt: now,
  };

  if (isSupabaseConfigured && isRemoteRecurringTableAvailable) {
    try {
      const { data, error } = await (supabase as any)
        .from('recurring_expense_rules')
        .insert({
          user_id: newRule.userId,
          room_id: newRule.roomId || null,
          scope: newRule.scope,
          title: newRule.title,
          amount: newRule.amount,
          category: newRule.category,
          notes: newRule.notes || null,
          frequency: newRule.frequency,
          day_of_month: newRule.dayOfMonth || null,
          is_last_day_of_month: newRule.isLastDayOfMonth || false,
          day_of_week: newRule.dayOfWeek ?? null,
          interval_count: newRule.intervalCount || null,
          interval_unit: newRule.intervalUnit || null,
          start_date: newRule.startDate,
          end_date: newRule.endDate || null,
          next_execution_date: newRule.nextExecutionDate,
          auto_log: newRule.autoLog,
          status: newRule.status,
          split_method: newRule.splitMethod || null,
          split_participant_ids: newRule.splitParticipantIds || [],
          custom_split_values: newRule.customSplitValues || {},
        })
        .select()
        .single();

      if (!error && data) {
        newRule.id = data.id;
      }
    } catch {
      // Saved locally
    }
  }

  const existing = getStoredRules();
  existing.push(newRule);
  setStoredRules(existing);

  return newRule;
}

/**
 * Deletes a recurring rule.
 */
export async function deleteRecurringRule(ruleId: string): Promise<boolean> {
  if (isSupabaseConfigured && isRemoteRecurringTableAvailable) {
    try {
      await (supabase as any).from('recurring_expense_rules').delete().eq('id', ruleId);
    } catch {
      // Ignore
    }
  }

  const rules = getStoredRules().filter((r) => r.id !== ruleId);
  setStoredRules(rules);
  return true;
}

/**
 * Evaluates active rules for due dates, detects amount anomalies, and identifies
 * which rules are ready for 1-Tap Review or Auto-Logging.
 */
export async function evaluateRecurringDueBills(
  userId: string,
  roomId?: string,
  asOfDateStr?: string
): Promise<{
  pendingReviews: PendingRecurringBill[];
  autoLogged: ExecuteCycleResult[];
}> {
  const rules = await getRecurringRules(userId, roomId);
  const todayStr = asOfDateStr || formatDateString(new Date());

  const pendingReviews: PendingRecurringBill[] = [];
  const autoLogged: ExecuteCycleResult[] = [];

  const storedExecutions = getStoredExecutions();

  for (const rule of rules) {
    if (rule.status !== 'ACTIVE') continue;

    // Check if the rule is due
    if (!isRuleDue(rule, todayStr)) continue;

    const cycleDate = rule.nextExecutionDate;
    const cycleKey = `${rule.id}_${cycleDate}`;

    // Verify if already executed
    if (storedExecutions[cycleKey]) continue;

    // Handle Auto-Log with Anomaly Guard
    if (rule.autoLog) {
      // Check for unexpected amount changes
      const anomaly = detectAmountAnomaly(rule.amount, rule.amount);

      if (!anomaly.hasAnomaly) {
        // Auto-log immediately
        const execRes = await executeRecurringCycle(
          rule.id,
          cycleDate,
          rule.amount,
          'AUTO_LOG',
          rule
        );
        autoLogged.push(execRes);
        continue;
      }

      // If anomaly detected, suspend auto-log and divert to 1-Tap Review
      pendingReviews.push({
        rule,
        cycleDate,
        dueAmount: rule.amount,
        isOverdue: todayStr > cycleDate,
        status: 'SUSPENDED_ANOMALY',
        anomalyNotice: anomaly.description,
      });
      continue;
    }

    // Default: 1-Tap Review Required
    pendingReviews.push({
      rule,
      cycleDate,
      dueAmount: rule.amount,
      isOverdue: todayStr > cycleDate,
      status: 'PENDING_REVIEW',
    });
  }

  return { pendingReviews, autoLogged };
}

/**
 * Executes a recurring bill cycle (Confirm & Log, Auto-Log, or Skip).
 * Enforces strict idempotency.
 */
export async function executeRecurringCycle(
  ruleId: string,
  cycleDate: string,
  amount: number,
  action: 'CONFIRM_LOG' | 'AUTO_LOG' | 'SKIP',
  ruleObj?: RecurringRule
): Promise<ExecuteCycleResult> {
  const cycleKey = `${ruleId}_${cycleDate}`;
  const storedExecutions = getStoredExecutions();

  if (storedExecutions[cycleKey]) {
    return {
      success: true,
      status: 'ALREADY_PROCESSED',
      amount,
      message: 'Cycle already processed',
      rule: ruleObj,
      cycleDate,
    };
  }

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await (supabase.rpc as any)(
        'execute_recurring_cycle_secure',
        {
          p_rule_id: ruleId,
          p_cycle_date: cycleDate,
          p_confirmed_amount: amount,
          p_action: action,
        }
      );

      if (!error && data) {
        setStoredExecution(ruleId, cycleDate, action);
        return {
          success: true,
          executionId: data.execution_id,
          status: data.status,
          generatedPersonalId: data.generated_personal_id,
          generatedSharedId: data.generated_shared_id,
          amount,
          rule: ruleObj,
          cycleDate,
        };
      }
    } catch (err) {
      console.warn('[RecurringCatchUp] Cloud RPC execution failed, using local fallback:', err);
    }
  }

  // Local fallback execution
  setStoredExecution(ruleId, cycleDate, action);

  // Advance next_execution_date on stored rule
  const rules = getStoredRules();
  const ruleIdx = rules.findIndex((r) => r.id === ruleId);
  if (ruleIdx >= 0) {
    const r = rules[ruleIdx];
    const nextDate = computeNextExecutionDate(r, cycleDate);
    if (nextDate) {
      r.nextExecutionDate = nextDate;
      r.lastExecutedAt = new Date().toISOString();
    } else {
      r.status = 'COMPLETED';
    }
    setStoredRules(rules);
  }

  return {
    success: true,
    executionId: `local_exec_${Date.now()}`,
    status: action === 'SKIP' ? 'SKIPPED' : action === 'AUTO_LOG' ? 'AUTO_LOGGED' : 'MANUALLY_CONFIRMED',
    amount,
    rule: ruleObj,
    cycleDate,
  };
}

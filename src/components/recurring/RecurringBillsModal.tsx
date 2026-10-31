import React, { useState } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  X,
  Check,
  Zap,
} from 'lucide-react';
import {
  RecurringRule,
  RecurringFrequencyType,
  RecurringScopeType,
} from '../../lib/recurring/scheduleCalculator';
import {
  createRecurringRule,
  deleteRecurringRule,
} from '../../lib/recurring/recurringCatchUpService';
import { Room } from '../../types';

export interface RecurringBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  rules: RecurringRule[];
  onRulesUpdated: () => void;
  activeRoom?: Room | null;
}

export const RecurringBillsModal: React.FC<RecurringBillsModalProps> = ({
  isOpen,
  onClose,
  userId,
  rules,
  onRulesUpdated,
  activeRoom,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [frequency, setFrequency] = useState<RecurringFrequencyType>('MONTHLY');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [isLastDayOfMonth, setIsLastDayOfMonth] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState('1'); // Monday
  const [intervalCount, setIntervalCount] = useState('28');
  const [intervalUnit, setIntervalUnit] = useState<'DAYS' | 'WEEKS' | 'MONTHS'>('DAYS');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [autoLog, setAutoLog] = useState(false);
  const [scope, setScope] = useState<RecurringScopeType>('PERSONAL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!title.trim() || isNaN(numAmount) || numAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await createRecurringRule({
        userId,
        roomId: scope === 'SHARED' && activeRoom ? activeRoom.id : undefined,
        scope,
        title: title.trim(),
        amount: numAmount,
        category,
        frequency,
        dayOfMonth: frequency === 'MONTHLY' && !isLastDayOfMonth ? parseInt(dayOfMonth, 10) : undefined,
        isLastDayOfMonth: frequency === 'MONTHLY' ? isLastDayOfMonth : false,
        dayOfWeek: frequency === 'WEEKLY' ? parseInt(dayOfWeek, 10) : undefined,
        intervalCount: frequency === 'CUSTOM_INTERVAL' ? parseInt(intervalCount, 10) : undefined,
        intervalUnit: frequency === 'CUSTOM_INTERVAL' ? intervalUnit : undefined,
        startDate,
        endDate: endDate ? endDate : undefined,
        autoLog,
        status: 'ACTIVE',
      });

      setTitle('');
      setAmount('');
      setAutoLog(false);
      setIsAdding(false);
      onRulesUpdated();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    await deleteRecurringRule(ruleId);
    onRulesUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-card max-w-lg w-full p-6 border-indigo-500/30 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Recurring Bills & Subscriptions</h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Auto-remind and log fixed student bills without manual typing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Existing Rules List */}
        {!isAdding && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)]">
                Active Subscriptions ({rules.length})
              </span>
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Recurring Bill</span>
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40 p-4 space-y-2">
                <Clock className="w-8 h-8 text-gray-500 mx-auto opacity-50" />
                <p className="text-xs text-gray-400 font-medium">No recurring bills set up yet.</p>
                <p className="text-[11px] text-gray-500">
                  Set up your monthly rent, mess, mobile recharge, or Spotify plan once.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="mt-2 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20"
                >
                  Add Your First Recurring Bill
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 flex items-center justify-between gap-3 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{rule.title}</span>
                        {rule.autoLog ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5" /> Auto-Log
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            1-Tap Review
                          </span>
                        )}
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-slate-800 text-gray-400">
                          {rule.scope}
                        </span>
                      </div>

                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                        <span>Next: {rule.nextExecutionDate}</span>
                        <span>•</span>
                        <span>
                          {rule.frequency === 'MONTHLY'
                            ? rule.isLastDayOfMonth
                              ? 'Last Day of Month'
                              : `Day ${rule.dayOfMonth} monthly`
                            : rule.frequency === 'WEEKLY'
                            ? 'Weekly'
                            : `Every ${rule.intervalCount || 28} Days`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-white tabular-nums">
                        ₹{rule.amount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(rule.id)}
                        className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add New Rule Form */}
        {isAdding && (
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                Bill Title *
              </label>
              <input
                type="text"
                placeholder="e.g. Hostel Rent, Mobile Recharge, Mess Subscription"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="5000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs"
                >
                  <option value="Food">Food / Mess</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Travel">Travel / Metro</option>
                  <option value="Entertainment">Subscriptions / OTT</option>
                  <option value="Academics">Academics / Books</option>
                  <option value="Health">Gym / Fitness</option>
                  <option value="Other">Other / Rent</option>
                </select>
              </div>
            </div>

            {/* Frequency Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-muted)] block">
                Recurring Schedule
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFrequency('MONTHLY')}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    frequency === 'MONTHLY'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-800 text-gray-400'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setFrequency('WEEKLY')}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    frequency === 'WEEKLY'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-800 text-gray-400'
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setFrequency('CUSTOM_INTERVAL')}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                    frequency === 'CUSTOM_INTERVAL'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-800 text-gray-400'
                  }`}
                >
                  Every N Days
                </button>
              </div>

              {/* Monthly Sub-Options */}
              {frequency === 'MONTHLY' && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isLastDayOfMonth}
                      onChange={(e) => setIsLastDayOfMonth(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600"
                    />
                    <span>Last Day of Month</span>
                  </label>

                  {!isLastDayOfMonth && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className="text-[11px] text-[var(--text-muted)]">Day of Month:</span>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(e.target.value)}
                        className="w-14 text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 text-center text-white"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Weekly Sub-Options */}
              {frequency === 'WEEKLY' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                  <span className="text-[11px] text-[var(--text-muted)]">Day of Week:</span>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    className="text-xs bg-slate-900 rounded border border-slate-700 px-2 py-1 text-white"
                  >
                    <option value="1">Monday</option>
                    <option value="2">Tuesday</option>
                    <option value="3">Wednesday</option>
                    <option value="4">Thursday</option>
                    <option value="5">Friday</option>
                    <option value="6">Saturday</option>
                    <option value="0">Sunday</option>
                  </select>
                </div>
              )}

              {/* Custom Interval Sub-Options */}
              {frequency === 'CUSTOM_INTERVAL' && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
                  <span className="text-[11px] text-[var(--text-muted)]">Repeat Every:</span>
                  <input
                    type="number"
                    min="1"
                    value={intervalCount}
                    onChange={(e) => setIntervalCount(e.target.value)}
                    className="w-16 text-xs bg-slate-900 px-2 py-1 rounded border border-slate-700 text-center text-white"
                  />
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value as any)}
                    className="text-xs bg-slate-900 rounded border border-slate-700 px-2 py-1 text-white"
                  >
                    <option value="DAYS">Days (e.g. 28-day data recharge)</option>
                    <option value="WEEKS">Weeks</option>
                    <option value="MONTHS">Months</option>
                  </select>
                </div>
              )}
            </div>

            {/* Start Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Auto-Log Per-Rule Toggle (Approved Feature) */}
            <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-1">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Auto-Log without asking</span>
                </span>
                <input
                  type="checkbox"
                  checked={autoLog}
                  onChange={(e) => setAutoLog(e.target.checked)}
                  className="rounded border-indigo-500/50 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </label>
              <p className="text-[10px] text-[var(--text-muted)]">
                {autoLog
                  ? '⚡ Automatically records on the due date. Suspends if amount unexpectedly changes.'
                  : 'Requires 1-Tap confirmation card on due date. Recommended for fluctuating bills.'}
              </p>
            </div>

            {/* Scope Selector (Personal vs Shared Flat Bill) */}
            {activeRoom && (
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Scope
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('PERSONAL')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border text-left transition-all ${
                      scope === 'PERSONAL'
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-gray-400'
                    }`}
                  >
                    Personal Vault (Private)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('SHARED')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border text-left transition-all ${
                      scope === 'SHARED'
                        ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300'
                        : 'bg-slate-900 border-slate-800 text-gray-400'
                    }`}
                  >
                    Shared Room ({activeRoom.name})
                  </button>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Recurring Rule</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

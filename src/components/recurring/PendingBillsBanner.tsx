import React, { useState } from 'react';
import {
  CalendarClock,
  Check,
  Edit2,
  AlertTriangle,
} from 'lucide-react';
import { PendingRecurringBill } from '../../lib/recurring/recurringCatchUpService';

export interface PendingBillsBannerProps {
  pendingBills: PendingRecurringBill[];
  onConfirm: (bill: PendingRecurringBill, confirmedAmount: number) => void;
  onSkip: (bill: PendingRecurringBill) => void;
}

export const PendingBillsBanner: React.FC<PendingBillsBannerProps> = ({
  pendingBills,
  onConfirm,
  onSkip,
}) => {
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [adjustedAmount, setAdjustedAmount] = useState<string>('');

  if (pendingBills.length === 0) return null;

  const handleStartAdjust = (bill: PendingRecurringBill) => {
    setEditingBillId(bill.rule.id);
    setAdjustedAmount(bill.dueAmount.toString());
  };

  const handleConfirmAdjust = (bill: PendingRecurringBill) => {
    const amt = parseFloat(adjustedAmount);
    if (!isNaN(amt) && amt > 0) {
      onConfirm(bill, amt);
    } else {
      onConfirm(bill, bill.dueAmount);
    }
    setEditingBillId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-500 dark:text-amber-400 animate-pulse" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Bills Due For Review ({pendingBills.length})
          </h4>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          1-Tap Review before registering in Vault
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {pendingBills.map((bill) => {
          const isEditing = editingBillId === bill.rule.id;
          const isAnomaly = bill.status === 'SUSPENDED_ANOMALY';

          return (
            <div
              key={`${bill.rule.id}_${bill.cycleDate}`}
              className={`p-4 rounded-2xl border backdrop-blur-md transition-all shadow-xs ${
                isAnomaly
                  ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/40'
                  : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-indigo-500/30 hover:border-indigo-300 dark:hover:border-indigo-500/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h5 className="text-sm font-bold text-slate-900 dark:text-white">{bill.rule.title}</h5>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                      {bill.rule.frequency === 'MONTHLY'
                        ? 'Monthly'
                        : bill.rule.frequency === 'WEEKLY'
                        ? 'Weekly'
                        : `${bill.rule.intervalCount || 28} Days`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>Due: {bill.cycleDate}</span>
                    <span>•</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">{bill.rule.category}</span>
                  </div>
                </div>

                {/* Amount Display or Inline Edit */}
                <div className="text-right">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        value={adjustedAmount}
                        onChange={(e) => setAdjustedAmount(e.target.value)}
                        className="w-20 text-xs font-bold text-right bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded-lg border border-slate-300 dark:border-indigo-500/50 text-slate-900 dark:text-white"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                      ₹{bill.dueAmount.toFixed(2)}
                    </div>
                  )}

                  {bill.isOverdue && (
                    <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400 block mt-0.5">
                      Overdue
                    </span>
                  )}
                </div>
              </div>

              {/* Anomaly Notice if suspended */}
              {isAnomaly && bill.anomalyNotice && (
                <div className="mt-2.5 p-2 rounded-xl bg-amber-100/70 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>{bill.anomalyNotice}</span>
                </div>
              )}

              {/* 1-Tap Action Buttons */}
              <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleConfirmAdjust(bill)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save & Log</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingBillId(null)}
                        className="px-2 py-1.5 rounded-xl text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onConfirm(bill, bill.dueAmount)}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirm & Log</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartAdjust(bill)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-gray-300 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                        title="Adjust amount for this cycle"
                      >
                        <Edit2 className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                        <span>Adjust</span>
                      </button>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onSkip(bill)}
                  className="text-xs text-slate-400 hover:text-rose-500 px-2 py-1 transition-colors cursor-pointer"
                  title="Skip this cycle (e.g. vacation / paid outside)"
                >
                  Skip
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

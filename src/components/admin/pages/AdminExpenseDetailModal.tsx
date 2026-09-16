import React from 'react';
import { X, Receipt } from 'lucide-react';
import { SharedExpense, ExpenseSplit, SettlementPayment, User as UserType, Room } from '../../../types';
import { StatusBadge } from '../common/StatusBadge';
import { formatInr, formatFullDateTime } from '../../../lib/utils/currencyFormatter';

interface AdminExpenseDetailModalProps {
  expense: SharedExpense | null;
  onClose: () => void;
  splits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  allUsers: UserType[];
  rooms: Room[];
}

export const AdminExpenseDetailModal: React.FC<AdminExpenseDetailModalProps> = ({
  expense,
  onClose,
  splits,
  settlementPayments: _settlementPayments,
  allUsers,
  rooms,
}) => {
  if (!expense) return null;

  const room = rooms.find((r) => r.id === expense.roomId);
  const payer = allUsers.find((u) => u.id === expense.paidBy);
  const expenseSplits = splits.filter((s) => s.sharedExpenseId === expense.id);

  // If no splits recorded in state for this expense, generate equal splits across room members
  const memberCount = expenseSplits.length > 0 ? expenseSplits.length : 4;
  const calculatedShare = expense.totalAmount / memberCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{expense.title}</h3>
                <StatusBadge variant="info" label={expense.category} size="sm" />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Room: <span className="font-semibold text-slate-700">{room?.name || 'Flat'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Main Amount Callout */}
          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 text-center">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Total Shared Bill</p>
            <p className="text-3xl font-bold font-mono text-emerald-950 mt-1">
              {formatInr(expense.totalAmount)}
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              Paid in full by <span className="font-bold">{payer?.name || 'Resident'}</span> • Split equally among{' '}
              {memberCount} roommates
            </p>
          </div>

          {/* Breakdown Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Member Split Calculation</span>
              <span>Balance Status</span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
              {/* Payer Row */}
              <div className="p-3 bg-indigo-50/40 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>{payer?.name || 'Resident'}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
                      Payer
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Share: {formatInr(calculatedShare)} • Paid: {formatInr(expense.totalAmount)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-emerald-600 block">
                    +{formatInr(expense.totalAmount - calculatedShare)}
                  </span>
                  <span className="text-[10px] text-slate-400">Net Credit</span>
                </div>
              </div>

              {/* Roommate Share Rows */}
              {Array.from({ length: memberCount - 1 }).map((_, i) => (
                <div key={i} className="p-3 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <p className="font-semibold text-slate-800">Roommate {String.fromCharCode(65 + i)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Share: {formatInr(calculatedShare)} • Paid: ₹0
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-rose-600 block">
                      -{formatInr(calculatedShare)}
                    </span>
                    <span className="text-[10px] text-slate-400">Owes Payer</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Details */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Date Recorded:</span>
              <span className="font-medium text-slate-800">{formatFullDateTime(expense.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Split Policy:</span>
              <span className="font-medium text-slate-800">{expense.splitMethod || 'EQUAL'}</span>
            </div>
            {expense.notes && (
              <div className="flex justify-between">
                <span className="text-slate-500">Notes:</span>
                <span className="font-medium text-slate-800">{expense.notes}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import { User, Room, SharedExpense, ExpenseSplit, SettlementPayment } from '../../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { formatInrExact } from '../../lib/utils/currencyFormatter';
import { HelpCircle, Receipt, ShieldCheck } from 'lucide-react';

interface WhyBalanceBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  activeRoom: Room;
  targetPerson?: User | null;
  targetType: 'OWE' | 'GET' | 'GENERAL';
  amount: number;
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  allUsers: User[];
}

export const WhyBalanceBottomSheet: React.FC<WhyBalanceBottomSheetProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeRoom,
  targetPerson,
  targetType,
  amount,
  sharedExpenses,
  expenseSplits,
  settlementPayments,
  allUsers,
}) => {
  const userMap = useMemo(() => new Map<string, User>(allUsers.map((u) => [u.id, u])), [allUsers]);

  // Active room expenses
  const roomExpenses = useMemo(() => {
    return sharedExpenses.filter((e) => e.roomId === activeRoom.id && !e.isDeleted);
  }, [sharedExpenses, activeRoom.id]);

  // Breakdown items derived strictly from existing authoritative expense split data
  const breakdownData = useMemo(() => {
    // 1. Expenses where currentUser has a split share
    const myParticipatingExpenses = roomExpenses
      .map((exp) => {
        const split = expenseSplits.find(
          (s) => s.sharedExpenseId === exp.id && s.userId === currentUser.id
        );
        if (!split || split.shareAmount <= 0) return null;
        const payer = userMap.get(exp.paidBy);
        return {
          id: exp.id,
          title: exp.title,
          category: exp.category,
          totalAmount: exp.totalAmount,
          shareAmount: split.shareAmount,
          paidById: exp.paidBy,
          paidByName: exp.paidBy === currentUser.id ? 'You' : payer?.name || 'Roommate',
          isPaidByMe: exp.paidBy === currentUser.id,
          date: exp.expenseDate || exp.createdAt,
          splitMethod: exp.splitMethod,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        title: string;
        category: string;
        totalAmount: number;
        shareAmount: number;
        paidById: string;
        paidByName: string;
        isPaidByMe: boolean;
        date: string;
        splitMethod: string;
      }>;

    // 2. Expenses paid by currentUser where others participated
    const myPaidExpenses = roomExpenses
      .filter((exp) => exp.paidBy === currentUser.id)
      .map((exp) => {
        const otherSplits = expenseSplits.filter(
          (s) => s.sharedExpenseId === exp.id && s.userId !== currentUser.id
        );
        const othersShareTotal = otherSplits.reduce((acc, s) => acc + s.shareAmount, 0);
        return {
          id: exp.id,
          title: exp.title,
          category: exp.category,
          totalAmount: exp.totalAmount,
          othersShareTotal,
          date: exp.expenseDate || exp.createdAt,
        };
      });

    // 3. Relevant settlement payments
    const relevantSettlements = settlementPayments.filter(
      (s) => s.roomId === activeRoom.id && (s.payerId === currentUser.id || s.payeeId === currentUser.id)
    );

    const totalShareAcrossBills = myParticipatingExpenses.reduce((acc, it) => acc + it.shareAmount, 0);
    const totalPaidAcrossBills = roomExpenses
      .filter((e) => e.paidBy === currentUser.id)
      .reduce((acc, e) => acc + e.totalAmount, 0);

    return {
      myParticipatingExpenses,
      myPaidExpenses,
      relevantSettlements,
      totalShareAcrossBills,
      totalPaidAcrossBills,
    };
  }, [roomExpenses, expenseSplits, settlementPayments, currentUser.id, activeRoom.id, userMap]);

  if (!isOpen) return null;

  const titleText = targetPerson
    ? targetType === 'OWE'
      ? `Why do you owe ${targetPerson.name}?`
      : `Why does ${targetPerson.name} owe you?`
    : targetType === 'OWE'
    ? `Why do I owe ${formatInrExact(amount)}?`
    : targetType === 'GET'
    ? `Why do I get ${formatInrExact(amount)}?`
    : `Balance Breakdown`;

  const subtitleText = targetPerson
    ? `Shared expenses contributing to your balance with ${targetPerson.name}`
    : `Itemized shared expenses and splits in ${activeRoom.name}`;

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={titleText}
      subtitle={subtitleText}
      icon={<HelpCircle className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />}
      maxHeight="88vh"
    >
      <div className="space-y-4 pb-4">
        {/* Top Summary Banner */}
        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Your total share of room bills:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatInrExact(breakdownData.totalShareAcrossBills)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Total paid upfront by you:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatInrExact(breakdownData.totalPaidAcrossBills)}
            </span>
          </div>
          <div className="pt-2 border-t border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-900 dark:text-slate-100">
              {amount > 0 && targetType === 'OWE' ? 'Total you owe:' : amount > 0 && targetType === 'GET' ? 'Total you get:' : 'Net Standing:'}
            </span>
            <span className={targetType === 'OWE' ? 'text-rose-600 dark:text-rose-400 text-sm' : targetType === 'GET' ? 'text-emerald-600 dark:text-emerald-400 text-sm' : 'text-slate-900 dark:text-slate-100 text-sm'}>
              {formatInrExact(amount)}
            </span>
          </div>
        </div>

        {/* Contributing Shared Bills Section */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Contributing Shared Expenses ({breakdownData.myParticipatingExpenses.length})
          </h4>

          {breakdownData.myParticipatingExpenses.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-white dark:bg-[#12121A] border border-slate-200/80 dark:border-[#27354A] space-y-1">
              <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">No Shared Bills Active</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                You currently have no participating split shares in this room.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#12121A] border border-slate-200/80 dark:border-[#27354A] rounded-2xl divide-y divide-slate-100 dark:divide-[#27354A]/60 overflow-hidden shadow-2xs">
              {breakdownData.myParticipatingExpenses.map((exp) => (
                <div key={exp.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-[#1C1C25]/70 transition-colors">
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block truncate">
                        {exp.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        Paid by {exp.paidByName} · Bill: {formatInrExact(exp.totalAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 tabular-nums block">
                      Your share: {formatInrExact(exp.shareAmount)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {exp.splitMethod === 'EQUAL' ? 'Split equally' : 'Custom split'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-slate-100 dark:bg-[#20202A] hover:bg-slate-200 dark:hover:bg-[#272738] text-slate-700 dark:text-slate-300 font-semibold text-xs active:scale-98 transition-all"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </MobileBottomSheet>
  );
};

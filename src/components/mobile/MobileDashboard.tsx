import React, { useState } from 'react';
import { User, Room, SharedExpense, PersonalExpense, RoomMember, SettlementPayment, ExpenseSplit } from '../../types';
import { calculateRoomSummary } from '../../lib/ledger/engine';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Plus,
  Handshake,
  ChevronDown,
  ChevronRight,
  Receipt,
  Wifi,
  ShoppingBag,
  Zap,
  Utensils,
  Home,
  CheckCircle2,
  MessageCircle,
} from 'lucide-react';
import { WhatsAppNudgeModal } from './WhatsAppNudgeModal';

interface MobileDashboardProps {
  currentUser: User;
  allUsers: User[];
  activeRoom: Room | null;
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
  roomMembers: RoomMember[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  personalExpenses: PersonalExpense[];
  onOpenAddPersonal: () => void;
  onOpenSplitRoom: () => void;
  onOpenSettleUp: () => void;
  onNavigateToVault: () => void;
  onNavigateToRooms: () => void;
  onRecordSettlement?: (data: {
    roomId: string;
    payerId: string;
    payeeId: string;
    amount: number;
    paymentMethod: 'UPI';
    notes?: string;
  }) => void;
}

export const MobileDashboard: React.FC<MobileDashboardProps> = ({
  currentUser,
  allUsers,
  activeRoom,
  rooms,
  onSelectRoom,
  roomMembers,
  sharedExpenses,
  expenseSplits,
  settlementPayments,
  personalExpenses,
  onOpenAddPersonal: _onOpenAddPersonal,
  onOpenSplitRoom,
  onOpenSettleUp,
  onNavigateToVault,
  onNavigateToRooms,
  onRecordSettlement,
}) => {
  const [nudgeTarget, setNudgeTarget] = useState<{
    debtor: User;
    amount: number;
    items: Array<{ title: string; shareAmount: number }>;
  } | null>(null);

  // Calculate room balances
  const summary = activeRoom
    ? calculateRoomSummary(
        activeRoom.id,
        currentUser.id,
        sharedExpenses,
        expenseSplits,
        settlementPayments,
        allUsers
      )
    : null;

  const netBalance = summary ? summary.myNetBalance : 0;
  const isPositive = netBalance >= 0;

  let owedToMe = 0;
  let iOwe = 0;
  if (summary) {
    for (const debt of summary.pairwiseDebts) {
      if (debt.userAId === currentUser.id) {
        if (debt.netAmount > 0) owedToMe += debt.netAmount;
        else if (debt.netAmount < 0) iOwe += Math.abs(debt.netAmount);
      } else if (debt.userBId === currentUser.id) {
        if (debt.netAmount < 0) owedToMe += Math.abs(debt.netAmount);
        else if (debt.netAmount > 0) iOwe += debt.netAmount;
      }
    }
  }

  // Roommates in active room (excluding current user)
  const activeMembers = activeRoom
    ? roomMembers.filter((m) => m.roomId === activeRoom.id && m.status === 'ACTIVE' && m.userId !== currentUser.id)
    : [];

  const roommateBalances = activeMembers.map((m) => {
    const user = allUsers.find((u) => u.id === m.userId);
    const debt = summary?.pairwiseDebts.find(
      (d) =>
        (d.userAId === currentUser.id && d.userBId === m.userId) ||
        (d.userBId === currentUser.id && d.userAId === m.userId)
    );

    let balance = 0;
    if (debt) {
      if (debt.userAId === currentUser.id) {
        balance = debt.netAmount; // positive means B owes A
      } else {
        balance = -debt.netAmount; // B is current user, so -netAmount is what A owes B
      }
    }

    return {
      id: m.userId,
      name: user?.name || 'Roommate',
      balance,
    };
  });

  // Personal expenses calculation (Weekly & Monthly)
  const userPersonalExpenses = personalExpenses.filter((p) => p.userId === currentUser.id);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Current week boundary (Monday 00:00 to Sunday 23:59)
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  let thisWeekPersonal = 0;
  let thisMonthPersonal = 0;
  for (const p of userPersonalExpenses) {
    const expDate = new Date(p.expenseDate || p.createdAt);
    if (expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear) {
      thisMonthPersonal += p.amount;
    }
    if (expDate >= monday && expDate <= sunday) {
      thisWeekPersonal += p.amount;
    }
  }

  const monthlyAllowance = 8000;
  const weeklyAllowance = 2000;
  const monthlyBudgetPercentage = Math.min(100, Math.round((thisMonthPersonal / monthlyAllowance) * 100));
  const weeklyBudgetPercentage = Math.min(100, Math.round((thisWeekPersonal / weeklyAllowance) * 100));

  // Combined recent activities (last 5)
  const roomExpensesWithMeta = sharedExpenses
    .filter((e) => activeRoom && e.roomId === activeRoom.id && !e.isDeleted)
    .map((e) => {
      const payer = allUsers.find((u) => u.id === e.paidBy);
      const isPayer = e.paidBy === currentUser.id;
      // calculate user share
      const userSplit = expenseSplits.find((s) => s.sharedExpenseId === e.id && s.userId === currentUser.id);
      const userShare = userSplit ? userSplit.shareAmount : e.totalAmount / 4;
      const lentAmount = isPayer ? e.totalAmount - userShare : -userShare;

      return {
        id: e.id,
        title: e.title,
        amount: e.totalAmount,
        category: e.category,
        date: e.expenseDate || e.createdAt,
        type: 'shared' as const,
        paidBy: payer?.name || 'Roommate',
        isCurrentUserPayer: isPayer,
        impactAmount: lentAmount,
      };
    });

  const recentTransactions = [...roomExpensesWithMeta]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'wi-fi':
      case 'wifi':
        return <Wifi className="w-5 h-5 text-indigo-600" />;
      case 'groceries':
        return <ShoppingBag className="w-5 h-5 text-amber-600" />;
      case 'electricity':
      case 'utilities':
        return <Zap className="w-5 h-5 text-amber-500" />;
      case 'food':
        return <Utensils className="w-5 h-5 text-emerald-600" />;
      case 'rent':
        return <Home className="w-5 h-5 text-blue-600" />;
      default:
        return <Receipt className="w-5 h-5 text-slate-600" />;
    }
  };

  const getCategoryBg = (category: string) => {
    switch (category.toLowerCase()) {
      case 'wi-fi':
      case 'wifi':
        return 'bg-indigo-50';
      case 'groceries':
        return 'bg-amber-50';
      case 'electricity':
      case 'utilities':
        return 'bg-amber-50';
      case 'food':
        return 'bg-emerald-50';
      case 'rent':
        return 'bg-blue-50';
      default:
        return 'bg-slate-100';
    }
  };

  return (
    <div className="space-y-4 pb-24 px-4 pt-3 bg-[#F9F9FF] min-h-full">
      {/* Header / Profile Row (Exact Stitch design) */}
      <header className="pt-1 pb-1 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Hi {currentUser.name.split(' ')[0]}
            </h1>
          </div>

          {/* Profile Avatar Circle */}
          <div className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-indigo-700 font-bold text-sm shadow-xs overflow-hidden">
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Active Group Dropdown Pill */}
        <div className="flex items-center">
          {activeRoom ? (
            <div className="relative inline-flex items-center">
              <select
                value={activeRoom.id}
                onChange={(e) => {
                  const r = rooms.find((rm) => rm.id === e.target.value);
                  if (r) onSelectRoom(r);
                }}
                aria-label="Active Room"
                className="appearance-none inline-flex items-center space-x-1.5 pl-3 pr-7 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({roomMembers.filter((m) => m.roomId === r.id).length || 4} members)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
            </div>
          ) : (
            <button
              onClick={onNavigateToRooms}
              className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600"
            >
              <span>Select or Create Room</span>
            </button>
          )}
        </div>
      </header>

      {/* Net Balance Hero Card (Apple Wallet / Splitwise Style) */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Overall, you are owed</span>
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
          </span>
        </div>

        <div className="mt-1 flex items-baseline">
          <span className={`text-3xl font-extrabold tracking-tight tabular-nums ${isPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
            {isPositive ? `+₹${Math.abs(netBalance).toLocaleString('en-IN')}` : `-₹${Math.abs(netBalance).toLocaleString('en-IN')}`}
          </span>
        </div>

        <div className="mt-1 flex items-center space-x-1.5 text-slate-500 text-[11px]">
          <span>
            {owedToMe > 0
              ? `All settled up with 1 roommate · ${roommateBalances.filter(r => r.balance !== 0).length || 3} pending`
              : 'You are all settled up with your roommates!'}
          </span>
        </div>

        {/* Micro breakdown indicators */}
        <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Owed to you</div>
              <div className="font-semibold text-slate-900 tabular-nums">
                ₹{owedToMe.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400">You owe others</div>
              <div className="font-semibold text-slate-900 tabular-nums">
                ₹{iOwe.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Action Buttons (Exact Stitch Screen Layout) */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={onOpenSplitRoom}
          className="flex items-center justify-center space-x-2 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold text-sm shadow-xs active:scale-[0.98] transition-transform"
          type="button"
        >
          <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
          <span>Add Bill</span>
        </button>

        <button
          onClick={onOpenSettleUp}
          className="flex items-center justify-center space-x-2 h-12 bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 rounded-full font-semibold text-sm shadow-xs active:scale-[0.98] transition-transform"
          type="button"
        >
          <Handshake className="w-4.5 h-4.5 text-slate-600" />
          <span>Settle Up</span>
        </button>
      </section>

      {/* Roommates in Flat 302 Section (Stitch Inset List) */}
      <section className="flex flex-col space-y-2 pt-1">
        <div className="flex items-center justify-between pb-0.5">
          <h2 className="text-sm font-bold text-slate-900">
            Roommates in {activeRoom?.name || 'Flat 302'}
          </h2>
          <button
            onClick={onNavigateToRooms}
            className="text-xs text-indigo-600 font-semibold hover:underline"
            type="button"
          >
            See all
          </button>
        </div>

        {/* Inset List Container */}
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
          {roommateBalances.length > 0 ? (
            roommateBalances.map((rm, idx) => {
              const owesMe = rm.balance > 0;
              const iOweHim = rm.balance < 0;
              const avatarColors = [
                'bg-purple-100 text-purple-700',
                'bg-amber-100 text-amber-800',
                'bg-pink-100 text-pink-700',
                'bg-emerald-100 text-emerald-800',
              ];
              const colorClass = avatarColors[idx % avatarColors.length];

              return (
                <div
                  key={rm.id}
                  className="flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-9 h-9 rounded-full ${colorClass} flex items-center justify-center font-bold text-xs border border-black/5`}
                    >
                      {rm.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-900">{rm.name}</span>
                      <span className="text-[11px] font-medium">
                        {owesMe ? (
                          <span className="text-emerald-700">owes you ₹{rm.balance.toLocaleString('en-IN')}</span>
                        ) : iOweHim ? (
                          <span className="text-rose-600">you owe ₹{Math.abs(rm.balance).toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-slate-400">settled up</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {owesMe && (
                    <button
                      onClick={() => {
                        const debtor = allUsers.find((u) => u.id === rm.id);
                        if (debtor && activeRoom) {
                          const roomExpenses = sharedExpenses.filter(
                            (e) => e.roomId === activeRoom.id && !e.isDeleted && e.paidBy === currentUser.id
                          );
                          const relevantItems = roomExpenses
                            .map((e) => {
                              const split = expenseSplits.find(
                                (s) => s.sharedExpenseId === e.id && s.userId === debtor.id
                              );
                              return split ? { title: e.title, shareAmount: split.shareAmount } : null;
                            })
                            .filter(Boolean) as Array<{ title: string; shareAmount: number }>;

                          setNudgeTarget({ debtor, amount: rm.balance, items: relevantItems });
                        }
                      }}
                      className="px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all border border-emerald-200 shadow-2xs"
                      type="button"
                      title="Nudge on WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5 fill-[#25D366] text-[#25D366]" />
                      <span>Nudge</span>
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">
              No other roommates found in this room.
            </div>
          )}
        </div>
      </section>

      {/* Personal Vault Weekly & Monthly Spend Card */}
      <section
        onClick={onNavigateToVault}
        className="rounded-2xl bg-white border border-slate-200/80 p-4 cursor-pointer hover:border-indigo-300 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] active:scale-[0.99] transition-all"
      >
        <div className="flex items-center justify-between text-xs mb-2.5">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-slate-900">Personal Spending Insights</span>
          </div>
          <div className="flex items-center text-indigo-600 text-[11px] font-semibold">
            <span>View Vault</span>
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </div>
        </div>

        {/* Dual Grid: This Week vs This Month */}
        <div className="grid grid-cols-2 gap-2.5 pt-0.5">
          {/* This Week */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              This Week
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums block mt-0.5">
              ₹{thisWeekPersonal.toLocaleString('en-IN')}
            </span>
            <div className="mt-1.5 w-full h-1 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${weeklyBudgetPercentage}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              of ₹{weeklyAllowance.toLocaleString('en-IN')} budget
            </span>
          </div>

          {/* This Month */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              This Month
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums block mt-0.5">
              ₹{thisMonthPersonal.toLocaleString('en-IN')}
            </span>
            <div className="mt-1.5 w-full h-1 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  monthlyBudgetPercentage > 85 ? 'bg-rose-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${monthlyBudgetPercentage}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              of ₹{monthlyAllowance.toLocaleString('en-IN')} allowance
            </span>
          </div>
        </div>
      </section>

      {/* Recent Activity Section (Stitch Inset Ledger) */}
      <section className="flex flex-col space-y-2 pt-1">
        <div className="flex items-center justify-between pb-0.5">
          <h2 className="text-sm font-bold text-slate-900">Recent Activity</h2>
          <span className="text-xs text-slate-400">This Month</span>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] overflow-hidden">
          {recentTransactions.length > 0 ? (
            recentTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl ${getCategoryBg(tx.category)} flex items-center justify-center flex-shrink-0`}
                  >
                    {getCategoryIcon(tx.category)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-900">{tx.title}</span>
                    <span className="text-[11px] text-slate-500">
                      {tx.isCurrentUserPayer
                        ? `You paid ₹${tx.amount} · Split equally`
                        : `${tx.paidBy} paid ₹${tx.amount} · Split equally`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      tx.impactAmount >= 0 ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {tx.impactAmount >= 0
                      ? `+₹${tx.impactAmount.toLocaleString('en-IN')}`
                      : `-₹${Math.abs(tx.impactAmount).toLocaleString('en-IN')}`}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {tx.impactAmount >= 0 ? 'you lent' : 'you borrowed'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-5 text-center text-xs text-slate-400">
              No transactions recorded yet in Flat 302.
            </div>
          )}
        </div>
      </section>

      {/* WhatsApp Nudge Studio Bottom Sheet Modal */}
      {nudgeTarget && activeRoom && (
        <WhatsAppNudgeModal
          isOpen={Boolean(nudgeTarget)}
          onClose={() => setNudgeTarget(null)}
          currentUser={currentUser}
          debtorUser={nudgeTarget.debtor}
          roomName={activeRoom.name}
          totalAmount={nudgeTarget.amount}
          items={nudgeTarget.items}
          onRecordSettlement={(amount, method) => {
            if (onRecordSettlement) {
              onRecordSettlement({
                roomId: activeRoom.id,
                payerId: nudgeTarget.debtor.id,
                payeeId: currentUser.id,
                amount,
                paymentMethod: method,
                notes: 'Settled via 1-Tap WhatsApp Nudge',
              });
            }
          }}
        />
      )}
    </div>
  );
};

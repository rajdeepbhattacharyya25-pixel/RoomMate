import React, { useState } from 'react';
import { User, Room, SharedExpense, PersonalExpense, RoomMember, SettlementPayment, ExpenseSplit, InAppNotification } from '../../types';
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
  WifiOff,
  ShoppingBag,
  Zap,
  Utensils,
  Home,
  CheckCircle2,
  MessageCircle,
  UserPlus,
} from 'lucide-react';
import { WhatsAppNudgeModal } from './WhatsAppNudgeModal';
import { NotificationBell } from './NotificationBell';
import { NotificationCenterDrawer } from './NotificationCenterDrawer';
import { getUserBudget } from '../../lib/storage/budgetService';
import { useNetworkStatus } from '../../context/NetworkContext';
import { hapticImpact, hapticSelection } from '../../lib/native/haptics';

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
  isRealtimeLive?: boolean;
  onOpenSupabaseModal?: () => void;
  onOpenCloudSyncSheet?: () => void;
  notifications?: InAppNotification[];
  onToggleNotificationRead?: (id: string, currentRead: boolean) => void;
  onMarkAllNotificationsRead?: (ids?: string[]) => void;
  onDeleteNotification?: (id: string) => void;
  onClearReadNotifications?: (ids?: string[]) => void;
  onNotificationAction?: (notification: InAppNotification) => void;
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
  isRealtimeLive,
  onOpenSupabaseModal,
  onOpenCloudSyncSheet,
  notifications = [],
  onToggleNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onClearReadNotifications,
  onNotificationAction,
  onRecordSettlement,
}) => {
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
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

  const userBudget = getUserBudget(currentUser.id);
  const monthlyAllowance = userBudget.monthlyAllowance || 8000;
  const weeklyAllowance = Math.round(monthlyAllowance / 4);
  const monthlyBudgetPercentage = Math.min(100, Math.round((thisMonthPersonal / monthlyAllowance) * 100));
  const weeklyBudgetPercentage = Math.min(100, Math.round((thisWeekPersonal / weeklyAllowance) * 100));

  const formatInr = (val: number) => {
    const rounded = Math.round(val * 100) / 100;
    return rounded.toLocaleString('en-IN', {
      minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  };

  // Combined recent activities (last 5)
  const roomExpensesWithMeta = sharedExpenses
    .filter((e) => activeRoom && e.roomId === activeRoom.id && !e.isDeleted)
    .map((e) => {
      const payer = allUsers.find((u) => u.id === e.paidBy);
      const isPayer = e.paidBy === currentUser.id;
      const activeMemberCount = roomMembers.filter((m) => m.roomId === activeRoom?.id && m.status === 'ACTIVE').length || 1;
      const userSplit = expenseSplits.find((s) => s.sharedExpenseId === e.id && s.userId === currentUser.id);
      const userShare = userSplit ? userSplit.shareAmount : e.totalAmount / activeMemberCount;
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

  const displayName = currentUser.name ? currentUser.name.split(' ')[0] : 'Resident';

  const { isOnline, isReconnecting, pendingSyncCount } = useNetworkStatus();

  return (
    <div className="space-y-4 pb-28 px-4 pt-3 bg-[#F9F9FF] min-h-full">
      {/* Header / Profile Row */}
      <header className="pt-1 pb-1 flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Hi {displayName}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {(onOpenCloudSyncSheet || onOpenSupabaseModal) && (
              <button
                onClick={onOpenCloudSyncSheet || onOpenSupabaseModal}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-2xs active:scale-95 transition-all ${
                  !isOnline
                    ? 'bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title={!isOnline ? 'Offline Mode - Operating on Local Vault' : 'Cloud Backup & Sync'}
              >
                {!isOnline ? (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-600" />
                    <span>{pendingSyncCount > 0 ? `${pendingSyncCount} Queued` : 'Offline Vault'}</span>
                  </>
                ) : (
                  <>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isReconnecting
                          ? 'bg-indigo-500 animate-spin'
                          : isRealtimeLive
                          ? 'bg-emerald-500 animate-pulse'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span>{isReconnecting ? 'Syncing...' : isRealtimeLive ? 'Cloud Live' : 'Cloud Saved'}</span>
                  </>
                )}
              </button>
            )}

            {/* In-App Notification Bell */}
            <NotificationBell
              notifications={notifications}
              onClick={() => setIsNotificationDrawerOpen(true)}
            />

            {/* Profile Avatar Circle */}
            <div className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-indigo-700 font-bold text-sm shadow-xs overflow-hidden">
              {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
        </div>

        {/* Active Group Dropdown Pill */}
        <div className="flex items-center">
          {activeRoom ? (
            <div className="relative inline-flex items-center">
              <select
                value={activeRoom.id}
                onChange={(e) => {
                  hapticSelection();
                  const r = rooms.find((rm) => rm.id === e.target.value);
                  if (r) onSelectRoom(r);
                }}
                aria-label="Active Room"
                className="appearance-none inline-flex items-center space-x-1.5 pl-3 pr-7 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer shadow-2xs"
              >
                {rooms
                  .filter((r) =>
                    roomMembers.some(
                      (m) => m.roomId === r.id && m.userId === currentUser.id && m.status === 'ACTIVE'
                    )
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({roomMembers.filter((m) => m.roomId === r.id && m.status === 'ACTIVE').length} members)
                    </option>
                  ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
            </div>
          ) : (
            <button
              onClick={onNavigateToRooms}
              className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white border border-dashed border-indigo-300 text-indigo-700 rounded-full text-xs font-medium hover:bg-indigo-50 transition-colors shadow-2xs"
            >
              <Plus className="w-3 h-3 text-indigo-600" />
              <span>Create or Join Room</span>
            </button>
          )}
        </div>
      </header>

      {/* Net Balance Hero Card (Apple Wallet / Splitwise Style) */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {netBalance >= 0 ? 'Overall, you are owed' : 'Overall, you owe'}
          </span>
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
          </span>
        </div>

        <div className="mt-1 flex items-baseline">
          <span className={`text-3xl font-extrabold tracking-tight tabular-nums ${isPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
            {netBalance === 0
              ? '₹0'
              : isPositive
              ? `+₹${formatInr(Math.abs(netBalance))}`
              : `-₹${formatInr(Math.abs(netBalance))}`}
          </span>
        </div>

        <div className="mt-1 flex items-center space-x-1.5 text-slate-500 text-[11px]">
          <span>
            {owedToMe > 0
              ? `${roommateBalances.filter((r) => r.balance > 0).length} roommate(s) owe you`
              : iOwe > 0
              ? `You owe ${roommateBalances.filter((r) => r.balance < 0).length} roommate(s)`
              : activeRoom
              ? 'You are all settled up with your roommates!'
              : 'Create or join a room to start tracking splits.'}
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
                ₹{formatInr(owedToMe)}
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
                ₹{formatInr(iOwe)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Action Buttons */}
      <section className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            hapticImpact('MEDIUM');
            onOpenSplitRoom();
          }}
          className="flex items-center justify-center space-x-2 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold text-sm shadow-xs active:scale-[0.96] transition-transform"
          type="button"
        >
          <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
          <span>Add Bill</span>
        </button>

        <button
          onClick={() => {
            hapticImpact('MEDIUM');
            onOpenSettleUp();
          }}
          className="flex items-center justify-center space-x-2 h-12 bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 rounded-full font-semibold text-sm shadow-xs active:scale-[0.96] transition-transform"
          type="button"
        >
          <Handshake className="w-4.5 h-4.5 text-slate-600" />
          <span>Settle Up</span>
        </button>
      </section>

      {/* Roommates in Room Section */}
      <section className="flex flex-col space-y-2 pt-1">
        <div className="flex items-center justify-between pb-0.5">
          <h2 className="text-sm font-bold text-slate-900">
            {activeRoom ? `Roommates in ${activeRoom.name}` : 'Shared Room Ledger'}
          </h2>
          <button
            onClick={onNavigateToRooms}
            className="text-xs text-indigo-600 font-semibold hover:underline"
            type="button"
          >
            {activeRoom ? 'See all' : 'Explore'}
          </button>
        </div>

        {/* Inset List Container */}
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
          {!activeRoom ? (
            <div className="p-6 text-center flex flex-col items-center">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 shadow-2xs">
                <Home className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-800 mb-0.5">No Active Room Yet</p>
              <p className="text-[11px] text-slate-500 max-w-[260px] mb-3 leading-relaxed">
                Create a room for your flat, PG, or hostel, or join your flatmates using their 6-character room code.
              </p>
              <button
                type="button"
                onClick={() => {
                  hapticImpact('LIGHT');
                  onNavigateToRooms();
                }}
                className="px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create or Join Room</span>
              </button>
            </div>
          ) : roommateBalances.length > 0 ? (
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
                          <span className="text-emerald-700">owes you ₹{formatInr(rm.balance)}</span>
                        ) : iOweHim ? (
                          <span className="text-rose-600">you owe ₹{formatInr(Math.abs(rm.balance))}</span>
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
            <div className="p-6 text-center flex flex-col items-center">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 shadow-2xs">
                <UserPlus className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-800 mb-0.5">Invite Your Roommates</p>
              <p className="text-[11px] text-slate-500 max-w-[240px] mb-3 leading-relaxed">
                Add roommates to {activeRoom?.name || 'this room'} to start tracking shared expenses together.
              </p>
              <button
                type="button"
                onClick={() => {
                  hapticImpact('LIGHT');
                  onNavigateToRooms();
                }}
                className="px-3.5 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 flex items-center gap-1.5 active:scale-95 transition-all shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Invite / View Room Code</span>
              </button>
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
              ₹{formatInr(thisWeekPersonal)}
            </span>
            <div className="mt-1.5 w-full h-1 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${weeklyBudgetPercentage}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              of ₹{formatInr(weeklyAllowance)} budget
            </span>
          </div>

          {/* This Month */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              This Month
            </span>
            <span className="text-base font-bold text-slate-900 tabular-nums block mt-0.5">
              ₹{formatInr(thisMonthPersonal)}
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
              of ₹{formatInr(monthlyAllowance)} allowance
            </span>
          </div>
        </div>
      </section>

      {/* Recent Activity Section */}
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
                        ? `You paid ₹${formatInr(tx.amount)}`
                        : `${tx.paidBy} paid ₹${formatInr(tx.amount)}`}
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
                      ? `+₹${formatInr(tx.impactAmount)}`
                      : `-₹${formatInr(Math.abs(tx.impactAmount))}`}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {tx.impactAmount >= 0 ? 'you lent' : 'you borrowed'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-slate-400 space-y-1.5">
              <Receipt className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">No shared expenses recorded yet</p>
              <p className="text-[11px] text-slate-500">Tap "+ Add Bill" above to split rent, groceries, or Wi-Fi.</p>
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

      {/* In-App Notification Center Drawer */}
      <NotificationCenterDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        notifications={notifications}
        onAction={onNotificationAction}
        onToggleRead={onToggleNotificationRead || (() => {})}
        onMarkAllRead={onMarkAllNotificationsRead || (() => {})}
        onDeleteNotification={onDeleteNotification || (() => {})}
        onClearReadNotifications={onClearReadNotifications || (() => {})}
      />
    </div>
  );
};


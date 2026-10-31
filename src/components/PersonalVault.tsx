import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { User, PersonalExpense, SharedExpense, ExpenseSplit, Room, SettlementPayment } from '../types';
import {
  Lock,
  Plus,
  Trash2,
  ShieldCheck,
  Search,
  Users,
  Receipt,
  Info,
  ArrowUpRight,
  CalendarClock,
} from 'lucide-react';
import { PendingBillsBanner } from './recurring/PendingBillsBanner';
import { RecurringBillsModal } from './recurring/RecurringBillsModal';
import {
  getRecurringRules,
  evaluateRecurringDueBills,
  executeRecurringCycle,
  PendingRecurringBill,
} from '../lib/recurring/recurringCatchUpService';
import { RecurringRule } from '../lib/recurring/scheduleCalculator';

interface PersonalVaultProps {
  currentUser: User;
  personalExpenses: PersonalExpense[];
  onAddExpense: (data: Omit<PersonalExpense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteExpense: (id: string) => void;
  // Phase 9: Room Share Integration
  sharedExpenses?: SharedExpense[];
  expenseSplits?: ExpenseSplit[];
  activeRoom?: Room | null;
  allUsers?: User[];
  settlementPayments?: SettlementPayment[];
}

type VaultTab = 'ALL' | 'PRIVATE' | 'ROOM_SHARE';

export const PersonalVault: React.FC<PersonalVaultProps> = ({
  currentUser,
  personalExpenses,
  onAddExpense,
  onDeleteExpense,
  sharedExpenses = [],
  expenseSplits = [],
  activeRoom: _activeRoom = null,
  allUsers = [],
}) => {
  const [activeTab, setActiveTab] = useState<VaultTab>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<PersonalExpense['category']>('Food');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Recurring Bills & Subscriptions State
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [pendingBills, setPendingBills] = useState<PendingRecurringBill[]>([]);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);

  const loadRecurringData = useCallback(async () => {
    try {
      const rules = await getRecurringRules(currentUser.id, _activeRoom?.id);
      setRecurringRules(rules);
      const evalResult = await evaluateRecurringDueBills(currentUser.id, _activeRoom?.id);
      setPendingBills(evalResult.pendingReviews);

      // Auto-logged personal bills registered directly
      if (evalResult.autoLogged.length > 0) {
        for (const item of evalResult.autoLogged) {
          if (item.status === 'AUTO_LOGGED' && item.rule && item.rule.scope === 'PERSONAL') {
            onAddExpense({
              title: item.rule.title,
              amount: item.amount,
              category: (item.rule.category as PersonalExpense['category']) || 'Food',
              notes: `Auto-logged recurring bill (${item.cycleDate || item.rule.nextExecutionDate})`,
              expenseDate: item.cycleDate || item.rule.nextExecutionDate,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[PersonalVault] Error evaluating recurring bills:', err);
    }
  }, [currentUser.id, _activeRoom?.id, onAddExpense]);

  useEffect(() => {
    loadRecurringData();
  }, [loadRecurringData]);

  const handleConfirmRecurringBill = async (bill: PendingRecurringBill, confirmedAmount: number) => {
    await executeRecurringCycle(
      bill.rule.id,
      bill.cycleDate,
      confirmedAmount,
      'CONFIRM_LOG',
      bill.rule
    );
    if (bill.rule.scope === 'PERSONAL') {
      onAddExpense({
        title: bill.rule.title,
        amount: confirmedAmount,
        category: (bill.rule.category as PersonalExpense['category']) || 'Food',
        notes: `Recurring bill confirmed (${bill.cycleDate})`,
        expenseDate: bill.cycleDate,
      });
    }
    setPendingBills((prev) =>
      prev.filter((b) => !(b.rule.id === bill.rule.id && b.cycleDate === bill.cycleDate))
    );
    const rules = await getRecurringRules(currentUser.id, _activeRoom?.id);
    setRecurringRules(rules);
  };

  const handleSkipRecurringBill = async (bill: PendingRecurringBill) => {
    await executeRecurringCycle(
      bill.rule.id,
      bill.cycleDate,
      bill.dueAmount,
      'SKIP',
      bill.rule
    );
    setPendingBills((prev) =>
      prev.filter((b) => !(b.rule.id === bill.rule.id && b.cycleDate === bill.cycleDate))
    );
    const rules = await getRecurringRules(currentUser.id, _activeRoom?.id);
    setRecurringRules(rules);
  };

  // 1. Private Personal Expenses for Current User
  const userExpenses = useMemo(() => {
    return personalExpenses.filter((p) => p.userId === currentUser.id);
  }, [personalExpenses, currentUser.id]);

  const personalSpent = useMemo(() => {
    return userExpenses.reduce((sum, p) => sum + p.amount, 0);
  }, [userExpenses]);

  // 2. Room Share Contribution (Canonical source: expense_splits.share_amount)
  const activeSharedExpenses = useMemo(() => {
    return (sharedExpenses || []).filter((e) => !e.isDeleted);
  }, [sharedExpenses]);

  const activeExpenseMap = useMemo(() => {
    return new Map(activeSharedExpenses.map((e) => [e.id, e]));
  }, [activeSharedExpenses]);

  const userRoomSplits = useMemo(() => {
    return (expenseSplits || []).filter(
      (s) => s.userId === currentUser.id && activeExpenseMap.has(s.sharedExpenseId)
    );
  }, [expenseSplits, currentUser.id, activeExpenseMap]);

  const roomShareContributionTotal = useMemo(() => {
    return userRoomSplits.reduce((sum, s) => sum + s.shareAmount, 0);
  }, [userRoomSplits]);

  // 3. User's Complete Financial Outflow / Actual Spending
  const totalActualSpending = personalSpent + roomShareContributionTotal;

  // 4. Fronted / Payer Tracking (Separates paid shared bills from actual personal spending)
  const sharedBillsPaidByUser = useMemo(() => {
    return activeSharedExpenses.filter((e) => e.paidBy === currentUser.id);
  }, [activeSharedExpenses, currentUser.id]);

  const totalSharedPaidByUser = useMemo(() => {
    return sharedBillsPaidByUser.reduce((sum, e) => sum + e.totalAmount, 0);
  }, [sharedBillsPaidByUser]);

  const userShareOfPaidBills = useMemo(() => {
    return userRoomSplits
      .filter((s) => sharedBillsPaidByUser.some((b) => b.id === s.sharedExpenseId))
      .reduce((sum, s) => sum + s.shareAmount, 0);
  }, [userRoomSplits, sharedBillsPaidByUser]);

  const frontedForOthers = Math.max(0, totalSharedPaidByUser - userShareOfPaidBills);

  // Detailed Room Share items for the UI list
  const roomShareItems = useMemo(() => {
    return userRoomSplits.map((split) => {
      const parentExp = activeExpenseMap.get(split.sharedExpenseId)!;
      const payer = allUsers.find((u) => u.id === parentExp.paidBy);
      const isPayer = parentExp.paidBy === currentUser.id;
      const othersOweOnBill = isPayer ? Math.max(0, parentExp.totalAmount - split.shareAmount) : 0;

      return {
        id: `split-${split.id}`,
        splitId: split.id,
        sharedExpenseId: parentExp.id,
        title: parentExp.title,
        category: parentExp.category,
        date: parentExp.expenseDate || parentExp.createdAt,
        totalBill: parentExp.totalAmount,
        myShare: split.shareAmount,
        paidBy: payer?.name || (isPayer ? 'You' : 'Roommate'),
        isPayer,
        othersOweOnBill,
        splitMethod: parentExp.splitMethod,
      };
    });
  }, [userRoomSplits, activeExpenseMap, allUsers, currentUser.id]);

  // Filtering Private Expenses
  const filteredPrivateExpenses = useMemo(() => {
    return userExpenses.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [userExpenses, searchQuery, selectedCategory]);

  // Filtering Room Share Splits
  const filteredRoomShareItems = useMemo(() => {
    return roomShareItems.filter((item) => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [roomShareItems, searchQuery, selectedCategory]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || Number(amount) <= 0) return;
    onAddExpense({
      title,
      amount: Number(amount),
      category,
      notes,
      expenseDate,
    });
    setTitle('');
    setAmount('');
    setNotes('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header with Privacy Guarantee & Financial Model Indicator */}
      <div className="glass-card p-6 border-emerald-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/30 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Lock className="w-3.5 h-3.5" />
                100% PRIVATE & ISOLATED VAULT
              </span>
              <span className="text-xs text-[var(--text-subtle)] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                PostgreSQL RLS Owner-Enforced
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Personal Expense Vault & Complete Spending</span>
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl leading-relaxed">
              Consolidates your private personal purchases and your exact room share contributions.
              Roommates and room admins can <strong>never</strong> access your private vault records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setShowRecurringModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-indigo-300 border border-slate-200 dark:border-indigo-500/30 font-bold text-xs shadow-xs transition-all cursor-pointer relative"
              title="Manage Recurring Bills & Subscriptions"
            >
              <CalendarClock className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span>Recurring Bills</span>
              {pendingBills.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center animate-pulse">
                  {pendingBills.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Private Expense</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1-Tap Pending Recurring Bills Banner */}
      {pendingBills.length > 0 && (
        <PendingBillsBanner
          pendingBills={pendingBills}
          onConfirm={handleConfirmRecurringBill}
          onSkip={handleSkipRecurringBill}
        />
      )}

      {/* 4-Column Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Actual Spending */}
        <div className="glass-card p-4 border-emerald-500/30 bg-emerald-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 uppercase tracking-wider font-bold">
              Total Actual Spending
            </span>
            <Receipt className="w-4 h-4 text-emerald-400 opacity-70" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-1.5 tabular-nums">
            ₹{totalActualSpending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="text-[11px] text-[var(--text-subtle)] mt-1.5 flex items-center gap-1.5">
            <span>Private: ₹{personalSpent.toLocaleString('en-IN')}</span>
            <span>+</span>
            <span>Room: ₹{roomShareContributionTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Metric 2: Private Vault */}
        <div className="glass-card p-4 border-indigo-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
              Private Expenses
            </span>
            <Lock className="w-4 h-4 text-indigo-400 opacity-70" />
          </div>
          <p className="text-2xl font-black text-indigo-300 mt-1.5 tabular-nums">
            ₹{personalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-[var(--text-subtle)] block mt-1">
            {userExpenses.length} private transactions
          </span>
        </div>

        {/* Metric 3: Room Share Contribution */}
        <div className="glass-card p-4 border-cyan-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
              Room Share Split
            </span>
            <Users className="w-4 h-4 text-cyan-400 opacity-70" />
          </div>
          <p className="text-2xl font-black text-cyan-300 mt-1.5 tabular-nums">
            ₹{roomShareContributionTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-[var(--text-subtle)] block mt-1">
            Your share across {userRoomSplits.length} room bills
          </span>
        </div>

        {/* Metric 4: Fronted for Others / Balance Insight */}
        <div className="glass-card p-4 border-purple-500/20">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">
              Fronted For Others
            </span>
            <ArrowUpRight className="w-4 h-4 text-purple-400 opacity-70" />
          </div>
          <p className="text-2xl font-black text-purple-300 mt-1.5 tabular-nums">
            ₹{frontedForOthers.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[11px] text-[var(--text-subtle)] block mt-1">
            Owed back to you (Not personal spending)
          </span>
        </div>
      </div>

      {/* Information Banner Explaining the Split Isolation */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-[var(--text-muted)] flex items-start gap-3">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="text-white">Fair Financial Model:</strong> When you pay a shared bill (e.g. ₹1,000 grocery bill split 4 ways), only your own ₹250 share counts as your spending. The remaining ₹750 is recorded as money owed to you by roommates, never inflated as your personal cost.
        </div>
      </div>

      {/* Segmented Tab Controls & Filter / Search Bar */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Tab Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-[var(--border-subtle)] w-full md:w-auto">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'ALL'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-white'
              }`}
            >
              All Spending ({filteredPrivateExpenses.length + filteredRoomShareItems.length})
            </button>
            <button
              onClick={() => setActiveTab('PRIVATE')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'PRIVATE'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-white'
              }`}
            >
              Private Vault ({filteredPrivateExpenses.length})
            </button>
            <button
              onClick={() => setActiveTab('ROOM_SHARE')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'ROOM_SHARE'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-white'
              }`}
            >
              Room Share Splits ({filteredRoomShareItems.length})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full !pl-9 text-xs"
            />
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1">
          {['ALL', 'Food', 'Shopping', 'Travel', 'Entertainment', 'Academics', 'Health', 'Other'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-800 text-white border border-slate-600 font-semibold'
                  : 'bg-slate-900/50 text-[var(--text-muted)] hover:text-white border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="space-y-4">
        {/* Section 1: Private Transactions */}
        {(activeTab === 'ALL' || activeTab === 'PRIVATE') && (
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                <span>Private Vault Transactions</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-gray-400">
                  {filteredPrivateExpenses.length}
                </span>
              </h2>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                ₹{filteredPrivateExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {filteredPrivateExpenses.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Lock className="w-7 h-7 text-[var(--text-subtle)] mx-auto opacity-40" />
                <p className="text-xs text-[var(--text-muted)]">No private expenses match the criteria.</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="text-xs text-emerald-400 hover:underline font-semibold"
                >
                  Log a private purchase
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {filteredPrivateExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-900/40 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-emerald-400 font-bold text-xs">
                        {exp.category.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{exp.title}</h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                            Private
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] mt-0.5">
                          <span className="text-emerald-400 font-medium">{exp.category}</span>
                          <span>•</span>
                          <span>{exp.expenseDate}</span>
                          {exp.notes && (
                            <>
                              <span>•</span>
                              <span className="italic text-gray-400 truncate max-w-xs">{exp.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                        ₹{exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={() => onDeleteExpense(exp.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                        title="Delete expense"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section 2: Room Share Contributions */}
        {(activeTab === 'ALL' || activeTab === 'ROOM_SHARE') && (
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                <span>Room Share Split Contributions</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-gray-400">
                  {filteredRoomShareItems.length}
                </span>
              </h2>
              <span className="text-xs text-cyan-600 dark:text-cyan-400 font-bold">
                ₹{filteredRoomShareItems.reduce((s, i) => s + i.myShare, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {filteredRoomShareItems.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Users className="w-7 h-7 text-[var(--text-subtle)] mx-auto opacity-40" />
                <p className="text-xs text-[var(--text-muted)]">No room share contributions recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {filteredRoomShareItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center text-cyan-400 font-bold text-xs">
                        {item.category.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h3>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-medium border border-cyan-500/20">
                            Room Split
                          </span>
                          {item.isPayer && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-medium border border-purple-500/20">
                              Paid by You
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-subtle)] mt-0.5">
                          <span className="text-cyan-400 font-medium">{item.category}</span>
                          <span>•</span>
                          <span>{item.date}</span>
                          <span>•</span>
                          <span>Total bill: ₹{item.totalBill.toLocaleString('en-IN')}</span>
                          <span>•</span>
                          <span>Paid by: {item.paidBy}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-[var(--text-muted)] block uppercase font-medium">Your Calculated Share</span>
                        <span className="text-base font-black text-cyan-300 tabular-nums">
                          ₹{item.myShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {item.isPayer && item.othersOweOnBill > 0 && (
                        <div className="text-right pl-3 border-l border-slate-800">
                          <span className="text-[10px] text-purple-400 block uppercase font-medium">Others Owe</span>
                          <span className="text-xs font-bold text-purple-300 tabular-nums">
                            +₹{item.othersOweOnBill.toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Private Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#12121A] border border-slate-200 dark:border-emerald-500/30 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#27354A]">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Private Expense</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Expense Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Swiggy Snack, Weekend Metro, College Books"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="250"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PersonalExpense['category'])}
                    className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                  >
                    <option value="Food">Food / Snacks</option>
                    <option value="Shopping">Shopping</option>
                    <option value="Travel">Travel / Metro</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Academics">Academics / Books</option>
                    <option value="Health">Health</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Private Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Only you will ever see this note..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#27354A]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 cursor-pointer"
                >
                  Save to Private Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Recurring Bills Modal */}
      <RecurringBillsModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        userId={currentUser.id}
        rules={recurringRules}
        onRulesUpdated={loadRecurringData}
        activeRoom={_activeRoom}
      />
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { User, PersonalExpense } from '../../types';
import {
  Lock,
  Plus,
  Trash2,
  Calendar,
  Search,
  X,
  ShoppingBag,
  Coffee,
  BookOpen,
  Car,
  Film,
  HeartPulse,
  MoreHorizontal,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  CheckCircle2,
  CalendarDays,
  ArrowUpDown,
  History,
} from 'lucide-react';

interface MobilePersonalVaultProps {
  currentUser: User;
  personalExpenses: PersonalExpense[];
  onAddExpense: (data: Omit<PersonalExpense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteExpense: (id: string) => void;
  showAddSheetInitially?: boolean;
  onCloseAddSheet?: () => void;
}

type PeriodFilter = 'WEEK' | 'MONTH' | 'ALL';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CATEGORIES: Array<{
  name: PersonalExpense['category'];
  icon: React.ElementType;
}> = [
  { name: 'Food', icon: Coffee },
  { name: 'Shopping', icon: ShoppingBag },
  { name: 'Travel', icon: Car },
  { name: 'Entertainment', icon: Film },
  { name: 'Academics', icon: BookOpen },
  { name: 'Health', icon: HeartPulse },
  { name: 'Other', icon: MoreHorizontal },
];

const PRESETS = [50, 100, 200, 500, 1000];

export const MobilePersonalVault: React.FC<MobilePersonalVaultProps> = ({
  currentUser,
  personalExpenses,
  onAddExpense,
  onDeleteExpense,
  showAddSheetInitially = false,
  onCloseAddSheet,
}) => {
  const now = new Date();
  const currentActualYear = now.getFullYear();
  const currentActualMonth = now.getMonth();

  const [showAddSheet, setShowAddSheet] = useState(showAddSheetInitially);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('MONTH');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Specific Month Navigation State
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(currentActualMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentActualYear);
  const [showMonthPickerModal, setShowMonthPickerModal] = useState<boolean>(false);

  // Add Sheet Form
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<PersonalExpense['category']>('Food');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Current user's expenses
  const userExpenses = useMemo(() => {
    return personalExpenses.filter((p) => p.userId === currentUser.id);
  }, [personalExpenses, currentUser.id]);

  const isCurrentMonth = selectedMonthIndex === currentActualMonth && selectedYear === currentActualYear;

  // Derive unique months available in user's history
  const availableMonthsHistory = useMemo(() => {
    const map = new Map<string, { year: number; monthIndex: number; total: number; count: number }>();

    // Ensure current month is always available
    const currentKey = `${currentActualYear}-${currentActualMonth}`;
    map.set(currentKey, {
      year: currentActualYear,
      monthIndex: currentActualMonth,
      total: 0,
      count: 0,
    });

    // Also include past months from data
    for (const exp of userExpenses) {
      const d = new Date(exp.expenseDate || exp.createdAt);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${m}`;
      const existing = map.get(key);
      if (existing) {
        existing.total += exp.amount;
        existing.count += 1;
      } else {
        map.set(key, { year: y, monthIndex: m, total: exp.amount, count: 1 });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.monthIndex - a.monthIndex;
    });
  }, [userExpenses, currentActualYear, currentActualMonth]);

  // Step to Previous Month
  const handlePrevMonth = () => {
    if (selectedMonthIndex === 0) {
      setSelectedMonthIndex(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonthIndex((m) => m - 1);
    }
  };

  // Step to Next Month
  const handleNextMonth = () => {
    if (isCurrentMonth) return;
    if (selectedMonthIndex === 11) {
      setSelectedMonthIndex(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonthIndex((m) => m + 1);
    }
  };

  // Jump to specific month
  const handleSelectMonth = (year: number, monthIdx: number) => {
    setSelectedYear(year);
    setSelectedMonthIndex(monthIdx);
    setSelectedPeriod('MONTH');
    setShowMonthPickerModal(false);
  };

  // Weekly and Monthly Calculations
  const {
    thisWeekExpenses,
    selectedMonthExpenses,
    weeklyTotal,
    selectedMonthTotal,
    allTimeTotal,
    weeklyDaysData,
    daysLeftInMonth,
    safeDailySpend,
  } = useMemo(() => {
    // Current week bounds (Monday 00:00 to Sunday 23:59)
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Days left in current month if inspecting current month
    const lastDayOfMonth = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
    const remainingDays = isCurrentMonth ? Math.max(1, lastDayOfMonth - now.getDate() + 1) : 0;

    let weekSum = 0;
    let monthSum = 0;
    let allSum = 0;

    const weekList: PersonalExpense[] = [];
    const monthList: PersonalExpense[] = [];

    // Initialize 7 days breakdown (Mon -> Sun)
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const dailySpend = [0, 0, 0, 0, 0, 0, 0];

    for (const exp of userExpenses) {
      const expDate = new Date(exp.expenseDate || exp.createdAt);
      allSum += exp.amount;

      // Check selected month & year
      if (expDate.getMonth() === selectedMonthIndex && expDate.getFullYear() === selectedYear) {
        monthSum += exp.amount;
        monthList.push(exp);
      }

      // Check current week
      if (expDate >= monday && expDate <= sunday) {
        weekSum += exp.amount;
        weekList.push(exp);
        const dayIdx = (expDate.getDay() + 6) % 7;
        dailySpend[dayIdx] += exp.amount;
      }
    }

    const monthlyBudget = 8000;
    const remainingMonthlyBudget = Math.max(0, monthlyBudget - monthSum);
    const dailySafe = remainingDays > 0 ? Math.round(remainingMonthlyBudget / remainingDays) : 0;

    const maxDaySpend = Math.max(...dailySpend, 1);
    const daysData = dayLabels.map((label, idx) => ({
      label,
      amount: dailySpend[idx],
      percent: Math.min(100, Math.round((dailySpend[idx] / maxDaySpend) * 100)),
      isToday: (now.getDay() + 6) % 7 === idx,
    }));

    return {
      thisWeekExpenses: weekList,
      selectedMonthExpenses: monthList,
      weeklyTotal: weekSum,
      selectedMonthTotal: monthSum,
      allTimeTotal: allSum,
      weeklyDaysData: daysData,
      daysLeftInMonth: remainingDays,
      safeDailySpend: dailySafe,
    };
  }, [userExpenses, now, selectedYear, selectedMonthIndex, isCurrentMonth]);

  // Active period list
  const activePeriodExpenses = useMemo(() => {
    if (selectedPeriod === 'WEEK') return thisWeekExpenses;
    if (selectedPeriod === 'MONTH') return selectedMonthExpenses;
    return userExpenses;
  }, [selectedPeriod, thisWeekExpenses, selectedMonthExpenses, userExpenses]);

  // Filtered by Search & Category
  const filteredExpenses = useMemo(() => {
    return activePeriodExpenses.filter((p) => {
      const matchesSearch =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat = selectedCategoryFilter === 'ALL' || p.category === selectedCategoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [activePeriodExpenses, searchQuery, selectedCategoryFilter]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title.trim() || isNaN(numAmount) || numAmount <= 0) return;

    onAddExpense({
      title: title.trim(),
      amount: numAmount,
      category,
      notes: notes.trim(),
      expenseDate,
    });

    setTitle('');
    setAmount('');
    setNotes('');
    setShowAddSheet(false);
    if (onCloseAddSheet) onCloseAddSheet();
  };

  const handleAddPreset = (val: number) => {
    const current = Number(amount) || 0;
    setAmount(String(current + val));
  };

  const currentDisplayTotal =
    selectedPeriod === 'WEEK'
      ? weeklyTotal
      : selectedPeriod === 'MONTH'
      ? selectedMonthTotal
      : allTimeTotal;

  const monthlyAllowance = 8000;
  const weeklyAllowance = 2000;
  const budgetLimit = selectedPeriod === 'WEEK' ? weeklyAllowance : monthlyAllowance;
  const budgetPercentage = Math.min(100, Math.round((currentDisplayTotal / budgetLimit) * 100));

  return (
    <div className="space-y-4 pb-28 px-4 pt-3 bg-[#F9F9FF] min-h-full">
      {/* Privacy Guarantee Header Card */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                Personal Vault
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  100% Private
                </span>
              </h1>
              <p className="text-[11px] text-slate-500">
                Only visible to you. Zero room visibility.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddSheet(true)}
            className="h-9 px-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1 active:scale-95 transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>

        {/* Period Segmented Control (This Week | This Month | All Time) */}
        <div className="mt-3 p-1 bg-slate-100 rounded-xl flex items-center">
          <button
            onClick={() => setSelectedPeriod('WEEK')}
            className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
              selectedPeriod === 'WEEK'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setSelectedPeriod('MONTH')}
            className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
              selectedPeriod === 'MONTH'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            By Month
          </button>
          <button
            onClick={() => setSelectedPeriod('ALL')}
            className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
              selectedPeriod === 'ALL'
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Time
          </button>
        </div>

        {/* SPECIFIC MONTH SELECTOR BAR (Only visible in 'MONTH' view) */}
        {selectedPeriod === 'MONTH' && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
            {/* Step to Previous Month */}
            <button
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Interactive Month Picker Trigger Pill */}
            <button
              onClick={() => setShowMonthPickerModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold text-xs hover:bg-indigo-100 active:scale-95 transition-all shadow-2xs"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>
                {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
              </span>
              {isCurrentMonth && (
                <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                  Current
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 ml-0.5" />
            </button>

            {/* Step to Next Month (Disabled if on current month) */}
            <button
              onClick={handleNextMonth}
              disabled={isCurrentMonth}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 flex items-center justify-center active:scale-95 transition-all"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dynamic Period Spent Amount */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-baseline justify-between">
          <div>
            <span className="text-xs text-slate-500 block">
              {selectedPeriod === 'WEEK'
                ? 'Spent This Week (Mon–Sun)'
                : selectedPeriod === 'MONTH'
                ? `Spent in ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`
                : 'Lifetime Private Spending'}
            </span>
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
              ₹{currentDisplayTotal.toLocaleString('en-IN')}
            </span>
          </div>

          {selectedPeriod !== 'ALL' && (
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase font-medium">Budget</span>
              <span className="text-xs font-semibold text-slate-700 tabular-nums">
                ₹{budgetLimit.toLocaleString('en-IN')} ({budgetPercentage}%)
              </span>
            </div>
          )}
        </div>

        {/* Progress Bar for Budget */}
        {selectedPeriod !== 'ALL' && (
          <div className="mt-2 w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                budgetPercentage > 100
                  ? 'bg-rose-500'
                  : budgetPercentage > 75
                  ? 'bg-amber-500'
                  : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, budgetPercentage)}%` }}
            />
          </div>
        )}

        {/* Contextual Smart Insight for Month (Current vs Past) */}
        {selectedPeriod === 'MONTH' && (
          <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
            {isCurrentMonth ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    <strong>{daysLeftInMonth} days</strong> left in month
                  </span>
                </div>
                <span className="text-emerald-700 font-semibold tabular-nums">
                  ₹{safeDailySpend}/day safe limit
                </span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    <strong>Month Completed</strong>
                  </span>
                </div>
                <span
                  className={`font-semibold tabular-nums ${
                    monthlyAllowance >= selectedMonthTotal ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {monthlyAllowance >= selectedMonthTotal
                    ? `Saved ₹${(monthlyAllowance - selectedMonthTotal).toLocaleString('en-IN')} under budget`
                    : `Exceeded by ₹${(selectedMonthTotal - monthlyAllowance).toLocaleString('en-IN')}`}
                </span>
              </>
            )}
          </div>
        )}

        {/* 7-Day Micro Bar Graph for 'This Week' View */}
        {selectedPeriod === 'WEEK' && (
          <div className="mt-3 pt-2 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
              <span>Daily Breakdown (Mon - Sun)</span>
              <span>Daily Avg: ₹{Math.round(weeklyTotal / 7).toLocaleString('en-IN')}</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 items-end h-14 pt-2">
              {weeklyDaysData.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full bg-slate-100 rounded-sm h-full flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-sm transition-all duration-300 ${
                        d.isToday ? 'bg-indigo-600' : 'bg-indigo-300'
                      }`}
                      style={{ height: `${Math.max(8, d.percent)}%` }}
                      title={`₹${d.amount}`}
                    />
                  </div>
                  <span className={`text-[9px] font-semibold ${d.isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${
            selectedPeriod === 'WEEK'
              ? 'this week’s'
              : selectedPeriod === 'MONTH'
              ? `${MONTH_NAMES[selectedMonthIndex]}'s`
              : 'all'
          } expenses...`}
          className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500 shadow-2xs transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear Search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Horizontal Category Pill Filter Bar */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategoryFilter('ALL')}
          className={`h-8 px-3 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-2xs ${
            selectedCategoryFilter === 'ALL'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All ({activePeriodExpenses.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = activePeriodExpenses.filter((p) => p.category === cat.name).length;
          const isActive = selectedCategoryFilter === cat.name;
          return (
            <button
              key={cat.name}
              onClick={() => setSelectedCategoryFilter(cat.name)}
              className={`h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all shadow-2xs ${
                isActive
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{cat.name}</span>
              {count > 0 && <span className="text-[10px] opacity-80">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Expenses Feed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {selectedPeriod === 'WEEK'
              ? 'This Week’s Records'
              : selectedPeriod === 'MONTH'
              ? `${MONTH_NAMES[selectedMonthIndex]} ${selectedYear} Records`
              : 'All Personal Records'}{' '}
            ({filteredExpenses.length})
          </span>
          {selectedPeriod === 'MONTH' && !isCurrentMonth && (
            <button
              onClick={() => handleSelectMonth(currentActualYear, currentActualMonth)}
              className="text-[11px] font-semibold text-indigo-600 hover:underline"
            >
              Return to Current Month
            </button>
          )}
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200/80 p-8 text-center text-xs text-slate-500 space-y-2 shadow-xs">
            <Lock className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-900">
              No expenses recorded in {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
            </p>
            <p className="text-[11px] text-slate-400">
              Use the arrows above to browse other months or tap <strong>+ Add</strong> to log an expense.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] overflow-hidden">
            {filteredExpenses.map((exp) => (
              <div
                key={exp.id}
                className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    ₹
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">{exp.title}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                        {exp.category}
                      </span>
                      <span>•</span>
                      <span>{exp.expenseDate}</span>
                      {exp.notes && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[100px]">{exp.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5">
                  <span className="text-xs font-bold text-slate-900 tabular-nums">
                    ₹{exp.amount.toLocaleString('en-IN')}
                  </span>
                  <button
                    onClick={() => onDeleteExpense(exp.id)}
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all"
                    aria-label="Delete Expense"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Specific Month History Drawer / Modal (iOS Bottom Sheet Style)             */}
      {/* ========================================================================= */}
      {showMonthPickerModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div className="w-full max-w-[395px] bg-white border-t border-slate-200 rounded-t-3xl p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-5">
            <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-1" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <History className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Select Month History</h2>
                  <p className="text-[11px] text-slate-500">Pick any past month to inspect spending</p>
                </div>
              </div>
              <button
                onClick={() => setShowMonthPickerModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List of Available Historical Months */}
            <div className="space-y-2 pt-1">
              {availableMonthsHistory.map((item) => {
                const isSelected = item.year === selectedYear && item.monthIndex === selectedMonthIndex;
                const isCurrent = item.year === currentActualYear && item.monthIndex === currentActualMonth;

                return (
                  <button
                    key={`${item.year}-${item.monthIndex}`}
                    onClick={() => handleSelectMonth(item.year, item.monthIndex)}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.99] ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-300 shadow-2xs'
                        : 'bg-white border-slate-200/90 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {MONTH_NAMES[item.monthIndex].slice(0, 3)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900">
                            {MONTH_NAMES[item.monthIndex]} {item.year}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                              Current
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {item.count} personal expense{item.count !== 1 ? 's' : ''} logged
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900 tabular-nums block">
                        ₹{item.total.toLocaleString('en-IN')}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          item.total <= monthlyAllowance ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {item.total <= monthlyAllowance ? 'Under Budget' : 'Over Budget'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Ergonomic Quick-Add Bottom Sheet */}
      {showAddSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div className="w-full max-w-[395px] bg-white border-t border-slate-200 rounded-t-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-5">
            <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-1" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Lock className="w-4.5 h-4.5" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">Add Private Expense</h2>
              </div>
              <button
                onClick={() => {
                  setShowAddSheet(false);
                  if (onCloseAddSheet) onCloseAddSheet();
                }}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Amount Display with Currency */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Amount in ₹
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-lg font-bold text-indigo-600">₹</span>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xl font-bold text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500 tabular-nums"
                  />
                </div>
              </div>

              {/* Quick Preset Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {PRESETS.map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleAddPreset(val)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-xs font-semibold text-slate-700 transition-all active:scale-95"
                  >
                    +₹{val}
                  </button>
                ))}
              </div>

              {/* Title & Category */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Chai, Books, Metro recharge"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Category Grid */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Category
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat.name;
                    return (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => setCategory(cat.name)}
                        className={`py-2 px-1 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-1 border transition-all ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <cat.icon className="w-4 h-4" />
                        <span>{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!title.trim() || !amount || Number(amount) <= 0}
                  className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Save Private Expense</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

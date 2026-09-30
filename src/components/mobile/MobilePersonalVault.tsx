import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { User, PersonalExpense, SharedExpense, ExpenseSplit, SettlementPayment, Room } from '../../types';
import {
  Lock,
  Plus,
  Trash2,
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
  History,
  SlidersHorizontal,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Undo2,
  ShieldAlert,
  Sparkles,
  PieChart,
  WifiOff,
  Download,
} from 'lucide-react';
import {
  getUserBudget,
  saveUserBudget,
  UserBudgetConfig,
} from '../../lib/storage/budgetService';
import { useNetworkStatus } from '../../context/NetworkContext';
import { MobileBottomSheet } from './MobileBottomSheet';
import { ExportBottomSheet } from './ExportBottomSheet';
import { ProgressiveFeedControls } from './ProgressiveFeedControls';
import { CurrencyInput } from '../common/CurrencyInput';
import { hapticImpact, hapticSelection, hapticSuccess, hapticWarning } from '../../lib/native/haptics';
import {
  gatherMonthlyExportData,
  exportToFormat,
  type ExportFormat,
} from '../../lib/services/expenseExportService';

interface MobilePersonalVaultProps {
  currentUser: User;
  personalExpenses: PersonalExpense[];
  onAddExpense: (data: Omit<PersonalExpense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteExpense: (id: string) => void;
  showAddSheetInitially?: boolean;
  onCloseAddSheet?: () => void;
  // Optional shared data for enriched export reports
  sharedExpenses?: SharedExpense[];
  expenseSplits?: ExpenseSplit[];
  settlementPayments?: SettlementPayment[];
  allUsers?: User[];
  rooms?: Room[];
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

// Robust date parser ensuring timezone-safe year, month, and day extraction
function parseExpenseDate(dateStr?: string): { year: number; month: number; day: number; date: Date } {
  if (!dateStr) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), date: now };
  }
  const isoPart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = isoPart.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // 0-indexed month
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return { year: y, month: m, day: d, date: new Date(y, m, d, 12, 0, 0) };
    }
  }
  const parsed = new Date(dateStr);
  return { year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate(), date: parsed };
}


const CATEGORY_QUICK_CHIPS: Record<PersonalExpense['category'], string[]> = {
  Food: ['Chai ☕', 'Lunch 🍲', 'Dinner 🍛', 'Groceries 🛒', 'Snacks 🍟', 'Swiggy 🍕'],
  Shopping: ['Clothes 👕', 'Toiletries 🧴', 'Stationery ✏️', 'Amazon Order 📦'],
  Travel: ['Auto / Cab 🛺', 'Metro 🚇', 'Bus Ticket 🚌', 'Petrol ⛽'],
  Academics: ['Photocopy 📄', 'Books 📚', 'Exam Fee 📝', 'Lab Manual 🔬'],
  Health: ['Medicines 💊', 'Doctor Visit 🩺', 'Gym / Protein 🏋️'],
  Entertainment: ['Movie 🎬', 'Weekend Outing 🎉', 'OTT Subscription 📺', 'Gaming 🎮'],
  Other: ['Mobile Recharge 📱', 'Laundry 🧺', 'Room Cleaning 🧹', 'ATM Cash 💵'],
};

export const MobilePersonalVault: React.FC<MobilePersonalVaultProps> = ({
  currentUser,
  personalExpenses,
  onAddExpense,
  onDeleteExpense,
  showAddSheetInitially = false,
  onCloseAddSheet,
  sharedExpenses,
  expenseSplits,
  settlementPayments,
  allUsers,
  rooms,
}) => {
  const { isOnline } = useNetworkStatus();
  const now = useMemo(() => new Date(), []);
  const currentActualYear = now.getFullYear();
  const currentActualMonth = now.getMonth();

  const [showAddSheet, setShowAddSheet] = useState(showAddSheetInitially);
  const [prevAddTrigger, setPrevAddTrigger] = useState(showAddSheetInitially);
  if (showAddSheetInitially !== prevAddTrigger) {
    setPrevAddTrigger(showAddSheetInitially);
    if (showAddSheetInitially) {
      setShowAddSheet(true);
    }
  }

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('MONTH');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // User Dynamic Budget Configuration & Bottom Drawer State
  const [budgetConfig, setBudgetConfig] = useState<UserBudgetConfig>(() => getUserBudget(currentUser.id));
  const [prevUserId, setPrevUserId] = useState(currentUser.id);
  if (currentUser.id !== prevUserId) {
    setPrevUserId(currentUser.id);
    const loaded = getUserBudget(currentUser.id);
    setBudgetConfig(loaded);
  }

  const [showBudgetModal, setShowBudgetModal] = useState<boolean>(false);
  const [editAllowanceInput, setEditAllowanceInput] = useState<string>(() => String(getUserBudget(currentUser.id).monthlyAllowance));
  const [editCategoryCaps, setEditCategoryCaps] = useState<Record<string, number>>(() => getUserBudget(currentUser.id).categoryCaps);
  const [showCategoryCapsCard, setShowCategoryCapsCard] = useState<boolean>(true);

  // Specific Month Navigation State
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(currentActualMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentActualYear);
  const [showMonthPickerModal, setShowMonthPickerModal] = useState<boolean>(false);

  // Add Sheet Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<PersonalExpense['category']>('Food');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Form Validation & Focus Refs
  const amountInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [validationErrors, setValidationErrors] = useState<{ amount?: string; title?: string }>({});

  // Optimistic Undo Deletion State
  const [deletedExpenseCache, setDeletedExpenseCache] = useState<PersonalExpense | null>(null);
  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [undoCountdown, setUndoCountdown] = useState<number>(4);

  // Export State
  const [showExportSheet, setShowExportSheet] = useState<boolean>(false);




  const handleExport = useCallback(async (format: ExportFormat) => {
    const dataset = gatherMonthlyExportData({
      month: selectedMonthIndex,
      year: selectedYear,
      currentUser,
      personalExpenses,
      budgetConfig,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
      rooms,
    });
    await exportToFormat(dataset, format);
  }, [selectedMonthIndex, selectedYear, currentUser, personalExpenses, budgetConfig, sharedExpenses, expenseSplits, settlementPayments, allUsers, rooms]);

  // Countdown timer for undo toast
  useEffect(() => {
    if (!deletedExpenseCache) return;
    const interval = setInterval(() => {
      setUndoCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [deletedExpenseCache]);

  // Current user's expenses (hiding pending deleted item optimistically)
  const userExpenses = useMemo(() => {
    return personalExpenses
      .filter((p) => p.userId === currentUser.id)
      .filter((p) => !deletedExpenseCache || p.id !== deletedExpenseCache.id);
  }, [personalExpenses, currentUser.id, deletedExpenseCache]);

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
      const parsed = parseExpenseDate(exp.expenseDate || exp.createdAt);
      const y = parsed.year;
      const m = parsed.month;
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
    hapticSelection();
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
    hapticSelection();
    if (selectedMonthIndex === 11) {
      setSelectedMonthIndex(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonthIndex((m) => m + 1);
    }
  };

  // Jump to specific month
  const handleSelectMonth = (year: number, monthIdx: number) => {
    hapticSelection();
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
      const parsed = parseExpenseDate(exp.expenseDate || exp.createdAt);
      const expDate = parsed.date;
      allSum += exp.amount;

      // Check selected month & year
      if (parsed.month === selectedMonthIndex && parsed.year === selectedYear) {
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

    const monthlyBudget = budgetConfig.monthlyAllowance;
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
  }, [userExpenses, now, selectedYear, selectedMonthIndex, isCurrentMonth, budgetConfig.monthlyAllowance]);

  // Active period list
  const activePeriodExpenses = useMemo(() => {
    if (selectedPeriod === 'WEEK') return thisWeekExpenses;
    if (selectedPeriod === 'MONTH') return selectedMonthExpenses;
    return userExpenses;
  }, [selectedPeriod, thisWeekExpenses, selectedMonthExpenses, userExpenses]);

  // Proactive Category Cap & Limit Indicators for Add Sheet
  const numEnteredAmount = Number(amount) || 0;
  const currentCategorySpentThisMonth = useMemo(() => {
    let sum = 0;
    for (const exp of selectedMonthExpenses) {
      if (exp.category === category) {
        sum += exp.amount;
      }
    }
    return sum;
  }, [selectedMonthExpenses, category]);

  const selectedCategoryCap = budgetConfig.categoryCaps[category] || 0;
  const projectedCategoryTotal = currentCategorySpentThisMonth + numEnteredAmount;
  const willExceedCategoryCap = selectedCategoryCap > 0 && projectedCategoryTotal > selectedCategoryCap;

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

  const VAULT_PAGE_SIZE = 15;
  const [vaultVisibleLimit, setVaultVisibleLimit] = useState<number>(VAULT_PAGE_SIZE);
  const recordsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-reset pagination to top 15 whenever any filter or search changes
  useEffect(() => {
    setVaultVisibleLimit(VAULT_PAGE_SIZE);
  }, [selectedPeriod, selectedMonthIndex, selectedYear, selectedCategoryFilter, searchQuery]);

  const displayedExpenses = useMemo(() => {
    return filteredExpenses.slice(0, vaultVisibleLimit);
  }, [filteredExpenses, vaultVisibleLimit]);

  const handleInitiateDelete = (exp: PersonalExpense) => {
    hapticImpact('MEDIUM');
    if (undoTimer) {
      clearTimeout(undoTimer);
    }
    setDeletedExpenseCache(exp);
    setUndoCountdown(4);

    const timer = setTimeout(() => {
      onDeleteExpense(exp.id);
      setDeletedExpenseCache(null);
      setUndoTimer(null);
    }, 4000);

    setUndoTimer(timer);
  };

  const handleUndoDelete = () => {
    if (undoTimer) {
      clearTimeout(undoTimer);
      setUndoTimer(null);
    }
    setDeletedExpenseCache(null);
    hapticSuccess();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    const newErrors: { amount?: string; title?: string } = {};

    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Please enter an amount greater than ₹0';
    }

    if (!title.trim()) {
      newErrors.title = 'Please enter a description (e.g. Chai, Groceries)';
    }

    if (newErrors.amount) {
      setValidationErrors(newErrors);
      hapticWarning();
      amountInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      amountInputRef.current?.focus();
      return;
    }

    if (newErrors.title) {
      setValidationErrors(newErrors);
      hapticWarning();
      titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      titleInputRef.current?.focus();
      return;
    }

    setValidationErrors({});
    hapticSuccess();
    onAddExpense({
      title: title.trim(),
      amount: numAmount,
      category,
      notes: notes.trim(),
      expenseDate,
    });

    // Auto-navigate to the expense's month so user immediately sees their record
    const addedDateInfo = parseExpenseDate(expenseDate);
    setSelectedYear(addedDateInfo.year);
    setSelectedMonthIndex(addedDateInfo.month);
    setSelectedPeriod('MONTH');

    // Ensure category filter doesn't hide the freshly created expense
    if (selectedCategoryFilter !== 'ALL' && selectedCategoryFilter !== category) {
      setSelectedCategoryFilter('ALL');
    }

    setTitle('');
    setAmount('');
    setNotes('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setShowAddSheet(false);
    if (onCloseAddSheet) onCloseAddSheet();
  };

  const handleAddPreset = (val: number) => {
    hapticImpact('LIGHT');
    const current = Number(amount) || 0;
    setAmount(String(current + val));
    if (validationErrors.amount) {
      setValidationErrors((prev) => ({ ...prev, amount: undefined }));
    }
  };

  const currentDisplayTotal =
    selectedPeriod === 'WEEK'
      ? weeklyTotal
      : selectedPeriod === 'MONTH'
      ? selectedMonthTotal
      : allTimeTotal;

  const monthlyAllowance = budgetConfig.monthlyAllowance;
  const weeklyAllowance = Math.round(budgetConfig.monthlyAllowance / 4);
  const budgetLimit = selectedPeriod === 'WEEK' ? weeklyAllowance : monthlyAllowance;
  const budgetPercentage = Math.min(100, Math.round((currentDisplayTotal / budgetLimit) * 100));

  // Category Breakdown & Caps Analysis
  const categoryBreakdown = useMemo(() => {
    const spentMap: Record<string, number> = {};
    for (const exp of activePeriodExpenses) {
      spentMap[exp.category] = (spentMap[exp.category] || 0) + exp.amount;
    }
    return CATEGORIES.map((cat) => {
      const spent = spentMap[cat.name] || 0;
      const cap = budgetConfig.categoryCaps[cat.name] || 0;
      const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
      return {
        name: cat.name,
        icon: cat.icon,
        spent,
        cap,
        pct,
        isOver: cap > 0 && spent > cap,
      };
    });
  }, [activePeriodExpenses, budgetConfig.categoryCaps]);

  // Burn-Rate Velocity Health Indicator
  const velocityInfo = useMemo(() => {
    if (selectedPeriod !== 'MONTH') return null;
    const daysInMonth = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
    const elapsedDays = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth;
    const elapsedPercent = Math.round((elapsedDays / daysInMonth) * 100);
    const spentPercent = budgetLimit > 0 ? Math.round((currentDisplayTotal / budgetLimit) * 100) : 0;

    if (spentPercent >= 100) {
      return {
        status: 'EXCEEDED' as const,
        label: 'Budget Exceeded',
        sublabel: `Over by ₹${(currentDisplayTotal - budgetLimit).toLocaleString('en-IN')}`,
      };
    }
    if (spentPercent > elapsedPercent + 15) {
      return {
        status: 'HIGH_VELOCITY' as const,
        label: 'High Spend Velocity',
        sublabel: `Pacing ${spentPercent - elapsedPercent}% ahead of month progress`,
      };
    }
    return {
      status: 'HEALTHY' as const,
      label: 'Healthy Burn Rate',
      sublabel: `Safe daily limit: ₹${safeDailySpend}/day`,
    };
  }, [selectedPeriod, selectedYear, selectedMonthIndex, isCurrentMonth, now, budgetLimit, currentDisplayTotal, safeDailySpend]);

  return (
    <div className="space-y-4 pb-28 sm:pb-nav-safe px-4 pt-3 bg-[#F9F9FF] dark:bg-[#0B0B10] min-h-full">
      {/* Privacy Guarantee Header Card */}
      <div className="rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200/90 dark:border-[#27354A] p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                Personal Vault
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                  100% Private
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
        <div className="mt-3 p-1 bg-slate-100 dark:bg-[#12121A] rounded-xl flex items-center">
          <button
            onClick={() => setSelectedPeriod('WEEK')}
            className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
              selectedPeriod === 'WEEK'
                ? 'bg-white dark:bg-[#20202A] text-slate-900 dark:text-slate-100 font-semibold shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setSelectedPeriod('MONTH')}
            className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
              selectedPeriod === 'MONTH'
                ? 'bg-white dark:bg-[#20202A] text-slate-900 dark:text-slate-100 font-semibold shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            By Month
          </button>
          <button
            onClick={() => setSelectedPeriod('ALL')}
            className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
              selectedPeriod === 'ALL'
                ? 'bg-white dark:bg-[#20202A] text-slate-900 dark:text-slate-100 font-semibold shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            All Time
          </button>
        </div>

        {/* SPECIFIC MONTH SELECTOR BAR (Only visible in 'MONTH' view) */}
        {selectedPeriod === 'MONTH' && (
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#27354A]/60 flex items-center justify-between">
            {/* Step to Previous Month */}
            <button
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#20202A] hover:bg-slate-200 dark:hover:bg-[#27354A] text-slate-700 dark:text-slate-300 flex items-center justify-center active:scale-95 transition-all"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Interactive Month Picker Trigger Pill */}
            <button
              onClick={() => setShowMonthPickerModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 font-semibold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/50 active:scale-95 transition-all shadow-2xs"
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
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 ml-0.5" />
            </button>

            {/* Step to Next Month (Disabled if on current month) */}
            <button
              onClick={handleNextMonth}
              disabled={isCurrentMonth}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#20202A] hover:bg-slate-200 dark:hover:bg-[#27354A] disabled:opacity-30 disabled:pointer-events-none text-slate-700 dark:text-slate-300 flex items-center justify-center active:scale-95 transition-all"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Dynamic Period Spent Amount */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#27354A]/60 flex items-baseline justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              {selectedPeriod === 'WEEK'
                ? 'Spent This Week (Mon–Sun)'
                : selectedPeriod === 'MONTH'
                ? `Spent in ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`
                : 'Lifetime Private Spending'}
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
              ₹{currentDisplayTotal.toLocaleString('en-IN')}
            </span>
          </div>

          {selectedPeriod !== 'ALL' && (
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase font-medium">Budget</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditAllowanceInput(String(budgetConfig.monthlyAllowance));
                    setEditCategoryCaps(budgetConfig.categoryCaps);
                    setShowBudgetModal(true);
                  }}
                  className="p-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                  title="Configure Allowance & Category Caps"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditAllowanceInput(String(budgetConfig.monthlyAllowance));
                  setEditCategoryCaps(budgetConfig.categoryCaps);
                  setShowBudgetModal(true);
                }}
                className="text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 tabular-nums hover:underline"
              >
                ₹{budgetLimit.toLocaleString('en-IN')} ({budgetPercentage}%)
              </button>
            </div>
          )}
        </div>

        {/* Progress Bar for Budget */}
        {selectedPeriod !== 'ALL' && (
          <div className="mt-2 w-full h-1.5 rounded-full bg-slate-100 dark:bg-[#12121A] overflow-hidden">
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
          <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#181820] border border-slate-100 dark:border-[#27354A]/60 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
            {isCurrentMonth ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    <strong>{daysLeftInMonth} days</strong> left in month
                  </span>
                </div>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                  ₹{safeDailySpend}/day safe limit
                </span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <strong>Month Completed</strong>
                  </span>
                </div>
                <span
                  className={`font-semibold tabular-nums ${
                    monthlyAllowance >= selectedMonthTotal ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
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

        {/* Export Button — visible in Month view */}
        {selectedPeriod === 'MONTH' && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                hapticImpact('LIGHT');
                setShowExportSheet(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px] hover:bg-indigo-100 dark:hover:bg-indigo-900/50 active:scale-95 transition-all shadow-2xs"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
            </button>
          </div>
        )}

        {/* 7-Day Micro Bar Graph for 'This Week' View */}
        {selectedPeriod === 'WEEK' && (
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-[#27354A]/60 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              <span>Daily Breakdown (Mon - Sun)</span>
              <span>Daily Avg: ₹{Math.round(weeklyTotal / 7).toLocaleString('en-IN')}</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5 items-end h-14 pt-2">
              {weeklyDaysData.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full bg-slate-100 dark:bg-[#20202A] rounded-sm h-full flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded-sm transition-all duration-300 ${
                        d.isToday ? 'bg-indigo-600' : 'bg-indigo-300 dark:bg-indigo-800'
                      }`}
                      style={{ height: `${Math.max(8, d.percent)}%` }}
                      title={`₹${d.amount}`}
                    />
                  </div>
                  <span className={`text-[9px] font-semibold ${d.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Burn Rate Velocity Health Banner */}
      {selectedPeriod === 'MONTH' && velocityInfo && (
        <div
          className={`rounded-2xl border p-3.5 flex items-center justify-between shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] dark:shadow-none ${
            velocityInfo.status === 'EXCEEDED'
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40'
              : velocityInfo.status === 'HIGH_VELOCITY'
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40'
              : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                velocityInfo.status === 'EXCEEDED'
                  ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                  : velocityInfo.status === 'HIGH_VELOCITY'
                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {velocityInfo.status === 'EXCEEDED' ? (
                <ShieldAlert className="w-4 h-4" />
              ) : velocityInfo.status === 'HIGH_VELOCITY' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <TrendingUp className="w-4 h-4" />
              )}
            </div>
            <div>
              <span
                className={`text-xs font-bold block ${
                  velocityInfo.status === 'EXCEEDED'
                    ? 'text-rose-900 dark:text-rose-200'
                    : velocityInfo.status === 'HIGH_VELOCITY'
                    ? 'text-amber-900 dark:text-amber-200'
                    : 'text-emerald-900 dark:text-emerald-200'
                }`}
              >
                {velocityInfo.label}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                {velocityInfo.sublabel}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditAllowanceInput(String(budgetConfig.monthlyAllowance));
              setEditCategoryCaps(budgetConfig.categoryCaps);
              setShowBudgetModal(true);
            }}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-2.5 py-1 rounded-lg bg-white dark:bg-[#181820] border border-slate-200 dark:border-[#27354A] shadow-2xs active:scale-95 transition-all flex-shrink-0"
          >
            Adjust
          </button>
        </div>
      )}

      {/* Category Spending Targets & Caps Card */}
      <div className="rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200/90 dark:border-[#27354A] p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Category Targets & Caps
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditAllowanceInput(String(budgetConfig.monthlyAllowance));
                setEditCategoryCaps(budgetConfig.categoryCaps);
                setShowBudgetModal(true);
              }}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Configure
            </button>
            <button
              type="button"
              onClick={() => setShowCategoryCapsCard(!showCategoryCapsCard)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showCategoryCapsCard ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {showCategoryCapsCard && (
          <div className="space-y-2.5 pt-1">
            {categoryBreakdown.map((cat) => {
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <cat.icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] tabular-nums">
                      <span className="font-bold text-slate-900 dark:text-slate-100">₹{cat.spent.toLocaleString('en-IN')}</span>
                      {cat.cap > 0 && (
                        <span className="text-slate-400 dark:text-slate-500">
                          / ₹{cat.cap.toLocaleString('en-IN')}
                        </span>
                      )}
                      {cat.cap > 0 && (
                        <span
                          className={`ml-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                            cat.isOver
                              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40'
                              : cat.pct > 75
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40'
                              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40'
                          }`}
                        >
                          {cat.pct}%
                        </span>
                      )}
                    </div>
                  </div>

                  {cat.cap > 0 && (
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-[#12121A] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          cat.isOver ? 'bg-rose-500' : cat.pct > 75 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.min(100, cat.pct)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
          className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#1C1C25] border border-slate-200 dark:border-[#27354A] rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-indigo-500 shadow-2xs transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
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
              : 'bg-white dark:bg-[#1C1C25] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
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
                  : 'bg-white dark:bg-[#1C1C25] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
              }`}
            >
              <span>{cat.name}</span>
              {count > 0 && <span className="text-[10px] opacity-80">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Expenses Feed */}
      <div ref={recordsContainerRef} className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Return to Current Month
            </button>
          )}
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200/80 dark:border-[#27354A] p-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2 shadow-xs">
            <Lock className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {selectedCategoryFilter !== 'ALL'
                ? `No ${selectedCategoryFilter} expenses found`
                : selectedPeriod === 'WEEK'
                ? 'No expenses recorded this week'
                : selectedPeriod === 'ALL'
                ? 'No personal expenses recorded yet'
                : `No expenses recorded in ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`}
            </p>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {selectedCategoryFilter !== 'ALL' ? (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryFilter('ALL')}
                  className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
                >
                  Show all categories ({activePeriodExpenses.length} records available)
                </button>
              ) : selectedPeriod === 'WEEK' ? (
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('MONTH')}
                  className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
                >
                  Switch to Monthly View ({selectedMonthExpenses.length} records in {MONTH_NAMES[selectedMonthIndex]})
                </button>
              ) : selectedPeriod === 'ALL' ? (
                'Tap + Add to log your first private resident expense.'
              ) : (
                'Use the arrows above to browse other months or tap + Add to log an expense.'
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-[#1C1C25] border border-slate-200/80 dark:border-[#27354A] rounded-2xl divide-y divide-slate-100 dark:divide-[#27354A]/60 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] dark:shadow-none overflow-hidden">
              {displayedExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 dark:hover:bg-[#20202A]/60 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      ₹
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{exp.title}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#20202A] text-slate-700 dark:text-slate-300 text-[10px] font-medium">
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
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      ₹{exp.amount.toLocaleString('en-IN')}
                    </span>
                    <button
                      onClick={() => {
                        handleInitiateDelete(exp);
                      }}
                      className="w-10 h-10 -mr-1.5 rounded-xl text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-all active:scale-90"
                      aria-label="Delete Expense"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Progressive Feed Controls (Option C) */}
            <ProgressiveFeedControls
              currentCount={displayedExpenses.length}
              totalCount={filteredExpenses.length}
              pageSize={VAULT_PAGE_SIZE}
              onShowMore={() =>
                setVaultVisibleLimit((prev) => Math.min(prev + VAULT_PAGE_SIZE, filteredExpenses.length))
              }
              onViewAll={() => setVaultVisibleLimit(filteredExpenses.length)}
              onShowLess={() => {
                setVaultVisibleLimit(VAULT_PAGE_SIZE);
                recordsContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              itemLabel="expenses"
            />
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Specific Month History Drawer / Modal (Native Bottom Sheet)                */}
      {/* ========================================================================= */}
      <MobileBottomSheet
        isOpen={showMonthPickerModal}
        onClose={() => setShowMonthPickerModal(false)}
        title="Select Month History"
        subtitle="Pick any past month to inspect spending"
        icon={<History className="w-4.5 h-4.5" />}
        maxHeight="85vh"
      >
        {/* List of Available Historical Months */}
        <div className="space-y-2 pt-1 pb-4">
          {availableMonthsHistory.map((item) => {
            const isSelected = item.year === selectedYear && item.monthIndex === selectedMonthIndex;
            const isCurrent = item.year === currentActualYear && item.monthIndex === currentActualMonth;

            return (
              <button
                key={`${item.year}-${item.monthIndex}`}
                onClick={() => handleSelectMonth(item.year, item.monthIndex)}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.99] ${
                  isSelected
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white dark:bg-[#1C1C25] border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-[#20202A] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {MONTH_NAMES[item.monthIndex].slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {MONTH_NAMES[item.monthIndex]} {item.year}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.count} expenses logged
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    ₹{item.total.toLocaleString()}
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      item.total <= monthlyAllowance
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40'
                        : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40'
                    }`}
                  >
                    {item.total <= monthlyAllowance ? 'Under Budget' : 'Over Budget'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </MobileBottomSheet>

      {/* Ergonomic Quick-Add Bottom Sheet */}
      <MobileBottomSheet
        isOpen={showAddSheet}
        onClose={() => {
          setShowAddSheet(false);
          if (onCloseAddSheet) onCloseAddSheet();
        }}
        title="Add Private Expense"
        subtitle="Saved securely in your personal vault"
        icon={<Lock className="w-4.5 h-4.5" />}
        maxHeight="92vh"
      >
        {!isOnline && (
          <div className="mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-700 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
            <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-medium">
              Operating Offline: Expense will be saved to your local vault immediately & synced once reconnected.
            </span>
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4 pb-4">
          {/* Amount Display with Currency */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between mb-1">
              <span className="flex items-center gap-1">
                <span>Amount in ₹</span>
                <span className="text-rose-500 font-bold">*</span>
              </span>
              {validationErrors.amount && (
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  Required
                </span>
              )}
            </label>
            <CurrencyInput
              ref={amountInputRef}
              size="lg"
              value={amount}
              onChange={(val) => {
                setAmount(val);
                if (validationErrors.amount) {
                  setValidationErrors((prev) => ({ ...prev, amount: undefined }));
                }
              }}
              placeholder="0"
              autoFocus
              hasError={Boolean(validationErrors.amount)}
            />
            {validationErrors.amount && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{validationErrors.amount}</span>
              </p>
            )}
          </div>

          {/* Quick Preset Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PRESETS.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleAddPreset(val)}
                className="h-8 px-3 min-w-[52px] rounded-lg bg-slate-100 dark:bg-[#20202A] hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-all active:scale-95 flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-[#27354A]"
              >
                +₹{val}
              </button>
            ))}
          </div>

          {/* Title / Description Field */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <span>Description</span>
                <span className="text-rose-500 font-bold">*</span>
              </label>
              {validationErrors.title && (
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  Required
                </span>
              )}
            </div>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (validationErrors.title) {
                  setValidationErrors((prev) => ({ ...prev, title: undefined }));
                }
              }}
              placeholder="e.g. Chai, Books, Metro recharge"
              className={`w-full px-3.5 py-2.5 rounded-xl text-base md:text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all ${
                validationErrors.title
                  ? 'bg-rose-50/40 dark:bg-rose-950/20 border-2 border-rose-400 ring-2 ring-rose-500/20 focus:border-rose-500'
                  : 'bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500'
              }`}
            />
            {validationErrors.title && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{validationErrors.title}</span>
              </p>
            )}

            {/* Quick Suggestions based on Selected Category */}
            <div className="pt-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium block mb-1">
                Quick 1-tap presets for {category}:
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {(CATEGORY_QUICK_CHIPS[category] || []).map((chip) => {
                  const cleanName = chip.replace(/\s[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
                  const isSelected = title.toLowerCase() === cleanName.toLowerCase();
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        hapticSelection();
                        setTitle(cleanName);
                        if (validationErrors.title) {
                          setValidationErrors((prev) => ({ ...prev, title: undefined }));
                        }
                        titleInputRef.current?.focus();
                      }}
                      className={`h-7 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-95 flex items-center gap-1 border shrink-0 ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 font-bold shadow-2xs'
                          : 'bg-slate-100 dark:bg-[#20202A] hover:bg-slate-200/80 dark:hover:bg-[#27354A] text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-[#27354A]'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Category Grid */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
              Category
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CATEGORIES.map((cat) => {
                const isSelected = category === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      setCategory(cat.name);
                    }}
                    className={`min-h-[52px] py-2 px-1 rounded-xl text-[11px] font-semibold flex flex-col items-center justify-center gap-1 border transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold shadow-2xs'
                        : 'bg-slate-50 dark:bg-[#20202A] border-slate-200 dark:border-[#27354A] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#27354A]'
                    }`}
                  >
                    <cat.icon className="w-4.5 h-4.5" />
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Category Cap & Spend Preview */}
            {selectedCategoryCap > 0 && (
              <div
                className={`mt-2 p-2.5 rounded-xl border text-xs flex items-center justify-between transition-colors ${
                  willExceedCategoryCap
                    ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200'
                    : 'bg-slate-50 dark:bg-[#181820] border-slate-200/80 dark:border-[#27354A] text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 pr-2">
                  <HeartPulse className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="font-semibold">{category} Limit:</span>{' '}
                    <span>₹{selectedCategoryCap.toLocaleString('en-IN')}/mo</span>
                    {willExceedCategoryCap && (
                      <span className="text-[11px] block text-amber-700 dark:text-amber-300 font-medium">
                        Will exceed limit by ₹{(projectedCategoryTotal - selectedCategoryCap).toLocaleString('en-IN')}. (Saved normally)
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right text-[11px] font-bold shrink-0">
                  <span className={willExceedCategoryCap ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-slate-100'}>
                    ₹{projectedCategoryTotal.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-normal">
                    {Math.round((projectedCategoryTotal / selectedCategoryCap) * 100)}% of limit
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
              Date
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#20202A] border border-slate-200 dark:border-[#27354A] rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Submit - Always responsive with guided validation */}
          <div className="pt-2 pb-2">
            <button
              type="submit"
              className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Save Private Expense</span>
            </button>
          </div>
        </form>
      </MobileBottomSheet>

      {/* Dynamic Budget Configuration Bottom Sheet */}
      <MobileBottomSheet
        isOpen={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        title="Personal Budget & Targets"
        subtitle="Tailored to your monthly allowance"
        icon={<SlidersHorizontal className="w-4.5 h-4.5" />}
        maxHeight="90vh"
      >
        <div className="space-y-4 pt-1 pb-4">
          {/* Monthly Pocket Money / Allowance Input */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Monthly Allowance (₹)
            </label>
            <CurrencyInput
              size="md"
              step="100"
              value={editAllowanceInput}
              onChange={(val) => setEditAllowanceInput(val)}
              placeholder="8000"
            />

            {/* Quick Budget Presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[5000, 8000, 10000, 12000, 15000, 20000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setEditAllowanceInput(String(val))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                    Number(editAllowanceInput) === val
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-[#20202A] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#27354A]'
                  }`}
                >
                  ₹{(val / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          {/* Category Caps Section */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-[#27354A]/60">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Category Spending Caps (₹)
              </label>
              <button
                type="button"
                onClick={() => {
                  // Auto-calculate suggested category caps based on entered allowance
                  const total = Number(editAllowanceInput) || 8000;
                  setEditCategoryCaps({
                    Food: Math.round(total * 0.45),
                    Shopping: Math.round(total * 0.20),
                    Travel: Math.round(total * 0.12),
                    Entertainment: Math.round(total * 0.12),
                    Academics: Math.round(total * 0.06),
                    Health: Math.round(total * 0.05),
                  });
                }}
                className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Auto-Distribute
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.filter((c) => c.name !== 'Other').map((cat) => {
                const currentCap = editCategoryCaps[cat.name] || 0;
                return (
                  <div key={cat.name} className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#181820] border border-slate-200/80 dark:border-[#27354A] space-y-1">
                    <div className="flex items-center gap-1.5">
                      <cat.icon className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{cat.name}</span>
                    </div>
                    <CurrencyInput
                      size="sm"
                      value={currentCap || ''}
                      onChange={(_val, num) =>
                        setEditCategoryCaps((prev) => ({
                          ...prev,
                          [cat.name]: num,
                        }))
                      }
                      placeholder="0"
                      containerClassName="bg-white dark:bg-[#20202A]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-2 pb-2">
            <button
              type="button"
              onClick={() => {
                const numAllowance = Number(editAllowanceInput);
                if (isNaN(numAllowance) || numAllowance <= 0) return;
                const newConfig: UserBudgetConfig = {
                  monthlyAllowance: numAllowance,
                  categoryCaps: editCategoryCaps,
                  updatedAt: new Date().toISOString(),
                };
                saveUserBudget(currentUser.id, newConfig);
                setBudgetConfig(newConfig);
                setShowBudgetModal(false);
              }}
              disabled={!editAllowanceInput || Number(editAllowanceInput) <= 0}
              className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Save Budget Targets</span>
            </button>
          </div>
        </div>
      </MobileBottomSheet>

      {/* Accidental Deletion Protection: Floating Undo Toast */}
      {deletedExpenseCache && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-sm mx-auto bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border border-slate-700/80 flex items-center justify-between animate-in fade-in slide-in-from-bottom-4 duration-200 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">
                Expense deleted
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                &ldquo;{deletedExpenseCache.title}&rdquo; (₹{deletedExpenseCache.amount}) &bull; {undoCountdown}s
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-1 shrink-0 shadow-xs"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {/* Export Bottom Sheet */}
      <ExportBottomSheet
        isOpen={showExportSheet}
        onClose={() => setShowExportSheet(false)}
        monthLabel={`${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`}
        onExport={handleExport}
      />
    </div>
  );
};

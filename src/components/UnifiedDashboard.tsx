import React from 'react';
import { User, PersonalExpense, SharedExpense, ExpenseSplit, SettlementPayment, Room } from '../types';
import { calculateUnifiedDashboard, calculateRoomSummary } from '../lib/ledger/engine';
import { Lock, Users, ArrowUpRight, ArrowDownLeft, Wallet, PieChart, CheckCircle } from 'lucide-react';

interface UnifiedDashboardProps {
  currentUser: User;
  personalExpenses: PersonalExpense[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  allUsers: User[];
  rooms: Room[];
  onOpenAddPersonal: () => void;
  onOpenAddShared: () => void;
  onNavigateTab: (tab: 'dashboard' | 'personal' | 'rooms' | 'subscription' | 'admin') => void;
}

export const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({
  currentUser,
  personalExpenses,
  sharedExpenses,
  expenseSplits,
  settlementPayments,
  allUsers,
  rooms,
  onOpenAddPersonal,
  onOpenAddShared,
  onNavigateTab,
}) => {
  const activeRoomIds = rooms.map((r) => r.id);
  const summary = calculateUnifiedDashboard(
    currentUser.id,
    personalExpenses,
    sharedExpenses,
    expenseSplits,
    settlementPayments,
    allUsers,
    activeRoomIds
  );

  // Group personal expenses by category for analytics
  const myPersonal = personalExpenses.filter((p) => p.userId === currentUser.id);
  const categoryTotals: Record<string, number> = {};
  myPersonal.forEach((p) => {
    categoryTotals[p.category] = (categoryTotals[p.category] || 0) + p.amount;
  });

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="glass-card p-6 relative overflow-hidden bg-gradient-to-r from-indigo-950/60 via-slate-900/80 to-slate-900/60 border-indigo-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                🎓 {currentUser.name}'s Monthly Outflow
              </span>
              <span className="text-xs text-[var(--text-subtle)]">September 2026</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Unified Financial Dashboard
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">
              Combines your strictly private personal budget with your calculated share of flat/room expenses.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenAddPersonal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 transition-all shadow-md"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>+ Private Expense</span>
            </button>
            <button
              onClick={onOpenAddShared}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
            >
              <Users className="w-3.5 h-3.5" />
              <span>+ Split Room Bill</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 Core Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Outflow */}
        <div className="glass-card p-5 border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 to-slate-900/80">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Total Monthly Outflow
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              ₹{summary.totalOutflow.toLocaleString('en-IN')}
            </span>
            <p className="text-xs text-[var(--text-subtle)] mt-1 flex items-center gap-1">
              <span>Personal (₹{summary.personalTotal}) + Room (₹{summary.sharedObligationsTotal})</span>
            </p>
          </div>
        </div>

        {/* Private Personal Total */}
        <div className="glass-card p-5 border-emerald-500/20 hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Private Spending</span>
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              100% PRIVATE
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-emerald-400 tracking-tight">
              ₹{summary.personalTotal.toLocaleString('en-IN')}
            </span>
            <p className="text-xs text-[var(--text-subtle)] mt-1">
              Food, shopping, travel & snacks
            </p>
          </div>
        </div>

        {/* Room Share Obligations */}
        <div className="glass-card p-5 border-purple-500/20 hover:border-purple-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              <span>My Room Share</span>
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              {summary.activeRoomsCount} ACTIVE ROOMS
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-purple-300 tracking-tight">
              ₹{summary.sharedObligationsTotal.toLocaleString('en-IN')}
            </span>
            <p className="text-xs text-[var(--text-subtle)] mt-1">
              Assigned share of electricity, Wi-Fi, groceries
            </p>
          </div>
        </div>

        {/* Net Debt / Balance */}
        <div className="glass-card p-5 border-amber-500/20 bg-gradient-to-br from-slate-900/90 to-slate-950">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Room Settlement Standing
            </span>
            {summary.netReceivables >= summary.netPayables ? (
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            ) : (
              <ArrowUpRight className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="mt-3">
            {summary.netReceivables > 0 && (
              <div className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                <span>+ ₹{summary.netReceivables}</span>
                <span className="text-[10px] text-emerald-300/80 font-normal">(You are owed)</span>
              </div>
            )}
            {summary.netPayables > 0 && (
              <div className="text-sm font-bold text-rose-400 flex items-center gap-1 mt-0.5">
                <span>- ₹{summary.netPayables}</span>
                <span className="text-[10px] text-rose-300/80 font-normal">(You owe roommates)</span>
              </div>
            )}
            {summary.netReceivables === 0 && summary.netPayables === 0 && (
              <span className="text-xl font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-5 h-5" />
                <span>All Settled Up</span>
              </span>
            )}
            <p className="text-xs text-[var(--text-subtle)] mt-1">
              Derived from two-way pairwise ledger
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown Section: Private Spending Categories & Room List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Personal Category Breakdown */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">Private Expense Allocation</h2>
            </div>
            <button
              onClick={() => onNavigateTab('personal')}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <span>Open Private Vault</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {Object.keys(categoryTotals).length === 0 ? (
              <p className="text-xs text-[var(--text-subtle)] py-4 text-center">No personal expenses logged this month.</p>
            ) : (
              Object.entries(categoryTotals).map(([cat, amt]) => {
                const pct = summary.personalTotal > 0 ? Math.round((amt / summary.personalTotal) * 100) : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-300">{cat}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">₹{amt.toLocaleString('en-IN')}</span>
                        <span className="text-[var(--text-subtle)] w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Col: Active Room Snapshots */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              <h2 className="text-base font-bold text-white">My Shared Rooms</h2>
            </div>
            <button
              onClick={() => onNavigateTab('rooms')}
              className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {rooms.map((room) => {
              const rSummary = calculateRoomSummary(
                room.id,
                currentUser.id,
                sharedExpenses,
                expenseSplits,
                settlementPayments,
                allUsers
              );

              return (
                <div
                  key={room.id}
                  onClick={() => onNavigateTab('rooms')}
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-[var(--border-subtle)] hover:border-indigo-500/40 cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white tracking-tight">{room.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-gray-300">
                      ₹{rSummary.totalRoomExpenses} Total
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-subtle)]">My Standing:</span>
                    {rSummary.myNetBalance > 0 ? (
                      <span className="font-bold text-emerald-400">+₹{rSummary.myNetBalance} (Owed)</span>
                    ) : rSummary.myNetBalance < 0 ? (
                      <span className="font-bold text-rose-400">-₹{Math.abs(rSummary.myNetBalance)} (Owes)</span>
                    ) : (
                      <span className="font-bold text-gray-400">Settled ✅</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

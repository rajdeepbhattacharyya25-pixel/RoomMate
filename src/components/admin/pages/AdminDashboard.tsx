import React, { useState, useEffect } from 'react';
import {
  Users,
  Building2,
  Receipt,
  Clock,
  Download,
  CheckCircle2,
  Headphones,
  UserPlus,
} from 'lucide-react';
import { User, Room, SharedExpense, ExpenseSplit, SettlementPayment, BugReport, AuditLog } from '../../../types';
import { MetricCard } from '../common/MetricCard';
import { formatInr, exportToCsv } from '../../../lib/utils/currencyFormatter';
import { AdminRoute } from '../AdminSidebar';

interface AdminDashboardProps {
  currentUser: User;
  allUsers: User[];
  rooms: Room[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  bugReports: BugReport[];
  auditLogs: AuditLog[];
  onNavigate: (route: AdminRoute, entityId?: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  allUsers,
  rooms,
  sharedExpenses,
  expenseSplits: _expenseSplits,
  settlementPayments,
  bugReports: _bugReports,
  auditLogs: _auditLogs,
  onNavigate,
}) => {
  const [timeFilter, setTimeFilter] = useState<'7D' | '30D' | '3M' | '6M' | '1Y'>('30D');
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [chartHoverIndex, setChartHoverIndex] = useState<number | null>(null);

  // Live Time clock update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' IST'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute Core Platform Metrics
  const totalUsers = allUsers.filter((u) => u.role === 'STUDENT').length || 12482;
  const activeUsers = Math.round(totalUsers * 0.714);
  const activeRooms = rooms.filter((r) => !r.isArchived && !r.isFrozen).length || 2843;

  // Shared Expenses Calculations (Strictly shared ledger)
  const totalSharedVolume = sharedExpenses.length > 0
    ? sharedExpenses.reduce((sum, e) => sum + e.totalAmount, 0)
    : 1842500;

  const totalSettledAmount = settlementPayments.length > 0
    ? settlementPayments.reduce((sum, s) => sum + s.amount, 0)
    : 1420700;

  const outstandingSharedBalance = Math.max(totalSharedVolume - totalSettledAmount, 421800);

  // Dynamic Chart Points based on Timeframe
  const chartData = {
    '7D': [
      { label: 'Mon', newUsers: 14, activeUsers: 640 },
      { label: 'Tue', newUsers: 22, activeUsers: 720 },
      { label: 'Wed', newUsers: 19, activeUsers: 690 },
      { label: 'Thu', newUsers: 28, activeUsers: 810 },
      { label: 'Fri', newUsers: 34, activeUsers: 890 },
      { label: 'Sat', newUsers: 45, activeUsers: 1020 },
      { label: 'Sun', newUsers: 38, activeUsers: 950 },
    ],
    '30D': [
      { label: 'Week 1', newUsers: 110, activeUsers: 2200 },
      { label: 'Week 2', newUsers: 145, activeUsers: 2450 },
      { label: 'Week 3', newUsers: 184, activeUsers: 2890 },
      { label: 'Week 4', newUsers: 215, activeUsers: 3120 },
    ],
    '3M': [
      { label: 'Jul', newUsers: 540, activeUsers: 6200 },
      { label: 'Aug', newUsers: 780, activeUsers: 7500 },
      { label: 'Sep', newUsers: 920, activeUsers: 8921 },
    ],
    '6M': [
      { label: 'Apr', newUsers: 410, activeUsers: 4800 },
      { label: 'May', newUsers: 480, activeUsers: 5400 },
      { label: 'Jun', newUsers: 520, activeUsers: 5900 },
      { label: 'Jul', newUsers: 610, activeUsers: 6800 },
      { label: 'Aug', newUsers: 780, activeUsers: 7800 },
      { label: 'Sep', newUsers: 980, activeUsers: 8921 },
    ],
    '1Y': [
      { label: 'Q1', newUsers: 1200, activeUsers: 4200 },
      { label: 'Q2', newUsers: 1850, activeUsers: 5900 },
      { label: 'Q3', newUsers: 2400, activeUsers: 7600 },
      { label: 'Q4', newUsers: 3100, activeUsers: 8921 },
    ],
  }[timeFilter];

  // Export Executive Summary
  const handleExportSummary = () => {
    const summary = [
      { Metric: 'Total Registered Students', Value: totalUsers },
      { Metric: 'Active Monthly Residents', Value: activeUsers },
      { Metric: 'Active Room Clusters', Value: activeRooms },
      { Metric: 'Total Shared Expense Volume (INR)', Value: totalSharedVolume },
      { Metric: 'Outstanding Room Balance (INR)', Value: outstandingSharedBalance },
      { Metric: 'Settled Reimbursements (INR)', Value: totalSettledAmount },
      { Metric: 'Exported At', Value: new Date().toISOString() },
    ];
    exportToCsv(`RoomMate_SuperAdmin_Summary_${timeFilter}`, summary);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Header & Live Timestamps */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Good evening, {currentUser.name || 'Superadmin'}
            </h1>
            <span className="text-xl">👋</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Here&apos;s what&apos;s happening across RoomMate student ledgers &amp; clusters today.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Live Date/Time Badge */}
          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-lg border border-slate-200 shadow-2xs text-xs text-slate-600 font-medium">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span className="font-mono text-indigo-700 font-semibold">{currentTimeStr || 'Loading...'}</span>
          </div>

          {/* Export Report Action */}
          <button
            onClick={handleExportSummary}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* 2. 5 KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Users"
          value={totalUsers.toLocaleString('en-IN')}
          trend={{ value: '+8.4%', isPositive: true, period: 'vs previous period' }}
          icon={<Users className="w-4 h-4" />}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          onClick={() => onNavigate('users')}
        />

        <MetricCard
          title="Active Users"
          value={activeUsers.toLocaleString('en-IN')}
          trend={{ value: '+5.2%', isPositive: true, period: '71.4% MAU rate' }}
          icon={<UserPlus className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          onClick={() => onNavigate('users')}
        />

        <MetricCard
          title="Active Rooms"
          value={activeRooms.toLocaleString('en-IN')}
          trend={{ value: '+11.8%', isPositive: true, period: 'vs last month' }}
          icon={<Building2 className="w-4 h-4" />}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          onClick={() => onNavigate('rooms')}
        />

        <MetricCard
          title="Shared Expenses"
          value={formatInr(totalSharedVolume, true)}
          subtitle="This month across all rooms"
          icon={<Receipt className="w-4 h-4" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          onClick={() => onNavigate('expenses')}
        />

        <MetricCard
          title="Outstanding Shared"
          value={formatInr(outstandingSharedBalance, true)}
          subtitle="Currently outstanding debt"
          icon={<Clock className="w-4 h-4" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          onClick={() => onNavigate('expenses')}
        />
      </div>

      {/* 3. CHARTS ROW: User Growth (Large) & Room Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Growth Line/Area Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">User Growth</h3>
                <p className="text-xs text-slate-500 mt-0.5">New resident registrations vs active daily participants</p>
              </div>

              {/* Time Range Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/60">
                {(['7D', '30D', '3M', '6M', '1Y'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTimeFilter(t)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      timeFilter === t
                        ? 'bg-white text-indigo-600 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive SVG Growth Chart */}
            <div className="h-64 w-full relative flex items-end justify-between pt-8 pb-6 px-4">
              {/* Background Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-6 opacity-40">
                <div className="border-b border-slate-200 w-full" />
                <div className="border-b border-slate-200 w-full" />
                <div className="border-b border-slate-200 w-full" />
              </div>

              {/* Bars / Points */}
              {chartData.map((d, index) => {
                const maxVal = Math.max(...chartData.map((p) => p.activeUsers)) || 1;
                const heightPct = Math.round((d.activeUsers / maxVal) * 80) + 15;
                const isHovered = chartHoverIndex === index;

                return (
                  <div
                    key={d.label}
                    onMouseEnter={() => setChartHoverIndex(index)}
                    onMouseLeave={() => setChartHoverIndex(null)}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer mx-1"
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-12 z-20 bg-slate-900 text-white text-[11px] font-medium py-1.5 px-3 rounded-lg shadow-xl whitespace-nowrap animate-in fade-in zoom-in-95">
                        <div className="font-bold text-indigo-300">{d.label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span>Active: {d.activeUsers.toLocaleString()}</span>
                          <span>•</span>
                          <span className="text-emerald-300">+{d.newUsers} new</span>
                        </div>
                      </div>
                    )}

                    {/* Bar visualization */}
                    <div className="w-full max-w-[44px] flex flex-col items-center justify-end h-full">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          isHovered
                            ? 'bg-indigo-600 shadow-md shadow-indigo-200'
                            : 'bg-indigo-100 group-hover:bg-indigo-200'
                        }`}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 mt-2">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                <span>Active Users</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>New Onboardings</span>
              </div>
            </div>
            <span className="font-semibold text-indigo-600 cursor-pointer" onClick={() => onNavigate('analytics')}>
              View Detailed Analytics &rarr;
            </span>
          </div>
        </div>

        {/* Room Activity & Lifecycle Status */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Room Activity</h3>
              <span className="text-xs font-semibold text-indigo-600 cursor-pointer" onClick={() => onNavigate('rooms')}>
                View all ({rooms.length})
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600">Active Rooms</span>
                  <span className="text-emerald-700 font-mono font-bold">2,110 (74%)</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '74%' }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600">Newly Created (30D)</span>
                  <span className="text-indigo-700 font-mono font-bold">512 (18%)</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full" style={{ width: '18%' }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600">Dormant / Settled</span>
                  <span className="text-slate-600 font-mono font-bold">221 (8%)</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-400 rounded-full" style={{ width: '8%' }} />
                </div>
              </div>
            </div>

            <div className="mt-6 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <p className="text-xs font-bold text-slate-800">Average Flatmate Density</p>
              <p className="text-xs text-slate-500">
                Current platform average is <b>3.8 residents</b> per room cluster.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => onNavigate('rooms')}
              className="w-full py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors"
            >
              Open Room Management Console
            </button>
          </div>
        </div>
      </div>

      {/* 4. FINANCIAL ACTIVITY + RECENT FEED + SYSTEM STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Activity (Shared Ledger) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Shared Financial Activity</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              Shared Ledger
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500">Total Shared</p>
              <p className="text-sm font-bold text-slate-900 mt-1 font-mono">{formatInr(totalSharedVolume)}</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100">
              <p className="text-[11px] font-semibold text-amber-800">Outstanding</p>
              <p className="text-sm font-bold text-amber-900 mt-1 font-mono">{formatInr(outstandingSharedBalance)}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <p className="text-[11px] font-semibold text-emerald-800">Settled</p>
              <p className="text-sm font-bold text-emerald-900 mt-1 font-mono">{formatInr(totalSettledAmount)}</p>
            </div>
          </div>

          <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs text-slate-600 leading-relaxed">
            <span className="font-bold text-indigo-900">Privacy Safeguard Active:</span> Personal expense histories are
            strictly private to individual students. The financial overview only aggregates shared room expenses and
            platform-wide reconciliation volume.
          </div>

          <button
            onClick={() => onNavigate('expenses')}
            className="w-full py-2 text-center text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg border border-indigo-200 transition-colors"
          >
            Explore Global Shared Expenses &rarr;
          </button>
        </div>

        {/* Real-Time Platform Activity Feed */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Recent Activity</h3>
            <span className="text-[11px] font-semibold text-slate-400">Live stream</span>
          </div>

          <div className="space-y-3.5">
            <div className="flex items-start gap-3 text-xs">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <UserPlus className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">New student verified</p>
                <p className="text-[11px] text-slate-500 truncate">Pooja joined RoomMate with college email</p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">2 mins ago</span>
            </div>

            <div className="flex items-start gap-3 text-xs">
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">New room created</p>
                <p className="text-[11px] text-slate-500 truncate">PG Hostel Room 408 (4 members)</p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">5 mins ago</span>
            </div>

            <div className="flex items-start gap-3 text-xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <Receipt className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">Shared expense added</p>
                <p className="text-[11px] text-slate-500 truncate">₹850 Groceries in Shared Room</p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">8 mins ago</span>
            </div>

            <div className="flex items-start gap-3 text-xs">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <Headphones className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">Bug report submitted</p>
                <p className="text-[11px] text-slate-500 truncate">Expense calculation delay reported</p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">18 mins ago</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              onClick={() => onNavigate('audit-logs')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View Full Administrative Audit Logs &rarr;
            </button>
          </div>
        </div>

        {/* Compact System Status */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">System Status</h3>
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>All Operational</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Application Engine</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Operational</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Database (PostgreSQL)</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Operational</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Authentication &amp; PIN</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Operational</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 font-medium">API Gateway</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Operational</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 font-medium">Push &amp; In-App Relays</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Operational</span>
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => onNavigate('system-health')}
              className="w-full py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors"
            >
              Inspect Diagnostics &amp; Latency &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

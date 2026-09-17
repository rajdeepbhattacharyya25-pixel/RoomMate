import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Building2,
  Receipt,
  Clock,
  Download,
  CheckCircle2,
  Headphones,
  UserPlus,
  ArrowRight,
  Shield,
  Activity,
  AlertCircle,
  Wifi,
} from 'lucide-react';
import { User, Room, RoomMember, SharedExpense, ExpenseSplit, SettlementPayment, BugReport, AuditLog } from '../../../types';
import { MetricCard } from '../common/MetricCard';
import { formatInr, formatRelativeTime, exportToCsv } from '../../../lib/utils/currencyFormatter';
import { AdminRoute } from '../AdminSidebar';
import { isSupabaseConfigured } from '../../../lib/supabase/client';

interface AdminDashboardProps {
  currentUser: User;
  allUsers: User[];
  rooms: Room[];
  roomMembers?: RoomMember[];
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
  roomMembers = [],
  sharedExpenses,
  expenseSplits: _expenseSplits,
  settlementPayments,
  bugReports,
  auditLogs,
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

  // Compute Core Platform Metrics strictly from real state (0 when empty)
  const studentUsers = useMemo(() => allUsers.filter((u) => u.role === 'STUDENT'), [allUsers]);
  const totalUsers = studentUsers.length;
  const activeUsers = useMemo(() => {
    return studentUsers.filter((u) => {
      if (u.isSuspended) return false;
      const belongsToRoom = roomMembers.some((m) => m.userId === u.id);
      const hasCreatedExpense = sharedExpenses.some((e) => e.paidBy === u.id || e.createdBy === u.id);
      const hasSettled = settlementPayments.some((s) => s.payerId === u.id || s.payeeId === u.id);
      return belongsToRoom || hasCreatedExpense || hasSettled || !u.isSuspended;
    }).length;
  }, [studentUsers, roomMembers, sharedExpenses, settlementPayments]);

  const activeRooms = useMemo(() => rooms.filter((r) => !r.isArchived && !r.isFrozen).length, [rooms]);

  // Shared Expenses Calculations (Strictly shared ledger)
  const totalSharedVolume = useMemo(
    () => sharedExpenses.reduce((sum, e) => sum + e.totalAmount, 0),
    [sharedExpenses]
  );

  const totalSettledAmount = useMemo(
    () => settlementPayments.reduce((sum, s) => sum + s.amount, 0),
    [settlementPayments]
  );

  const outstandingSharedBalance = Math.max(totalSharedVolume - totalSettledAmount, 0);

  // Dynamic Room Activity breakdown
  const now30d = useMemo(() => Date.now() - 30 * 24 * 60 * 60 * 1000, []);
  const newlyCreatedRooms = useMemo(
    () => rooms.filter((r) => new Date(r.createdAt).getTime() >= now30d).length,
    [rooms, now30d]
  );
  const dormantRooms = useMemo(() => rooms.filter((r) => r.isFrozen || r.isArchived).length, [rooms]);
  const activeRoomsPct = rooms.length > 0 ? Math.round((activeRooms / rooms.length) * 100) : 0;
  const newlyCreatedPct = rooms.length > 0 ? Math.round((newlyCreatedRooms / rooms.length) * 100) : 0;
  const dormantPct = rooms.length > 0 ? Math.round((dormantRooms / rooms.length) * 100) : 0;
  const averageDensity = rooms.length > 0 ? (roomMembers.length / rooms.length).toFixed(1) : '0';

  // Dynamic Chart Points based on Timeframe and real data
  const chartData = useMemo(() => {
    const now = new Date();

    if (timeFilter === '7D') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const points = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const nextD = new Date(d);
        nextD.setDate(nextD.getDate() + 1);

        const newUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.createdAt);
          return uDate >= d && uDate < nextD;
        }).length;

        const activeUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.updatedAt || u.createdAt);
          const hasExp = sharedExpenses.some(
            (e) => e.paidBy === u.id && new Date(e.createdAt) >= d && new Date(e.createdAt) < nextD
          );
          const hasStl = settlementPayments.some(
            (s) => (s.payerId === u.id || s.payeeId === u.id) && new Date(s.createdAt) >= d && new Date(s.createdAt) < nextD
          );
          return (uDate >= d && uDate < nextD) || hasExp || hasStl;
        }).length;

        points.push({
          label: days[d.getDay()],
          newUsers: newUsersCount,
          activeUsers: activeUsersCount,
        });
      }
      return points;
    }

    if (timeFilter === '30D') {
      const points = [];
      for (let i = 3; i >= 0; i--) {
        const dStart = new Date(now);
        dStart.setDate(dStart.getDate() - (i + 1) * 7);
        const dEnd = new Date(now);
        dEnd.setDate(dEnd.getDate() - i * 7);

        const newUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.createdAt);
          return uDate >= dStart && uDate < dEnd;
        }).length;

        const activeUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.updatedAt || u.createdAt);
          const hasExp = sharedExpenses.some(
            (e) => e.paidBy === u.id && new Date(e.createdAt) >= dStart && new Date(e.createdAt) < dEnd
          );
          const hasStl = settlementPayments.some(
            (s) => (s.payerId === u.id || s.payeeId === u.id) && new Date(s.createdAt) >= dStart && new Date(s.createdAt) < dEnd
          );
          return (uDate >= dStart && uDate < dEnd) || hasExp || hasStl;
        }).length;

        points.push({
          label: `Week ${4 - i}`,
          newUsers: newUsersCount,
          activeUsers: activeUsersCount,
        });
      }
      return points;
    }

    if (timeFilter === '3M') {
      const points = [];
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const label = d.toLocaleString('en-IN', { month: 'short' });

        const newUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.createdAt);
          return uDate >= d && uDate < nextMonth;
        }).length;

        const activeUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.updatedAt || u.createdAt);
          const hasExp = sharedExpenses.some(
            (e) => e.paidBy === u.id && new Date(e.createdAt) >= d && new Date(e.createdAt) < nextMonth
          );
          const hasStl = settlementPayments.some(
            (s) => (s.payerId === u.id || s.payeeId === u.id) && new Date(s.createdAt) >= d && new Date(s.createdAt) < nextMonth
          );
          return (uDate >= d && uDate < nextMonth) || hasExp || hasStl;
        }).length;

        points.push({
          label,
          newUsers: newUsersCount,
          activeUsers: activeUsersCount,
        });
      }
      return points;
    }

    if (timeFilter === '6M') {
      const points = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const label = d.toLocaleString('en-IN', { month: 'short' });

        const newUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.createdAt);
          return uDate >= d && uDate < nextMonth;
        }).length;

        const activeUsersCount = studentUsers.filter((u) => {
          const uDate = new Date(u.updatedAt || u.createdAt);
          const hasExp = sharedExpenses.some(
            (e) => e.paidBy === u.id && new Date(e.createdAt) >= d && new Date(e.createdAt) < nextMonth
          );
          const hasStl = settlementPayments.some(
            (s) => (s.payerId === u.id || s.payeeId === u.id) && new Date(s.createdAt) >= d && new Date(s.createdAt) < nextMonth
          );
          return (uDate >= d && uDate < nextMonth) || hasExp || hasStl;
        }).length;

        points.push({
          label,
          newUsers: newUsersCount,
          activeUsers: activeUsersCount,
        });
      }
      return points;
    }

    // '1Y'
    const points = [];
    for (let i = 3; i >= 0; i--) {
      const qNum = Math.floor(now.getMonth() / 3) + 1;
      const qOffset = ((qNum - 1 - i + 4) % 4) + 1;
      const dStart = new Date(now.getFullYear(), (qOffset - 1) * 3, 1);
      const dEnd = new Date(now.getFullYear(), qOffset * 3, 1);

      const newUsersCount = studentUsers.filter((u) => {
        const uDate = new Date(u.createdAt);
        return uDate >= dStart && uDate < dEnd;
      }).length;

      const activeUsersCount = studentUsers.filter((u) => {
        const uDate = new Date(u.updatedAt || u.createdAt);
        const hasExp = sharedExpenses.some(
          (e) => e.paidBy === u.id && new Date(e.createdAt) >= dStart && new Date(e.createdAt) < dEnd
        );
        const hasStl = settlementPayments.some(
          (s) => (s.payerId === u.id || s.payeeId === u.id) && new Date(s.createdAt) >= dStart && new Date(s.createdAt) < dEnd
        );
        return (uDate >= dStart && uDate < dEnd) || hasExp || hasStl;
      }).length;

      points.push({
        label: `Q${qOffset}`,
        newUsers: newUsersCount,
        activeUsers: activeUsersCount,
      });
    }
    return points;
  }, [studentUsers, sharedExpenses, settlementPayments, timeFilter]);

  // Dynamic Recent Activity Feed assembled from real state
  const recentActivities = useMemo(() => {
    type ActivityItem = {
      id: string;
      title: string;
      description: string;
      time: string;
      timestamp: number;
      type: 'user' | 'room' | 'expense' | 'settlement' | 'bug' | 'audit';
    };
    const items: ActivityItem[] = [];

    // 1. Audit logs
    auditLogs.slice(0, 8).forEach((log) => {
      items.push({
        id: `audit-${log.id}`,
        title: log.action.replace(/_/g, ' '),
        description: log.details || 'Administrative operational log',
        time: formatRelativeTime(log.createdAt),
        timestamp: new Date(log.createdAt).getTime(),
        type: 'audit',
      });
    });

    // 2. Recent student users
    studentUsers.slice(0, 8).forEach((u) => {
      items.push({
        id: `user-${u.id}`,
        title: 'New student onboarded',
        description: `${u.name} registered (${u.email || u.phone || 'Resident'})`,
        time: formatRelativeTime(u.createdAt),
        timestamp: new Date(u.createdAt).getTime(),
        type: 'user',
      });
    });

    // 3. Recent rooms
    rooms.slice(0, 8).forEach((r) => {
      const owner = allUsers.find((u) => u.id === r.createdBy);
      items.push({
        id: `room-${r.id}`,
        title: 'New room created',
        description: `${r.name} created by ${owner?.name || 'Resident Admin'}`,
        time: formatRelativeTime(r.createdAt),
        timestamp: new Date(r.createdAt).getTime(),
        type: 'room',
      });
    });

    // 4. Recent shared expenses
    sharedExpenses.slice(0, 8).forEach((e) => {
      const payer = allUsers.find((u) => u.id === e.paidBy);
      items.push({
        id: `exp-${e.id}`,
        title: 'Shared expense added',
        description: `${formatInr(e.totalAmount)} for ${e.title} by ${payer?.name || 'Resident'}`,
        time: formatRelativeTime(e.createdAt),
        timestamp: new Date(e.createdAt).getTime(),
        type: 'expense',
      });
    });

    // 5. Recent settlements
    settlementPayments.slice(0, 8).forEach((s) => {
      const payer = allUsers.find((u) => u.id === s.payerId);
      const payee = allUsers.find((u) => u.id === s.payeeId);
      items.push({
        id: `stl-${s.id}`,
        title: 'Settlement cleared',
        description: `${payer?.name || 'Resident'} settled ${formatInr(s.amount)} with ${payee?.name || 'Flatmate'}`,
        time: formatRelativeTime(s.createdAt),
        timestamp: new Date(s.createdAt).getTime(),
        type: 'settlement',
      });
    });

    // 6. Bug reports
    bugReports.slice(0, 8).forEach((b) => {
      items.push({
        id: `bug-${b.id}`,
        title: 'Support report submitted',
        description: b.description,
        time: formatRelativeTime(b.createdAt),
        timestamp: new Date(b.createdAt).getTime(),
        type: 'bug',
      });
    });

    return items
      .filter((i) => !isNaN(i.timestamp))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }, [auditLogs, studentUsers, rooms, allUsers, sharedExpenses, settlementPayments, bugReports]);

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

  const totalChartActive = useMemo(
    () => chartData.reduce((sum, p) => sum + p.activeUsers, 0),
    [chartData]
  );
  const maxVal = Math.max(...chartData.map((p) => p.activeUsers)) || 1;

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
          trend={
            totalUsers > 0
              ? { value: `${activeUsers} active`, isPositive: true, period: 'verified students' }
              : undefined
          }
          subtitle={totalUsers === 0 ? 'No registered students yet' : undefined}
          icon={<Users className="w-4 h-4" />}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          onClick={() => onNavigate('users')}
        />

        <MetricCard
          title="Active Users"
          value={activeUsers.toLocaleString('en-IN')}
          trend={
            totalUsers > 0
              ? {
                  value: `${Math.round((activeUsers / totalUsers) * 100)}%`,
                  isPositive: true,
                  period: 'active participation',
                }
              : undefined
          }
          subtitle={activeUsers === 0 ? 'Awaiting resident activity' : undefined}
          icon={<UserPlus className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          onClick={() => onNavigate('users')}
        />

        <MetricCard
          title="Active Rooms"
          value={activeRooms.toLocaleString('en-IN')}
          trend={
            rooms.length > 0
              ? { value: `${activeRoomsPct}%`, isPositive: true, period: 'of total room clusters' }
              : undefined
          }
          subtitle={rooms.length === 0 ? 'No rooms created yet' : undefined}
          icon={<Building2 className="w-4 h-4" />}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          onClick={() => onNavigate('rooms')}
        />

        <MetricCard
          title="Shared Expenses"
          value={formatInr(totalSharedVolume, true)}
          subtitle={
            sharedExpenses.length > 0
              ? `${sharedExpenses.length} shared bills logged`
              : 'Zero shared expenses'
          }
          icon={<Receipt className="w-4 h-4" />}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          onClick={() => onNavigate('expenses')}
        />

        <MetricCard
          title="Outstanding Shared"
          value={formatInr(outstandingSharedBalance, true)}
          subtitle={
            totalSharedVolume > 0
              ? `${Math.round((totalSettledAmount / totalSharedVolume) * 100)}% settled so far`
              : 'Zero unsettled debt'
          }
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
                <h3 className="text-base font-bold text-slate-900 tracking-tight">User Growth &amp; Engagement</h3>
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

              {/* Zero data notification overlay if clean state */}
              {totalChartActive === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-400 text-xs">
                  <span>No resident registrations or activity recorded in {timeFilter}.</span>
                  <span className="text-[11px] text-slate-400 mt-0.5">Live events will plot here as users engage.</span>
                </div>
              )}

              {/* Bars / Points */}
              {chartData.map((d, index) => {
                const heightPct = totalChartActive > 0 ? Math.round((d.activeUsers / maxVal) * 80) + 12 : 6;
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
                            : totalChartActive > 0
                            ? 'bg-indigo-100 group-hover:bg-indigo-200'
                            : 'bg-slate-100'
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
                  <span className="text-emerald-700 font-mono font-bold">
                    {activeRooms} ({activeRoomsPct}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${activeRoomsPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600">Newly Created (30D)</span>
                  <span className="text-indigo-700 font-mono font-bold">
                    {newlyCreatedRooms} ({newlyCreatedPct}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${newlyCreatedPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-600">Dormant / Archived</span>
                  <span className="text-slate-600 font-mono font-bold">
                    {dormantRooms} ({dormantPct}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-400 rounded-full transition-all" style={{ width: `${dormantPct}%` }} />
                </div>
              </div>
            </div>

            <div className="mt-6 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <p className="text-xs font-bold text-slate-800">Average Flatmate Density</p>
              <p className="text-xs text-slate-500">
                Current platform average is <b>{averageDensity} residents</b> per room cluster.
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

          {recentActivities.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-slate-500">No platform activity recorded yet.</p>
              <p className="text-[11px] text-slate-400">
                New user signups, room creations, and bill splits will stream here automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {recentActivities.map((act) => {
                const icon =
                  act.type === 'user' ? (
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                      <UserPlus className="w-3.5 h-3.5" />
                    </div>
                  ) : act.type === 'room' ? (
                    <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                  ) : act.type === 'expense' ? (
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Receipt className="w-3.5 h-3.5" />
                    </div>
                  ) : act.type === 'settlement' ? (
                    <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  ) : act.type === 'bug' ? (
                    <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Headphones className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-3.5 h-3.5" />
                    </div>
                  );

                return (
                  <div key={act.id} className="flex items-start gap-3 text-xs">
                    {icon}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{act.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{act.description}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{act.time}</span>
                  </div>
                );
              })}
            </div>
          )}

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
                <span>{isSupabaseConfigured ? 'Live Cloud Connected' : 'Local Sandbox Mode'}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Application Engine</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{typeof window !== 'undefined' && navigator.onLine ? 'Operational' : 'Offline'}</span>
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-600 font-medium">Database (PostgreSQL)</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    isSupabaseConfigured ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {isSupabaseConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  <span>{isSupabaseConfigured ? 'Operational (Supabase)' : 'Local Storage Fallback'}</span>
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
                <span className="text-slate-600 font-medium">API Gateway &amp; Realtime</span>
                <span
                  className={`inline-flex items-center gap-1 font-semibold ${
                    isSupabaseConfigured ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                >
                  {isSupabaseConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  <span>{isSupabaseConfigured ? 'Operational' : 'Standby'}</span>
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


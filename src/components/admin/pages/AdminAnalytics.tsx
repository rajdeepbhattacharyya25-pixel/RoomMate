import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Home,
  Receipt,
  CreditCard,
  PieChart,
  ArrowUpRight,
  Clock,
  Sparkles,
  Zap,
  ExternalLink,
  Video,
  Activity,
  ShieldCheck,
  LayoutDashboard,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { User, Room, RoomMember, SharedExpense, ExpenseSplit, SettlementPayment } from '../../../types';
import { formatInr } from '../../../lib/utils/currencyFormatter';
import {
  isPostHogConfigured,
  getPostHogDashboardUrl,
  getPostHogSessionReplaysUrl,
  getPostHogInsightsUrl,
  getPostHogEventsUrl,
  POSTHOG_PROJECT_ID,
  POSTHOG_HOST,
  POSTHOG_EMBED_DASHBOARD_URL,
  TRACKED_EVENT_TAXONOMIES,
} from '../../../lib/analytics/telemetryConfig';

interface AdminAnalyticsProps {
  allUsers: User[];
  rooms: Room[];
  roomMembers: RoomMember[];
  sharedExpenses: SharedExpense[];
  splits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
}

type Timeframe = '7D' | '30D' | '90D' | '1Y' | 'ALL';
type ViewTab = 'ledger' | 'posthog_embed';

export const AdminAnalytics: React.FC<AdminAnalyticsProps> = ({
  allUsers,
  rooms,
  roomMembers,
  sharedExpenses,
  settlementPayments,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('30D');
  const [activeTab, setActiveTab] = useState<ViewTab>('ledger');
  const [embedUrl, setEmbedUrl] = useState<string>(() => {
    return POSTHOG_EMBED_DASHBOARD_URL || localStorage.getItem('rm_posthog_embed_url') || '';
  });
  const [inputUrl, setInputUrl] = useState<string>(embedUrl);
  const [iframeKey, setIframeKey] = useState<number>(0);

  const handleSaveEmbedUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputUrl.trim();
    setEmbedUrl(clean);
    localStorage.setItem('rm_posthog_embed_url', clean);
    setIframeKey((prev) => prev + 1);
  };

  // Filter based on timeframe
  const timeframeDays = useMemo(() => {
    switch (timeframe) {
      case '7D':
        return 7;
      case '30D':
        return 30;
      case '90D':
        return 90;
      case '1Y':
        return 365;
      case 'ALL':
        return 9999;
    }
  }, [timeframe]);

  const filteredExpenses = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeframeDays);
    return sharedExpenses.filter((e) => new Date(e.createdAt) >= cutoff);
  }, [sharedExpenses, timeframeDays]);

  const filteredSettlements = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeframeDays);
    return settlementPayments.filter((s) => new Date(s.createdAt) >= cutoff);
  }, [settlementPayments, timeframeDays]);

  // Aggregate metrics
  const totalVolume = filteredExpenses.reduce((sum, e) => sum + e.totalAmount, 0);
  const avgExpenseTicket = filteredExpenses.length > 0 ? Math.round(totalVolume / filteredExpenses.length) : 0;
  const totalSettledAmount = filteredSettlements.reduce((sum, s) => sum + s.amount, 0);

  // Active Users calculation
  const _totalUsersCount = allUsers.length;
  const activeRoomsCount = rooms.filter((r) => !r.isArchived).length;
  const avgRoomMembers = rooms.length > 0 ? (roomMembers.length / rooms.length).toFixed(1) : '0';

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    filteredExpenses.forEach((e) => {
      const cat = e.category || 'Other';
      if (!map[cat]) map[cat] = { count: 0, total: 0 };
      map[cat].count += 1;
      map[cat].total += e.totalAmount;
    });

    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        count: data.count,
        total: data.total,
        percentage: totalVolume > 0 ? Math.round((data.total / totalVolume) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredExpenses, totalVolume]);

  // Room size distribution
  const roomSizeDistribution = useMemo(() => {
    const counts = { '2': 0, '3': 0, '4': 0, '5+': 0 };
    rooms.forEach((room) => {
      const members = roomMembers.filter((m) => m.roomId === room.id).length;
      if (members <= 2) counts['2'] += 1;
      else if (members === 3) counts['3'] += 1;
      else if (members === 4) counts['4'] += 1;
      else counts['5+'] += 1;
    });
    return counts;
  }, [rooms, roomMembers]);

  // Settlement methods
  const upiSettlements = filteredSettlements.filter(
    (s) => s.paymentMethod === 'UPI' || (s.paymentMethod as string) === 'UPI_INTENT'
  );
  const cashSettlements = filteredSettlements.filter((s) => s.paymentMethod === 'CASH');
  const upiPercent =
    filteredSettlements.length > 0
      ? Math.round((upiSettlements.length / filteredSettlements.length) * 100)
      : 0;

  // Real volume comparison against preceding period of equal duration
  const prevTimeframeVolume = useMemo(() => {
    const endCutoff = new Date();
    endCutoff.setDate(endCutoff.getDate() - timeframeDays);
    const startCutoff = new Date();
    startCutoff.setDate(startCutoff.getDate() - timeframeDays * 2);
    return sharedExpenses
      .filter((e) => {
        const d = new Date(e.createdAt);
        return d >= startCutoff && d < endCutoff;
      })
      .reduce((sum, e) => sum + e.totalAmount, 0);
  }, [sharedExpenses, timeframeDays]);

  const volumeGrowthPct = useMemo(() => {
    if (prevTimeframeVolume === 0) {
      return totalVolume > 0 ? 100 : 0;
    }
    return Math.round(((totalVolume - prevTimeframeVolume) / prevTimeframeVolume) * 100);
  }, [totalVolume, prevTimeframeVolume]);

  // Real settlement resolution velocity (median hours between expense split and settlement)
  const settlementVelocityHours = useMemo(() => {
    if (filteredSettlements.length === 0 || filteredExpenses.length === 0) return null;
    const durations: number[] = [];
    filteredSettlements.forEach((s) => {
      const sTime = new Date(s.createdAt || s.paymentDate).getTime();
      const precedingExpenses = filteredExpenses.filter(
        (e) => e.roomId === s.roomId && new Date(e.createdAt).getTime() <= sTime
      );
      if (precedingExpenses.length > 0) {
        const lastExpTime = new Date(precedingExpenses[0].createdAt).getTime();
        const diffHours = (sTime - lastExpTime) / (1000 * 60 * 60);
        if (diffHours >= 0 && diffHours < 720) {
          durations.push(diffHours);
        }
      }
    });
    if (durations.length === 0) return null;
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];
    return median < 1 ? `${Math.round(median * 60)} mins` : `${median.toFixed(1)} hours`;
  }, [filteredSettlements, filteredExpenses]);

  // Daily or weekly trend buckets for SVG visualization
  const trendBuckets = useMemo(() => {
    const bucketsCount = timeframe === '7D' ? 7 : timeframe === '30D' ? 10 : 12;
    const buckets: { label: string; volume: number; count: number }[] = [];

    for (let i = bucketsCount - 1; i >= 0; i--) {
      const dayOffsetStart = (i + 1) * (timeframeDays / bucketsCount);
      const dayOffsetEnd = i * (timeframeDays / bucketsCount);

      const dStart = new Date();
      dStart.setDate(dStart.getDate() - dayOffsetStart);
      const dEnd = new Date();
      dEnd.setDate(dEnd.getDate() - dayOffsetEnd);

      const inBucket = filteredExpenses.filter((e) => {
        const d = new Date(e.createdAt);
        return d >= dStart && d < dEnd;
      });

      const vol = inBucket.reduce((sum, e) => sum + e.totalAmount, 0);
      buckets.push({
        label: `${dEnd.getDate()} ${dEnd.toLocaleString('default', { month: 'short' })}`,
        volume: vol,
        count: inBucket.length,
      });
    }

    return buckets;
  }, [filteredExpenses, timeframe, timeframeDays]);

  const maxBucketVolume = Math.max(...trendBuckets.map((b) => b.volume), 1000);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header & Direct External Telemetry Launchers */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Telemetry & Analytics</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Live Pulse
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Aggregate student spending trends, settlement velocity, and live PostHog product telemetry.
          </p>
        </div>

        {/* Quick Launch Cloud Actions */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <a
            href={getPostHogInsightsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all"
            title="Open PostHog Insights & Funnel Trends"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>PostHog Insights</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>

          <a
            href={getPostHogSessionReplaysUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-all"
            title="View Realtime Student Screen Replays"
          >
            <Video className="w-3.5 h-3.5 text-amber-400" />
            <span>Session Replays</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>

          <a
            href={getPostHogEventsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs transition-all"
            title="Live Event Ingestion Stream"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Events</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        </div>
      </div>

      {/* Sub-Navigation / Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'ledger'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Ledger & App Metrics</span>
          </button>

          <button
            onClick={() => setActiveTab('posthog_embed')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'posthog_embed'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-purple-600" />
            <span>Embedded PostHog Dashboard</span>
          </button>
        </div>

        {/* Timeframe Selector or Embed Tools */}
        {activeTab === 'ledger' ? (
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm self-start sm:self-auto">
            {(['7D', '30D', '90D', '1Y', 'ALL'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  timeframe === tf
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg shadow-2xs transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Frame</span>
            </button>
            <a
              href={getPostHogDashboardUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-bold rounded-lg transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in PostHog</span>
            </a>
          </div>
        )}
      </div>

      {activeTab === 'posthog_embed' ? (
        <div className="space-y-6">
          {embedUrl ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-800">PostHog Shared Dashboard (Embedded)</span>
                  <span className="text-[11px] text-slate-400 font-mono">Project {POSTHOG_PROJECT_ID}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newUrl = prompt('Enter PostHog Shared Dashboard Embed URL:', embedUrl);
                      if (newUrl !== null) {
                        setEmbedUrl(newUrl.trim());
                        localStorage.setItem('rm_posthog_embed_url', newUrl.trim());
                        setIframeKey((k) => k + 1);
                      }
                    }}
                    className="text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors"
                  >
                    Change URL
                  </button>
                  <a
                    href={embedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
                    title="Open embed URL in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="w-full bg-slate-950 rounded-xl overflow-hidden min-h-[720px] shadow-inner">
                <iframe
                  key={iframeKey}
                  src={embedUrl}
                  title="PostHog Shared Dashboard"
                  className="w-full h-[760px] border-0"
                  allow="clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-3xl mx-auto space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <LayoutDashboard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Embed PostHog Dashboard</h3>
                  <p className="text-xs text-slate-500">
                    Display your live PostHog charts, funnels, and retention curves directly in this SuperAdmin tab.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3 text-xs text-slate-600">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  How to generate an Embed Link in PostHog:
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                  <li>Open your PostHog Project <strong className="font-mono text-indigo-700">{POSTHOG_PROJECT_ID}</strong> in PostHog Cloud.</li>
                  <li>Navigate to <strong>Dashboards</strong> and choose or create your executive overview.</li>
                  <li>Click <strong>Share</strong> in the top right &rarr; enable <strong>&ldquo;Share publicly&rdquo;</strong> or copy the embed iframe link.</li>
                  <li>Paste the URL below to preview and lock it inside this SuperAdmin portal.</li>
                </ol>
              </div>

              <form onSubmit={handleSaveEmbedUrl} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    PostHog Shared / Embed URL
                  </label>
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://us.posthog.com/embedded/..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <a
                    href={getPostHogDashboardUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 transition-colors"
                  >
                    <span>Open PostHog Dashboards</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>

                  <button
                    type="submit"
                    disabled={!inputUrl.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
                  >
                    Save & Load Dashboard
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* KPI Overview Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Shared Spend</span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
              </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-slate-900">{formatInr(totalVolume)}</span>
            {totalVolume > 0 && prevTimeframeVolume > 0 ? (
              <div
                className={`flex items-center gap-1.5 mt-1.5 text-xs font-bold ${
                  volumeGrowthPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                <ArrowUpRight className={`w-3.5 h-3.5 ${volumeGrowthPct < 0 ? 'rotate-90' : ''}`} />
                <span>
                  {volumeGrowthPct >= 0 ? `+${volumeGrowthPct}%` : `${volumeGrowthPct}%`} vs prev period
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 font-medium">
                <span>{filteredExpenses.length} shared transactions</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Settled via UPI / Cash</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-slate-900">{formatInr(totalSettledAmount)}</span>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 font-medium">
              <span>{filteredSettlements.length} settlement payments</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Avg Expense Ticket</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-slate-900">{formatInr(avgExpenseTicket)}</span>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 font-medium">
              <span>Across {filteredExpenses.length} shared transactions</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Room Density</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Home className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono text-slate-900">{avgRoomMembers}</span>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 font-medium">
              <span>Residents / active room ({activeRoomsCount} rooms)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Trends Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Shared Expense Volume Timeline</h3>
            <p className="text-xs text-slate-500">
              Aggregated collective expenditures across all student flats ({timeframe})
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-indigo-600 inline-block" />
              <span className="text-slate-600 font-medium">Volume (INR)</span>
            </div>
          </div>
        </div>

        {/* Bar Chart Container */}
        <div className="h-64 flex items-end gap-3 pt-6 pb-2 px-2">
          {trendBuckets.map((bucket, idx) => {
            const heightPercent = maxBucketVolume > 0 ? Math.max((bucket.volume / maxBucketVolume) * 100, 6) : 6;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                {/* Tooltip */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 bg-slate-900 text-white text-[10px] font-mono py-1 px-2 rounded shadow-lg pointer-events-none whitespace-nowrap z-10">
                  <div className="font-bold">{formatInr(bucket.volume)}</div>
                  <div className="text-slate-300">{bucket.count} bills</div>
                </div>
                {/* Bar */}
                <div className="w-full bg-slate-100 rounded-t-lg relative overflow-hidden flex items-end h-48">
                  <div
                    className="w-full bg-indigo-600 hover:bg-indigo-700 transition-all rounded-t-lg"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                {/* Label */}
                <span className="text-[10px] font-semibold text-slate-400 truncate max-w-full text-center">
                  {bucket.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-600" />
              Shared Spending by Category
            </h3>
            <span className="text-xs text-slate-400 font-medium">Strictly Shared Bills</span>
          </div>
          <p className="text-xs text-slate-500 mb-6">
            Distribution of communal bills such as WiFi, groceries, flat utilities, and cook/maid charges.
          </p>

          <div className="space-y-4">
            {categoryBreakdown.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">No expense records found in period</div>
            ) : (
              categoryBreakdown.map((cat) => (
                <div key={cat.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{formatInr(cat.total)}</span>
                      <span className="text-slate-400 w-9 text-right font-mono">{cat.percentage}%</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Feature Adoption & Settlement Velocity */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Settlement & Splitting Behavior
              </h3>
              <span className="text-xs text-slate-400 font-medium">Student Patterns</span>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              How flatmates resolve IOUs and prefer to settle balances.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">UPI Payments</span>
                  <span className="text-xs font-black text-indigo-600">{upiPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${upiPercent}%` }} />
                </div>
                <span className="text-[11px] text-slate-400 mt-2 block">
                  {upiSettlements.length} verified UPI transfers
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Cash Settlements</span>
                  <span className="text-xs font-black text-slate-700">{100 - upiPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-slate-400 rounded-full" style={{ width: `${100 - upiPercent}%` }} />
                </div>
                <span className="text-[11px] text-slate-400 mt-2 block">
                  {cashSettlements.length} offline cash marked
                </span>
              </div>
            </div>

            {/* Room size buckets */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Rooms by Occupancy
              </span>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-lg font-black text-slate-800 font-mono block">
                    {roomSizeDistribution['2']}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">2 Sharing</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-lg font-black text-slate-800 font-mono block">
                    {roomSizeDistribution['3']}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">3 Sharing</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-lg font-black text-slate-800 font-mono block">
                    {roomSizeDistribution['4']}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">4 Sharing</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-lg font-black text-slate-800 font-mono block">
                    {roomSizeDistribution['5+']}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">5+ Sharing</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom highlight */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span className="text-xs text-slate-600">
              {settlementVelocityHours ? (
                <>
                  <strong className="text-slate-900">{settlementVelocityHours}</strong> median time to resolve flatmate settlement after bill split.
                </>
              ) : (
                <>
                  <strong className="text-slate-900">Awaiting settlements</strong> to calculate median resolution velocity across flatmates.
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Product Telemetry & Funnel Diagnostics (PostHog Cloud) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Product Analytics & Event Taxonomy (PostHog)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {isPostHogConfigured() ? 'Cloud Ingestion Active' : 'Fallback / Mock Mode'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Client telemetry dispatched directly to PostHog project{' '}
              <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                {POSTHOG_PROJECT_ID}
              </span>{' '}
              with zero financial PII retention.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={getPostHogInsightsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <span>Explore Funnels</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={getPostHogSessionReplaysUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <Video className="w-3 h-3 text-amber-400" />
              <span>Session Replays</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Telemetry Guard & Privacy Attributes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Ingestion Pipeline
            </span>
            <span className="text-xs font-mono font-bold text-indigo-600 block truncate">{POSTHOG_HOST}</span>
            <span className="text-[11px] text-slate-500 block">ClickHouse Realtime Event Storage</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Privacy Sanitization
              </span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-xs font-bold text-emerald-700 block">PII & Financial Stripping Active</span>
            <span className="text-[11px] text-slate-500 block">Amounts, UPI IDs, passwords scrubbed</span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Global Super Properties
            </span>
            <span className="text-xs font-mono font-bold text-slate-800 block">v1.0.4 • staging • android/web</span>
            <span className="text-[11px] text-slate-500 block">Appended to every client payload</span>
          </div>
        </div>

        {/* Event Taxonomy Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tracked Event Taxonomies (Click to Filter in PostHog)
            </h4>
            <a
              href={getPostHogEventsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              <span>View All Events Stream</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TRACKED_EVENT_TAXONOMIES.map((taxonomy) => (
              <div
                key={taxonomy.id}
                className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:shadow-xs transition-all space-y-3 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {taxonomy.title}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600">
                      {taxonomy.events.length} events
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {taxonomy.description}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex flex-wrap gap-1">
                    {taxonomy.events.map((ev) => (
                      <span
                        key={ev}
                        className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200/60 font-mono text-[10px] text-slate-600"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>

                  <a
                    href={getPostHogEventsUrl(taxonomy.events[0])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 pt-1 group-hover:translate-x-0.5 transition-transform"
                  >
                    <span>Inspect in PostHog</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
      )}
    </div>
  );
};

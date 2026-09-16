import React, { useState } from 'react';
import {
  Server,
  Database,
  Wifi,
  Key,
  HardDrive,
  AlertTriangle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { SystemIncident } from '../../../types';
import { StatusBadge } from '../common/StatusBadge';
import { formatRelativeTime } from '../../../lib/utils/currencyFormatter';

interface AdminSystemHealthProps {
  incidents?: SystemIncident[];
  onResolveIncident?: (incidentId: string) => Promise<void> | void;
}

export const AdminSystemHealth: React.FC<AdminSystemHealthProps> = ({
  incidents = [
    {
      id: 'inc-01',
      service: 'API',
      error: 'UPI Intent deep-link timeout on older Android 11 devices',
      severity: 'MEDIUM',
      status: 'INVESTIGATING',
      occurrences: 4,
      details: 'Failed to resolve scheme paytmmp:// on certain dual-SIM Android handsets.',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: 'inc-02',
      service: 'Database',
      error: 'Query spike during monthly rent splitting cycle',
      severity: 'LOW',
      status: 'RESOLVED',
      occurrences: 1,
      details: 'Connection pool reached 70% threshold. Scaled read replicas automatically.',
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      resolvedAt: new Date(Date.now() - 86400000 * 3 + 1800000).toISOString(),
    },
  ],
  onResolveIncident,
}) => {
  const [isPinging, setIsPinging] = useState(false);

  const handleManualPing = () => {
    setIsPinging(true);
    setTimeout(() => {
      setIsPinging(false);
    }, 600);
  };

  const services = [
    {
      name: 'Application Engine',
      provider: 'Vercel Edge Network',
      status: 'OPERATIONAL',
      uptime: '99.98%',
      latency: '24ms',
      icon: Server,
    },
    {
      name: 'PostgreSQL Database',
      provider: 'Supabase Postgres 15',
      status: 'OPERATIONAL',
      uptime: '99.99%',
      latency: '38ms',
      icon: Database,
    },
    {
      name: 'Realtime WebSockets',
      provider: 'Supabase Realtime Channel',
      status: 'OPERATIONAL',
      uptime: '99.95%',
      latency: '42ms',
      icon: Wifi,
    },
    {
      name: 'Authentication Engine',
      provider: 'Supabase Auth + Google OAuth',
      status: 'OPERATIONAL',
      uptime: '100%',
      latency: '85ms',
      icon: Key,
    },
    {
      name: 'CDN & Storage',
      provider: 'Supabase Storage Bucket',
      status: 'OPERATIONAL',
      uptime: '99.99%',
      latency: '18ms',
      icon: HardDrive,
    },
  ];

  // Latency metrics mock
  const latencyBuckets = [
    { time: '18:00', p50: 22, p95: 48 },
    { time: '19:00', p50: 25, p95: 55 },
    { time: '20:00', p50: 38, p95: 84 },
    { time: '21:00', p50: 45, p95: 95 },
    { time: '22:00', p50: 32, p95: 72 },
    { time: '23:00', p50: 28, p95: 60 },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Health & Telemetry</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              All Systems Nominal
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time infrastructure health, latency percentiles, and incident diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualPing}
            disabled={isPinging}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{isPinging ? 'Pinging Services...' : 'Health Ping'}</span>
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {services.map((srv) => {
          const Icon = srv.icon;
          return (
            <div
              key={srv.name}
              className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4 hover:border-slate-300 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <StatusBadge variant="success" label="Operational" size="sm" />
              </div>

              <div>
                <span className="font-bold text-slate-900 text-sm block">{srv.name}</span>
                <span className="text-xs text-slate-400 font-medium">{srv.provider}</span>
              </div>

              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Uptime (30d)</span>
                  <span className="font-bold text-slate-800 font-mono">{srv.uptime}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Latency</span>
                  <span className="font-bold text-emerald-600 font-mono">{srv.latency}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Latency Percentiles Visualization */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> API Latency Timeline (ms)
            </h3>
            <p className="text-xs text-slate-500">
              Response time percentiles for edge GraphQL and REST handlers
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600" /> P50 (Median)
            </span>
            <span className="flex items-center gap-1 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> P95 (Peak)
            </span>
          </div>
        </div>

        {/* Latency bars */}
        <div className="h-44 flex items-end gap-6 pt-4 pb-2 px-4 border-b border-slate-100">
          {latencyBuckets.map((bucket) => (
            <div key={bucket.time} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex items-end justify-center gap-1 h-32">
                {/* P50 bar */}
                <div
                  className="w-4 bg-indigo-600 rounded-t-sm transition-all"
                  style={{ height: `${bucket.p50}%` }}
                  title={`P50: ${bucket.p50}ms`}
                />
                {/* P95 bar */}
                <div
                  className="w-4 bg-amber-400 rounded-t-sm transition-all"
                  style={{ height: `${bucket.p95}%` }}
                  title={`P95: ${bucket.p95}ms`}
                />
              </div>
              <span className="text-[11px] font-mono text-slate-400">{bucket.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" /> System Incidents & Anomalies
            </h3>
            <p className="text-xs text-slate-500">
              Recent infrastructure warnings, timeouts, and automated mitigation events.
            </p>
          </div>
        </div>

        {incidents.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-400">
            Zero system incidents detected. All services operating normally.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {incidents.map((inc) => (
              <div key={inc.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">{inc.error}</span>
                    <StatusBadge
                      variant={
                        inc.status === 'RESOLVED'
                          ? 'success'
                          : inc.status === 'INVESTIGATING'
                          ? 'warning'
                          : 'danger'
                      }
                      label={inc.status}
                      size="sm"
                    />
                    <StatusBadge
                      variant={
                        inc.severity === 'CRITICAL' || inc.severity === 'HIGH'
                          ? 'danger'
                          : inc.severity === 'MEDIUM'
                          ? 'warning'
                          : 'neutral'
                      }
                      label={inc.severity}
                      size="sm"
                    />
                  </div>
                  <p className="text-xs text-slate-600">{inc.details}</p>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-700">{inc.service}</span>
                    <span>•</span>
                    <span>{inc.occurrences} events</span>
                    <span>•</span>
                    <span>{formatRelativeTime(inc.createdAt)}</span>
                  </div>
                </div>

                {inc.status !== 'RESOLVED' && onResolveIncident && (
                  <button
                    onClick={() => onResolveIncident(inc.id)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl self-start transition-colors"
                  >
                    Mark Resolved
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

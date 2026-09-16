import React, { useState, useMemo } from 'react';
import {
  Download,
  Eye,
  FileText,
} from 'lucide-react';
import { AuditLog } from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { formatRelativeTime, formatFullDateTime, exportToJson } from '../../../lib/utils/currencyFormatter';

interface AdminAuditLogsProps {
  auditLogs: AuditLog[];
}

export const AdminAuditLogs: React.FC<AdminAuditLogsProps> = ({ auditLogs = [] }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'USER' && (log.action.includes('USER') || log.entityType === 'USER')) return true;
      if (selectedCategory === 'ROOM' && (log.action.includes('ROOM') || log.entityType === 'ROOM')) return true;
      if (selectedCategory === 'SECURITY' && (log.action.includes('AUTH') || log.action.includes('SESSION') || log.action.includes('SECURITY'))) return true;
      if (selectedCategory === 'SETTINGS' && (log.action.includes('SETTING') || log.action.includes('PLATFORM'))) return true;
      return false;
    });
  }, [auditLogs, selectedCategory]);

  const columns: Column<AuditLog>[] = [
    {
      key: 'action',
      header: 'Event / Action',
      sortable: true,
      render: (log) => {
        const isDanger = log.action.includes('SUSPEND') || log.action.includes('FREEZE') || log.action.includes('REVOKE');
        const isSuccess = log.action.includes('CREATE') || log.action.includes('RESOLVE') || log.action.includes('UNFREEZE');
        return (
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] shrink-0 ${
                isDanger
                  ? 'bg-rose-100 text-rose-700'
                  : isSuccess
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-indigo-50 text-indigo-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 block text-xs">{log.action}</span>
              <span className="text-[11px] text-slate-500 block truncate max-w-sm">
                {log.details || 'Operational record'}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      key: 'entityType',
      header: 'Target Entity',
      sortable: true,
      render: (log) => (
        <div>
          <span className="text-xs font-bold text-slate-700 block">{log.entityType || 'SYSTEM'}</span>
          <span className="text-[11px] font-mono text-slate-400 block truncate max-w-[120px]">
            {log.entityId ? `#${log.entityId.slice(-8)}` : 'global'}
          </span>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'Actor',
      sortable: true,
      render: (log) => (
        <span className="font-mono text-xs text-slate-600 font-medium">
          {log.userId === 'usr-superadmin-master' || !log.userId ? 'SuperAdmin' : log.userId.slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
      sortable: true,
      render: (log) => <span className="text-xs text-slate-500">{formatRelativeTime(log.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Inspect',
      align: 'right',
      render: (log) => (
        <button
          onClick={() => setSelectedLog(log)}
          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors text-xs font-bold flex items-center gap-1"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>JSON</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Audit Trail</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              Immutable Log
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete cryptographic audit trail of all SuperAdmin interventions, state mutations, and security events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => exportToJson('roommate-audit-logs', auditLogs)}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs shadow-sm flex items-center gap-2 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Raw JSON</span>
          </button>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedCategory === 'all'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All Events ({auditLogs.length})
        </button>
        <button
          onClick={() => setSelectedCategory('USER')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedCategory === 'USER'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          User Events
        </button>
        <button
          onClick={() => setSelectedCategory('ROOM')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedCategory === 'ROOM'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Room Events
        </button>
        <button
          onClick={() => setSelectedCategory('SECURITY')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedCategory === 'SECURITY'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Security & Auth
        </button>
        <button
          onClick={() => setSelectedCategory('SETTINGS')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedCategory === 'SETTINGS'
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          Platform Settings
        </button>
      </div>

      {/* Audit Log Table */}
      <DataTable
        data={filteredLogs}
        columns={columns}
        searchPlaceholder="Filter audit records by action or description..."
        searchKeys={['action', 'details', 'entityType', 'userId']}
        pageSize={15}
        emptyMessage="No audit log entries recorded in this category."
        exportFileName="roommate-audit-logs.csv"
      />

      {/* Detail JSON Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Audit Record Raw Payload
              </span>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold"
              >
                Close
              </button>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 font-mono">{selectedLog.action}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Timestamp: {formatFullDateTime(selectedLog.createdAt)}
              </p>
            </div>
            <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-xl overflow-x-auto max-h-80">
              <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

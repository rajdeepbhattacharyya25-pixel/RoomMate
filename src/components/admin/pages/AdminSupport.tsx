import React, { useState, useMemo } from 'react';
import {
  Bug,
  Lightbulb,
  MessageSquare,
  Eye,
} from 'lucide-react';
import {
  BugReport,
  BugStatus,
  FeatureSuggestion,
  ContactRequest,
  User,
} from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { AdminSupportDetailModal } from './AdminSupportDetailModal';
import { formatRelativeTime } from '../../../lib/utils/currencyFormatter';

interface AdminSupportProps {
  bugReports: BugReport[];
  featureSuggestions?: FeatureSuggestion[];
  contactRequests?: ContactRequest[];
  allUsers: User[];
  onUpdateBugStatus: (bugId: string, status: BugStatus, adminNotes?: string) => Promise<void> | void;
  onSendNotification?: (userId: string, title: string, message: string) => Promise<void> | void;
  initialSelectedTicketId?: string;
}

type TabType = 'BUGS' | 'FEATURES' | 'CONTACT' | 'ALL';

export const AdminSupport: React.FC<AdminSupportProps> = ({
  bugReports = [],
  featureSuggestions = [],
  contactRequests = [],
  allUsers: _allUsers,
  onUpdateBugStatus,
  onSendNotification,
  initialSelectedTicketId,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('BUGS');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  type SelectedItem =
    | { type: 'BUG'; data: BugReport }
    | { type: 'FEATURE'; data: FeatureSuggestion }
    | { type: 'CONTACT'; data: ContactRequest };

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(() => {
    if (initialSelectedTicketId) {
      const b = bugReports.find((r) => r.id === initialSelectedTicketId);
      if (b) return { type: 'BUG', data: b };
    }
    return null;
  });

  // Filtered bug reports
  const filteredBugs = useMemo(() => {
    return bugReports.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (severityFilter !== 'all' && b.severity !== severityFilter) return false;
      return true;
    });
  }, [bugReports, statusFilter, severityFilter]);

  // Counts
  const openBugsCount = bugReports.filter((b) => b.status === 'OPEN' || b.status === 'INVESTIGATING').length;
  const criticalBugsCount = bugReports.filter(
    (b) => (b.severity === 'CRITICAL' || b.severity === 'HIGH') && b.status !== 'CLOSED' && b.status !== 'RESOLVED'
  ).length;

  // Bug Columns
  const bugColumns: Column<BugReport>[] = [
    {
      key: 'id',
      header: 'Report & Issue',
      sortable: true,
      render: (b) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
              b.severity === 'CRITICAL'
                ? 'bg-rose-100 text-rose-700'
                : b.severity === 'HIGH'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-indigo-50 text-indigo-700'
            }`}
          >
            <Bug className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block truncate max-w-xs">{b.description}</span>
            <span className="text-[11px] text-slate-400 font-mono block">ID: #{b.id.slice(-6)}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Reporter',
      sortable: true,
      render: (b) => (
        <div>
          <span className="font-semibold text-slate-800 text-xs block">{b.userName}</span>
          <span className="text-[11px] text-slate-400 font-mono block truncate max-w-[150px]">{b.userEmail}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (b) => (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
          {b.category}
        </span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      sortable: true,
      render: (b) => (
        <StatusBadge
          variant={
            b.severity === 'CRITICAL' || b.severity === 'HIGH'
              ? 'danger'
              : b.severity === 'MEDIUM'
              ? 'warning'
              : 'neutral'
          }
          label={b.severity}
          size="sm"
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (b) => (
        <StatusBadge
          variant={
            b.status === 'RESOLVED' || b.status === 'CLOSED'
              ? 'success'
              : b.status === 'INVESTIGATING'
              ? 'warning'
              : 'danger'
          }
          label={b.status}
          size="sm"
        />
      ),
    },
    {
      key: 'createdAt',
      header: 'Reported',
      sortable: true,
      render: (b) => <span className="text-xs text-slate-500">{formatRelativeTime(b.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Inspect',
      align: 'right',
      render: (b) => (
        <button
          onClick={() => setSelectedItem({ type: 'BUG', data: b })}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
        >
          <Eye className="w-4 h-4" />
          <span>Details</span>
        </button>
      ),
    },
  ];

  // Feature Columns
  const featureColumns: Column<FeatureSuggestion>[] = [
    {
      key: 'title',
      header: 'Suggestion',
      sortable: true,
      render: (f) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{f.title}</span>
            <span className="text-[11px] text-slate-500 block truncate max-w-sm">{f.description}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'userName',
      header: 'Submitted By',
      sortable: true,
      render: (f) => (
        <div>
          <span className="font-semibold text-slate-800 text-xs block">{f.userName}</span>
          <span className="text-[11px] text-slate-400 font-mono block truncate max-w-[150px]">{f.userEmail}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (f) => (
        <StatusBadge
          variant={
            f.status === 'IMPLEMENTED'
              ? 'success'
              : f.status === 'PLANNED' || f.status === 'IN_DEVELOPMENT'
              ? 'info'
              : 'neutral'
          }
          label={f.status}
          size="sm"
        />
      ),
    },
    {
      key: 'votesCount',
      header: 'Votes',
      sortable: true,
      align: 'center',
      render: (f) => <span className="font-bold font-mono text-slate-800">{f.votesCount || 0}</span>,
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      sortable: true,
      render: (f) => <span className="text-xs text-slate-500">{formatRelativeTime(f.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (f) => (
        <button
          onClick={() => setSelectedItem({ type: 'FEATURE', data: f })}
          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
        >
          <Eye className="w-4 h-4" />
          <span>Review</span>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Support & User Inquiries</h1>
            {openBugsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-100">
                {openBugsCount} active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Student bug reports, crash logs, feature feedback, and direct contact inquiries.
          </p>
        </div>

        {/* Action / KPI Quick summary */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-700">
              {criticalBugsCount} Critical/High Priority
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('BUGS')}
          className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'BUGS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Bug className="w-4 h-4" />
          <span>Bug Reports</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {bugReports.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('FEATURES')}
          className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'FEATURES'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Lightbulb className="w-4 h-4" />
          <span>Feature Suggestions</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {featureSuggestions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('CONTACT')}
          className={`pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'CONTACT'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Contact Requests</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {contactRequests.length}
          </span>
        </button>
      </div>

      {/* Filter Controls (for Bug tab) */}
      {activeTab === 'BUGS' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="INVESTIGATING">Investigating</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      )}

      {/* Main Table Views */}
      {activeTab === 'BUGS' && (
        <DataTable
          data={filteredBugs}
          columns={bugColumns}
          searchPlaceholder="Search bugs by issue description, reporter, or ID..."
          searchKeys={['description', 'userName', 'userEmail', 'category', 'id']}
          pageSize={10}
          emptyMessage="No bug reports match your filter criteria."
          exportFileName="roommate-bug-reports.csv"
        />
      )}

      {activeTab === 'FEATURES' && (
        <DataTable
          data={featureSuggestions}
          columns={featureColumns}
          searchPlaceholder="Search feature suggestions..."
          searchKeys={['title', 'description', 'userName', 'category']}
          pageSize={10}
          emptyMessage="No feature suggestions submitted yet."
          exportFileName="roommate-feature-suggestions.csv"
        />
      )}

      {activeTab === 'CONTACT' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          {contactRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No pending contact or inquiry requests.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {contactRequests.map((req) => (
                <div key={req.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">{req.subject}</span>
                      <StatusBadge
                        variant={req.status === 'RESOLVED' ? 'success' : 'warning'}
                        label={req.status}
                        size="sm"
                      />
                    </div>
                    <p className="text-xs text-slate-600">{req.message}</p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>{req.userName} ({req.userEmail})</span>
                      <span>•</span>
                      <span>{formatRelativeTime(req.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedItem({ type: 'CONTACT', data: req })}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                  >
                    Reply
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ticket Detail Drawer/Modal */}
      {selectedItem && (
        <AdminSupportDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdateBugStatus={async (bugId, status, notes) => {
            await onUpdateBugStatus(bugId, status, notes);
            setSelectedItem(null);
          }}
          onSendUserReply={async (userId, title, message) => {
            if (onSendNotification) {
              await onSendNotification(userId, title, message);
            }
          }}
        />
      )}
    </div>
  );
};

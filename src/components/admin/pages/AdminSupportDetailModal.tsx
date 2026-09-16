import React, { useState } from 'react';
import {
  X,
  Bug,
  Lightbulb,
  MessageSquare,
  Smartphone,
  Wifi,
  Monitor,
  Terminal,
  Clock,
  CheckCircle,
  Send,
  Save,
  FileText,
  User as UserIcon,
} from 'lucide-react';
import { BugReport, BugStatus, FeatureSuggestion, ContactRequest } from '../../../types';
import { StatusBadge } from '../common/StatusBadge';
import { formatRelativeTime, formatFullDateTime } from '../../../lib/utils/currencyFormatter';

type SupportItem =
  | { type: 'BUG'; data: BugReport }
  | { type: 'FEATURE'; data: FeatureSuggestion }
  | { type: 'CONTACT'; data: ContactRequest };

interface AdminSupportDetailModalProps {
  item: SupportItem | null;
  onClose: () => void;
  onUpdateBugStatus?: (bugId: string, status: BugStatus, adminNotes?: string) => Promise<void> | void;
  onSendUserReply?: (userId: string, title: string, message: string) => Promise<void> | void;
}

export const AdminSupportDetailModal: React.FC<AdminSupportDetailModalProps> = ({
  item,
  onClose,
  onUpdateBugStatus,
  onSendUserReply,
}) => {
  const isBug = item?.type === 'BUG';
  const isFeature = item?.type === 'FEATURE';
  const isContact = item?.type === 'CONTACT';

  const bug = isBug ? (item?.data as BugReport) : null;
  const feature = isFeature ? (item?.data as FeatureSuggestion) : null;
  const contact = isContact ? (item?.data as ContactRequest) : null;

  const [status, setStatus] = useState<BugStatus>(bug?.status || 'OPEN');
  const [adminNotes, setAdminNotes] = useState(bug?.adminNotes || feature?.adminNotes || '');
  const [replyMessage, setReplyMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);

  if (!item) return null;

  const handleSaveBugStatus = async () => {
    if (!bug || !onUpdateBugStatus) return;
    setIsSaving(true);
    try {
      await onUpdateBugStatus(bug.id, status, adminNotes);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyMessage.trim() || !onSendUserReply) return;
    const userId = bug?.userId || feature?.userId || contact?.userId;
    if (!userId) return;

    setIsSendingReply(true);
    try {
      const subject = isBug
        ? `Update on your Bug Report #${bug?.id.slice(-6)}`
        : isFeature
        ? `Feedback on your Suggestion: ${feature?.title}`
        : `Re: ${contact?.subject}`;
      await onSendUserReply(userId, subject, replyMessage.trim());
      setReplySuccess(true);
      setReplyMessage('');
      setTimeout(() => setReplySuccess(false), 4000);
    } finally {
      setIsSendingReply(false);
    }
  };

  const title = isBug
    ? `Bug Report #${bug?.id.slice(-6)}`
    : isFeature
    ? `Feature Suggestion: ${feature?.title}`
    : `Inquiry: ${contact?.subject}`;

  const reporterName = bug?.userName || feature?.userName || contact?.userName || 'Student';
  const reporterEmail = bug?.userEmail || feature?.userEmail || contact?.userEmail || 'No email';
  const createdAt = bug?.createdAt || feature?.createdAt || contact?.createdAt || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                isBug
                  ? 'bg-rose-50 text-rose-600 border border-rose-100'
                  : isFeature
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}
            >
              {isBug ? (
                <Bug className="w-5 h-5" />
              ) : isFeature ? (
                <Lightbulb className="w-5 h-5" />
              ) : (
                <MessageSquare className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{title}</h2>
                {isBug && bug && (
                  <StatusBadge
                    variant={
                      bug.severity === 'CRITICAL' || bug.severity === 'HIGH'
                        ? 'danger'
                        : bug.severity === 'MEDIUM'
                        ? 'warning'
                        : 'neutral'
                    }
                    label={bug.severity}
                    size="sm"
                  />
                )}
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                <span>Submitted by {reporterName}</span>
                <span>•</span>
                <Clock className="w-3 h-3" />
                <span>{formatRelativeTime(createdAt)}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Status & Priority Controller for Bugs */}
          {isBug && bug && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Workflow Lifecycle Status
                </span>
                <span className="text-xs font-medium text-slate-600 mt-0.5 block">
                  Update progress to keep telemetry metrics accurate.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BugStatus)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="OPEN">🔴 Open</option>
                  <option value="INVESTIGATING">🟡 Investigating</option>
                  <option value="RESOLVED">🟢 Resolved</option>
                  <option value="CLOSED">⚪ Closed</option>
                </select>
                <button
                  onClick={handleSaveBugStatus}
                  disabled={isSaving}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Saving...' : 'Update'}
                </button>
              </div>
            </div>
          )}

          {/* User & Issue Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5" /> Reporter Details
              </span>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Name:</span>
                  <span className="font-semibold text-slate-800">{reporterName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-mono text-slate-700">{reporterEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reported On:</span>
                  <span className="text-slate-700">{formatFullDateTime(createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Category / Scope */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Classification
              </span>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-semibold text-slate-800">
                    {bug?.category || feature?.category || 'General Support'}
                  </span>
                </div>
                {bug?.diagnostics?.roomName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Room Context:</span>
                    <span className="font-semibold text-slate-800">{bug.diagnostics.roomName}</span>
                  </div>
                )}
                {feature?.votesCount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Community Upvotes:</span>
                    <span className="font-bold text-indigo-600">{feature.votesCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Issue Description / Body
            </span>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs leading-relaxed whitespace-pre-wrap font-sans">
              {bug?.description || feature?.description || contact?.message || 'No description provided.'}
            </div>
          </div>

          {/* Screenshot (if any) */}
          {bug?.screenshotUrl && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Attached Screenshot
              </span>
              <div className="p-2 border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
                <img
                  src={bug.screenshotUrl}
                  alt="Bug attachment"
                  className="max-h-64 rounded-lg mx-auto object-contain cursor-pointer"
                  onClick={() => window.open(bug.screenshotUrl, '_blank')}
                />
              </div>
            </div>
          )}

          {/* Diagnostic Telemetry Box (for bugs) */}
          {bug?.diagnostics && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-600" /> Device & Environment Telemetry
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Smartphone className="w-3 h-3" />
                    <span className="text-[10px] uppercase font-bold">Platform / OS</span>
                  </div>
                  <span className="font-bold text-slate-800 text-[11px] block truncate">
                    {bug.diagnostics.platform || 'Unknown'} {bug.diagnostics.osVersion}
                  </span>
                </div>

                <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Monitor className="w-3 h-3" />
                    <span className="text-[10px] uppercase font-bold">App Version</span>
                  </div>
                  <span className="font-bold text-slate-800 text-[11px] block">
                    v{bug.diagnostics.appVersion || '1.0.0'}
                  </span>
                </div>

                <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Wifi className="w-3 h-3" />
                    <span className="text-[10px] uppercase font-bold">Network</span>
                  </div>
                  <span className="font-bold text-slate-800 text-[11px] block capitalize">
                    {bug.diagnostics.networkStatus || 'Online'}
                  </span>
                </div>

                <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Monitor className="w-3 h-3" />
                    <span className="text-[10px] uppercase font-bold">Resolution</span>
                  </div>
                  <span className="font-bold text-slate-800 text-[11px] block font-mono">
                    {bug.diagnostics.screenResolution || '390x844'}
                  </span>
                </div>
              </div>

              {/* Console Logs */}
              {bug.diagnostics.recentLogs && bug.diagnostics.recentLogs.length > 0 && (
                <div className="mt-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Recent Client Logs (Last Actions)
                  </span>
                  <div className="bg-slate-900 text-emerald-400 font-mono text-[11px] p-3 rounded-lg overflow-x-auto max-h-32 space-y-0.5">
                    {bug.diagnostics.recentLogs.map((log, idx) => (
                      <div key={idx} className="leading-tight">
                        &gt; {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Admin Internal RCA Notes */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Internal Root-Cause Notes (SuperAdmin Only)
            </span>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add internal debugging notes, Jira ticket references, or resolution details..."
              rows={2}
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder:text-slate-400"
            />
          </div>

          {/* Direct Response Dispatcher */}
          <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 block flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> Direct In-App User Response
            </span>
            <p className="text-[11px] text-slate-600">
              Send an immediate notification directly to {reporterName}'s mobile app regarding this ticket.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder={`Type update message to ${reporterName}...`}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleSendReply}
                disabled={!replyMessage.trim() || isSendingReply}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSendingReply ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
            {replySuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold animate-fadeIn">
                <CheckCircle className="w-4 h-4" /> Message delivered to user's notifications!
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

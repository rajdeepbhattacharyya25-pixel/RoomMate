/**
 * RoomReconciliationCard.tsx
 *
 * Track 4: Monthly Room Ledger Audit & Certified Statement Export UI Card.
 *
 * Coordinates monthly reconciliation locks, live roommate sign-off progress,
 * cryptographic certification seals, and direct-to-device PDF/Excel downloads.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Table2,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  User,
  Room,
  RoomMember,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  RoomStatementData,
} from '../../types';
import { UserAvatar } from '../common/UserAvatar';
import { formatInrExact } from '../../lib/utils/currencyFormatter';
import {
  fetchReconciliationData,
  lockPeriodCloud,
  unlockPeriodCloud,
  signStatementCloud,
} from '../../lib/storage/reconciliationAdapter';
import {
  gatherRoomExportData,
  exportRoomToFormat,
  MONTH_NAMES,
  RoomExportFormat,
} from '../../lib/services/roomExpenseExportService';
import { StatementSignOffModal } from './StatementSignOffModal';
import { AdminLockPeriodModal } from './AdminLockPeriodModal';
import { AdminUnlockModal } from './AdminUnlockModal';
import { hapticImpact, hapticSuccess } from '../../lib/native/haptics';

interface RoomReconciliationCardProps {
  currentUser: User;
  activeRoom: Room;
  roomMembers: RoomMember[];
  allUsers: User[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
}

export const RoomReconciliationCard: React.FC<RoomReconciliationCardProps> = ({
  currentUser,
  activeRoom,
  roomMembers,
  allUsers,
  sharedExpenses,
  expenseSplits,
  settlementPayments,
}) => {
  // Current calendar state defaults to current month / previous month
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(today.getMonth()); // 0-indexed

  const [statementData, setStatementData] = useState<RoomStatementData>({
    hasPeriod: false,
    period: null,
    signoffs: [],
  });
  const [downloadingFormat, setDownloadingFormat] = useState<RoomExportFormat | null>(null);
  const [copiedSeal, setCopiedSeal] = useState<boolean>(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  // Modals
  const [showSignModal, setShowSignModal] = useState<boolean>(false);
  const [showLockModal, setShowLockModal] = useState<boolean>(false);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);

  const monthLabel = `${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`;
  const periodMonthNumber = selectedMonthIndex + 1; // 1-indexed

  // Is current user Room Admin or Room Creator?
  const isRoomAdmin = useMemo(() => {
    if (activeRoom.createdBy === currentUser.id) return true;
    const member = roomMembers.find(
      (m) => m.roomId === activeRoom.id && m.userId === currentUser.id
    );
    return member?.role === 'ROOM_ADMIN';
  }, [activeRoom, currentUser, roomMembers]);

  // Load statement data whenever room, year, or month changes
  const loadStatement = useCallback(async () => {
    try {
      const data = await fetchReconciliationData(
        activeRoom.id,
        selectedYear,
        periodMonthNumber,
        roomMembers,
        allUsers
      );
      setStatementData(data);
    } catch (err) {
      console.warn('Failed to load reconciliation data:', err);
    }
  }, [activeRoom.id, selectedYear, periodMonthNumber, roomMembers, allUsers]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    hapticImpact('LIGHT');
    if (selectedMonthIndex === 0) {
      setSelectedMonthIndex(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    hapticImpact('LIGHT');
    if (selectedMonthIndex === 11) {
      setSelectedMonthIndex(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonthIndex((m) => m + 1);
    }
  };

  // Compile export dataset
  const exportDataset = useMemo(() => {
    return gatherRoomExportData({
      roomId: activeRoom.id,
      monthIndex: selectedMonthIndex,
      year: selectedYear,
      currentUser,
      activeRoom,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
      reconciliation: {
        period: statementData.period,
        signoffs: statementData.signoffs,
        isCertified: statementData.period?.status === 'CERTIFIED',
        sealHash: statementData.period?.certifiedSealHash,
      },
    });
  }, [
    activeRoom,
    selectedMonthIndex,
    selectedYear,
    currentUser,
    sharedExpenses,
    expenseSplits,
    settlementPayments,
    allUsers,
    statementData,
  ]);

  // Signatory metrics
  const totalSignatories = statementData.signoffs.length;
  const signedCount = statementData.signoffs.filter((s) => s.status === 'SIGNED').length;
  const _disputedCount = statementData.signoffs.filter((s) => s.status === 'DISPUTED').length;
  const progressPercent =
    totalSignatories > 0 ? Math.round((signedCount / totalSignatories) * 100) : 0;

  // Has current user signed?
  const mySignoff = statementData.signoffs.find((s) => s.userId === currentUser.id);

  // My balances for current month
  const mySettlementRow = exportDataset.settlements.find((s) => s.userId === currentUser.id);
  const myPaid = mySettlementRow?.totalPaid || 0;
  const myShare = mySettlementRow?.fairShare || 0;
  const myNetBalance = mySettlementRow?.netBalance || 0;

  // Eligible signatories for lock modal
  const eligibleSignatories = useMemo(() => {
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const monthStart = new Date(Date.UTC(selectedYear, selectedMonthIndex, 1));
    const monthEnd = new Date(Date.UTC(selectedYear, selectedMonthIndex + 1, 0, 23, 59, 59));

    return roomMembers
      .filter((m) => {
        if (m.roomId !== activeRoom.id) return false;
        const joinedAt = new Date(m.joinedAt);
        const leftAt = m.leftAt ? new Date(m.leftAt) : null;
        return joinedAt <= monthEnd && (!leftAt || leftAt >= monthStart);
      })
      .map((m) => {
        const u = userMap.get(m.userId);
        return {
          id: m.userId,
          name: u?.name || 'Roommate',
          avatarUrl: u?.avatarUrl,
        };
      });
  }, [roomMembers, allUsers, activeRoom.id, selectedYear, selectedMonthIndex]);

  // Handlers
  const handleLockConfirm = async () => {
    hapticImpact('MEDIUM');
    const updated = await lockPeriodCloud(
      activeRoom.id,
      selectedYear,
      periodMonthNumber,
      currentUser.id,
      roomMembers,
      allUsers
    );
    setStatementData(updated);
    hapticSuccess();
  };

  const handleUnlockConfirm = async (reason: string) => {
    hapticImpact('MEDIUM');
    const updated = await unlockPeriodCloud(
      activeRoom.id,
      selectedYear,
      periodMonthNumber,
      currentUser.id,
      reason,
      roomMembers,
      allUsers
    );
    setStatementData(updated);
    hapticSuccess();
  };

  const handleSignConfirm = async () => {
    if (!statementData.period) return;
    hapticImpact('MEDIUM');
    const updated = await signStatementCloud(
      statementData.period.id,
      activeRoom.id,
      selectedYear,
      periodMonthNumber,
      currentUser.id,
      'SIGNED',
      undefined,
      roomMembers,
      allUsers
    );
    setStatementData(updated);
  };

  const handleDisputeConfirm = async (reason: string) => {
    if (!statementData.period) return;
    hapticImpact('MEDIUM');
    const updated = await signStatementCloud(
      statementData.period.id,
      activeRoom.id,
      selectedYear,
      periodMonthNumber,
      currentUser.id,
      'DISPUTED',
      reason,
      roomMembers,
      allUsers
    );
    setStatementData(updated);
  };

  const handleDownload = async (format: RoomExportFormat) => {
    if (downloadingFormat) return;
    hapticImpact('LIGHT');
    setDownloadingFormat(format);
    try {
      await exportRoomToFormat(exportDataset, format);
      hapticSuccess();
      setDownloadToast(`Saved ${format.toUpperCase()} to device storage!`);
      setTimeout(() => setDownloadToast(null), 3500);
    } catch (err: unknown) {
      console.error('Download error:', err);
      setDownloadToast('Failed to save file to device.');
      setTimeout(() => setDownloadToast(null), 3500);
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleCopySeal = () => {
    if (!statementData.period?.certifiedSealHash) return;
    navigator.clipboard.writeText(statementData.period.certifiedSealHash);
    setCopiedSeal(true);
    hapticImpact('LIGHT');
    setTimeout(() => setCopiedSeal(false), 2000);
  };

  const status = statementData.period?.status || 'OPEN';

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all">
      {/* Top Banner / Month Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/50">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Reconciliation & Certified Audit
          </span>
        </div>

        {/* Month Selector Pills */}
        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5 shadow-xs">
          <button
            onClick={handlePrevMonth}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-semibold text-slate-900 dark:text-white min-w-[110px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 space-y-5">
        {/* Toast confirmation */}
        {downloadToast && (
          <div className="p-3 text-xs rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{downloadToast}</span>
            </div>
          </div>
        )}

        {/* Status Header Block */}
        {status === 'CERTIFIED' ? (
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border border-emerald-500/30 dark:border-emerald-500/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-sm">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                      Certified Financial Statement
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                      100% Unanimous Sign-Off
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700/90 dark:text-emerald-400/90 mt-0.5">
                    Sealed on{' '}
                    {statementData.period?.certifiedAt
                      ? new Date(statementData.period.certifiedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Month-End'}
                  </p>
                </div>
              </div>

              {statementData.period?.certifiedSealHash && (
                <button
                  onClick={handleCopySeal}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/80 dark:bg-slate-900/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-white dark:hover:bg-slate-900 transition"
                  title="Copy SHA-256 seal hash"
                >
                  {copiedSeal ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{statementData.period.certifiedSealHash.slice(0, 10)}...</span>
                </button>
              )}
            </div>

            {/* Download Buttons Bar */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              <button
                disabled={!!downloadingFormat}
                onClick={() => handleDownload('pdf')}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50 transition shadow-sm"
              >
                {downloadingFormat === 'pdf' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Download Certified PDF</span>
              </button>

              <button
                disabled={!!downloadingFormat}
                onClick={() => handleDownload('xlsx')}
                className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-emerald-900 dark:text-emerald-100 bg-emerald-100/80 dark:bg-emerald-900/50 hover:bg-emerald-200/80 dark:hover:bg-emerald-900/70 border border-emerald-200 dark:border-emerald-800 disabled:opacity-50 transition"
              >
                {downloadingFormat === 'xlsx' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
                <span>Download Excel (.xlsx)</span>
              </button>

              <button
                disabled={!!downloadingFormat}
                onClick={() => handleDownload('csv')}
                className="px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                title="Download CSV"
              >
                <Table2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : status === 'LOCKED' ? (
          <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500 text-white shadow-sm">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-900 dark:text-amber-300">
                      Reconciliation Locked
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                      Revision #{statementData.period?.revisionCount || 1}
                    </span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    Modifications are frozen. Awaiting unanimous roommate sign-offs.
                  </p>
                </div>
              </div>

              {isRoomAdmin && (
                <button
                  onClick={() => setShowUnlockModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 transition"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock for Edit</span>
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                <span>Sign-Off Progress</span>
                <span className="font-bold">
                  {signedCount} of {totalSignatories} Signed ({progressPercent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Current User Sign Action */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              {mySignoff?.status === 'SIGNED' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>You signed this statement</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowSignModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-sm"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Review & Sign Statement</span>
                </button>
              )}

              <button
                disabled={!!downloadingFormat}
                onClick={() => handleDownload('pdf')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              >
                {downloadingFormat === 'pdf' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Provisional PDF</span>
              </button>

              <button
                disabled={!!downloadingFormat}
                onClick={() => handleDownload('xlsx')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
              >
                {downloadingFormat === 'xlsx' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                <span>Excel (.xlsx)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Reconciliation Period Open
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Roommates can enter, edit, and settle expenses for {monthLabel}.
                  </p>
                </div>
              </div>

              {isRoomAdmin && (
                <button
                  onClick={() => setShowLockModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 shadow-sm transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock & Request Sign-Offs</span>
                </button>
              )}
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Total Spend so far:</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {formatInrExact(exportDataset.summary.totalSharedSpending)}
              </span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <button
                disabled={!!downloadingFormat}
                onClick={() => handleDownload('pdf')}
                className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-medium"
              >
                <Download className="w-3 h-3" />
                <span>Export Draft Report</span>
              </button>
            </div>
          </div>
        )}

        {/* Signatories Roster Grid (When Locked or Certified) */}
        {statementData.signoffs.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Roommate Sign-Off Ledger ({statementData.signoffs.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {statementData.signoffs.map((s) => {
                const isUserSigned = s.status === 'SIGNED';
                const isUserDisputed = s.status === 'DISPUTED';
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                  >
                    <div className="flex items-center gap-2">
                      <UserAvatar name={s.userName || 'Roommate'} src={s.userAvatar} size="sm" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {s.userName || 'Roommate'}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {isUserSigned
                            ? s.signedAt
                              ? `Signed ${new Date(s.signedAt).toLocaleDateString('en-IN')}`
                              : 'Signed'
                            : isUserDisputed
                            ? `Dispute: ${s.disputeReason || 'Flagged'}`
                            : 'Pending review'}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isUserSigned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                          <Check className="w-3 h-3" />
                          <span>Signed</span>
                        </span>
                      ) : isUserDisputed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Disputed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <StatementSignOffModal
        isOpen={showSignModal}
        onClose={() => setShowSignModal(false)}
        roomName={activeRoom.name}
        monthLabel={monthLabel}
        totalRoomSpend={exportDataset.summary.totalSharedSpending}
        myPaid={myPaid}
        myShare={myShare}
        myNetBalance={myNetBalance}
        onSign={handleSignConfirm}
        onDispute={handleDisputeConfirm}
      />

      <AdminLockPeriodModal
        isOpen={showLockModal}
        onClose={() => setShowLockModal(false)}
        roomName={activeRoom.name}
        monthLabel={monthLabel}
        signatories={eligibleSignatories}
        onConfirmLock={handleLockConfirm}
      />

      <AdminUnlockModal
        isOpen={showUnlockModal}
        onClose={() => setShowUnlockModal(false)}
        roomName={activeRoom.name}
        monthLabel={monthLabel}
        currentRevision={statementData.period?.revisionCount || 1}
        onConfirmUnlock={handleUnlockConfirm}
      />
    </div>
  );
};

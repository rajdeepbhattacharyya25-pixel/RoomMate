import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Download,
  RefreshCw,
  CheckCircle2,
  FileSpreadsheet,
  ShieldCheck,
  Clock,
  Layers,
  Share2,
  Upload,
  KeyRound,
  X,
  Loader2,
  ArrowRight,
  Sparkles,
  HardDrive,
} from 'lucide-react';
import { User } from '../../../../types';
import { db } from '../../../../lib/storage/mockStorage';
import { fetchCloudDatabaseState } from '../../../../lib/storage/cloudStorageAdapter';
import { getPendingQueueCount, subscribeToQueueChanges } from '../../../../lib/storage/offlineQueue';
import { getUserBudget } from '../../../../lib/storage/budgetService';
import {
  gatherMonthlyExportData,
  exportToFormat,
  type ExportFormat,
} from '../../../../lib/services/expenseExportService';
import { hapticImpact, hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { ExportBottomSheet } from '../../ExportBottomSheet';
import { createEncryptedBackup } from '../../../../lib/storage/backupCryptoService';
import { shareOrDownloadBackup } from '../../../../lib/storage/shareBackupService';
import { RestoreBackupModal } from '../modals/RestoreBackupModal';
import { GoogleDriveBackupModal } from '../modals/GoogleDriveBackupModal';
import { StrictPinInput } from '../../../common/StrictPinInput';

interface DataBackupTabProps {
  currentUser: User;
  onShowToast: (msg: string) => void;
}

export const DataBackupTab: React.FC<DataBackupTabProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  const [pendingCount, setPendingCount] = useState<number>(() => getPendingQueueCount());
  const [showExportSheet, setShowExportSheet] = useState<boolean>(false);

  // Backup & Restore States
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [showBackupPinModal, setShowBackupPinModal] = useState<boolean>(false);
  const [showGoogleDriveModal, setShowGoogleDriveModal] = useState<boolean>(false);
  const [backupPin, setBackupPin] = useState<string>('');
  const [backupMode, setBackupMode] = useState<'share' | 'download'>('share');
  const [showRestoreModal, setShowRestoreModal] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToQueueChanges(() => {
      setPendingCount(getPendingQueueCount());
    });
    return () => unsub();
  }, []);

  const handleForceSync = async () => {
    setIsSyncing(true);
    hapticImpact('LIGHT');
    try {
      const cloudState = await fetchCloudDatabaseState();
      if (cloudState) {
        setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setPendingCount(getPendingQueueCount());
        await hapticSuccess();
        onShowToast('Cloud database state synchronized successfully!');
      } else {
        onShowToast('Sync completed (Offline-first local vault mode active)');
      }
    } catch (err) {
      console.warn('Force sync warning:', err);
      hapticWarning();
      onShowToast('Sync encountered an error. Data preserved locally.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStartBackup = (mode: 'share' | 'download') => {
    const storedPin =
      (typeof localStorage !== 'undefined' &&
        (localStorage.getItem(`roommate_vault_pin_${currentUser.id}`) ||
          localStorage.getItem('roommate_vault_pin'))) ||
      '';
    setBackupPin(storedPin);
    setBackupMode(mode);
    setShowBackupPinModal(true);
    hapticImpact('LIGHT');
  };

  const handleExecuteBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backupPin.length !== 4) {
      hapticWarning();
      onShowToast('PIN must be exactly 4 digits.');
      return;
    }

    setIsBackingUp(true);
    try {
      const envelope = await createEncryptedBackup(currentUser, backupPin);
      const result = await shareOrDownloadBackup(envelope, currentUser.name, backupMode === 'download');
      setShowBackupPinModal(false);
      hapticSuccess();
      if (result.action === 'shared') {
        onShowToast('Backup file sent to share sheet (Google Drive, Files, etc.)');
      } else if (result.action === 'downloaded') {
        onShowToast(`Downloaded backup file: ${result.fileName}`);
      }
    } catch (err: unknown) {
      hapticWarning();
      onShowToast(err instanceof Error ? err.message : 'Backup creation failed');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const budget = getUserBudget(currentUser.id);
    const state = db.getState();
    const personalExpenses = state.personalExpenses;
    const sharedExpenses = state.sharedExpenses;
    const expenseSplits = state.expenseSplits;
    const settlementPayments = state.settlementPayments;
    const allUsers = state.users;
    const rooms = state.rooms;

    const dataset = gatherMonthlyExportData({
      month: currentMonth,
      year: currentYear,
      currentUser,
      personalExpenses,
      budgetConfig: budget,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
      rooms,
    });

    await exportToFormat(dataset, format);
  };

  return (
    <div className="space-y-4">
      {/* Card 1: Cloud Sync & Local Vault */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Cloud className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Cloud Sync Status
              </h3>
              <p className="text-[11px] text-slate-500">
                PostgreSQL Cloud &amp; Offline Local Vault
              </p>
            </div>
          </div>

          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Synced</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
            <div className="text-[10px] text-slate-500 font-medium">Last Cloud Ping</div>
            <div className="text-xs font-bold text-slate-800 font-mono flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{lastSyncTime}</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
            <div className="text-[10px] text-slate-500 font-medium">Offline Queue</div>
            <div className="text-xs font-bold text-slate-800 font-mono flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>{pendingCount} pending</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleForceSync}
          disabled={isSyncing}
          className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all disabled:opacity-60 shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Synchronizing with Cloud...' : 'Force Sync with Cloud Vault'}</span>
        </button>
      </div>

      {/* Card 2: Encrypted Vault Backup (NEW) */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Encrypted Vault Backup
              </h3>
              <p className="text-[11px] text-slate-500">
                Google Drive or Device Download
              </p>
            </div>
          </div>

          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            AES-256 Protected
          </span>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          Create an encrypted snapshot of your personal expenses and budget. Save directly to your chosen <strong>Google Drive</strong> account, local device, or external apps.
        </p>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => setShowGoogleDriveModal(true)}
            className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs"
          >
            <HardDrive className="w-4 h-4" />
            <span>Backup to Google Drive (Choose Account)</span>
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleStartBackup('share')}
              disabled={isBackingUp}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share (Other Apps)</span>
            </button>

            <button
              type="button"
              onClick={() => handleStartBackup('download')}
              disabled={isBackingUp}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .json</span>
            </button>
          </div>
        </div>
      </div>

      {/* Card 3: Restore Vault from Backup (NEW) */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Upload className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Restore from Backup
            </h3>
            <p className="text-[11px] text-slate-500">
              Recover records from an encrypted archive
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          Switching devices or reinstalling RoomMate? Import your previously saved <code className="font-mono text-slate-800">.json</code> backup file and enter your 4-digit PIN to restore your records.
        </p>

        <button
          type="button"
          onClick={() => {
            hapticImpact('LIGHT');
            setShowRestoreModal(true);
          }}
          className="w-full py-2.5 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 shadow-2xs active:scale-98 transition-all"
        >
          <Upload className="w-3.5 h-3.5 text-indigo-600" />
          <span>Restore from Backup File</span>
        </button>
      </div>

      {/* Card 4: Export Data */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Download className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Export Financial Statements
            </h3>
            <p className="text-[11px] text-slate-500">
              Download personal and shared room statements
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          Export your complete monthly transaction history, category breakdowns, and settlement proofs into standardized PDF reports, CSV tables, or Excel spreadsheets.
        </p>

        <button
          type="button"
          onClick={() => {
            hapticImpact('LIGHT');
            setShowExportSheet(true);
          }}
          className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Export Monthly Expense Report</span>
        </button>
      </div>

      {/* Card 5: Privacy & Data Ownership */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-2 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-indigo-600" />
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Data Sovereignty Guarantee
          </h4>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Your expense records are bound strictly to your user profile and active rooms. RoomMate operates an offline-first architecture where data is stored securely on your device and synchronized via Row-Level Security.
        </p>
      </div>

      {/* PIN Confirmation Modal for Backup Creation */}
      {showBackupPinModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 text-slate-900 animate-in fade-in"
        >
          <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 animate-in slide-in-from-bottom-6 sm:zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Encrypt Backup</h4>
                  <p className="text-[11px] text-slate-500">Enter your 4-digit PIN</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBackupPinModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Your backup archive will be encrypted with AES-256. You will need this 4-digit PIN to restore your data on any device.
            </p>

            <form onSubmit={handleExecuteBackup} className="space-y-4">
              <StrictPinInput
                value={backupPin}
                onChange={setBackupPin}
                label="Security PIN"
                helperText="4 numeric digits"
                autoFocus
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowBackupPinModal(false)}
                  className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={backupPin.length !== 4 || isBackingUp}
                  className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
                >
                  {isBackingUp ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Encrypting...</span>
                    </>
                  ) : (
                    <>
                      <span>{backupMode === 'share' ? 'Share / Drive' : 'Download'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span>PBKDF2 100,000 iterations &bull; AES-GCM 256</span>
            </div>
          </div>
        </div>
      )}

      {/* Restore Backup Wizard Modal */}
      <RestoreBackupModal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        currentUser={currentUser}
        onRestoreSuccess={(msg) => onShowToast(msg)}
      />

      {/* Google Drive Account Selector & Backup Modal */}
      <GoogleDriveBackupModal
        isOpen={showGoogleDriveModal}
        currentUser={currentUser}
        onClose={() => setShowGoogleDriveModal(false)}
        onShowToast={onShowToast}
      />

      {/* Export Bottom Sheet */}
      <ExportBottomSheet
        isOpen={showExportSheet}
        onClose={() => setShowExportSheet(false)}
        monthLabel={new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
        onExport={handleExport}
      />
    </div>
  );
};

import React, { useState, useRef } from 'react';
import { User } from '../../../../types';
import {
  Upload,
  KeyRound,
  FileCheck,
  AlertCircle,
  X,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { StrictPinInput } from '../../../common/StrictPinInput';
import {
  EncryptedBackupEnvelope,
  BackupDecryptedPayload,
  decryptBackup,
} from '../../../../lib/storage/backupCryptoService';
import { parseBackupFile, executeRestore } from '../../../../lib/storage/restoreService';
import { hapticSuccess, hapticWarning, hapticImpact } from '../../../../lib/native/haptics';

interface RestoreBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onRestoreSuccess: (message: string) => void;
}

export const RestoreBackupModal: React.FC<RestoreBackupModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRestoreSuccess,
}) => {
  const [step, setStep] = useState<'SELECT_FILE' | 'ENTER_PIN' | 'PREVIEW'>('SELECT_FILE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [envelope, setEnvelope] = useState<EncryptedBackupEnvelope | null>(null);
  const [pin, setPin] = useState('');
  const [decryptedPayload, setDecryptedPayload] = useState<BackupDecryptedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsLoading(true);
    try {
      const parsedEnvelope = await parseBackupFile(file);
      setSelectedFile(file);
      setEnvelope(parsedEnvelope);
      setStep('ENTER_PIN');
      hapticImpact('LIGHT');
    } catch (err: unknown) {
      hapticWarning();
      setError(err instanceof Error ? err.message : 'Invalid backup file.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envelope) return;

    setError(null);
    setIsLoading(true);
    try {
      const payload = await decryptBackup(envelope, pin);
      setDecryptedPayload(payload);
      setStep('PREVIEW');
      hapticSuccess();
    } catch (err: unknown) {
      hapticWarning();
      setError(
        err instanceof Error && err.message.includes('INVALID_PIN')
          ? 'Incorrect PIN. Please re-enter the 4-digit PIN used to create this backup.'
          : 'Unable to decrypt backup archive.'
      );
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!envelope || !pin) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await executeRestore(envelope, pin, currentUser);
      hapticSuccess();
      onRestoreSuccess(
        `Restored ${result.restoredExpenses} expenses and budget from ${result.backupUserName}'s backup!`
      );
      handleClose();
    } catch (err: unknown) {
      hapticWarning();
      setError(err instanceof Error ? err.message : 'Failed to restore backup.');
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    hapticImpact('LIGHT');
    setStep('SELECT_FILE');
    setSelectedFile(null);
    setEnvelope(null);
    setPin('');
    setDecryptedPayload(null);
    setError(null);
    setIsLoading(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-modal-title"
      className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 text-slate-900 animate-in fade-in"
    >
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-5 animate-in slide-in-from-bottom-8 sm:zoom-in-95 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
              <Upload className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 id="restore-modal-title" className="text-sm font-bold text-slate-900">
                Restore Expense Vault
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Import and recover from an encrypted backup
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* STEP 1: SELECT FILE */}
        {step === 'SELECT_FILE' && (
          <div className="space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json,.roommate-backup"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-3xl p-8 flex flex-col items-center text-center space-y-3 bg-slate-50/70 hover:bg-indigo-50/30 transition-all cursor-pointer group"
            >
              <div className="w-14 h-14 rounded-2xl bg-white shadow-xs border border-slate-200/80 flex items-center justify-center text-slate-500 group-hover:text-indigo-600 group-hover:border-indigo-300 transition-all">
                {isLoading ? (
                  <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
                ) : (
                  <Upload className="w-7 h-7 stroke-[2]" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-800">
                  {isLoading ? 'Inspecting Backup File...' : 'Choose Backup Archive'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Select a <code className="font-mono text-slate-700">.json</code> file from Google Drive or device
                </p>
              </div>
            </button>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-600 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <span>
                RoomMate backup files are encrypted with AES-256. You will be prompted to enter the 4-digit PIN you used when creating the backup.
              </span>
            </div>
          </div>
        )}

        {/* STEP 2: ENTER PIN */}
        {step === 'ENTER_PIN' && (
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex items-center gap-2.5 text-xs text-indigo-900">
              <FileCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="truncate flex-1">
                <span className="font-bold">Archive:</span>{' '}
                <span className="font-mono text-[11px]">{selectedFile?.name}</span>
              </div>
            </div>

            <div className="text-center space-y-1 pt-1">
              <div className="inline-flex p-2.5 rounded-2xl bg-slate-100 text-slate-700 mb-1">
                <KeyRound className="w-5 h-5 stroke-[2.2]" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Enter Decryption PIN</h4>
              <p className="text-xs text-slate-500">
                Enter the 4-digit PIN used to encrypt this backup archive.
              </p>
            </div>

            <StrictPinInput
              value={pin}
              onChange={setPin}
              label="Backup Security PIN"
              helperText="Must match original PIN"
              autoFocus
            />

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep('SELECT_FILE');
                  setSelectedFile(null);
                  setEnvelope(null);
                  setPin('');
                  setError(null);
                }}
                className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Change File
              </button>
              <button
                type="submit"
                disabled={pin.length !== 4 || isLoading}
                className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Decrypting...</span>
                  </>
                ) : (
                  <>
                    <span>Decrypt &amp; Preview</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: PREVIEW & CONFIRM */}
        {step === 'PREVIEW' && decryptedPayload && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <div className="inline-flex p-2 rounded-full bg-emerald-50 text-emerald-600 mb-1">
                <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Backup Verified</h4>
              <p className="text-xs text-slate-500">
                Created for <strong className="text-slate-800">{decryptedPayload.manifest.userName}</strong>
              </p>
            </div>

            {/* Content Summary Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-1 text-center">
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 font-medium">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Personal Expenses</span>
                </div>
                <div className="text-base font-bold text-slate-900 font-mono">
                  {decryptedPayload.personalExpenses.length} records
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-1 text-center">
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Backup Date</span>
                </div>
                <div className="text-xs font-bold text-slate-900 font-mono truncate">
                  {new Date(decryptedPayload.exportedAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {decryptedPayload.budgetConfig && (
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-xs space-y-1">
                <div className="font-semibold text-slate-800">Monthly Budget Config</div>
                <div className="text-slate-600 text-[11px]">
                  Allowance: <strong>₹{decryptedPayload.budgetConfig.monthlyAllowance.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            )}

            <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/70 text-[11px] text-amber-900 space-y-1">
              <p className="font-semibold">Safe Merge Guarantee:</p>
              <p className="text-amber-800">
                These records will be merged into your current personal vault. Duplicate transactions with matching IDs will not be duplicated.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep('ENTER_PIN')}
                disabled={isLoading}
                className="h-11 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isLoading}
                className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Restore Records</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

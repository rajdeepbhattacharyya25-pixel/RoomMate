import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Loader2,
  HardDrive,
  Info,
  Share2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { User } from '../../../../types';
import { StrictPinInput } from '../../../common/StrictPinInput';
import { createEncryptedBackup } from '../../../../lib/storage/backupCryptoService';
import { generateBackupFileName, shareOrDownloadBackup } from '../../../../lib/storage/shareBackupService';
import {
  GoogleDriveAccount,
  getStoredGoogleDriveAccounts,
  storeGoogleDriveAccount,
  removeGoogleDriveAccount,
  getLastUsedGoogleDriveAccount,
  requestGoogleDriveAuthorization,
  uploadBackupToGoogleDrive,
  getGoogleClientId,
} from '../../../../lib/services/googleDriveService';
import { hapticSuccess, hapticWarning, hapticImpact, hapticSelection } from '../../../../lib/native/haptics';
import { useBackButton } from '../../../../lib/native/backButton';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onShowToast,
}) => {
  // Dismiss Google Drive backup modal on Android hardware back button
  useBackButton(onClose, isOpen);

  const [accounts, setAccounts] = useState<GoogleDriveAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<GoogleDriveAccount | null>(null);
  const [showRecentAccounts, setShowRecentAccounts] = useState<boolean>(false);
  const [pin, setPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');

  const clientId = getGoogleClientId();
  const hasClientId = Boolean(clientId);

  useEffect(() => {
    if (!isOpen) return;
    const stored = getStoredGoogleDriveAccounts();
    const lastUsed = getLastUsedGoogleDriveAccount();

    setAccounts(stored);
    if (stored.length > 0) {
      setActiveAccount(lastUsed || stored[0]);
    } else {
      // Default initial destination placeholder from profile
      const defaultEmail = currentUser.email?.includes('@') ? currentUser.email : 'Google Account';
      setActiveAccount({
        email: defaultEmail,
        name: currentUser.name,
        lastUsed: new Date().toISOString(),
      });
    }

    const defaultPin =
      (typeof localStorage !== 'undefined' &&
        (localStorage.getItem(`roommate_vault_pin_${currentUser.id}`) ||
          localStorage.getItem('roommate_vault_pin'))) ||
      '';
    setPin(defaultPin);
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  // Handle switching to a different account via Google OAuth select_account prompt
  const handleChangeGoogleAccount = async () => {
    if (!hasClientId) {
      hapticWarning();
      onShowToast('Google Client ID is not configured. Use the native Share Sheet below to choose any Drive account.');
      return;
    }

    setIsSwitchingAccount(true);
    hapticImpact('LIGHT');

    try {
      // Force account picker prompt to allow user to pick any personal or work account
      const authResult = await requestGoogleDriveAuthorization();

      if (authResult.cancelled) {
        onShowToast('Account selection cancelled.');
        return;
      }

      if (!authResult.success || !authResult.account) {
        throw new Error(authResult.error || 'Failed to select Google account');
      }

      // Save new account as default active destination and update remembered accounts list
      storeGoogleDriveAccount(authResult.account);
      const updatedAccounts = getStoredGoogleDriveAccounts();
      setAccounts(updatedAccounts);
      setActiveAccount(authResult.account);
      setShowRecentAccounts(false);

      await hapticSuccess();
      onShowToast(`Backup destination set to: ${authResult.account.email}`);
    } catch (err) {
      console.warn('Account selection error:', err);
      hapticWarning();
      onShowToast(err instanceof Error ? err.message : 'Could not change account');
    } finally {
      setIsSwitchingAccount(false);
    }
  };

  // Quick switch to a previously remembered account
  const handleSelectRecentAccount = (acc: GoogleDriveAccount) => {
    hapticSelection();
    setActiveAccount(acc);
    storeGoogleDriveAccount(acc);
    setShowRecentAccounts(false);
    onShowToast(`Switched destination to ${acc.email}`);
  };

  // Remove account from saved history
  const handleRemoveAccount = (email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticImpact('LIGHT');
    removeGoogleDriveAccount(email);
    const updated = getStoredGoogleDriveAccounts();
    setAccounts(updated);

    if (activeAccount?.email.toLowerCase() === email.toLowerCase()) {
      if (updated.length > 0) {
        setActiveAccount(updated[0]);
      } else {
        setActiveAccount({
          email: currentUser.email || 'Google Account',
          name: currentUser.name,
          lastUsed: new Date().toISOString(),
        });
      }
    }
  };

  // Execute direct Google Drive upload (Option 1)
  const handleExecuteGoogleDriveBackup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length !== 4) {
      hapticWarning();
      onShowToast('Enter a valid 4-digit encryption PIN.');
      return;
    }

    if (!hasClientId) {
      hapticWarning();
      onShowToast('Google Client ID not configured. Please use System Share Sheet below.');
      return;
    }

    setIsLoading(true);
    setStatusText('Authorizing with Google...');

    try {
      const targetEmail = activeAccount?.email;
      const authResult = await requestGoogleDriveAuthorization(targetEmail);

      if (authResult.cancelled) {
        onShowToast('Google authorization cancelled.');
        setIsLoading(false);
        return;
      }

      if (!authResult.success || !authResult.token) {
        throw new Error(authResult.error || 'Failed to authenticate with Google');
      }

      if (authResult.account) {
        storeGoogleDriveAccount(authResult.account);
        setAccounts(getStoredGoogleDriveAccounts());
        setActiveAccount(authResult.account);
      }

      setStatusText('Encrypting vault data (AES-256)...');
      const envelope = await createEncryptedBackup(currentUser, pin);
      const fileName = generateBackupFileName(currentUser.name);

      setStatusText('Uploading to Google Drive...');
      const uploadResult = await uploadBackupToGoogleDrive(authResult.token, envelope, fileName);

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload backup to Google Drive');
      }

      await hapticSuccess();
      const accountDisplay = authResult.account?.email || targetEmail || 'Google Drive';
      onShowToast(`Backup saved to Google Drive (${accountDisplay})!`);
      onClose();
    } catch (err) {
      console.error('Google Drive backup error:', err);
      hapticWarning();
      onShowToast(err instanceof Error ? err.message : 'Google Drive backup failed');
    } finally {
      setIsLoading(false);
      setStatusText('');
    }
  };

  // Instant Native Android Share Sheet Fallback (Option 2)
  const handleFallbackShareSheet = async () => {
    if (pin.length !== 4) {
      hapticWarning();
      onShowToast('Enter a 4-digit PIN first.');
      return;
    }

    setIsLoading(true);
    try {
      const envelope = await createEncryptedBackup(currentUser, pin);
      const res = await shareOrDownloadBackup(envelope, currentUser.name, false);
      if (res.action === 'shared') {
        onShowToast('Backup sent to Share Sheet! Tap "Save to Drive".');
        onClose();
      } else if (res.action === 'downloaded') {
        onShowToast(`Downloaded backup file: ${res.fileName}`);
        onClose();
      }
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="w-full sm:max-w-md bg-white dark:bg-[#12121A] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-[#27354A] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-[#27354A]/60 bg-gradient-to-r from-indigo-50/60 to-white dark:from-indigo-950/20 dark:to-[#12121A]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Google Drive Backup</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Encrypted personal vault backup</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading || isSwitchingAccount}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1E2638] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleExecuteGoogleDriveBackup} className="p-4 space-y-4 overflow-y-auto">
          {/* STEP 1: Connected Account Card (Destination) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Connected Google Account
              </label>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/40">
                <CheckCircle2 className="w-3 h-3" />
                <span>Destination Confirmed</span>
              </span>
            </div>

            {/* Active Account Card */}
            <div className="p-3.5 rounded-2xl border border-indigo-200/90 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/30 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3 min-w-0">
                {activeAccount?.picture ? (
                  <img
                    src={activeAccount.picture}
                    alt=""
                    className="w-10 h-10 rounded-full border border-indigo-300 dark:border-indigo-700 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    {(activeAccount?.name || activeAccount?.email || 'G').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  {activeAccount?.name && (
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {activeAccount.name}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate font-medium">
                    {activeAccount?.email}
                  </p>
                </div>
              </div>

              {/* [ Change Google account ] Action Button */}
              <button
                type="button"
                onClick={handleChangeGoogleAccount}
                disabled={isSwitchingAccount || isLoading}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-white dark:bg-[#1C1C25] hover:bg-slate-50 dark:hover:bg-[#252532] border border-slate-200/90 dark:border-[#27354A] text-indigo-600 dark:text-indigo-400 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-2xs"
              >
                {isSwitchingAccount ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Opening...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Change</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Switch Dropdown if multiple remembered accounts exist */}
            {accounts.length > 1 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowRecentAccounts((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-1"
                >
                  <span>Switch to previously connected account ({accounts.length})</span>
                  {showRecentAccounts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showRecentAccounts && (
                  <div className="mt-2 space-y-1.5 p-2 rounded-xl bg-slate-50 dark:bg-[#181820] border border-slate-200/80 dark:border-[#27354A] animate-in fade-in duration-150">
                    {accounts.map((acc) => {
                      const isCurrent = activeAccount?.email.toLowerCase() === acc.email.toLowerCase();
                      return (
                        <div
                          key={acc.email}
                          onClick={() => handleSelectRecentAccount(acc)}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isCurrent
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold'
                              : 'hover:bg-white dark:hover:bg-[#20202A] text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate text-xs">
                            <span className="truncate">{acc.email}</span>
                            {isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveAccount(acc.email, e)}
                            title="Remove from list"
                            className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Smart Notice if Google Client ID is not configured in .env */}
          {!hasClientId && (
            <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-[11px] uppercase tracking-wide">Direct Cloud Sync Notice</p>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  Direct in-app Google Drive sync requires <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-900/60 rounded text-[10px]">VITE_GOOGLE_CLIENT_ID</code>.
                  For instant zero-setup backup, tap <strong>Save to Drive via System Share Sheet</strong> below!
                </p>
              </div>
            </div>
          )}

          {/* Privacy & Scope Notice */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#181820] border border-slate-200/80 dark:border-[#27354A] flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-slate-300">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Privacy &amp; Minimal Permissions</p>
              <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                RoomMate only requests access to create its own encrypted backup file (<code className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">drive.file</code> scope). It <strong>cannot</strong> read, view, or modify any other files in your Google Drive.
              </p>
            </div>
          </div>

          {/* STEP 2: Backup Encryption PIN */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-0.5">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Backup Encryption PIN
              </label>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Required to restore later</span>
            </div>

            <StrictPinInput
              value={pin}
              onChange={setPin}
              autoFocus={false}
              showToggle={true}
              className="justify-center py-1"
            />
          </div>

          {/* STEP 3: Action Buttons */}
          <div className="pt-2 space-y-2.5">
            {/* Primary Option 1: Direct Cloud Backup */}
            <button
              type="submit"
              disabled={isLoading || isSwitchingAccount || pin.length !== 4}
              className={`w-full py-3 px-4 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm ${
                hasClientId
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-indigo-400 opacity-60 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{statusText || 'Processing...'}</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  <span>Authorize &amp; Backup to Google Drive</span>
                </>
              )}
            </button>

            {/* Seamless Native Fallback (Option 2) */}
            <div className="relative flex py-1 items-center justify-center">
              <div className="grow border-t border-slate-200 dark:border-[#27354A]"></div>
              <span className="shrink mx-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                OR INSTANT FALLBACK
              </span>
              <div className="grow border-t border-slate-200 dark:border-[#27354A]"></div>
            </div>

            <button
              type="button"
              onClick={handleFallbackShareSheet}
              disabled={isLoading || pin.length !== 4}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/90 dark:bg-[#1C1C25] dark:hover:bg-[#27354A] border border-slate-200/80 dark:border-[#27354A] text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all shadow-2xs"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Save to Drive via System Share Sheet</span>
            </button>
            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500">
              Recommended for Android • Select any Google account directly in your Drive app
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

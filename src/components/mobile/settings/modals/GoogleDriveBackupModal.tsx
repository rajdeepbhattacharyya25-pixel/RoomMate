import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Plus,
  Trash2,
  Loader2,
  HardDrive,
  Info,
  ExternalLink,
  Share2,
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
import { hapticSuccess, hapticWarning, hapticImpact } from '../../../../lib/native/haptics';

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
  const [accounts, setAccounts] = useState<GoogleDriveAccount[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [isAddNew, setIsAddNew] = useState<boolean>(false);
  const [newEmailInput, setNewEmailInput] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');

  const clientId = getGoogleClientId();

  useEffect(() => {
    if (!isOpen) return;
    const stored = getStoredGoogleDriveAccounts();
    const lastUsed = getLastUsedGoogleDriveAccount();

    setAccounts(stored);
    if (stored.length > 0) {
      setSelectedEmail(lastUsed ? lastUsed.email : stored[0].email);
      setIsAddNew(false);
    } else {
      // If user has a Google email or profile email, use that as default hint
      const defaultEmail = currentUser.email?.includes('@') ? currentUser.email : '';
      setSelectedEmail(defaultEmail);
      setIsAddNew(true);
      setNewEmailInput(defaultEmail);
    }

    const defaultPin =
      (typeof localStorage !== 'undefined' &&
        (localStorage.getItem(`roommate_vault_pin_${currentUser.id}`) ||
          localStorage.getItem('roommate_vault_pin'))) ||
      '';
    setPin(defaultPin);
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSelectAccount = (email: string) => {
    setSelectedEmail(email);
    setIsAddNew(false);
    hapticImpact('LIGHT');
  };

  const handleToggleAddNew = () => {
    setIsAddNew(true);
    setSelectedEmail('');
    hapticImpact('LIGHT');
  };

  const handleRemoveAccount = (email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeGoogleDriveAccount(email);
    const updated = getStoredGoogleDriveAccounts();
    setAccounts(updated);
    if (selectedEmail.toLowerCase() === email.toLowerCase()) {
      if (updated.length > 0) {
        setSelectedEmail(updated[0].email);
        setIsAddNew(false);
      } else {
        setSelectedEmail('');
        setIsAddNew(true);
      }
    }
    hapticImpact('LIGHT');
  };

  const handleExecuteGoogleDriveBackup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length !== 4) {
      hapticWarning();
      onShowToast('Enter a valid 4-digit encryption PIN.');
      return;
    }

    const targetEmail = isAddNew ? newEmailInput.trim() : selectedEmail;
    if (isAddNew && !targetEmail) {
      // If adding new account, email can be empty (Google prompt will ask)
    }

    setIsLoading(true);
    setStatusText('Authorizing with Google...');

    try {
      // 1. Request OAuth authorization with prompt: 'select_account'
      const authResult = await requestGoogleDriveAuthorization(targetEmail);

      if (authResult.cancelled) {
        onShowToast('Google authorization cancelled.');
        setIsLoading(false);
        return;
      }

      if (!authResult.success || !authResult.token) {
        throw new Error(authResult.error || 'Failed to authenticate with Google');
      }

      // Update accounts list if newly authorized
      if (authResult.account) {
        storeGoogleDriveAccount(authResult.account);
        setAccounts(getStoredGoogleDriveAccounts());
        setSelectedEmail(authResult.account.email);
        setIsAddNew(false);
      }

      // 2. Encrypt the backup envelope with the user's PIN
      setStatusText('Encrypting vault data (AES-256)...');
      const envelope = await createEncryptedBackup(currentUser, pin);
      const fileName = generateBackupFileName(currentUser.name);

      // 3. Upload to Google Drive API v3
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
        onShowToast('Backup sent to Share Sheet! Select "Save to Drive".');
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
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Google Drive Backup</h2>
              <p className="text-[11px] text-slate-500">Choose destination Google account</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleExecuteGoogleDriveBackup} className="p-4 space-y-4 overflow-y-auto">
          {/* Account Selection Card */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Google Account
            </label>

            {accounts.length > 0 && (
              <div className="space-y-1.5">
                {accounts.map((acc) => {
                  const isSelected = !isAddNew && selectedEmail.toLowerCase() === acc.email.toLowerCase();
                  return (
                    <div
                      key={acc.email}
                      onClick={() => handleSelectAccount(acc.email)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {acc.picture ? (
                          <img
                            src={acc.picture}
                            alt=""
                            className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {acc.email.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          {acc.name && (
                            <p className="text-xs font-semibold text-slate-900 truncate">{acc.name}</p>
                          )}
                          <p className="text-[11px] text-slate-500 truncate">{acc.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                        <button
                          type="button"
                          onClick={(e) => handleRemoveAccount(acc.email, e)}
                          title="Remove from remembered accounts"
                          className="p-1 text-slate-300 hover:text-rose-500 rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Choose / Connect another account option */}
            <div
              onClick={handleToggleAddNew}
              className={`flex items-center gap-2.5 p-3 rounded-xl border border-dashed transition-all cursor-pointer ${
                isAddNew
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-700'
                  : 'border-slate-300 hover:border-slate-400 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold">Choose another Google account...</p>
                <p className="text-[10px] text-slate-400">
                  Select any personal or work account during Google sign-in
                </p>
              </div>
            </div>

            {isAddNew && (
              <div className="pt-1">
                <input
                  type="email"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="Optional: Enter account hint (e.g. yourname@gmail.com)"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          {/* Scopes & Privacy Notice */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2 text-[11px] text-slate-600">
            <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-700">Privacy &amp; Minimal Permissions</p>
              <p className="leading-normal">
                RoomMate only requests access to create and manage its own backup files (<code>drive.file</code> scope). It <strong>cannot</strong> read, view, or modify any other files in your Google Drive.
              </p>
            </div>
          </div>

          {/* Encryption PIN */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Backup Encryption PIN
              </label>
              <span className="text-[10px] text-slate-500">Required to restore later</span>
            </div>

            <StrictPinInput
              value={pin}
              onChange={setPin}
              disabled={isLoading}
              autoFocus={false}
              className="justify-center py-1"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isLoading || pin.length !== 4}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50 shadow-sm"
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

            {/* Alternative Direct Share Sheet (Always available as instant companion) */}
            <button
              type="button"
              onClick={handleFallbackShareSheet}
              disabled={isLoading || pin.length !== 4}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Save to Drive via System Share Sheet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

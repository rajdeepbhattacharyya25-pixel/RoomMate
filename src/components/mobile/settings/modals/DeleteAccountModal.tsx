import React, { useState } from 'react';
import { AlertTriangle, X, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { hapticWarning, hapticSuccess } from '../../../../lib/native/haptics';
import { deleteUserAccountCloud } from '../../../../lib/storage/cloudStorageAdapter';

interface DeleteAccountModalProps {
  isOpen: boolean;
  userId: string;
  onClose: () => void;
  onConfirmDelete: () => void;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen,
  userId,
  onClose,
  onConfirmDelete,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    if (confirmText.trim() !== 'DELETE') {
      hapticWarning();
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const result = await deleteUserAccountCloud(userId);
      if (!result.success && result.error) {
        setErrorMessage(result.error);
        hapticWarning();
        setIsDeleting(false);
        return;
      }

      await hapticSuccess();
      onConfirmDelete();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account';
      setErrorMessage(msg);
      hapticWarning();
      setIsDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 animate-in slide-in-from-bottom-6 duration-200"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="delete-account-title" className="text-sm font-bold text-slate-900">Delete Account?</h3>
              <p className="text-[11px] text-slate-500">Permanent and irreversible action</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/80 text-xs text-rose-900 leading-relaxed space-y-1.5">
          <p className="font-semibold text-rose-950">This action permanently deletes your account:</p>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-800">
            <li>Erases authentication credentials and identity profile</li>
            <li>Purges private expense vault and subscription history</li>
            <li>Removes your membership across all shared rooms</li>
            <li>Transfers room leadership to remaining roommates</li>
          </ul>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label htmlFor="confirm-delete-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Type <span className="font-mono font-bold text-rose-600">DELETE</span> to confirm:
          </label>
          <input
            id="confirm-delete-input"
            type="text"
            value={confirmText}
            disabled={isDeleting}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoCapitalize="characters"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-rose-500 disabled:opacity-60"
          />
        </div>

        <div className="flex items-center space-x-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={confirmText.trim() !== 'DELETE' || isDeleting}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting Account...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Forever</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

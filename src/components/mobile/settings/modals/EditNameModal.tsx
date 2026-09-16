import React, { useState, useEffect, useRef } from 'react';
import { User as UserIcon, X, Loader2, Check } from 'lucide-react';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { updateProfileName } from '../../../../lib/storage/cloudStorageAdapter';
import { User } from '../../../../types';

interface EditNameModalProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onSaved: (newName: string) => void;
}

export const EditNameModal: React.FC<EditNameModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState(currentUser.name);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentUser.name);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, currentUser.name]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter your full name.');
      hapticWarning();
      return;
    }
    if (cleanName.length < 2) {
      setError('Name must be at least 2 characters.');
      hapticWarning();
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const success = await updateProfileName(currentUser.id, cleanName);
      if (success) {
        await hapticSuccess();
        onSaved(cleanName);
        onClose();
      } else {
        setError("Couldn't update your name. Please try again.");
        hapticWarning();
      }
    } catch {
      setError("Couldn't update your name. Please try again.");
      hapticWarning();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-name-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 animate-in slide-in-from-bottom-6 duration-200"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <UserIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="edit-name-title" className="text-sm font-bold text-slate-900">Edit Name</h3>
              <p className="text-[11px] text-slate-500">Your display name for roommates</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label htmlFor="full-name-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Full Name
            </label>
            <input
              id="full-name-input"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              disabled={isSaving}
              placeholder="e.g. Rajdeep Bhattacharyya"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
            {error && (
              <p className="text-[11px] text-rose-600 font-medium mt-1.5">{error}</p>
            )}
          </div>

          <div className="flex items-center space-x-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

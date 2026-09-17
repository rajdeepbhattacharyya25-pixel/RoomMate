import React, { useState, useEffect, useRef } from 'react';
import { AtSign, X, Check, AlertCircle } from 'lucide-react';
import { hapticSuccess, hapticWarning } from '../../../../lib/native/haptics';
import { User } from '../../../../types';
import { PrefixInput } from '../../../common/PrefixInput';

interface EditUsernameModalProps {
  isOpen: boolean;
  currentUser: User;
  currentUsername: string;
  onClose: () => void;
  onSaved: (newUsername: string) => void;
}

export const EditUsernameModal: React.FC<EditUsernameModalProps> = ({
  isOpen,
  currentUser,
  currentUsername,
  onClose,
  onSaved,
}) => {
  const [username, setUsername] = useState(currentUsername.replace(/^@/, ''));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername.replace(/^@/, ''));
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, currentUsername]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = username.trim().toLowerCase();
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;

    if (!clean) {
      setError('Username cannot be empty.');
      hapticWarning();
      return;
    }
    if (!usernameRegex.test(clean)) {
      setError('Username must be 3-20 characters using letters, numbers, and underscores.');
      hapticWarning();
      return;
    }

    try {
      localStorage.setItem(`roommate_username_${currentUser.id}`, clean);
      hapticSuccess();
      onSaved(clean);
      onClose();
    } catch {
      setError("Couldn't save username. Please try again.");
      hapticWarning();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-username-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200/90 space-y-4 animate-in slide-in-from-bottom-6 duration-200"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
              <AtSign className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="edit-username-title" className="text-sm font-bold text-slate-900">Edit Username</h3>
              <p className="text-[11px] text-slate-500">Unique handle for your RoomMate identity</p>
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
            <label htmlFor="username-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Username Handle
            </label>
            <PrefixInput
              id="username-input"
              ref={inputRef}
              prefix="@"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''));
                if (error) setError(null);
              }}
              maxLength={20}
              placeholder="rajdeep_b"
              hasError={Boolean(error)}
            />
            {error && (
              <p className="text-[11px] text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!username.trim()}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Username</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

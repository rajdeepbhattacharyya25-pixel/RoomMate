import React from 'react';
import { Clock, X, Check } from 'lucide-react';
import { hapticSelection } from '../../../../lib/native/haptics';

interface LockTimeoutSheetProps {
  isOpen: boolean;
  currentTimeout: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}

const TIMEOUT_OPTIONS = [
  { value: 'immediate', label: 'Immediately upon exit', desc: 'Locks instantly whenever you leave RoomMate' },
  { value: '30s', label: 'After 30 seconds', desc: 'Allows brief multitasking without re-locking' },
  { value: '1m', label: 'After 1 minute', desc: 'Comfortable balance between security and convenience' },
  { value: '5m', label: 'After 5 minutes', desc: 'Recommended when frequently switching between apps' },
  { value: '10m', label: 'After 10 minutes', desc: 'Locks after longer periods of inactivity' },
];

export const LockTimeoutSheet: React.FC<LockTimeoutSheetProps> = ({
  isOpen,
  currentTimeout,
  onClose,
  onSelect,
}) => {
  if (!isOpen) return null;

  const handleSelect = (val: string) => {
    hapticSelection();
    onSelect(val);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-timeout-title"
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
              <Clock className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="lock-timeout-title" className="text-sm font-bold text-slate-900">App Lock Timeout</h3>
              <p className="text-[11px] text-slate-500">When should RoomMate require your PIN or biometrics?</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 pt-1">
          {TIMEOUT_OPTIONS.map((opt) => {
            const isSelected = currentTimeout === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`w-full min-h-[48px] p-3 rounded-xl border text-left flex items-center justify-between transition-all active:scale-[0.99] ${
                  isSelected
                    ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs'
                    : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 ml-2">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

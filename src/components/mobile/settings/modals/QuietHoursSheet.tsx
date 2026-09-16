import React, { useState, useEffect } from 'react';
import { Moon, X, Check } from 'lucide-react';
import { hapticSuccess } from '../../../../lib/native/haptics';

interface QuietHoursSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: { enabled: boolean; startTime: string; endTime: string }) => void;
}

export const QuietHoursSheet: React.FC<QuietHoursSheetProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [enabled, setEnabled] = useState(true);
  const [startTime, setStartTime] = useState('23:00');
  const [endTime, setEndTime] = useState('07:00');

  useEffect(() => {
    if (isOpen) {
      try {
        const raw = localStorage.getItem('roommate_quiet_hours');
        if (raw) {
          const parsed = JSON.parse(raw);
          setEnabled(Boolean(parsed.enabled));
          setStartTime(parsed.startTime || '23:00');
          setEndTime(parsed.endTime || '07:00');
        }
      } catch {
        // use defaults
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const config = { enabled, startTime, endTime };
    try {
      localStorage.setItem('roommate_quiet_hours', JSON.stringify(config));
    } catch {
      // ignore
    }
    hapticSuccess();
    onSave(config);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiet-hours-title"
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
              <Moon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 id="quiet-hours-title" className="text-sm font-bold text-slate-900">Quiet Hours</h3>
              <p className="text-[11px] text-slate-500">Mute non-urgent alert chimes while sleeping</p>
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

        <div className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/50 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-900">Enable Quiet Hours</div>
            <div className="text-[11px] text-slate-500">Silence chimes and vibration during set times</div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            aria-label="Toggle quiet hours"
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
              enabled ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
            }`}
          >
            <div className="bg-white w-4 h-4 rounded-full shadow-md" />
          </button>
        </div>

        {enabled && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label htmlFor="start-time-input" className="block text-xs font-semibold text-slate-700">
                Starts At
              </label>
              <input
                id="start-time-input"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="end-time-input" className="block text-xs font-semibold text-slate-700">
                Ends At
              </label>
              <input
                id="end-time-input"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        )}

        <div className="flex items-center space-x-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 active:scale-98 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-sm active:scale-98 transition-all"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Hours</span>
          </button>
        </div>
      </div>
    </div>
  );
};

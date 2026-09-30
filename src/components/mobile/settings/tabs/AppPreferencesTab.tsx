import React, { useState } from 'react';
import {
  Palette,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
  Trash2,
  Layers,
  Smartphone,
} from 'lucide-react';
import { hapticImpact, hapticSelection } from '../../../../lib/native/haptics';
import {
  isShakeDetectionEnabled,
  setShakeDetectionEnabled,
  getShakeSensitivity,
  setShakeSensitivity,
  ShakeSensitivity,
} from '../../../../lib/native/shakeDetector';
import { useTheme, ThemePreference } from '../../../../context/ThemeContext';

interface AppPreferencesTabProps {
  onShowToast: (msg: string) => void;
}

type ListDensity = 'standard' | 'compact';

export const AppPreferencesTab: React.FC<AppPreferencesTabProps> = ({ onShowToast }) => {
  // Global Theme Context
  const { theme, setTheme } = useTheme();

  // List Density
  const [density, setDensity] = useState<ListDensity>(() => {
    if (typeof localStorage === 'undefined') return 'standard';
    return (localStorage.getItem('roommate_list_density') as ListDensity) || 'standard';
  });

  // Shake to Report
  const [shakeEnabled, setShakeEnabled] = useState<boolean>(() => isShakeDetectionEnabled());
  const [shakeSensitivity, setShakeSensitivityState] = useState<ShakeSensitivity>(() => getShakeSensitivity());

  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);

  const handleSelectTheme = (selected: ThemePreference) => {
    hapticSelection();
    setTheme(selected);
    const label = selected === 'system' ? 'System Default' : selected === 'light' ? 'Light Mode' : 'Dark Mode';
    onShowToast(`Theme preference updated: ${label}`);
  };

  const handleSelectDensity = (selected: ListDensity) => {
    hapticSelection();
    setDensity(selected);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('roommate_list_density', selected);
    }
    onShowToast(`List display density set to: ${selected === 'compact' ? 'Compact' : 'Standard'}`);
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    hapticImpact('MEDIUM');
    try {
      // Clear temporary image cache or non-critical preview tokens
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          // ignore cache storage failure
        }
      }
      setTimeout(() => {
        setIsClearingCache(false);
        onShowToast('Local cache & image buffer cleared');
      }, 500);
    } catch {
      setIsClearingCache(false);
      onShowToast('Cache cleared');
    }
  };

  return (
    <div className="space-y-4">
      {/* Card 1: Appearance & Theme */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div className="flex items-center space-x-2">
          <Palette className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Appearance & Theme
          </h3>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Choose how RoomMate looks on your device:
        </p>

        <div className="grid grid-cols-3 gap-2 pt-1">
          {/* System */}
          <button
            type="button"
            onClick={() => handleSelectTheme('system')}
            className={`p-3 rounded-xl border text-center transition-all active:scale-95 ${
              theme === 'system'
                ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-500 shadow-xs'
                : 'bg-white dark:bg-[#1C1C25] border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
            }`}
          >
            <div className="w-7 h-7 mx-auto rounded-lg bg-slate-100 dark:bg-[#20202A] flex items-center justify-center text-slate-600 dark:text-slate-300 mb-1.5">
              <Monitor className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">System</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Auto match</div>
          </button>

          {/* Light */}
          <button
            type="button"
            onClick={() => handleSelectTheme('light')}
            className={`p-3 rounded-xl border text-center transition-all active:scale-95 ${
              theme === 'light'
                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 dark:border-amber-500 ring-1 ring-amber-500 shadow-xs'
                : 'bg-white dark:bg-[#1C1C25] border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
            }`}
          >
            <div className="w-7 h-7 mx-auto rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-700 dark:text-amber-400 mb-1.5">
              <Sun className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Light</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Always crisp</div>
          </button>

          {/* Dark */}
          <button
            type="button"
            onClick={() => handleSelectTheme('dark')}
            className={`p-3 rounded-xl border text-center transition-all active:scale-95 ${
              theme === 'dark'
                ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-500 shadow-xs'
                : 'bg-white dark:bg-[#1C1C25] border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
            }`}
          >
            <div className={`w-7 h-7 mx-auto rounded-lg flex items-center justify-center mb-1.5 ${
              theme === 'dark' ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-[#20202A] text-slate-700 dark:text-slate-300'
            }`}>
              <Moon className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Dark</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Low glare</div>
          </button>
        </div>
      </div>

      {/* Card 2: Layout & List Density */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            List Density
          </h3>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Adjust row height and spacing across expense ledgers:
        </p>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => handleSelectDensity('standard')}
            className={`p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
              density === 'standard'
                ? 'bg-slate-50 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-500/30'
                : 'bg-white dark:bg-[#1C1C25] border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Standard</span>
              {density === 'standard' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Comfortable touch targets with complete metadata
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleSelectDensity('compact')}
            className={`p-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
              density === 'compact'
                ? 'bg-slate-50 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-500/30'
                : 'bg-white dark:bg-[#1C1C25] border-slate-200 dark:border-[#27354A] hover:bg-slate-50 dark:hover:bg-[#20202A]'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Compact</span>
              {density === 'compact' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Higher information density with minimal vertical padding
            </p>
          </button>
        </div>
      </div>

      {/* Card 3: Shake to Report Bug */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Shake to Report
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs pt-1">
              Shake your device anywhere in the app to instantly open the bug reporting and feedback window.
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
            <input
              type="checkbox"
              checked={shakeEnabled}
              onChange={(e) => {
                const val = e.target.checked;
                setShakeEnabled(val);
                setShakeDetectionEnabled(val);
                hapticSelection();
                onShowToast(val ? 'Shake to report enabled' : 'Shake to report disabled');
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {shakeEnabled && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Motion Sensitivity</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {shakeSensitivity === 'low'
                  ? 'Firm (Zero false triggers)'
                  : shakeSensitivity === 'high'
                  ? 'Gentle (Light movement)'
                  : 'Standard (Balanced)'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/80 dark:bg-[#20202A] rounded-xl border border-slate-200/60 dark:border-[#27354A]">
              <button
                type="button"
                onClick={() => {
                  setShakeSensitivityState('low');
                  setShakeSensitivity('low');
                  hapticSelection();
                  onShowToast('Shake sensitivity set to: Firm (Walking-Safe)');
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  shakeSensitivity === 'low'
                    ? 'bg-white dark:bg-[#181820] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Firm
              </button>

              <button
                type="button"
                onClick={() => {
                  setShakeSensitivityState('medium');
                  setShakeSensitivity('medium');
                  hapticSelection();
                  onShowToast('Shake sensitivity set to: Standard');
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  shakeSensitivity === 'medium'
                    ? 'bg-white dark:bg-[#181820] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Standard
              </button>

              <button
                type="button"
                onClick={() => {
                  setShakeSensitivityState('high');
                  setShakeSensitivity('high');
                  hapticSelection();
                  onShowToast('Shake sensitivity set to: Gentle');
                }}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                  shakeSensitivity === 'high'
                    ? 'bg-white dark:bg-[#181820] text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Gentle
              </button>
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
              {shakeSensitivity === 'low' &&
                'Requires a deliberate, firm double-shake. Recommended if you walk, jog, or carry your phone in your pocket.'}
              {shakeSensitivity === 'medium' &&
                'Requires 3 rhythmic back-and-forth oscillations. Immune to tilting, walking steps, and setting on desk.'}
              {shakeSensitivity === 'high' &&
                'Requires less force to trigger. Recommended if you have limited wrist mobility.'}
            </p>
          </div>
        )}
      </div>

      {/* Card 4: Cache Storage Maintenance */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-150">
        <div className="flex items-center space-x-2">
          <Trash2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Storage & Cache Maintenance
          </h3>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Clear temporary image cache and service worker assets without affecting your offline database records or login credentials.
        </p>

        <button
          type="button"
          onClick={handleClearCache}
          disabled={isClearingCache}
          className="w-full py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-[#20202A] hover:bg-slate-200 dark:hover:bg-[#282836] text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{isClearingCache ? 'Cleaning Buffers...' : 'Clear Cached Assets'}</span>
        </button>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Bell,
  Receipt,
  Handshake,
  MessageCircle,
  Volume2,
  ShieldCheck,
} from 'lucide-react';
import {
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
} from '../../lib/services/notificationService';
import { playNotificationSound } from '../../lib/native/notificationSound';
import { hapticImpact, hapticSelection } from '../../lib/native/haptics';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [testSoundPlayed, setTestSoundPlayed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(getNotificationSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = (key: keyof NotificationSettings) => {
    if (key === 'highPriorityAlerts') return; // Locked safeguard

    hapticSelection();
    const updated = {
      ...settings,
      [key]: !settings[key],
    };
    setSettings(updated);
    saveNotificationSettings(updated);
  };

  const handleTestSound = () => {
    hapticImpact('LIGHT');
    playNotificationSound();
    setTestSoundPlayed(true);
    setTimeout(() => setTestSoundPlayed(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#12121A] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#27354A] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 dark:border-[#27354A]/60 flex items-center justify-between bg-slate-50/50 dark:bg-[#181820]/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-[#20202A] border border-indigo-200 dark:border-[#27354A] flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Notification Settings</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure alert priorities and sound</p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticImpact('LIGHT');
              onClose();
            }}
            className="p-1.5 rounded-full hover:bg-slate-200/60 dark:hover:bg-[#20202A] text-slate-500 dark:text-slate-400 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Safeguard Alert Notice */}
          <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex items-start gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>Financial Safeguard Active:</strong> Critical debt settlements, overdue balances, and room join requests always notify you immediately.
            </span>
          </div>

          {/* Setting 1: High Priority (Locked) */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#27354A] bg-slate-50/70 dark:bg-[#181820] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-bold text-slate-900 dark:text-white">High-Priority Financial Alerts</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase bg-slate-200 dark:bg-[#27354A] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  Locked
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Overdue debts, room approval requests, and security verifications.
              </p>
            </div>

            <div className="w-11 h-6 rounded-full bg-indigo-600 flex items-center justify-end px-1 opacity-75 cursor-not-allowed">
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </div>
          </div>

          {/* Setting 2: Shared Bills */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#27354A] bg-white dark:bg-[#1C1C25] flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">Shared Room Bills</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Alerts when roommates add new Wi-Fi, electricity, or grocery bills.
              </p>
            </div>

            <button
              onClick={() => handleToggle('sharedBills')}
              className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors ${
                settings.sharedBills ? 'bg-indigo-600 justify-end' : 'bg-slate-200 dark:bg-[#27354A] justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          {/* Setting 3: Settlements */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#27354A] bg-white dark:bg-[#1C1C25] flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <Handshake className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">UPI & Cash Settlements</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Confirmations when a flatmate settles up their debt with you.
              </p>
            </div>

            <button
              onClick={() => handleToggle('settlements')}
              className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors ${
                settings.settlements ? 'bg-indigo-600 justify-end' : 'bg-slate-200 dark:bg-[#27354A] justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          {/* Setting 4: WhatsApp Nudges */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#27354A] bg-white dark:bg-[#1C1C25] flex items-center justify-between gap-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">Roommate Reminders & Nudges</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Reminders sent by roommates for pending room balances.
              </p>
            </div>

            <button
              onClick={() => handleToggle('nudges')}
              className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors ${
                settings.nudges ? 'bg-indigo-600 justify-end' : 'bg-slate-200 dark:bg-[#27354A] justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          {/* Setting 5: Sound & Chime */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#27354A] bg-white dark:bg-[#1C1C25] space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Notification Chime Sound</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  Play RoomMate notification chime when new notifications arrive.
                </p>
              </div>

              <button
                onClick={() => handleToggle('soundEnabled')}
                className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors ${
                  settings.soundEnabled ? 'bg-indigo-600 justify-end' : 'bg-slate-200 dark:bg-[#27354A] justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
              </button>
            </div>

            {settings.soundEnabled && (
              <div className="pt-2 border-t border-slate-100 dark:border-[#27354A]/60 flex justify-end">
                <button
                  onClick={handleTestSound}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-[#20202A] text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-[#27354A] border border-indigo-200 dark:border-[#27354A] flex items-center gap-1.5 transition-colors"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>{testSoundPlayed ? 'Playing...' : 'Test Sound Chime'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 dark:bg-[#181820] border-t border-slate-100 dark:border-[#27354A]/60 flex justify-end">
          <button
            onClick={() => {
              hapticImpact('LIGHT');
              onClose();
            }}
            className="px-4 py-2 bg-slate-900 dark:bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-slate-800 dark:hover:bg-indigo-700 transition-colors shadow-xs active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

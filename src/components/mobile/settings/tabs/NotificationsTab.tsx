import React, { useState, useEffect } from 'react';
import {
  Bell,
  Lock,
  Receipt,
  Handshake,
  MessageCircle,
  Volume2,
  VolumeX,
  Smartphone,
  Moon,
  Check,
  Loader2,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { User } from '../../../../types';
import {
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
} from '../../../../lib/services/notificationService';
import {
  isHapticsEnabled,
  setHapticsEnabled,
  hapticImpact,
  hapticSuccess,
  hapticSelection,
} from '../../../../lib/native/haptics';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  playNotificationSound,
} from '../../../../lib/native/notificationSound';
import { registerPushNotifications, getCachedFcmToken } from '../../../../lib/firebase/pushService';
import { QuietHoursSheet } from '../modals/QuietHoursSheet';

interface NotificationsTabProps {
  currentUser: User;
  onShowToast: (msg: string) => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [settings, setSettings] = useState<NotificationSettings>(() => getNotificationSettings());
  const [hapticsOn, setHapticsOn] = useState<boolean>(() => isHapticsEnabled());
  const [soundOn, setSoundOn] = useState<boolean>(() => isNotificationSoundEnabled());
  const [pushRegistered, setPushRegistered] = useState<boolean>(() => Boolean(getCachedFcmToken()));
  const [isRegisteringPush, setIsRegisteringPush] = useState<boolean>(false);
  const [testSoundPlayed, setTestSoundPlayed] = useState<boolean>(false);
  const [showQuietHours, setShowQuietHours] = useState<boolean>(false);

  // Quiet hours label
  const quietHoursConfig = typeof localStorage !== 'undefined'
    ? localStorage.getItem('roommate_quiet_hours')
    : null;
  const parsedQuiet = quietHoursConfig ? JSON.parse(quietHoursConfig) : null;
  const quietHoursLabel = parsedQuiet?.enabled
    ? `${parsedQuiet.start || '22:00'} – ${parsedQuiet.end || '07:00'}`
    : 'Disabled';

  useEffect(() => {
    const handleSettingsSync = () => {
      setHapticsOn(isHapticsEnabled());
      setSoundOn(isNotificationSoundEnabled());
      setSettings(getNotificationSettings());
    };

    window.addEventListener('roommate_haptics_changed', handleSettingsSync);
    window.addEventListener('roommate_sound_changed', handleSettingsSync);
    window.addEventListener('roommate_settings_changed', handleSettingsSync);

    return () => {
      window.removeEventListener('roommate_haptics_changed', handleSettingsSync);
      window.removeEventListener('roommate_sound_changed', handleSettingsSync);
      window.removeEventListener('roommate_settings_changed', handleSettingsSync);
    };
  }, []);

  const handleToggleSetting = (key: keyof NotificationSettings) => {
    if (key === 'highPriorityAlerts') return; // Locked safeguard
    hapticSelection();
    const updated = {
      ...settings,
      [key]: !settings[key],
    };
    setSettings(updated);
    saveNotificationSettings(updated);
    onShowToast(`Updated: ${key}`);
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotificationSoundEnabled(next);
    const updated = { ...settings, soundEnabled: next };
    setSettings(updated);
    saveNotificationSettings(updated);
    if (next) {
      playNotificationSound();
      onShowToast('Notification chime sound enabled');
    } else {
      onShowToast('Notification sounds muted');
    }
  };

  const handleToggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    if (next) {
      hapticImpact('LIGHT');
      onShowToast('Tactile haptic vibrations enabled');
    } else {
      onShowToast('Haptic vibrations disabled');
    }
  };

  const handleTestChime = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticImpact('LIGHT');
    playNotificationSound();
    setTestSoundPlayed(true);
    setTimeout(() => setTestSoundPlayed(false), 1500);
  };

  const handleRegisterPush = async () => {
    setIsRegisteringPush(true);
    try {
      const token = await registerPushNotifications(currentUser.id);
      if (token) {
        setPushRegistered(true);
        await hapticSuccess();
        onShowToast('Cross-device push alerts activated!');
      } else {
        onShowToast('Push alerts require Firebase credentials. Local chimes & foreground alerts are active.');
      }
    } catch {
      onShowToast('Could not register push notifications on this device.');
    } finally {
      setIsRegisteringPush(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Safeguard Alert Notice */}
      <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
        <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-950 leading-relaxed">
          <span className="font-bold">Financial Safeguard Guard:</span> Critical debt settlements, overdue balances, and room join requests always notify you in real-time.
        </div>
      </div>

      {/* Card 1: Alert Categories & Triggers */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Alert Categories
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {/* High Priority (Locked) */}
          <div className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-bold text-slate-900">High-Priority Alerts</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  Locked
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Overdue debts, room approval requests, and security verifications.
              </p>
            </div>

            <div className="w-11 h-6 rounded-full bg-indigo-600 flex items-center justify-end px-1 opacity-70 cursor-not-allowed shrink-0">
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </div>
          </div>

          {/* Shared Bills */}
          <div
            onClick={() => handleToggleSetting('sharedBills')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleSetting('sharedBills');
              }
            }}
            className="py-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition-colors"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Receipt className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-bold text-slate-900">Shared Room Bills</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Alerts when roommates add new Wi-Fi, electricity, or grocery expenses.
              </p>
            </div>

            <div
              className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${
                settings.sharedBills ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md" />
            </div>
          </div>

          {/* Settlements */}
          <div
            onClick={() => handleToggleSetting('settlements')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleSetting('settlements');
              }
            }}
            className="py-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition-colors"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Handshake className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900">UPI & Cash Settlements</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Confirmations when a flatmate settles up their debt with you.
              </p>
            </div>

            <div
              className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${
                settings.settlements ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md" />
            </div>
          </div>

          {/* WhatsApp / Roommate Nudges */}
          <div
            onClick={() => handleToggleSetting('nudges')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleSetting('nudges');
              }
            }}
            className="py-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition-colors"
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <MessageCircle className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-xs font-bold text-slate-900">Roommate Reminders & Nudges</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Friendly payment nudges and reminders from fellow room members.
              </p>
            </div>

            <div
              className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${
                settings.nudges ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Card 2: Audio, Tactile & Quiet Hours */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <Volume2 className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Feedback & Silence
          </h3>
        </div>

        <div className="divide-y divide-slate-100">
          {/* Notification Sound */}
          <div className="py-3 space-y-2">
            <div
              onClick={handleToggleSound}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleSound();
                }
              }}
              className="flex items-center justify-between gap-3 cursor-pointer select-none"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Notification Sound Chime</div>
                  <div className="text-[11px] text-slate-500">
                    Pleasant chime on bills & payment settlements
                  </div>
                </div>
              </div>

              <div
                className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${
                  soundOn ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md" />
              </div>
            </div>

            {soundOn && (
              <div className="pt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={handleTestChime}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>{testSoundPlayed ? 'Playing Chime...' : 'Test Chime'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Tactile Haptics */}
          <div
            onClick={handleToggleHaptics}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleHaptics();
              }
            }}
            className="py-3 flex items-center justify-between gap-3 cursor-pointer select-none"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Tactile Haptic Feedback</div>
                <div className="text-[11px] text-slate-500">
                  Subtle vibrations on taps, debt splits & approvals
                </div>
              </div>
            </div>

            <div
              className={`w-11 h-6 rounded-full flex items-center px-1 transition-colors shrink-0 ${
                hapticsOn ? 'bg-indigo-600 justify-end' : 'bg-slate-200 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md" />
            </div>
          </div>

          {/* Quiet Hours */}
          <div
            onClick={() => setShowQuietHours(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowQuietHours(true);
              }
            }}
            className="py-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Moon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Quiet Hours (DND)</div>
                <div className="text-[11px] text-slate-500">
                  Mute non-critical alerts during study or sleep
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-400">
              <span className="text-xs font-semibold text-slate-700 font-mono">
                {quietHoursLabel}
              </span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Cross-Device Push Notifications (FCM) */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
              <Bell className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Cross-Device Push Alerts</div>
              <div className="text-[11px] text-slate-500">
                Receive notifications even when RoomMate is closed
              </div>
            </div>
          </div>

          {pushRegistered ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">
              <Check className="w-3 h-3" />
              <span>Active</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleRegisterPush}
              disabled={isRegisteringPush}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-xs flex items-center gap-1.5 shrink-0"
            >
              {isRegisteringPush && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>{isRegisteringPush ? 'Enabling...' : 'Enable Push'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Quiet Hours Bottom Sheet */}
      <QuietHoursSheet
        isOpen={showQuietHours}
        onClose={() => setShowQuietHours(false)}
        onSave={() => {
          onShowToast('Quiet hours preferences updated');
        }}
      />
    </div>
  );
};

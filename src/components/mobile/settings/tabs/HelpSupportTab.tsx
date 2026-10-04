import React, { useState, useEffect } from 'react';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Mail,
  Phone,
  MessageSquare,
} from 'lucide-react';
import { User, PlatformSettings } from '../../../../types';
import { hapticSelection, hapticImpact } from '../../../../lib/native/haptics';
import { ShakeBugReportModal } from '../../ShakeBugReportModal';
import { db } from '../../../../lib/storage/mockStorage';

interface HelpSupportTabProps {
  currentUser: User;
  platformSettings?: PlatformSettings;
  onShowToast: (msg: string) => void;
}

interface FaqItem {
  id: string;
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    id: 'splits',
    q: 'How do room debt splits work?',
    a: 'When an expense is recorded in a room, RoomMate uses greedy debt simplification algorithms. Instead of everyone paying each other separately, debts are netted out so the minimum number of UPI transfers settles everyone completely.',
  },
  {
    id: 'nudges',
    q: 'What if a flatmate delays settlement?',
    a: 'You can tap the WhatsApp Nudge icon next to any pending balance on the room ledger to send a pre-filled, polite reminder with the exact amount and your UPI payment link.',
  },
  {
    id: 'offline',
    q: 'Can I add expenses with poor campus Wi-Fi?',
    a: 'Yes! RoomMate is built offline-first. Any bill or settlement recorded without an internet connection is saved into your device vault and automatically replayed to the cloud once you reconnect.',
  },
  {
    id: 'qr',
    q: 'Is uploading my UPI QR safe?',
    a: 'Yes. Your UPI QR code only contains your public Virtual Payment Address (VPA) and NPCI routing instructions for receiving money. RoomMate never asks for or stores banking passwords, ATM PINs, or card CVVs.',
  },
];

export const HelpSupportTab: React.FC<HelpSupportTabProps> = ({
  currentUser,
  platformSettings,
  onShowToast,
}) => {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [liveSettings, setLiveSettings] = useState<PlatformSettings>(
    platformSettings || db.getPlatformSettings()
  );

  useEffect(() => {
    if (platformSettings) {
      setLiveSettings(platformSettings);
    }
  }, [platformSettings]);

  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<PlatformSettings>;
      if (customEvent.detail) {
        setLiveSettings((prev) => ({ ...prev, ...customEvent.detail }));
      } else {
        setLiveSettings(db.getPlatformSettings());
      }
    };

    window.addEventListener('roommate_platform_settings_updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('roommate_platform_settings_updated', handleSettingsUpdate);
    };
  }, []);

  const effectiveEmail = (liveSettings.supportEmail || 'support@roommate.app').trim();
  const effectivePhone = (liveSettings.supportPhone || '').trim();

  const toggleFaq = (id: string) => {
    hapticSelection();
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {/* Card 1: Frequently Asked Questions */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <HelpCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Frequently Asked Questions
          </h3>
        </div>

        <div className="space-y-2 divide-y divide-slate-100 dark:divide-[#27354A] pt-1">
          {FAQS.map((faq) => {
            const isExpanded = expandedFaq === faq.id;
            return (
              <div key={faq.id} className="pt-2.5 first:pt-0">
                <button
                  type="button"
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full flex items-center justify-between text-left py-1 group"
                >
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors pr-2">
                    {faq.q}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                {isExpanded && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed pt-1.5 pb-1 animate-in fade-in">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 2: Report a Problem Modal Trigger */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
              Encountered a Glitch?
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Submit bug reports with diagnostic screenshots
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          If debt numbers don&apos;t align, an image upload fails, or notifications misbehave, let our engineering team know directly.
        </p>

        <button
          type="button"
          onClick={() => {
            hapticImpact('LIGHT');
            setShowReportModal(true);
          }}
          className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#20202A] dark:hover:bg-[#252532] text-slate-800 dark:text-slate-200 dark:border dark:border-[#27354A] text-xs font-semibold flex items-center justify-center gap-2 active:scale-98 transition-all"
        >
          <MessageSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Report an Issue or Suggest Feature</span>
        </button>
      </div>

      {/* Card 3: Direct Support Channels — Dynamically Reflects SuperAdmin Dashboard Configuration */}
      <div className="rounded-2xl bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-[#27354A] p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            Direct Support Channels
          </h4>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#20202A] border border-slate-200/70 dark:border-[#27354A] space-y-2 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400 text-[10px] font-medium">Developer & Support Desk</div>
            <a
              href={`mailto:${effectiveEmail}?subject=Resident%20Support%20Request`}
              className="font-mono text-slate-900 dark:text-slate-100 font-semibold select-all block hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {effectiveEmail}
            </a>
          </div>

          {effectivePhone && (
            <div className="pt-1 border-t border-slate-200/60 dark:border-[#27354A]">
              <div className="text-slate-500 dark:text-slate-400 text-[10px] font-medium">Helpline Support Phone</div>
              <a
                href={`tel:${effectivePhone.replace(/[\s()-]/g, '')}`}
                className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5 hover:underline mt-0.5"
              >
                <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>{effectivePhone}</span>
              </a>
            </div>
          )}

          <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1">
            Resident inquiries answered within 24 hours.
          </p>
        </div>
      </div>

      {/* Report Problem / Feedback Modal */}
      <ShakeBugReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        currentUser={currentUser}
        currentRoute="settings_help"
        onReportSubmitted={() => {
          onShowToast('Report submitted! Thank you for helping improve RoomMate.');
        }}
      />
    </div>
  );
};

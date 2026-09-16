import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  CreditCard,
  Zap,
  Shield,
  FileSpreadsheet,
  QrCode,
  Users,
} from 'lucide-react';
import { UserSubscription } from '../../../../types';
import { hapticImpact } from '../../../../lib/native/haptics';

interface MembershipTabProps {
  subscription?: UserSubscription;
  onUpgradePlan?: (planCode: 'PRO' | 'CAMPUS_MAX') => void;
  onShowToast: (msg: string) => void;
}

const PRO_PERKS = [
  {
    icon: Users,
    title: 'Unlimited Rooms & Flatmates',
    desc: 'Join and manage multiple flats or campus apartments without limit',
  },
  {
    icon: QrCode,
    title: 'Direct UPI QR Settlements',
    desc: 'Roommates scan your personalized QR code to settle debts instantly',
  },
  {
    icon: FileSpreadsheet,
    title: 'Multi-Format Financial Exports',
    desc: 'Download detailed monthly PDF statements, CSV, and Excel workbooks',
  },
  {
    icon: Shield,
    title: 'Cloud Backup & Offline Sync',
    desc: 'Row-level encrypted cloud backup with automatic offline queue replay',
  },
  {
    icon: Zap,
    title: 'Zero Ads & Priority Latency',
    desc: 'Lightning-fast ledger updates and real-time push notifications',
  },
];

export const MembershipTab: React.FC<MembershipTabProps> = ({
  subscription,
  onUpgradePlan,
  onShowToast,
}) => {
  const isPro = subscription?.planCode === 'PRO' || subscription?.planCode === 'CAMPUS_MAX';

  const handleUpgrade = () => {
    hapticImpact('MEDIUM');
    if (onUpgradePlan) {
      onUpgradePlan('PRO');
    } else {
      onShowToast('Upgrade service initiated.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Current Plan Header Card */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isPro ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
            }`}>
              {isPro ? <Sparkles className="w-5 h-5 text-indigo-600" /> : <CreditCard className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900">
                  {isPro ? 'Resident Pro Plan' : 'Free Resident Tier'}
                </h3>
              </div>
              <p className="text-[11px] text-slate-500">
                {isPro ? 'Full access to all roommate features' : 'Basic student ledger access'}
              </p>
            </div>
          </div>

          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
              isPro
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {isPro ? 'PRO ACTIVE' : 'FREE'}
          </span>
        </div>

        {isPro ? (
          <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Membership Active & Cloud Synced</span>
            </div>
            <p className="text-[11px] text-slate-600">
              Billing renewal:{' '}
              <span className="font-semibold text-slate-800">
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Auto-renews monthly'}
              </span>{' '}
              • ₹49/month
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
            You are on the standard student plan. Upgrade to <strong>Resident Pro (₹49/mo)</strong> to unlock limitless rooms and advanced financial reports.
          </div>
        )}

        {!isPro && (
          <button
            type="button"
            onClick={handleUpgrade}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Upgrade to Resident Pro (₹49/mo)</span>
          </button>
        )}
      </div>

      {/* Perks Comparison Card */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Resident Pro Benefits
          </h4>
        </div>

        <div className="space-y-3 divide-y divide-slate-100">
          {PRO_PERKS.map((perk, idx) => {
            const Icon = perk.icon;
            return (
              <div key={idx} className={`pt-3 first:pt-0 flex items-start space-x-3`}>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>{perk.title}</span>
                    {isPro && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                    {perk.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

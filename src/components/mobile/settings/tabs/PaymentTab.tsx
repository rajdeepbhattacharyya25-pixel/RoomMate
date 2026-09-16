import React, { useState } from 'react';
import {
  CreditCard,
  Smartphone,
  Banknote,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  QrCode,
  Info,
} from 'lucide-react';
import { User } from '../../../../types';
import { UpiAppTarget } from '../../../../lib/payments/upiIntentService';
import { hapticImpact, hapticSelection } from '../../../../lib/native/haptics';

interface PaymentTabProps {
  currentUser: User;
  onShowToast: (msg: string) => void;
  onNavigateToAccount?: () => void;
}

interface UpiAppOption {
  id: UpiAppTarget;
  name: string;
  badge: string;
  scheme: string;
  iconBg: string;
  iconColor: string;
}

const UPI_APPS: UpiAppOption[] = [
  {
    id: 'generic',
    name: 'Auto / OS Intent Chooser',
    badge: 'Recommended',
    scheme: 'upi://pay',
    iconBg: 'bg-emerald-50 text-emerald-600',
    iconColor: 'border-emerald-200',
  },
  {
    id: 'gpay',
    name: 'Google Pay (Tez)',
    badge: 'Direct Launch',
    scheme: 'tez://upi/pay',
    iconBg: 'bg-blue-50 text-blue-600',
    iconColor: 'border-blue-200',
  },
  {
    id: 'phonepe',
    name: 'PhonePe',
    badge: 'Direct Launch',
    scheme: 'phonepe://pay',
    iconBg: 'bg-purple-50 text-purple-600',
    iconColor: 'border-purple-200',
  },
  {
    id: 'paytm',
    name: 'Paytm UPI',
    badge: 'Direct Launch',
    scheme: 'paytmmp://pay',
    iconBg: 'bg-sky-50 text-sky-600',
    iconColor: 'border-sky-200',
  },
];

export const PaymentTab: React.FC<PaymentTabProps> = ({
  currentUser,
  onShowToast,
  onNavigateToAccount,
}) => {
  // Default payment mode (UPI vs CASH)
  const [defaultMethod, setDefaultMethod] = useState<'UPI' | 'CASH'>(() => {
    if (typeof localStorage === 'undefined') return 'UPI';
    return (localStorage.getItem('roommate_default_payment_method') as 'UPI' | 'CASH') || 'UPI';
  });

  // Preferred UPI App target
  const [preferredApp, setPreferredApp] = useState<UpiAppTarget>(() => {
    if (typeof localStorage === 'undefined') return 'generic';
    return (localStorage.getItem('roommate_preferred_upi_app') as UpiAppTarget) || 'generic';
  });

  const handleSelectDefaultMethod = (method: 'UPI' | 'CASH') => {
    hapticSelection();
    setDefaultMethod(method);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('roommate_default_payment_method', method);
    }
    onShowToast(`Default settlement mode set to: ${method === 'UPI' ? 'UPI Instant Pay' : 'Physical Cash'}`);
  };

  const handleSelectUpiApp = (app: UpiAppTarget) => {
    hapticImpact('LIGHT');
    setPreferredApp(app);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('roommate_preferred_upi_app', app);
    }
    const target = UPI_APPS.find((a) => a.id === app);
    onShowToast(`Preferred UPI app set to ${target?.name || app}`);
  };

  return (
    <div className="space-y-4">
      {/* Card 1: Default Settlement Method */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <CreditCard className="w-4 h-4 text-indigo-600" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Default Settlement Method
          </h3>
        </div>
        <p className="text-[11px] text-slate-500">
          Pre-selects your preferred payment channel when clearing debts with roommates:
        </p>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          {/* UPI Option */}
          <button
            type="button"
            onClick={() => handleSelectDefaultMethod('UPI')}
            className={`p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
              defaultMethod === 'UPI'
                ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500 shadow-xs'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                UPI
              </div>
              {defaultMethod === 'UPI' && (
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              )}
            </div>
            <div className="text-xs font-bold text-slate-900">UPI Instant</div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
              One-tap deep link to GPay, PhonePe, or Paytm
            </div>
          </button>

          {/* Cash Option */}
          <button
            type="button"
            onClick={() => handleSelectDefaultMethod('CASH')}
            className={`p-3 rounded-2xl border text-left transition-all active:scale-[0.98] ${
              defaultMethod === 'CASH'
                ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-500 shadow-xs'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                <Banknote className="w-4 h-4" />
              </div>
              {defaultMethod === 'CASH' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <div className="text-xs font-bold text-slate-900">Cash Handover</div>
            <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
              In-person cash settlement with manual confirmation
            </div>
          </button>
        </div>
      </div>

      {/* Card 2: Preferred UPI App Target */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Smartphone className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Preferred UPI App
            </h3>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">NPCI Standard</span>
        </div>
        <p className="text-[11px] text-slate-500 leading-snug">
          Choose which application launches automatically when you tap &quot;Pay via UPI&quot;:
        </p>

        <div className="space-y-2 pt-1">
          {UPI_APPS.map((app) => {
            const isSelected = preferredApp === app.id;
            return (
              <div
                key={app.id}
                onClick={() => handleSelectUpiApp(app.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectUpiApp(app.id);
                  }
                }}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer select-none transition-all active:scale-[0.99] ${
                  isSelected
                    ? 'bg-slate-50 border-indigo-400 ring-1 ring-indigo-500/20 shadow-2xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50/70'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-lg ${app.iconBg} flex items-center justify-center font-bold text-xs`}>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{app.name}</span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {app.badge}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Scheme: {app.scheme}
                    </div>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                    isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 3: QR Management Exclusivity Notice */}
      <div className="rounded-2xl bg-indigo-50/50 border border-indigo-100 p-4 space-y-2.5 shadow-2xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-950">
              Payment QR Code Location
            </h4>
            <p className="text-[11px] text-indigo-700">
              Housed securely under your Account Identity
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          Your personal UPI ID ({currentUser.upiId || 'Not set'}) and settlement QR image are managed exclusively in your Account tab to guarantee identity consistency across all rooms.
        </p>

        {onNavigateToAccount && (
          <button
            type="button"
            onClick={onNavigateToAccount}
            className="w-full py-2 px-3 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all shadow-2xs"
          >
            <span>View & Manage Payment QR in Account</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Card 4: Compliance & Digital Settlements */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-2.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Verified NPCI Compliance
          </h4>
        </div>
        <div className="text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
          <p className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>RoomMate uses standardized NPCI URI parameters (<code>cu=INR</code>, <code>pa</code>, <code>pn</code>, <code>am</code>).</span>
          </p>
          <p className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>Settlement receipts are digitally timestamped and exportable as cryptographic proof images.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

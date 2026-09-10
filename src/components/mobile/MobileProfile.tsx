import React from 'react';
import { User, UserSubscription } from '../../types';
import {
  CreditCard,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  LogOut,
  KeyRound,
} from 'lucide-react';

interface MobileProfileProps {
  currentUser: User;
  allUsers: User[];
  onSwitchUser: (user: User) => void;
  subscription?: UserSubscription;
  onUpgradePlan: (planCode: 'PRO' | 'CAMPUS_MAX') => void;
  onOpenSecurityAudit: () => void;
  onResetData: () => void;
  onLogout?: () => void;
}

export const MobileProfile: React.FC<MobileProfileProps> = ({
  currentUser,
  allUsers,
  onSwitchUser,
  subscription,
  onUpgradePlan,
  onOpenSecurityAudit,
  onResetData,
  onLogout,
}) => {
  const isPro = subscription?.planCode === 'PRO' || subscription?.planCode === 'CAMPUS_MAX';

  return (
    <div className="space-y-4 pb-28 px-4 pt-3 bg-[#F9F9FF] min-h-full">
      {/* Resident Identity Card */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 flex items-center space-x-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="w-13 h-13 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-xl shadow-xs">
          {currentUser.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-bold text-slate-900 truncate">{currentUser.name}</h1>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                currentUser.role === 'SUPER_ADMIN'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}
            >
              {currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'Resident'}
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate mt-0.5">{currentUser.email}</p>
          <div className="text-[11px] text-emerald-700 flex items-center gap-1.5 mt-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>UPI: {currentUser.name.toLowerCase().replace(/\s+/g, '')}@okaxis</span>
          </div>
        </div>
      </div>

      {/* Subscription Card */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Resident Membership Plan
            </h2>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
              isPro
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {subscription?.planName || 'Free Resident Tier'}
          </span>
        </div>

        <div className="text-xs text-slate-600 leading-relaxed">
          {isPro ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Pro Membership Active</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Renews {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'next month'} • ₹49/mo
              </p>
            </div>
          ) : (
            <p>
              Upgrade to <strong>Resident Pro (₹49/mo)</strong> for unlimited rooms, automatic UPI QR requests, and zero ads.
            </p>
          )}
        </div>

        {!isPro && (
          <button
            onClick={() => onUpgradePlan('PRO')}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs active:scale-98 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Upgrade to Resident Pro (₹49/mo)</span>
          </button>
        )}
      </div>

      {/* Switch Persona (Demo / Testing Roommates) */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-2.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Switch Testing Persona
        </h2>
        <p className="text-[11px] text-slate-500">
          Simulate app usage from different roommates' viewpoints:
        </p>

        <div className="grid grid-cols-2 gap-2">
          {allUsers.map((u) => {
            const isSelected = u.id === currentUser.id;
            return (
              <button
                key={u.id}
                onClick={() => onSwitchUser(u)}
                className={`min-h-[44px] p-2.5 rounded-xl border text-left flex items-center space-x-2 transition-all ${
                  isSelected
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {u.name.charAt(0)}
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold truncate">{u.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {u.role === 'SUPER_ADMIN' ? 'Admin' : 'Roommate'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Security & System Controls */}
      <div className="rounded-2xl bg-white border border-slate-200/90 divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
        <button
          onClick={onOpenSecurityAudit}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-all text-xs font-medium text-slate-900"
        >
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Vault Security & RLS Audit</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={onResetData}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-all text-xs font-medium text-slate-700"
        >
          <div className="flex items-center space-x-2.5">
            <RefreshCw className="w-4 h-4 text-slate-500" />
            <span>Reset Demo Storage</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full p-3.5 flex items-center justify-between text-left hover:bg-rose-50/50 transition-all text-xs font-bold text-rose-600"
          >
            <div className="flex items-center space-x-2.5">
              <LogOut className="w-4 h-4 text-rose-500" />
              <span>Log Out & Lock Vault</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Sign In Screen</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

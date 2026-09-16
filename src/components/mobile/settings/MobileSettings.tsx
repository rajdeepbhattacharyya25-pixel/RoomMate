import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon,
  Bell,
  Lock,
  CreditCard,
  Sparkles,
  Cloud,
  Palette,
  HelpCircle,
  Info,
  Check,
  Settings as SettingsIcon,
} from 'lucide-react';
import { User, UserSubscription } from '../../../types';
import { hapticSelection } from '../../../lib/native/haptics';
import { registerBackButtonHandler } from '../../../lib/native/backButton';

// Tab imports
import { AccountTab } from './tabs/AccountTab';
import { NotificationsTab } from './tabs/NotificationsTab';
import { SecurityTab } from './tabs/SecurityTab';
import { PaymentTab } from './tabs/PaymentTab';
import { MembershipTab } from './tabs/MembershipTab';
import { DataBackupTab } from './tabs/DataBackupTab';
import { AppPreferencesTab } from './tabs/AppPreferencesTab';
import { HelpSupportTab } from './tabs/HelpSupportTab';
import { AboutTab } from './tabs/AboutTab';

export type SettingsCategory =
  | 'account'
  | 'notifications'
  | 'security'
  | 'payment'
  | 'membership'
  | 'data-backup'
  | 'app-preferences'
  | 'help-support'
  | 'about';

interface CategoryMeta {
  id: SettingsCategory;
  label: string;
  icon: React.ElementType;
}

const CATEGORIES: CategoryMeta[] = [
  { id: 'account', label: 'Account', icon: UserIcon },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'membership', label: 'Membership', icon: Sparkles },
  { id: 'data-backup', label: 'Data & Backup', icon: Cloud },
  { id: 'app-preferences', label: 'Preferences', icon: Palette },
  { id: 'help-support', label: 'Help & Support', icon: HelpCircle },
  { id: 'about', label: 'About', icon: Info },
];

export interface MobileSettingsProps {
  currentUser: User;
  allUsers?: User[];
  onSwitchUser?: (user: User) => void;
  subscription?: UserSubscription;
  onUpgradePlan?: (planCode: 'PRO' | 'CAMPUS_MAX') => void;
  onOpenSecurityAudit?: () => void;
  onResetData?: () => void;
  onLogout?: () => void;
  onProfileUpdated?: () => void;
}

export const MobileSettings: React.FC<MobileSettingsProps> = ({
  currentUser,
  allUsers = [],
  onSwitchUser,
  subscription,
  onUpgradePlan,
  onOpenSecurityAudit,
  onResetData,
  onLogout,
  onProfileUpdated,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('account');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const chipContainerRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Android hardware back button handler: return to 'account' tab before exit
  useEffect(() => {
    if (activeCategory !== 'account') {
      const unregister = registerBackButtonHandler(() => {
        setActiveCategory('account');
        return true;
      });
      return unregister;
    }
  }, [activeCategory]);

  const handleSelectCategory = (cat: SettingsCategory) => {
    hapticSelection();
    setActiveCategory(cat);
  };

  // Scroll active chip into view smoothly
  useEffect(() => {
    if (chipContainerRef.current) {
      const activeEl = chipContainerRef.current.querySelector(
        `[data-category="${activeCategory}"]`
      ) as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }
    }
  }, [activeCategory]);

  return (
    <div className="flex flex-col min-h-full bg-[#F8FAFC] pb-nav-safe">
      {/* Toast Alert */}
      {statusMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Sticky Settings Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 pt-3 pb-2.5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <SettingsIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">Settings</h1>
              <p className="text-[11px] text-slate-500">Preferences, security & identity</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {currentUser.role === 'SUPER_ADMIN' ? 'Admin' : 'Resident'}
            </span>
          </div>
        </div>

        {/* Responsive Horizontal Category Chips */}
        <div
          ref={chipContainerRef}
          className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-1 -mx-4 px-4 scroll-smooth"
        >
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                data-category={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category Content Area with 180ms smooth transition */}
      <div className="p-4 flex-1">
        <div
          key={activeCategory}
          className="animate-in fade-in duration-180 slide-in-from-bottom-1"
        >
          {activeCategory === 'account' && (
            <AccountTab
              currentUser={currentUser}
              onProfileUpdated={onProfileUpdated}
              onShowToast={showToast}
            />
          )}

          {activeCategory === 'notifications' && (
            <NotificationsTab
              currentUser={currentUser}
              onShowToast={showToast}
            />
          )}

          {activeCategory === 'security' && (
            <SecurityTab
              currentUser={currentUser}
              onShowToast={showToast}
              onLogout={onLogout}
            />
          )}

          {activeCategory === 'payment' && (
            <PaymentTab
              currentUser={currentUser}
              onShowToast={showToast}
              onNavigateToAccount={() => setActiveCategory('account')}
            />
          )}

          {activeCategory === 'membership' && (
            <MembershipTab
              subscription={subscription}
              onUpgradePlan={onUpgradePlan}
              onShowToast={showToast}
            />
          )}

          {activeCategory === 'data-backup' && (
            <DataBackupTab
              currentUser={currentUser}
              onShowToast={showToast}
            />
          )}

          {activeCategory === 'app-preferences' && (
            <AppPreferencesTab
              onShowToast={showToast}
            />
          )}

          {activeCategory === 'help-support' && (
            <HelpSupportTab
              currentUser={currentUser}
              onShowToast={showToast}
            />
          )}

          {activeCategory === 'about' && (
            <AboutTab
              currentUser={currentUser}
              allUsers={allUsers}
              onSwitchUser={onSwitchUser}
              onOpenSecurityAudit={onOpenSecurityAudit}
              onResetData={onResetData}
              onLogout={onLogout}
              onShowToast={showToast}
            />
          )}
        </div>
      </div>
    </div>
  );
};

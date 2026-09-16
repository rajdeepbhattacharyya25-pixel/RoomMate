import React from 'react';
import { LayoutDashboard, Lock, Users, Settings, Plus } from 'lucide-react';
import { hapticSelection, hapticImpact } from '../../lib/native/haptics';

import { isNativeApp } from '../../lib/platform/deviceDetector';

export type MobileTabType = 'dashboard' | 'vault' | 'rooms' | 'profile';

interface MobileBottomNavProps {
  activeTab: MobileTabType;
  onSelectTab: (tab: MobileTabType) => void;
  onOpenQuickAction: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenQuickAction,
}) => {
  const isNative = isNativeApp();

  const handleTabClick = (tab: MobileTabType) => {
    hapticSelection();
    onSelectTab(tab);
  };

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 pt-1.5 w-full md:max-w-[395px] mx-auto transition-all shadow-[0_-2px_10px_rgba(0,0,0,0.03)]"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
      }}
    >
      <div className="flex items-center justify-around relative">
        {/* Dashboard Tab */}
        <button
          onClick={() => handleTabClick('dashboard')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all active:scale-95 ${
            activeTab === 'dashboard'
              ? 'text-indigo-600 font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Dashboard"
        >
          <LayoutDashboard className={`w-5 h-5 transition-transform ${activeTab === 'dashboard' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">Home</span>
        </button>

        {/* Vault Tab (Personal) */}
        <button
          onClick={() => handleTabClick('vault')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all active:scale-95 ${
            activeTab === 'vault'
              ? 'text-indigo-600 font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Personal Vault"
        >
          <Lock className={`w-5 h-5 transition-transform ${activeTab === 'vault' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">Vault</span>
        </button>

        {/* Center Quick Action Floating Button (Thumb Zone) */}
        <div className="relative -top-3">
          <button
            onClick={() => {
              hapticImpact('MEDIUM');
              onOpenQuickAction();
            }}
            className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 active:scale-90 transition-all border-2 border-white"
            aria-label="Quick Add Expense"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        {/* Rooms Tab */}
        <button
          onClick={() => handleTabClick('rooms')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all active:scale-95 ${
            activeTab === 'rooms'
              ? 'text-indigo-600 font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Rooms Ledger"
        >
          <Users className={`w-5 h-5 transition-transform ${activeTab === 'rooms' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">Rooms</span>
        </button>

        {/* Settings Tab */}
        <button
          onClick={() => handleTabClick('profile')}
          className={`flex flex-col items-center justify-center min-w-[56px] min-h-[48px] py-1 px-2 rounded-xl transition-all active:scale-95 ${
            activeTab === 'profile'
              ? 'text-indigo-600 font-semibold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Settings and Preferences"
        >
          <Settings className={`w-5 h-5 transition-transform ${activeTab === 'profile' ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
          <span className="text-[10px] mt-0.5 tracking-tight">Settings</span>
        </button>
      </div>

      {/* iOS Home Indicator Bar - only shown in desktop simulated frame */}
      {!isNative && (
        <div className="hidden md:flex justify-center pt-1 pb-0.5">
          <div className="w-32 h-1 bg-slate-300 rounded-full" />
        </div>
      )}
    </nav>
  );
};

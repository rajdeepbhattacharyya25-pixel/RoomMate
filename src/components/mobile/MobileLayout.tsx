import React, { useState, useEffect } from 'react';
import {
  User,
  Room,
  RoomMember,
  RoomInvitation,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  PersonalExpense,
  UserSubscription,
  SplitMethod,
} from '../../types';
import { MobileBottomNav, MobileTabType } from './MobileBottomNav';
import { MobileDashboard } from './MobileDashboard';
import { MobilePersonalVault } from './MobilePersonalVault';
import { MobileRoomLedger } from './MobileRoomLedger';
import { MobileProfile } from './MobileProfile';
import {
  Smartphone,
  Monitor,
  Wifi,
  Battery,
  Signal,
  X,
  Zap,
  QrCode,
  Lock,
} from 'lucide-react';

interface MobileLayoutProps {
  currentUser: User;
  allUsers: User[];
  onSwitchUser: (user: User) => void;
  activeRoom: Room | null;
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
  roomMembers: RoomMember[];
  roomInvitations: RoomInvitation[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  personalExpenses: PersonalExpense[];
  subscriptions: UserSubscription[];
  onAddPersonalExpense: (data: Omit<PersonalExpense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  onDeletePersonalExpense: (id: string) => void;
  onAddSharedExpense: (data: {
    roomId: string;
    paidBy: string;
    title: string;
    totalAmount: number;
    category: SharedExpense['category'];
    splitMethod?: SplitMethod;
    participantUserIds: string[];
    customValues?: Record<string, number>;
    notes?: string;
    expenseDate?: string;
  }) => void;
  onRecordSettlement: (data: {
    roomId: string;
    payerId: string;
    payeeId: string;
    amount: number;
    paymentMethod: SettlementPayment['paymentMethod'];
    transactionRef?: string;
    notes?: string;
  }) => void;
  onCreateRoom: (name: string, description?: string) => void;
  onJoinRoom: (code: string) => void;
  onUpgradePlan: (planCode: 'PRO' | 'CAMPUS_MAX') => void;
  onOpenSecurityAudit: () => void;
  onResetData: () => void;
  onSwitchToDesktopView?: () => void;
  onLogout?: () => void;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  currentUser,
  allUsers,
  onSwitchUser,
  activeRoom,
  rooms,
  onSelectRoom,
  roomMembers,
  roomInvitations,
  sharedExpenses,
  expenseSplits,
  settlementPayments,
  personalExpenses,
  subscriptions,
  onAddPersonalExpense,
  onDeletePersonalExpense,
  onAddSharedExpense,
  onRecordSettlement,
  onCreateRoom,
  onJoinRoom,
  onUpgradePlan,
  onOpenSecurityAudit,
  onResetData,
  onSwitchToDesktopView,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<MobileTabType>('dashboard');
  const [currentTime, setCurrentTime] = useState('9:41');
  const [showQuickActionSheet, setShowQuickActionSheet] = useState(false);
  const [triggerPersonalAdd, setTriggerPersonalAdd] = useState(false);
  const [triggerSplitAdd, setTriggerSplitAdd] = useState(false);
  const [triggerSettleUp, setTriggerSettleUp] = useState(false);

  // Update clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  const currentSubscription = subscriptions.find((s) => s.userId === currentUser.id);

  // Handle Quick Action Center FAB
  const handleSelectQuickAction = (type: 'personal' | 'split' | 'settle') => {
    setShowQuickActionSheet(false);
    if (type === 'personal') {
      setActiveTab('vault');
      setTriggerPersonalAdd(true);
    } else if (type === 'split') {
      setActiveTab('rooms');
      setTriggerSplitAdd(true);
    } else if (type === 'settle') {
      setActiveTab('rooms');
      setTriggerSettleUp(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-[#111827] flex flex-col items-center justify-start lg:py-6 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Banner on Desktop Screens */}
      <header className="w-full max-w-lg mb-3 px-4 flex items-center justify-between hidden md:flex">
        <div className="flex items-center space-x-2 text-xs text-slate-600">
          <Smartphone className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-slate-900">iOS Simulator</span>
          <a
            href="https://stitch.withgoogle.com/projects/7490169641002141903"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] border border-indigo-200 font-medium hover:bg-indigo-100 transition-colors inline-flex items-center gap-1"
          >
            <span>Stitch Project</span>
            <span className="font-mono text-[9px]">7490169641002141903</span>
          </a>
        </div>

        {onSwitchToDesktopView && (
          <button
            onClick={onSwitchToDesktopView}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 border border-slate-300 shadow-xs active:scale-95 transition-all"
          >
            <Monitor className="w-3.5 h-3.5 text-indigo-600" />
            <span>Switch to Desktop View</span>
          </button>
        )}
      </header>

      {/* Simulated Device Frame Container (iPhone 16 Pro Style) */}
      <div className="w-full md:max-w-[395px] md:h-[852px] md:rounded-[48px] bg-[#F9F9FF] md:border-[10px] md:border-slate-800 shadow-2xl relative flex flex-col overflow-hidden md:ring-1 md:ring-slate-300">
        {/* Mobile Status Bar */}
        <div className="h-11 px-6 pt-2 flex items-center justify-between text-xs text-slate-900 select-none z-30 shrink-0 bg-[#F9F9FF]/90 backdrop-blur-md border-b border-slate-100">
          <span className="font-semibold tracking-tight text-[13px]">{currentTime}</span>

          {/* Dynamic Island Notch */}
          <div className="w-24 h-4.5 rounded-full bg-slate-900 mx-auto hidden md:block" />

          <div className="flex items-center space-x-1.5 text-slate-800">
            <Signal className="w-3.5 h-3.5" />
            <Wifi className="w-3.5 h-3.5" />
            <Battery className="w-4 h-4" />
          </div>
        </div>

        {/* Scrollable Screen Content */}
        <div className="flex-1 overflow-y-auto scrollbar-none relative">
          {activeTab === 'dashboard' && (
            <MobileDashboard
              currentUser={currentUser}
              allUsers={allUsers}
              activeRoom={activeRoom}
              rooms={rooms}
              onSelectRoom={onSelectRoom}
              roomMembers={roomMembers}
              sharedExpenses={sharedExpenses}
              expenseSplits={expenseSplits}
              settlementPayments={settlementPayments}
              personalExpenses={personalExpenses}
              onOpenAddPersonal={() => {
                setActiveTab('vault');
                setTriggerPersonalAdd(true);
              }}
              onOpenSplitRoom={() => {
                setActiveTab('rooms');
                setTriggerSplitAdd(true);
              }}
              onOpenSettleUp={() => {
                setActiveTab('rooms');
                setTriggerSettleUp(true);
              }}
              onNavigateToVault={() => setActiveTab('vault')}
              onNavigateToRooms={() => setActiveTab('rooms')}
              onRecordSettlement={onRecordSettlement}
            />
          )}

          {activeTab === 'vault' && (
            <MobilePersonalVault
              currentUser={currentUser}
              personalExpenses={personalExpenses}
              onAddExpense={onAddPersonalExpense}
              onDeleteExpense={onDeletePersonalExpense}
              showAddSheetInitially={triggerPersonalAdd}
              onCloseAddSheet={() => setTriggerPersonalAdd(false)}
            />
          )}

          {activeTab === 'rooms' && (
            <MobileRoomLedger
              currentUser={currentUser}
              allUsers={allUsers}
              rooms={rooms}
              activeRoom={activeRoom}
              onSelectRoom={onSelectRoom}
              roomMembers={roomMembers}
              roomInvitations={roomInvitations}
              sharedExpenses={sharedExpenses}
              expenseSplits={expenseSplits}
              settlementPayments={settlementPayments}
              onAddSharedExpense={onAddSharedExpense}
              onRecordSettlement={onRecordSettlement}
              onCreateRoom={onCreateRoom}
              onJoinRoom={onJoinRoom}
              showSplitModalInitially={triggerSplitAdd}
              showSettleModalInitially={triggerSettleUp}
              onCloseModals={() => {
                setTriggerSplitAdd(false);
                setTriggerSettleUp(false);
              }}
            />
          )}

          {activeTab === 'profile' && (
            <MobileProfile
              currentUser={currentUser}
              allUsers={allUsers}
              onSwitchUser={onSwitchUser}
              subscription={currentSubscription}
              onUpgradePlan={onUpgradePlan}
              onOpenSecurityAudit={onOpenSecurityAudit}
              onResetData={onResetData}
              onLogout={onLogout}
            />
          )}
        </div>

        {/* Quick Action Bottom Sheet Drawer */}
        {showQuickActionSheet && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs animate-in fade-in">
            <div className="w-full bg-white border-t border-slate-200 rounded-t-3xl p-5 space-y-3 shadow-2xl animate-in slide-in-from-bottom-5">
              <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-1" />

              <div className="flex items-center justify-between pb-1">
                <h3 className="text-sm font-bold text-slate-900">Quick Action</h3>
                <button
                  onClick={() => setShowQuickActionSheet(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleSelectQuickAction('personal')}
                  className="w-full min-h-[48px] p-3 rounded-xl bg-[#F9FAFB] hover:bg-slate-100 border border-slate-200 flex items-center space-x-3 text-left transition-all active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <Lock className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Add Private Expense</div>
                    <div className="text-[10px] text-slate-500">
                      Only visible to you in your Personal Vault
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleSelectQuickAction('split')}
                  className="w-full min-h-[48px] p-3 rounded-xl bg-[#F9FAFB] hover:bg-slate-100 border border-slate-200 flex items-center space-x-3 text-left transition-all active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                    <Zap className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Split Room Bill</div>
                    <div className="text-[10px] text-slate-500">
                      Split with roommates in {activeRoom?.name || 'Room'}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleSelectQuickAction('settle')}
                  className="w-full min-h-[48px] p-3 rounded-xl bg-[#F9FAFB] hover:bg-slate-100 border border-slate-200 flex items-center space-x-3 text-left transition-all active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                    <QrCode className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">Settle Up via UPI</div>
                    <div className="text-[10px] text-slate-500">
                      Open GPay, PhonePe, or Paytm with QR code
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Persistent Bottom Tab Navigation */}
        <MobileBottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setTriggerPersonalAdd(false);
            setTriggerSplitAdd(false);
            setTriggerSettleUp(false);
          }}
          onOpenQuickAction={() => setShowQuickActionSheet(true)}
        />
      </div>
    </div>
  );
};

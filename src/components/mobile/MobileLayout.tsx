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
  JoinPolicy,
  InvitePolicy,
  RoomJoinRequest,
  InAppNotification,
} from '../../types';
import { MobileBottomNav, MobileTabType } from './MobileBottomNav';
import { MobileDashboard } from './MobileDashboard';
import { MobilePersonalVault } from './MobilePersonalVault';
import { MobileRoomLedger } from './MobileRoomLedger';
import { MobileProfile } from './MobileProfile';
import { UpiQrScannerModal } from './UpiQrScannerModal';
import { MobileOfflineBanner } from './MobileOfflineBanner';
import { MobileBottomSheet } from './MobileBottomSheet';
import { ShakeBugReportModal } from './ShakeBugReportModal';
import { addShakeListener } from '../../lib/native/shakeDetector';
import { hapticImpact } from '../../lib/native/haptics';
import { useNetworkStatus } from '../../context/NetworkContext';
import { isNativeApp } from '../../lib/platform/deviceDetector';
import {
  Smartphone,
  Monitor,
  Zap,
  QrCode,
  Lock,
  Camera,
  Wifi,
  WifiOff,
  Bug,
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
  onLeaveRoom?: (roomId: string) => Promise<void>;
  onRemoveMember?: (roomId: string, targetUserId: string) => Promise<void>;
  roomJoinRequests?: Array<RoomJoinRequest & { user: User }>;
  onApproveJoinRequest?: (requestId: string) => Promise<void>;
  onDeclineJoinRequest?: (requestId: string) => Promise<void>;
  onTransferOwnership?: (roomId: string, newAdminId: string) => Promise<void>;
  onRegenerateInvite?: (roomId: string, expirationHours?: number) => Promise<RoomInvitation | void>;
  onUpdateRoomPolicies?: (roomId: string, policies: { joinPolicy?: JoinPolicy; invitePolicy?: InvitePolicy }) => Promise<void>;
  onResolveInvite?: (tokenOrCode: string) => Promise<{
    room: { id: string; name: string; description?: string; joinPolicy: JoinPolicy; invitePolicy: InvitePolicy };
    memberCount: number;
    adminName: string;
    invite: RoomInvitation;
  }>;
  onRequestJoinRoom?: (tokenOrCode: string) => Promise<{
    status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
    room: Room;
    message?: string;
  }>;
  onUpgradePlan: (planCode: 'PRO' | 'CAMPUS_MAX') => void;
  onOpenSecurityAudit: () => void;
  onResetData: () => void;
  onSwitchToDesktopView?: () => void;
  onLogout?: () => void;
  isRealtimeLive?: boolean;
  onOpenSupabaseModal?: () => void;
  onProfileUpdated?: () => void;
  notifications?: InAppNotification[];
  onToggleNotificationRead?: (id: string, currentRead: boolean) => void;
  onMarkAllNotificationsRead?: () => void;
  onDeleteNotification?: (id: string) => void;
  onClearReadNotifications?: () => void;
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
  onLeaveRoom,
  onRemoveMember,
  roomJoinRequests,
  onApproveJoinRequest,
  onDeclineJoinRequest,
  onTransferOwnership,
  onRegenerateInvite,
  onUpdateRoomPolicies,
  onResolveInvite,
  onRequestJoinRoom,
  onUpgradePlan,
  onOpenSecurityAudit,
  onResetData,
  onSwitchToDesktopView,
  onLogout,
  isRealtimeLive,
  onOpenSupabaseModal,
  onProfileUpdated,
  notifications = [],
  onToggleNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onClearReadNotifications,
}) => {
  const isNative = isNativeApp();
  const [activeTab, setActiveTab] = useState<MobileTabType>('dashboard');
  const [showQuickActionSheet, setShowQuickActionSheet] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [triggerPersonalAdd, setTriggerPersonalAdd] = useState(false);
  const [triggerSplitAdd, setTriggerSplitAdd] = useState(false);
  const [triggerSettleUp, setTriggerSettleUp] = useState(false);
  const [showShakeReportModal, setShowShakeReportModal] = useState(false);

  // Global Shake Detection Listener (suppressed while modal or scanner is active)
  useEffect(() => {
    const unsubscribe = addShakeListener(() => {
      setShowShakeReportModal((alreadyOpen) => {
        if (alreadyOpen) return true;
        return true;
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Handle in-app notification contextual routing
  const handleNotificationAction = (notification: InAppNotification) => {
    if (notification.actionType === 'PAY_NOW') {
      setActiveTab('rooms');
      setTriggerSettleUp(true);
    } else if (
      notification.actionType === 'VIEW_EXPENSE' ||
      notification.actionType === 'VIEW_DETAILS' ||
      notification.actionType === 'VIEW_BALANCE' ||
      notification.actionType === 'REVIEW'
    ) {
      setActiveTab('rooms');
    }
  };

  const { isSimulatedOffline, toggleSimulateOffline } = useNetworkStatus();
  const currentSubscription = subscriptions.find((s) => s.userId === currentUser.id);

  // Handle Quick Action Center FAB
  const handleSelectQuickAction = (type: 'personal' | 'split' | 'settle' | 'scan') => {
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
    } else if (type === 'scan') {
      setShowQrScanner(true);
    }
  };

  return (
    <div className={`min-h-screen ${isNative ? 'bg-[#F9F9FF] w-full flex flex-col' : 'bg-[#F1F5F9] flex flex-col items-center justify-start lg:py-6'} text-[#111827] selection:bg-indigo-100 selection:text-indigo-900`}>
      {/* Top Banner on Desktop Screens */}
      {!isNative && (
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

          <div className="flex items-center gap-2">
            {/* Quick Shake Simulator for Browser Testing */}
            <button
              onClick={() => {
                hapticImpact('HEAVY');
                setShowShakeReportModal(true);
              }}
              className="px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all active:scale-95"
              title="Trigger Instagram-style Shake to Report modal without physical device"
            >
              <Bug className="w-3.5 h-3.5 text-rose-500" />
              <span>Test Shake</span>
            </button>

            {/* Quick Offline Simulator Toggle */}
            <button
              onClick={toggleSimulateOffline}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all active:scale-95 ${
                isSimulatedOffline
                  ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Toggle Offline State for Testing"
            >
              {isSimulatedOffline ? <WifiOff className="w-3.5 h-3.5 text-amber-700" /> : <Wifi className="w-3.5 h-3.5 text-slate-600" />}
              <span>{isSimulatedOffline ? 'Offline Mode' : 'Simulate Offline'}</span>
            </button>

            {onSwitchToDesktopView && (
              <button
                onClick={onSwitchToDesktopView}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 border border-slate-300 shadow-xs active:scale-95 transition-all"
              >
                <Monitor className="w-3.5 h-3.5 text-indigo-600" />
                <span>Desktop</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* Frame Container */}
      <div className={isNative ? 'w-full min-h-screen bg-[#F9F9FF] relative flex flex-col overflow-x-hidden' : 'w-full md:max-w-[395px] md:h-[852px] md:rounded-[48px] bg-[#F9F9FF] md:border-[10px] md:border-slate-800 shadow-2xl relative flex flex-col overflow-hidden md:ring-1 md:ring-slate-300'}>
        {/* Safe-area top spacer — prevents content from merging with the phone's real status bar */}
        <div
          className="w-full shrink-0 bg-[#F9F9FF]"
          style={{ height: isNative ? 'max(env(safe-area-inset-top, 0px), 0px)' : '44px' }}
        />

        {/* Mobile Offline & Reconnection Banner */}
        <MobileOfflineBanner />

        {/* Scrollable Screen Content */}
        <div className="flex-1 overflow-y-auto scrollbar-none relative pb-nav-safe">
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
              notifications={notifications}
              onToggleNotificationRead={onToggleNotificationRead}
              onMarkAllNotificationsRead={onMarkAllNotificationsRead}
              onDeleteNotification={onDeleteNotification}
              onClearReadNotifications={onClearReadNotifications}
              onNotificationAction={handleNotificationAction}
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
              isRealtimeLive={isRealtimeLive}
              onOpenSupabaseModal={onOpenSupabaseModal}
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
              sharedExpenses={sharedExpenses}
              expenseSplits={expenseSplits}
              settlementPayments={settlementPayments}
              allUsers={allUsers}
              rooms={rooms}
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
              onLeaveRoom={onLeaveRoom}
              onRemoveMember={onRemoveMember}
              roomJoinRequests={roomJoinRequests}
              onApproveJoinRequest={onApproveJoinRequest}
              onDeclineJoinRequest={onDeclineJoinRequest}
              onTransferOwnership={onTransferOwnership}
              onRegenerateInvite={onRegenerateInvite}
              onUpdateRoomPolicies={onUpdateRoomPolicies}
              onResolveInvite={onResolveInvite}
              onRequestJoinRoom={onRequestJoinRoom}
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
              onProfileUpdated={onProfileUpdated}
            />
          )}
        </div>

        {/* Quick Action Bottom Sheet Drawer */}
        <MobileBottomSheet
          isOpen={showQuickActionSheet}
          onClose={() => setShowQuickActionSheet(false)}
          title="Quick Action"
          subtitle="Choose an action to get started"
          icon={<Zap className="w-4.5 h-4.5" />}
          maxHeight="82vh"
        >
          <div className="space-y-2 pt-1 pb-4">
            <button
              onClick={() => handleSelectQuickAction('personal')}
              className="w-full min-h-[48px] p-2.5 rounded-xl bg-[#F9FAFB] hover:bg-slate-100 border border-slate-200 flex items-center space-x-3 text-left transition-all active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
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
              className="w-full min-h-[48px] p-2.5 rounded-xl bg-[#F9FAFB] hover:bg-slate-100 border border-slate-200 flex items-center space-x-3 text-left transition-all active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shrink-0">
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
              className="w-full min-h-[48px] p-2.5 rounded-xl bg-[#F9FAFB] hover:bg-slate-100 border border-slate-200 flex items-center space-x-3 text-left transition-all active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                <QrCode className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">Settle Up via UPI</div>
                <div className="text-[10px] text-slate-500">
                  Open GPay, PhonePe, or Paytm with QR code
                </div>
              </div>
            </button>

            <button
              onClick={() => handleSelectQuickAction('scan')}
              className="w-full min-h-[48px] p-2.5 rounded-xl bg-[#F9FAFB] hover:bg-slate-100 border border-slate-200 flex items-center space-x-3 text-left transition-all active:scale-[0.99]"
            >
              <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 shrink-0">
                <Camera className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">Scan Any UPI QR Code</div>
                <div className="text-[10px] text-slate-500">
                  Scan merchant/roommate QR or upload screenshot
                </div>
              </div>
            </button>
          </div>
        </MobileBottomSheet>

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

        {/* Live Camera & Screenshot UPI QR Scanner Hub */}
        <UpiQrScannerModal
          isOpen={showQrScanner}
          onClose={() => setShowQrScanner(false)}
          onScanned={(_data) => {
            setActiveTab('rooms');
            setTriggerSettleUp(true);
          }}
        />

        {/* Global Instagram-Style Shake Bug Report & Telemetry Modal */}
        <ShakeBugReportModal
          isOpen={showShakeReportModal}
          onClose={() => setShowShakeReportModal(false)}
          currentUser={currentUser}
          activeRoom={activeRoom}
          currentRoute={activeTab}
        />
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { User, Room, SharedExpense, SettlementPayment, PersonalExpense, SplitMethod } from './types';
import { db, DatabaseState } from './lib/storage/mockStorage';
import {
  fetchCloudDatabaseState,
  addSharedExpenseCloud,
  recordSettlementCloud,
  addPersonalExpenseCloud,
  deletePersonalExpenseCloud,
  subscribeToRoomRealtime,
  authenticateResidentWithSupabase,
  IS_LIVE_SYNC_ENABLED,
} from './lib/storage/cloudStorageAdapter';
import { Navbar } from './components/Navbar';
import { UnifiedDashboard } from './components/UnifiedDashboard';
import { PersonalVault } from './components/PersonalVault';
import { RoomLedger } from './components/RoomLedger';
import { UserSubscriptionView } from './components/UserSubscription';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import { SecurityTestModal } from './components/SecurityTestModal';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { MobileLayout } from './components/mobile/MobileLayout';
import { MobileLogin } from './components/mobile/MobileLogin';
import {
  getStoredResidentSession,
  clearResidentSession,
  createResidentToken,
  storeResidentSession,
} from './lib/auth/jwtService';
import { hapticSuccess, hapticImpact } from './lib/native/haptics';
import {
  initNativeNotifications,
  sendLocalExpenseNotification,
  sendLocalSettlementNotification,
} from './lib/native/notifications';
import { setAppStatusBarStyle, hideSplashScreen, setupKeyboardListeners } from './lib/native/statusBar';
import { listenToNetworkStatus, listenToAppLifecycle } from './lib/native/network';
import { DesktopLandingPage } from './components/desktop/DesktopLandingPage';
import { isNativeApp, getInitialDeviceMode } from './lib/platform/deviceDetector';
import { ShieldAlert, Smartphone, Cloud, LogOut, CheckCircle2 } from 'lucide-react';

export function App() {
  const [dbState, setDbState] = useState<DatabaseState>(db.getState());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(getStoredResidentSession());
  });
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const session = getStoredResidentSession();
    if (session) {
      const found = db.getState().users.find((u) => u.id === session.sub);
      if (found) return found;
    }
    // Default to resident Rajdeep
    return db.getState().users.find((u) => u.id === 'usr-rajdeep-1') || db.getState().users[0];
  });
  const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>(() => getInitialDeviceMode());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'personal' | 'rooms' | 'subscription' | 'admin'>('dashboard');
  const [activeRoom, setActiveRoom] = useState<Room | null>(() => {
    return db.getState().rooms[0] || null;
  });
  const [showSecurityAudit, setShowSecurityAudit] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);
  const [remoteSyncToast, setRemoteSyncToast] = useState<string | null>(null);

  // Sync state whenever db updates
  const refreshState = () => {
    const updated = db.getState();
    setDbState({ ...updated });
    const refreshedUser = updated.users.find((u) => u.id === currentUser.id);
    if (refreshedUser) setCurrentUser(refreshedUser);
  };

  // 0. Native Mobile Platform Initialization (Status Bar, Notifications, Keyboard, Network)
  useEffect(() => {
    initNativeNotifications();
    setAppStatusBarStyle('DARK', '#0a0e17');
    hideSplashScreen();
    const cleanupKeyboard = setupKeyboardListeners();

    const cleanupNetwork = listenToNetworkStatus(
      () => {
        setRemoteSyncToast('🟢 Network Connected • Cloud Live');
        setTimeout(() => setRemoteSyncToast(null), 3000);
        if (IS_LIVE_SYNC_ENABLED) {
          fetchCloudDatabaseState().then((state) => {
            if (state) setDbState(state);
          });
        }
      },
      () => {
        setRemoteSyncToast('🟡 Device Offline • Operating on Local Vault');
        setTimeout(() => setRemoteSyncToast(null), 4000);
      }
    );

    const cleanupLifecycle = listenToAppLifecycle(() => {
      if (IS_LIVE_SYNC_ENABLED) {
        fetchCloudDatabaseState().then((state) => {
          if (state) setDbState(state);
        });
      }
    });

    return () => {
      cleanupKeyboard();
      cleanupNetwork();
      cleanupLifecycle();
    };
  }, []);

  // 1. Initial State Hydration from Supabase Cloud
  useEffect(() => {
    if (!IS_LIVE_SYNC_ENABLED) return;

    authenticateResidentWithSupabase(currentUser.email).then(() => {
      fetchCloudDatabaseState().then((cloudState) => {
        if (cloudState && cloudState.users.length > 0) {
          setDbState(cloudState);
          const matched =
            cloudState.users.find((u) => u.email.toLowerCase() === currentUser.email.toLowerCase()) ||
            cloudState.users[0];
          setCurrentUser(matched);
          if (cloudState.rooms.length > 0) {
            setActiveRoom(cloudState.rooms[0]);
          }
          setIsRealtimeLive(true);
        }
      });
    });
  }, [currentUser.email]);

  // 2. Realtime Room Subscriptions (Multi-Device Broadcast Listener & Native Notifications)
  useEffect(() => {
    if (!IS_LIVE_SYNC_ENABLED || !activeRoom?.id) return;

    const unsubscribe = subscribeToRoomRealtime(activeRoom.id, (table, eventType) => {
      fetchCloudDatabaseState().then((cloudState) => {
        if (cloudState) {
          setDbState(cloudState);
          const readableTable = table === 'shared_expenses' ? 'Expense' : table === 'settlement_payments' ? 'Settlement' : table;
          setRemoteSyncToast(`Realtime Sync: ${readableTable} ${eventType.toLowerCase()}d`);
          setTimeout(() => setRemoteSyncToast(null), 3500);

          // Dispatch native notification when remote flatmates make a change
          if (table === 'shared_expenses' && eventType === 'INSERT') {
            const latestExp = cloudState.sharedExpenses[0];
            if (latestExp && latestExp.paidBy !== currentUser.id) {
              const payer = cloudState.users.find((u) => u.id === latestExp.paidBy);
              sendLocalExpenseNotification({
                title: latestExp.title,
                totalAmount: latestExp.totalAmount,
                paidByName: payer ? payer.name : 'Flatmate',
                roomName: activeRoom.name,
              });
            }
          } else if (table === 'settlement_payments') {
            const latestSet = cloudState.settlementPayments[0];
            if (latestSet && latestSet.payeeId === currentUser.id) {
              const payer = cloudState.users.find((u) => u.id === latestSet.payerId);
              sendLocalSettlementNotification({
                amount: latestSet.amount,
                payerName: payer ? payer.name : 'Flatmate',
                payeeName: currentUser.name,
                paymentMethod: latestSet.paymentMethod,
              });
            }
          }
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, [activeRoom?.id, currentUser.id, currentUser.name, activeRoom?.name]);

  // If switched user persona changes
  const handleSwitchUser = (user: User) => {
    setCurrentUser(user);
    if (IS_LIVE_SYNC_ENABLED) {
      authenticateResidentWithSupabase(user.email);
    }
    if (user.role === 'SUPER_ADMIN') {
      setActiveTab('admin');
    } else if (activeTab === 'admin') {
      setActiveTab('dashboard');
    }
  };

  // Switch to personal / shared add modals from dashboard
  const handleOpenAddPersonal = () => {
    setActiveTab('personal');
  };

  const handleOpenAddShared = () => {
    setActiveTab('rooms');
  };

  // Current user's subscription
  const currentSubscription = dbState.subscriptions.find((s) => s.userId === currentUser.id);

  // Handle Resident Login
  const handleLogin = (user: User, _token: string) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    if (IS_LIVE_SYNC_ENABLED) {
      authenticateResidentWithSupabase(user.email);
    }
    if (user.role === 'SUPER_ADMIN') {
      setActiveTab('admin');
    } else if (activeTab === 'admin') {
      setActiveTab('dashboard');
    }
  };

  // Handle Resident / Admin Logout
  const handleLogout = () => {
    clearResidentSession();
    setIsAuthenticated(false);
    const defaultStudent = dbState.users.find((u) => u.role === 'STUDENT') || dbState.users[0];
    setCurrentUser(defaultStudent);
    setActiveTab('dashboard');
  };

  // Handlers for Shared Expense, Settlement, and Personal Expense with Cloud Sync
  const handleAddSharedExpense = async (data: {
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
  }) => {
    await addSharedExpenseCloud({
      ...data,
      createdBy: currentUser.id,
    });
    hapticSuccess();
    refreshState();
  };

  const handleRecordSettlement = async (data: {
    roomId: string;
    payerId?: string;
    payeeId: string;
    amount: number;
    paymentMethod: SettlementPayment['paymentMethod'];
    notes?: string;
  }) => {
    await recordSettlementCloud({
      roomId: data.roomId,
      payerId: data.payerId || currentUser.id,
      payeeId: data.payeeId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
    });
    hapticSuccess();
    refreshState();
  };

  const handleAddPersonalExpense = async (data: {
    title: string;
    amount: number;
    category: PersonalExpense['category'];
    notes?: string;
    expenseDate?: string;
  }) => {
    await addPersonalExpenseCloud({
      ...data,
      userId: currentUser.id,
    });
    hapticSuccess();
    refreshState();
  };

  const handleDeletePersonalExpense = async (id: string) => {
    await deletePersonalExpenseCloud(currentUser.id, id);
    hapticImpact('LIGHT');
    refreshState();
  };

  // If not authenticated, render MobileLogin screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] text-[#111827] flex flex-col items-center justify-center p-0 sm:py-6 selection:bg-indigo-100 selection:text-indigo-900">
        <div className="w-full md:max-w-[395px] md:h-[852px] md:rounded-[48px] bg-[#F9F9FF] md:border-[10px] md:border-slate-800 shadow-2xl relative flex flex-col overflow-hidden md:ring-1 md:ring-slate-300">
          <MobileLogin
            allUsers={dbState.users}
            onLogin={handleLogin}
            onJoinWithCode={(code) => {
              try {
                const joined = db.joinRoomWithCode(currentUser.id, code);
                refreshState();
                setActiveRoom(joined);
                const token = createResidentToken(currentUser);
                storeResidentSession(token, true);
                setIsAuthenticated(true);
              } catch (err: unknown) {
                alert(String(err));
              }
            }}
          />
        </div>
      </div>
    );
  }

  // Locked screen if resident account is suspended
  if (currentUser.isSuspended && currentUser.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen bg-[#0a0e17] flex items-center justify-center p-4">
        <div className="glass-card max-w-md w-full p-8 text-center space-y-4 border-rose-500/40">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-extrabold text-white">Resident Account Suspended</h1>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Your account ({currentUser.email}) has been temporarily suspended by the platform administrator due to pending subscription payment or policy violations.
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                const admin = dbState.users.find((u) => u.role === 'SUPER_ADMIN');
                if (admin) handleSwitchUser(admin);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700"
            >
              Switch to Super Admin to Reactivate
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'mobile') {
    return (
      <div className="relative min-h-screen bg-[#F8FAFC]">
        {/* Remote Sync Toast Notification */}
        {remoteSyncToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{remoteSyncToast}</span>
          </div>
        )}

        <MobileLayout
          currentUser={currentUser}
          allUsers={dbState.users}
          onSwitchUser={handleSwitchUser}
          activeRoom={activeRoom}
          rooms={dbState.rooms}
          onSelectRoom={setActiveRoom}
          roomMembers={dbState.roomMembers}
          roomInvitations={dbState.roomInvitations}
          sharedExpenses={dbState.sharedExpenses}
          expenseSplits={dbState.expenseSplits}
          settlementPayments={dbState.settlementPayments}
          personalExpenses={dbState.personalExpenses}
          subscriptions={dbState.subscriptions}
          onAddPersonalExpense={handleAddPersonalExpense}
          onDeletePersonalExpense={handleDeletePersonalExpense}
          onAddSharedExpense={handleAddSharedExpense}
          onRecordSettlement={handleRecordSettlement}
          onCreateRoom={(name, desc) => {
            const newR = db.createRoom(currentUser.id, name, desc);
            refreshState();
            setActiveRoom(newR);
          }}
          onJoinRoom={(code) => {
            try {
              const joined = db.joinRoomWithCode(currentUser.id, code);
              refreshState();
              setActiveRoom(joined);
            } catch (err: unknown) {
              alert(String(err));
            }
          }}
          onUpgradePlan={(planCode) => {
            db.processRazorpayWebhook(`event_${Date.now()}`, 'subscription.charged', currentUser.id, {
              planCode,
            });
            refreshState();
          }}
          onOpenSecurityAudit={() => setShowSecurityAudit(true)}
          onResetData={() => {
            db.resetToSeedData();
            refreshState();
          }}
          onSwitchToDesktopView={isNativeApp() ? undefined : () => setViewMode('desktop')}
          onLogout={handleLogout}
        />

        {showSecurityAudit && (
          <SecurityTestModal onClose={() => setShowSecurityAudit(false)} />
        )}

        {showSupabaseModal && (
          <SupabaseSyncModal
            isOpen={showSupabaseModal}
            onClose={() => setShowSupabaseModal(false)}
            onStateSynced={refreshState}
          />
        )}

        {/* Floating Supabase Cloud Button for Mobile View */}
        <div className="fixed top-3 right-3 z-30">
          <button
            onClick={() => setShowSupabaseModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-md active:scale-95 transition-all ${
              isRealtimeLive
                ? 'bg-white/95 text-emerald-700 border border-emerald-300'
                : 'bg-slate-900/90 text-emerald-400 border border-emerald-500/40'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRealtimeLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{isRealtimeLive ? 'Cloud Synced' : 'Supabase'}</span>
          </button>
        </div>
      </div>
    );
  }

  // If in desktop view and not authenticated as SuperAdmin, show Desktop Landing Page
  if (viewMode === 'desktop' && currentUser.role !== 'SUPER_ADMIN') {
    return (
      <DesktopLandingPage
        allUsers={dbState.users}
        onLoginSuccess={(adminUser) => {
          handleLogin(adminUser, 'superadmin_token');
          setActiveTab('admin');
        }}
        onOpenMobilePreview={() => setViewMode('mobile')}
      />
    );
  }

  // If in desktop view and authenticated as SuperAdmin, show dedicated Stitch-themed SuperAdmin Portal
  if (viewMode === 'desktop' && currentUser.role === 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <SuperAdminPortal
          currentUser={currentUser}
          allUsers={dbState.users}
          rooms={dbState.rooms}
          roomMembers={dbState.roomMembers}
          sharedExpenses={dbState.sharedExpenses}
          expenseSplits={dbState.expenseSplits}
          settlementPayments={dbState.settlementPayments}
          subscriptions={dbState.subscriptions}
          subscriptionEvents={dbState.subscriptionEvents}
          auditLogs={dbState.auditLogs}
          onToggleUserSuspension={(targetUserId, suspend) => {
            db.superAdminToggleUserSuspension(currentUser.id, targetUserId, suspend);
            refreshState();
          }}
          onToggleRoomFreeze={(roomId, freeze) => {
            db.superAdminToggleRoomFreeze(currentUser.id, roomId, freeze);
            refreshState();
          }}
          onArchiveRoom={(roomId, archive) => {
            db.superAdminArchiveRoom(currentUser.id, roomId, archive);
            refreshState();
          }}
          onResetRoomInviteCode={(roomId) => {
            const code = db.superAdminResetInviteCode(currentUser.id, roomId);
            refreshState();
            return code;
          }}
          onUpdateUserPlan={(userId, planCode) => {
            db.superAdminUpdateUserPlan(currentUser.id, userId, planCode);
            refreshState();
          }}
          onOpenSupabaseSync={() => setShowSupabaseModal(true)}
          onSwitchToMobile={() => setViewMode('mobile')}
          onLogout={handleLogout}
        />

        {showSupabaseModal && (
          <SupabaseSyncModal
            isOpen={showSupabaseModal}
            onClose={() => setShowSupabaseModal(false)}
            onStateSynced={refreshState}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0e17] text-[#f3f4f6] relative">
      {/* Remote Sync Toast Notification */}
      {remoteSyncToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{remoteSyncToast}</span>
        </div>
      )}

      {/* Floating Toolbar in Desktop View */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={handleLogout}
          className="px-3.5 py-2 rounded-2xl bg-slate-900/90 hover:bg-rose-950 text-rose-400 font-bold text-xs flex items-center gap-2 shadow-xl border border-rose-500/40 backdrop-blur-md active:scale-95 transition-all"
          title="Sign Out and Return to Mobile Login"
        >
          <LogOut className="w-4 h-4 text-rose-400" />
          <span>Lock Vault</span>
        </button>
        <button
          onClick={() => setShowSupabaseModal(true)}
          className="px-3.5 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-emerald-400 font-bold text-xs flex items-center gap-2 shadow-xl border border-emerald-500/40 backdrop-blur-md active:scale-95 transition-all"
          title="Supabase PostgreSQL Backend Hub"
        >
          <Cloud className="w-4 h-4 text-emerald-400" />
          <span>Supabase Hub</span>
        </button>
        <button
          onClick={() => setViewMode('mobile')}
          className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-xl shadow-indigo-600/30 border border-indigo-400/40 active:scale-95 transition-all"
        >
          <Smartphone className="w-4 h-4" />
          <span>Switch to Mobile</span>
        </button>
      </div>

      {/* Main Desktop Navbar */}
      <Navbar
        currentUser={currentUser}
        allUsers={dbState.users}
        onSwitchUser={handleSwitchUser}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeRoom={activeRoom}
        rooms={dbState.rooms}
        onSelectRoom={setActiveRoom}
        onOpenSecurityAudit={() => setShowSecurityAudit(true)}
        onOpenSupabaseSync={() => setShowSupabaseModal(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: Unified Financial Dashboard */}
        {activeTab === 'dashboard' && (
          <UnifiedDashboard
            currentUser={currentUser}
            personalExpenses={dbState.personalExpenses}
            sharedExpenses={dbState.sharedExpenses}
            expenseSplits={dbState.expenseSplits}
            settlementPayments={dbState.settlementPayments}
            allUsers={dbState.users}
            rooms={dbState.rooms}
            onOpenAddPersonal={handleOpenAddPersonal}
            onOpenAddShared={handleOpenAddShared}
            onNavigateTab={setActiveTab}
          />
        )}

        {/* TAB 2: 100% Private Personal Expense Vault */}
        {activeTab === 'personal' && (
          <PersonalVault
            currentUser={currentUser}
            personalExpenses={dbState.personalExpenses}
            onAddExpense={handleAddPersonalExpense}
            onDeleteExpense={(id) => handleDeletePersonalExpense(id)}
          />
        )}

        {/* TAB 3: Shared Room Ledger */}
        {activeTab === 'rooms' && (
          <RoomLedger
            currentUser={currentUser}
            allUsers={dbState.users}
            rooms={dbState.rooms}
            activeRoom={activeRoom}
            onSelectRoom={setActiveRoom}
            roomMembers={dbState.roomMembers}
            roomInvitations={dbState.roomInvitations}
            sharedExpenses={dbState.sharedExpenses}
            expenseSplits={dbState.expenseSplits}
            settlementPayments={dbState.settlementPayments}
            onAddSharedExpense={handleAddSharedExpense}
            onRecordSettlement={handleRecordSettlement}
            onCreateRoom={(name, desc) => {
              const newR = db.createRoom(currentUser.id, name, desc);
              refreshState();
              setActiveRoom(newR);
            }}
            onJoinRoom={(code) => {
              try {
                const joined = db.joinRoomWithCode(currentUser.id, code);
                refreshState();
                setActiveRoom(joined);
              } catch (err: unknown) {
                alert(String(err));
              }
            }}
          />
        )}

        {/* TAB 4: Student SaaS Subscription & Razorpay Tiers */}
        {activeTab === 'subscription' && (
          <UserSubscriptionView
            currentUser={currentUser}
            subscription={currentSubscription}
            subscriptionEvents={dbState.subscriptionEvents}
            onTriggerWebhook={(eventType, eventId, payload) => {
              const res = db.processRazorpayWebhook(eventId, eventType, currentUser.id, payload);
              refreshState();
              return res;
            }}
          />
        )}

        {/* TAB 5: Super Admin Platform Audit Portal */}
        {activeTab === 'admin' && (
          <SuperAdminPortal
            currentUser={currentUser}
            allUsers={dbState.users}
            rooms={dbState.rooms}
            roomMembers={dbState.roomMembers}
            sharedExpenses={dbState.sharedExpenses}
            expenseSplits={dbState.expenseSplits}
            settlementPayments={dbState.settlementPayments}
            subscriptions={dbState.subscriptions}
            subscriptionEvents={dbState.subscriptionEvents}
            auditLogs={dbState.auditLogs}
            onToggleUserSuspension={(targetUserId: string, suspend: boolean) => {
              db.superAdminToggleUserSuspension(currentUser.id, targetUserId, suspend);
              refreshState();
            }}
            onToggleRoomFreeze={(roomId: string, freeze: boolean) => {
              db.superAdminToggleRoomFreeze(currentUser.id, roomId, freeze);
              refreshState();
            }}
            onArchiveRoom={(roomId: string, archive: boolean) => {
              db.superAdminArchiveRoom(currentUser.id, roomId, archive);
              refreshState();
            }}
            onResetRoomInviteCode={(roomId: string) => {
              const code = db.superAdminResetInviteCode(currentUser.id, roomId);
              refreshState();
              return code;
            }}
            onUpdateUserPlan={(userId: string, planCode) => {
              db.superAdminUpdateUserPlan(currentUser.id, userId, planCode);
              refreshState();
            }}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Modals */}
      {showSecurityAudit && (
        <SecurityTestModal onClose={() => setShowSecurityAudit(false)} />
      )}

      {showSupabaseModal && (
        <SupabaseSyncModal
          isOpen={showSupabaseModal}
          onClose={() => setShowSupabaseModal(false)}
          onStateSynced={refreshState}
        />
      )}
    </div>
  );
}

export default App;

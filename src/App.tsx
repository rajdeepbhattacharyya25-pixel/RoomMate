import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User,
  Room,
  SharedExpense,
  SettlementPayment,
  PersonalExpense,
  SplitMethod,
  JoinPolicy,
  InvitePolicy,
  RoomJoinRequest,
} from './types';
import { db, DatabaseState } from './lib/storage/mockStorage';
import {
  fetchCloudDatabaseState,
  addSharedExpenseCloud,
  recordSettlementCloud,
  addPersonalExpenseCloud,
  deletePersonalExpenseCloud,
  subscribeToRoomRealtime,
  authenticateResidentWithSupabase,
  createRoomCloud,
  joinRoomWithCodeCloud,
  leaveRoomCloud,
  removeMemberCloud,
  transferOwnershipCloud,
  regenerateInviteCloud,
  updateRoomPoliciesCloud,
  getRoomJoinRequestsCloud,
  approveJoinRequestCloud,
  declineJoinRequestCloud,
  resolveInviteCloud,
  requestJoinRoomCloud,
  createInAppNotificationCloud,
  toggleNotificationReadCloud,
  markAllNotificationsReadCloud,
  deleteNotificationCloud,
  clearReadNotificationsCloud,
  IS_LIVE_SYNC_ENABLED,
} from './lib/storage/cloudStorageAdapter';
import { App as CapApp } from '@capacitor/app';
import { Navbar } from './components/Navbar';
import { UnifiedDashboard } from './components/UnifiedDashboard';
import { PersonalVault } from './components/PersonalVault';
import { RoomLedger } from './components/RoomLedger';
import { UserSubscriptionView } from './components/UserSubscription';
import { AdminRouter } from './components/admin/AdminRouter';
import { AdminLoginView } from './components/admin/AdminLoginView';
import { SecurityTestModal } from './components/SecurityTestModal';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { CloudSyncSheet } from './components/mobile/CloudSyncSheet';
import { sendLocalJoinApprovalNotification } from './lib/native/notifications';
import { MobileLayout } from './components/mobile/MobileLayout';
import { MobileLogin } from './components/mobile/MobileLogin';
import { AppLockGateway } from './components/mobile/AppLockGateway';
import { GooglePinSetupModal } from './components/mobile/GooglePinSetupModal';
import { FirstLoginOnboardingModal } from './components/mobile/FirstLoginOnboardingModal';
import { UpdateNotificationToast } from './components/UpdateNotificationToast';
import { syncOAuthSessionToProfile, redeemOAuthUrlOrHash } from './lib/storage/cloudStorageAdapter';
import { supabase, isSupabaseConfigured } from './lib/supabase/client';
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
import { playNotificationSound } from './lib/native/notificationSound';
import { setAppStatusBarStyle, hideSplashScreen, setupKeyboardListeners } from './lib/native/statusBar';
import { listenToNetworkStatus, listenToAppLifecycle } from './lib/native/network';
import { setupBackButtonListener } from './lib/native/backButton';
import { DesktopLandingPage } from './components/desktop/DesktopLandingPage';
import { isNativeApp, getInitialDeviceMode } from './lib/platform/deviceDetector';
import {
  initPushListeners,
  sendPushNotificationToMembers,
  deactivateCurrentDevicePush,
  EXPENSES_CHANNEL_ID,
  SETTLEMENTS_CHANNEL_ID,
} from './lib/firebase/pushService';
import { crashService } from './lib/crashlytics/crashService';
import { analytics } from './lib/analytics/posthog';
import { ShieldAlert, Smartphone, Cloud, LogOut, CheckCircle2 } from 'lucide-react';
import { NetworkProvider } from './context/NetworkContext';

const DEFAULT_RESIDENT: User = {
  id: 'usr-default-guest',
  name: 'Resident',
  email: '',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function AppContent() {
  const [dbState, setDbState] = useState<DatabaseState>(db.getState());
  const [isAuthInitializing, setIsAuthInitializing] = useState<boolean>(() => isSupabaseConfigured);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(getStoredResidentSession());
  });
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => {
    const session = getStoredResidentSession();
    const lockEnabled =
      localStorage.getItem('roommate_app_lock_enabled') !== null
        ? localStorage.getItem('roommate_app_lock_enabled') !== 'false'
        : localStorage.getItem('campusflow_app_lock_enabled') !== 'false';
    return Boolean(session && lockEnabled);
  });
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const session = getStoredResidentSession();
    if (session) {
      const found = db.getState().users.find((u) => u.id === session.sub);
      if (found) return found;
    }
    return DEFAULT_RESIDENT;
  });
  const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>(() => getInitialDeviceMode());
  const [activeTab, setActiveTab] = useState<'dashboard' | 'personal' | 'rooms' | 'subscription' | 'admin'>('dashboard');
  // Active rooms where currentUser is an active member
  const userRooms = useMemo(() => {
    return dbState.rooms.filter((r) =>
      dbState.roomMembers.some(
        (m) => m.roomId === r.id && m.userId === currentUser.id && m.status === 'ACTIVE'
      )
    );
  }, [dbState.rooms, dbState.roomMembers, currentUser.id]);

  const [activeRoom, setActiveRoom] = useState<Room | null>(() => {
    const session = getStoredResidentSession();
    const userId = session?.sub || DEFAULT_RESIDENT.id;
    const initialUserRooms = db.getState().rooms.filter((r) =>
      db.getState().roomMembers.some(
        (m) => m.roomId === r.id && m.userId === userId && m.status === 'ACTIVE'
      )
    );
    return initialUserRooms[0] || null;
  });

  // Keep activeRoom strictly in sync with userRooms
  useEffect(() => {
    if (activeRoom) {
      const stillActive = userRooms.find((r: Room) => r.id === activeRoom.id);
      if (!stillActive) {
        setActiveRoom(userRooms[0] || null);
      }
    } else if (userRooms.length > 0) {
      setActiveRoom(userRooms[0]);
    }
  }, [userRooms, activeRoom]);

  const [showSecurityAudit, setShowSecurityAudit] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [showCloudSyncSheet, setShowCloudSyncSheet] = useState(false);
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);
  const [remoteSyncToast, setRemoteSyncToast] = useState<string | null>(null);
  const [roomJoinRequests, setRoomJoinRequests] = useState<Array<RoomJoinRequest & { user: User }>>([]);
  const [googlePinSetupUser, setGooglePinSetupUser] = useState<User | null>(null);
  const [profileOnboardingUser, setProfileOnboardingUser] = useState<{
    user: User;
    extractedFirstName: string;
    needsPin: boolean;
    isGoogleUser: boolean;
  } | null>(null);

  const fetchJoinRequests = useCallback(async () => {
    if (!activeRoom?.id) {
      setRoomJoinRequests([]);
      return;
    }
    try {
      const requests = await getRoomJoinRequestsCloud(currentUser.id, activeRoom.id);
      setRoomJoinRequests(requests);
    } catch {
      try {
        setRoomJoinRequests(db.getRoomJoinRequests(currentUser.id, activeRoom.id));
      } catch {
        setRoomJoinRequests([]);
      }
    }
  }, [activeRoom?.id, currentUser.id]);

  useEffect(() => {
    fetchJoinRequests();
  }, [fetchJoinRequests, dbState]);

  // Sync state whenever db updates
  const refreshState = useCallback(() => {
    const updated = db.getState();
    setDbState({ ...updated });
    const refreshedUser = updated.users.find((u) => u.id === currentUser.id);
    if (refreshedUser) setCurrentUser(refreshedUser);
  }, [currentUser.id]);

  // 0. Native Mobile Platform Initialization (Status Bar, Notifications, Keyboard, Network, App Lock, Back Button)
  useEffect(() => {
    initNativeNotifications();
    // Light status bar ensures dark icons (clock, battery %) over light #F9F9FF theme
    setAppStatusBarStyle('LIGHT', '#F9F9FF');
    hideSplashScreen();
    const cleanupKeyboard = setupKeyboardListeners();
    const cleanupBack = setupBackButtonListener((message) => {
      setRemoteSyncToast(message);
      setTimeout(() => setRemoteSyncToast(null), 2500);
    });

    let cleanupPush = () => {};
    initPushListeners({
      onForegroundNotification: (notif) => {
        setRemoteSyncToast(`🔔 ${notif.title}`);
        setTimeout(() => setRemoteSyncToast(null), 4000);
        refreshState();
      },
      onNotificationActionPerformed: (action) => {
        const roomId = action.data?.roomId as string | undefined;
        if (roomId) {
          const targetRoom = db.getState().rooms.find((r) => r.id === roomId);
          if (targetRoom) {
            setActiveRoom(targetRoom);
            setActiveTab('rooms');
          }
        }
      },
    }).then((unsub) => {
      cleanupPush = unsub;
    });

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

    let lastBackgroundTime = 0;
    const cleanupLifecycle = listenToAppLifecycle(() => {
      // Re-hydrate cloud state
      if (IS_LIVE_SYNC_ENABLED) {
        fetchCloudDatabaseState().then((state) => {
          if (state) setDbState(state);
        });
      }

      // Check App Lock timeout on resume
      const lockEnabled =
        localStorage.getItem('roommate_app_lock_enabled') !== null
          ? localStorage.getItem('roommate_app_lock_enabled') !== 'false'
          : localStorage.getItem('campusflow_app_lock_enabled') !== 'false';
      if (lockEnabled) {
        const timeoutSetting =
          localStorage.getItem('roommate_app_lock_timeout') ||
          localStorage.getItem('campusflow_app_lock_timeout') ||
          'immediate';
        const timeoutMs = timeoutSetting === '5m' ? 300000 : timeoutSetting === '1m' ? 60000 : 3000;
        const elapsed = Date.now() - lastBackgroundTime;
        if (elapsed >= timeoutMs) {
          setIsAppLocked(true);
        }
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastBackgroundTime = Date.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cleanupKeyboard();
      cleanupBack();
      cleanupPush();
      cleanupNetwork();
      cleanupLifecycle();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshState]);

  // Analytics & Diagnostics: User Identity Sync
  useEffect(() => {
    if (currentUser && currentUser.id !== DEFAULT_RESIDENT.id) {
      crashService.setUserId(currentUser.id);
      analytics.identify(currentUser.id, { role: currentUser.role });
    } else {
      crashService.setUserId(null);
      analytics.reset();
    }
  }, [currentUser]);

  // Analytics & Diagnostics: Tab / Screen Navigation Sync
  useEffect(() => {
    analytics.trackScreen(activeTab);
    crashService.logBreadcrumb(`Navigation: Switched to ${activeTab} tab`);
  }, [activeTab]);

  // 1. Initial State Hydration from Supabase Cloud
  useEffect(() => {
    if (!IS_LIVE_SYNC_ENABLED) return;

    fetchCloudDatabaseState().then((cloudState) => {
      if (cloudState && cloudState.users.length > 0) {
        setDbState(cloudState);
        if (isAuthenticated && currentUser.id !== DEFAULT_RESIDENT.id) {
          const matched =
            cloudState.users.find((u) => u.id === currentUser.id) ||
            cloudState.users.find((u) => u.email.toLowerCase() === currentUser.email.toLowerCase());
          if (matched) {
            if (currentUser.role === 'SUPER_ADMIN' && matched.role !== 'SUPER_ADMIN') {
              matched.role = 'SUPER_ADMIN';
            }
            setCurrentUser(matched);
          }
        }
        if (cloudState.rooms.length > 0) {
          setActiveRoom((prev) => prev || cloudState.rooms[0]);
        }
        setIsRealtimeLive(true);
      }
    });
  }, [isAuthenticated, currentUser.id, currentUser.email]);

  // 2. Realtime Room Subscriptions (Multi-Device Broadcast Listener & Native Notifications)
  useEffect(() => {
    if (!IS_LIVE_SYNC_ENABLED || !activeRoom?.id) return;

    const unsubscribe = subscribeToRoomRealtime(activeRoom.id, (table, eventType) => {
      fetchCloudDatabaseState().then((cloudState) => {
        if (cloudState) {
          setDbState(cloudState);
          const readableTable = table === 'shared_expenses' ? 'Expense' : table === 'settlement_payments' ? 'Settlement' : table === 'in_app_notifications' ? 'Notification' : table;
          setRemoteSyncToast(`Realtime Sync: ${readableTable} ${eventType.toLowerCase()}d`);
          setTimeout(() => setRemoteSyncToast(null), 3500);

          if (table === 'in_app_notifications') {
            playNotificationSound();
          }

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
    // Check if user needs first-login profile onboarding
    const isAlreadyCompleted =
      user.onboardingCompleted === true ||
      Boolean(user.name && user.phone && user.name.trim() !== '' && user.name !== 'Resident');

    if (user.role === 'STUDENT' && !isAlreadyCompleted) {
      setProfileOnboardingUser({
        user,
        extractedFirstName: user.name || '',
        needsPin: false,
        isGoogleUser: false,
      });
      return;
    }

    const effectiveToken =
      _token && _token !== 'superadmin_token'
        ? _token
        : createResidentToken(user, { expiresInDays: 7, biometricVerified: false });
    storeResidentSession(effectiveToken, true);

    setCurrentUser(user);
    setIsAuthenticated(true);
    analytics.trackLoginCompleted(user.email.includes('google') ? 'google' : 'email');
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
    analytics.trackLogoutCompleted();
    if (currentUser?.id && currentUser.id !== DEFAULT_RESIDENT.id) {
      deactivateCurrentDevicePush(currentUser.id).catch((err) => {
        console.warn('[Push] Error deactivating device token on logout:', err);
      });
    }
    clearResidentSession();
    if (isSupabaseConfigured) {
      try {
        supabase.auth.signOut({ scope: 'local' });
      } catch {
        // ignore
      }
    }
    const updated = db.getState();
    setDbState({ ...updated });
    setIsAuthenticated(false);
    setCurrentUser(DEFAULT_RESIDENT);
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
    const newExp = await addSharedExpenseCloud({
      ...data,
      createdBy: currentUser.id,
    });
    hapticSuccess();
    refreshState();

    analytics.trackSharedExpenseCreated({
      category: data.category,
      splitType: data.splitMethod || 'EQUAL',
      participantCount: data.participantUserIds.length,
    });

    // Notify other room members via push and in-app notifications
    const otherMembers = data.participantUserIds.filter((id) => id !== currentUser.id);
    if (otherMembers.length > 0) {
      sendPushNotificationToMembers({
        recipientUserIds: otherMembers,
        title: `New Bill: ${data.title}`,
        body: `${currentUser.name} added ₹${data.totalAmount.toFixed(2)}. Check your share.`,
        channelId: EXPENSES_CHANNEL_ID,
        data: { roomId: data.roomId, type: 'expense' },
      });

      // Also create In-App Notifications for each roommate
      const memberCount = data.participantUserIds.length || 1;
      const userShare = data.totalAmount / memberCount;

      for (const participantId of otherMembers) {
        await createInAppNotificationCloud({
          userId: participantId,
          roomId: data.roomId,
          type: 'EXPENSE_ADDED',
          title: `New Bill: ${data.title}`,
          message: `${currentUser.name} added ₹${data.totalAmount.toFixed(2)}. Your share: ₹${userShare.toFixed(2)}.`,
          priority: 'MEDIUM',
          isRead: false,
          actionType: 'VIEW_EXPENSE',
          actionTarget: data.roomId,
          metadata: {
            amount: data.totalAmount,
            payerName: currentUser.name,
            payerId: currentUser.id,
            roomName: activeRoom?.name,
            category: data.category,
          },
          eventId: `exp_${newExp?.expense?.id || Date.now()}_${participantId}`,
        });
      }
      refreshState();
    }
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

    analytics.trackSettlementRecorded({ paymentMethod: data.paymentMethod });

    // Notify payee or payer via push and in-app notifications
    const recipient = data.payeeId !== currentUser.id ? data.payeeId : data.payerId;
    if (recipient && recipient !== currentUser.id) {
      sendPushNotificationToMembers({
        recipientUserIds: [recipient],
        title: `Settlement: ₹${data.amount.toFixed(2)}`,
        body: `${currentUser.name} settled ₹${data.amount.toFixed(2)} via ${data.paymentMethod}.`,
        channelId: SETTLEMENTS_CHANNEL_ID,
        data: { roomId: data.roomId, type: 'settlement' },
      });

      // Create In-App Notification for Payee
      await createInAppNotificationCloud({
        userId: recipient,
        roomId: data.roomId,
        type: 'PARTIAL_PAYMENT_RECEIVED',
        title: `Settlement Received: ₹${data.amount.toFixed(2)}`,
        message: `${currentUser.name} settled ₹${data.amount.toFixed(2)} via ${data.paymentMethod}. Balances updated.`,
        priority: 'MEDIUM',
        isRead: false,
        actionType: 'VIEW_DETAILS',
        actionTarget: data.roomId,
        metadata: {
          amount: data.amount,
          payerName: currentUser.name,
          payerId: currentUser.id,
          roomName: activeRoom?.name,
        },
        eventId: `settle_${Date.now()}_${recipient}`,
      });
      refreshState();
    }
  };

  const handleLeaveRoom = async (roomId: string) => {
    try {
      await leaveRoomCloud(currentUser.id, roomId);
      hapticImpact('MEDIUM');
      refreshState();

      // If leaving active room, switch to another room where user is an active member
      if (activeRoom?.id === roomId) {
        const remainingActiveRooms = dbState.rooms.filter((r) => {
          if (r.id === roomId) return false;
          return dbState.roomMembers.some(
            (rm) => rm.roomId === r.id && rm.userId === currentUser.id && rm.status === 'ACTIVE'
          );
        });
        setActiveRoom(remainingActiveRooms[0] || null);
      }
    } catch (err: unknown) {
      console.error('handleLeaveRoom error:', err);
      throw err;
    }
  };

  const handleRemoveMember = async (roomId: string, targetUserId: string) => {
    try {
      await removeMemberCloud(currentUser.id, roomId, targetUserId);
      hapticImpact('LIGHT');
      refreshState();
    } catch (err: unknown) {
      console.error('handleRemoveMember error:', err);
      throw err;
    }
  };

  const handleApproveJoinRequest = async (requestId: string) => {
    try {
      const res = await approveJoinRequestCloud(currentUser.id, requestId);
      hapticSuccess();
      refreshState();
      setRemoteSyncToast('Approved roommate join request');
      setTimeout(() => setRemoteSyncToast(null), 3000);
      sendLocalJoinApprovalNotification({
        roomName: res.room?.name || activeRoom?.name || 'Room',
        adminName: currentUser.name,
      });

      if (res.request?.userId) {
        await createInAppNotificationCloud({
          userId: res.request.userId,
          roomId: res.room?.id || activeRoom?.id,
          type: 'MEMBER_JOINED',
          title: `🎉 Welcome to ${res.room?.name || 'Flat'}!`,
          message: `${currentUser.name} approved your join request. Tap to enter your shared room ledger.`,
          priority: 'LOW',
          isRead: false,
          actionType: 'VIEW_DETAILS',
          actionTarget: res.room?.id || activeRoom?.id,
          metadata: {
            roomName: res.room?.name || activeRoom?.name,
          },
          eventId: `joinappr_${requestId}`,
        });
        refreshState();
      }
    } catch (err: unknown) {
      console.error('handleApproveJoinRequest error:', err);
      throw err;
    }
  };

  const handleDeclineJoinRequest = async (requestId: string) => {
    try {
      await declineJoinRequestCloud(currentUser.id, requestId);
      hapticImpact('LIGHT');
      refreshState();
    } catch (err: unknown) {
      console.error('handleDeclineJoinRequest error:', err);
      throw err;
    }
  };

  // In-App Notification Action Handlers
  const handleToggleNotificationRead = async (id: string, currentRead: boolean) => {
    // 1. Instant optimistic local UI update
    setDbState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) =>
        n.id === id ? { ...n, isRead: !currentRead, readAt: !currentRead ? new Date().toISOString() : undefined } : n
      ),
    }));

    // 2. Background cloud & storage persistence
    try {
      await toggleNotificationReadCloud(id, currentRead);
    } catch (err) {
      console.warn('handleToggleNotificationRead error:', err);
    }
  };

  const handleMarkAllNotificationsRead = async (ids?: string[]) => {
    // 1. Instant optimistic local UI update (0ms delay)
    const nowIso = new Date().toISOString();
    setDbState((prev) => {
      const updated = (prev.notifications || []).map((n) => {
        const isTarget = ids && ids.length > 0
          ? ids.includes(n.id)
          : (n.userId === currentUser.id || !n.userId || n.userId === 'usr-rajdeep-1' || currentUser.name?.toLowerCase().includes('rajdeep'));
        return isTarget && !n.isRead ? { ...n, isRead: true, readAt: nowIso } : n;
      });
      return { ...prev, notifications: updated };
    });

    // 2. Background cloud & storage persistence
    try {
      await markAllNotificationsReadCloud(currentUser.id, ids);
    } catch (err) {
      console.warn('handleMarkAllNotificationsRead error:', err);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    // 1. Instant optimistic local UI update
    setDbState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => n.id !== id),
    }));

    // 2. Background cloud & storage persistence
    try {
      await deleteNotificationCloud(id);
    } catch (err) {
      console.warn('handleDeleteNotification error:', err);
    }
  };

  const handleClearReadNotifications = async (ids?: string[]) => {
    // 1. Instant optimistic local UI update
    setDbState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => {
        if (ids && ids.length > 0) {
          return !ids.includes(n.id);
        }
        const isUserTarget = n.userId === currentUser.id || !n.userId || n.userId === 'usr-rajdeep-1' || currentUser.name?.toLowerCase().includes('rajdeep');
        return !(isUserTarget && n.isRead);
      }),
    }));

    // 2. Background cloud & storage persistence
    try {
      await clearReadNotificationsCloud(currentUser.id, ids);
    } catch (err) {
      console.warn('handleClearReadNotifications error:', err);
    }
  };

  const handleTransferOwnership = async (roomId: string, newAdminId: string) => {
    try {
      await transferOwnershipCloud(currentUser.id, roomId, newAdminId);
      hapticSuccess();
      refreshState();
      setRemoteSyncToast('👑 Room ownership transferred');
      setTimeout(() => setRemoteSyncToast(null), 3000);
    } catch (err: unknown) {
      console.error('handleTransferOwnership error:', err);
      throw err;
    }
  };

  const handleRegenerateInvite = async (roomId: string, expirationHours?: number) => {
    try {
      const inv = await regenerateInviteCloud(currentUser.id, roomId, expirationHours);
      hapticSuccess();
      refreshState();
      return inv;
    } catch (err: unknown) {
      console.error('handleRegenerateInvite error:', err);
      throw err;
    }
  };

  const handleUpdateRoomPolicies = async (
    roomId: string,
    policies: { joinPolicy?: JoinPolicy; invitePolicy?: InvitePolicy }
  ) => {
    try {
      await updateRoomPoliciesCloud(currentUser.id, roomId, policies);
      hapticSuccess();
      refreshState();
      setRemoteSyncToast('Room invitation policies updated');
      setTimeout(() => setRemoteSyncToast(null), 3000);
    } catch (err: unknown) {
      console.error('handleUpdateRoomPolicies error:', err);
      throw err;
    }
  };

  const handleResolveInvite = async (tokenOrCode: string) => {
    return resolveInviteCloud(tokenOrCode);
  };

  const handleRequestJoinRoom = async (tokenOrCode: string) => {
    const res = await requestJoinRoomCloud(currentUser.id, tokenOrCode);
    refreshState();
    if (res.status === 'JOINED') {
      setActiveRoom(res.room);
    }
    return res;
  };

  // Deep Link Token Consumer & Listener
  const handleDeepLinkToken = useCallback(
    async (token: string) => {
      if (!token) return;
      if (!isAuthenticated) {
        localStorage.setItem('roommate_pending_join_token', token);
        sessionStorage.setItem('roommate_pending_join_token', token);
        setRemoteSyncToast('Room invite detected. Please sign in to join.');
        setTimeout(() => setRemoteSyncToast(null), 4000);
        return;
      }

      try {
        const res = await requestJoinRoomCloud(currentUser.id, token);
        refreshState();
        if (res.status === 'JOINED') {
          setActiveRoom(res.room);
          setRemoteSyncToast(`Joined ${res.room.name}!`);
        } else if (res.status === 'PENDING') {
          setRemoteSyncToast(`Join request sent to ${res.room.name} admin.`);
        } else {
          setActiveRoom(res.room);
        }
        setTimeout(() => setRemoteSyncToast(null), 3500);
        localStorage.removeItem('roommate_pending_join_token');
        sessionStorage.removeItem('roommate_pending_join_token');
      } catch (err: unknown) {
        console.warn('Deep link join error:', err);
      }
    },
    [isAuthenticated, currentUser.id, refreshState]
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    const pendingToken =
      localStorage.getItem('roommate_pending_join_token') ||
      sessionStorage.getItem('roommate_pending_join_token');
    if (pendingToken) {
      handleDeepLinkToken(pendingToken);
    }
  }, [isAuthenticated, handleDeepLinkToken]);

  useEffect(() => {
    // 1. Check window URL on load
    const checkUrl = async () => {
      try {
        const url = new URL(window.location.href);

        // Auto-redeem OAuth tokens or auth code if present in window URL / hash
        if (
          window.location.hash.includes('access_token=') ||
          window.location.search.includes('code=') ||
          window.location.hash.includes('code=')
        ) {
          const redeemResult = await redeemOAuthUrlOrHash(window.location.href);
          if (redeemResult.success) {
            window.history.replaceState(null, '', window.location.pathname);
            return;
          }
        }

        const joinParam = url.searchParams.get('join') || url.searchParams.get('code');
        if (joinParam) {
          localStorage.setItem('roommate_pending_join_token', joinParam);
          sessionStorage.setItem('roommate_pending_join_token', joinParam);
          if (isAuthenticated) {
            handleDeepLinkToken(joinParam);
          }
          return;
        }
        const pathname = url.pathname;
        if (pathname.includes('/join/')) {
          const token = pathname.split('/join/')[1]?.split('/')[0]?.split('?')[0];
          if (token) {
            localStorage.setItem('roommate_pending_join_token', token);
            sessionStorage.setItem('roommate_pending_join_token', token);
            if (isAuthenticated) handleDeepLinkToken(token);
          }
        }

        // Email confirmation callback detection from Supabase Auth
        if (
          url.searchParams.get('verified') === 'true' ||
          url.hash.includes('type=signup')
        ) {
          setRemoteSyncToast('🎉 Email address verified! Welcome to RoomMate.');
          setTimeout(() => setRemoteSyncToast(null), 4000);
        }
      } catch {}
    };

    checkUrl();

    // 2. Listen to native Capacitor App URL open
    let appUrlSub: { remove: () => void } | null = null;
    CapApp.addListener('appUrlOpen', async (event) => {
      try {
        const rawUrl = event.url;

        // Handle native Supabase OAuth deep link callback (e.g. roommate://auth-callback#access_token=... or ?code=...)
        if (rawUrl.includes('access_token=') || rawUrl.includes('code=')) {
          const res = await redeemOAuthUrlOrHash(rawUrl);
          if (res.success) {
            return;
          }
        }

        if (rawUrl.includes('token=')) {
          const u = new URL(rawUrl);
          const t = u.searchParams.get('token');
          if (t) handleDeepLinkToken(t);
        } else if (rawUrl.includes('/join/')) {
          const t = rawUrl.split('/join/')[1]?.split('?')[0]?.split('#')[0];
          if (t) handleDeepLinkToken(t);
        }
      } catch (err) {
        console.warn('appUrlOpen parse error:', err);
      }
    }).then((handle) => {
      appUrlSub = handle;
    });

    return () => {
      if (appUrlSub) appUrlSub.remove();
    };
  }, [handleDeepLinkToken, isAuthenticated]);

  // Handle Google PIN Setup Success
  const handleGooglePinSetupSuccess = (_newPin: string) => {
    if (!googlePinSetupUser) return;
    const token = createResidentToken(googlePinSetupUser, {
      expiresInDays: 7,
      biometricVerified: false,
    });
    storeResidentSession(token, true);
    setCurrentUser(googlePinSetupUser);
    setIsAuthenticated(true);
    setGooglePinSetupUser(null);
    hapticSuccess();
    setRemoteSyncToast(`🎉 Welcome to RoomMate, ${googlePinSetupUser.name}!`);
    setTimeout(() => setRemoteSyncToast(null), 4000);
  };

  // Handle First-Login Profile Onboarding Completion (Name + Phone persisted)
  const handleProfileOnboardingCompleted = (updatedUser: User, firstName: string) => {
    const needsPin = profileOnboardingUser?.needsPin;
    setProfileOnboardingUser(null);
    refreshState();

    if (needsPin) {
      setGooglePinSetupUser(updatedUser);
    } else {
      const token = createResidentToken(updatedUser, {
        expiresInDays: 7,
        biometricVerified: false,
      });
      storeResidentSession(token, true);
      setCurrentUser(updatedUser);
      setIsAuthenticated(true);
      hapticSuccess();
      setRemoteSyncToast(`🎉 Welcome to RoomMate, ${firstName}!`);
      setTimeout(() => setRemoteSyncToast(null), 4000);
    }
  };

  // 3. Supabase Auth State Change & Google OAuth Session Listener
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAuthInitializing(false);
      return;
    }

    // Check existing or newly redirected session
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          try {
            const syncResult = await syncOAuthSessionToProfile(session.user);
            refreshState();
            if (!isAuthenticated) {
              if (syncResult.needsProfileOnboarding) {
                setProfileOnboardingUser({
                  user: syncResult.user,
                  extractedFirstName: syncResult.extractedFirstName,
                  needsPin: syncResult.needsPinSetup,
                  isGoogleUser: session.user.app_metadata?.provider === 'google',
                });
              } else if (syncResult.needsPinSetup) {
                setGooglePinSetupUser(syncResult.user);
              } else {
                const token = createResidentToken(syncResult.user, {
                  expiresInDays: 7,
                  biometricVerified: false,
                });
                storeResidentSession(token, true);
                setCurrentUser(syncResult.user);
                setIsAuthenticated(true);
              }
            } else {
              // Already authenticated, refresh user object
              setCurrentUser(syncResult.user);
            }
          } catch (err) {
            console.warn('Initial session resolution error:', err);
          }
        }
      })
      .finally(() => {
        setIsAuthInitializing(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        try {
          const syncResult = await syncOAuthSessionToProfile(session.user);
          refreshState();
          if (syncResult.needsProfileOnboarding) {
            setProfileOnboardingUser({
              user: syncResult.user,
              extractedFirstName: syncResult.extractedFirstName,
              needsPin: syncResult.needsPinSetup,
              isGoogleUser: session.user.app_metadata?.provider === 'google',
            });
          } else if (syncResult.needsPinSetup) {
            setGooglePinSetupUser(syncResult.user);
          } else {
            const token = createResidentToken(syncResult.user, {
              expiresInDays: 7,
              biometricVerified: false,
            });
            storeResidentSession(token, true);
            setCurrentUser(syncResult.user);
            setIsAuthenticated(true);
            setRemoteSyncToast(`🎉 Signed in as ${syncResult.user.name}`);
            setTimeout(() => setRemoteSyncToast(null), 3500);
          }
        } catch (err) {
          console.warn('Supabase Auth session sync error:', err);
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser((prev) => {
          if (prev && prev.role === 'SUPER_ADMIN') {
            return prev; // Never log out SuperAdmin on Supabase background signout
          }
          const session = getStoredResidentSession();
          if (session && session.sub && !session.sub.startsWith('usr-default')) {
            return prev;
          }
          clearResidentSession();
          setIsAuthenticated(false);
          return DEFAULT_RESIDENT;
        });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

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
    analytics.trackPersonalExpenseCreated({ category: data.category });
  };

  const handleDeletePersonalExpense = async (id: string) => {
    await deletePersonalExpenseCloud(currentUser.id, id);
    hapticImpact('LIGHT');
    refreshState();
    analytics.trackExpenseDeleted({ isShared: false });
  };

  if (isAuthInitializing) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300 font-medium text-xs tracking-wider uppercase">Loading RoomMate...</p>
      </div>
    );
  }

  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.toLowerCase().startsWith('/admin');

  // Direct /admin route handling (Vercel Desktop Web)
  if (!isNativeApp() && isAdminPath) {
    if (!isAuthenticated || currentUser.role !== 'SUPER_ADMIN') {
      return (
        <AdminLoginView
          allUsers={dbState.users}
          onLoginSuccess={(adminUser) => {
            handleLogin(adminUser, 'superadmin_token');
            setActiveTab('admin');
          }}
          onOpenMobilePreview={() => {
            window.history.pushState({}, '', '/');
            setViewMode('mobile');
          }}
        />
      );
    }

    return (
      <AdminRouter
        currentUser={currentUser}
        allUsers={dbState.users}
        rooms={dbState.rooms}
        roomMembers={dbState.roomMembers}
        sharedExpenses={dbState.sharedExpenses}
        splits={dbState.expenseSplits}
        settlementPayments={dbState.settlementPayments}
        subscriptions={dbState.subscriptions}
        auditLogs={dbState.auditLogs}
        onSwitchToMobile={() => {
          window.history.pushState({}, '', '/');
          setViewMode('mobile');
        }}
        onLogout={handleLogout}
        onDataMutated={refreshState}
      />
    );
  }

  // If in desktop view and not authenticated as SuperAdmin, show Desktop Landing Page
  if (!isNativeApp() && viewMode === 'desktop' && !(isAuthenticated && currentUser.role === 'SUPER_ADMIN')) {
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

  // If not authenticated, render MobileLogin screen
  if (!isAuthenticated) {
    if (isNativeApp()) {
      return (
        <div className="w-full min-h-screen bg-[#F9F9FF] text-slate-900 flex flex-col">
          <MobileLogin
            allUsers={dbState.users}
            onLogin={handleLogin}
            onJoinWithCode={async (code, newUser, token) => {
              try {
                const effectiveUser =
                  newUser ||
                  (currentUser.id === DEFAULT_RESIDENT.id
                    ? dbState.users[0] || currentUser
                    : currentUser);
                const joined = await joinRoomWithCodeCloud(effectiveUser.id, code);
                setCurrentUser(effectiveUser);
                refreshState();
                setActiveRoom(joined);
                const effectiveToken = token || createResidentToken(effectiveUser);
                storeResidentSession(effectiveToken, true);
                setIsAuthenticated(true);
                setRemoteSyncToast(`Welcome to ${joined.name}!`);
                setTimeout(() => setRemoteSyncToast(null), 3500);
              } catch (err: unknown) {
                alert(String(err));
              }
            }}
          />
          {profileOnboardingUser && (
            <FirstLoginOnboardingModal
              isOpen={Boolean(profileOnboardingUser)}
              user={profileOnboardingUser.user}
              extractedFirstName={profileOnboardingUser.extractedFirstName}
              isGoogleUser={profileOnboardingUser.isGoogleUser}
              onCompleted={handleProfileOnboardingCompleted}
            />
          )}
          {googlePinSetupUser && (
            <GooglePinSetupModal
              isOpen={Boolean(googlePinSetupUser)}
              user={googlePinSetupUser}
              onSuccess={handleGooglePinSetupSuccess}
            />
          )}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#F1F5F9] text-[#111827] flex flex-col items-center justify-center p-0 sm:py-6 selection:bg-indigo-100 selection:text-indigo-900">
        <div className="w-full sm:max-w-[420px] sm:min-h-[852px] sm:rounded-[44px] bg-[#F9F9FF] sm:border-[8px] sm:border-slate-800 shadow-2xl relative flex flex-col overflow-hidden sm:ring-1 sm:ring-slate-300">
          <MobileLogin
            allUsers={dbState.users}
            onLogin={handleLogin}
            onJoinWithCode={async (code, newUser, token) => {
              try {
                const effectiveUser =
                  newUser ||
                  (currentUser.id === DEFAULT_RESIDENT.id
                    ? dbState.users[0] || currentUser
                    : currentUser);
                const joined = await joinRoomWithCodeCloud(effectiveUser.id, code);
                setCurrentUser(effectiveUser);
                refreshState();
                setActiveRoom(joined);
                const effectiveToken = token || createResidentToken(effectiveUser);
                storeResidentSession(effectiveToken, true);
                setIsAuthenticated(true);
                setRemoteSyncToast(`Welcome to ${joined.name}!`);
                setTimeout(() => setRemoteSyncToast(null), 3500);
              } catch (err: unknown) {
                alert(String(err));
              }
            }}
          />
          {profileOnboardingUser && (
            <FirstLoginOnboardingModal
              isOpen={Boolean(profileOnboardingUser)}
              user={profileOnboardingUser.user}
              extractedFirstName={profileOnboardingUser.extractedFirstName}
              isGoogleUser={profileOnboardingUser.isGoogleUser}
              onCompleted={handleProfileOnboardingCompleted}
            />
          )}
          {googlePinSetupUser && (
            <GooglePinSetupModal
              isOpen={Boolean(googlePinSetupUser)}
              user={googlePinSetupUser}
              onSuccess={handleGooglePinSetupSuccess}
            />
          )}
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
          rooms={userRooms}
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
          onLeaveRoom={handleLeaveRoom}
          onRemoveMember={handleRemoveMember}
          roomJoinRequests={roomJoinRequests}
          onApproveJoinRequest={handleApproveJoinRequest}
          onDeclineJoinRequest={handleDeclineJoinRequest}
          onTransferOwnership={handleTransferOwnership}
          onRegenerateInvite={handleRegenerateInvite}
          onUpdateRoomPolicies={handleUpdateRoomPolicies}
          onResolveInvite={handleResolveInvite}
          onRequestJoinRoom={handleRequestJoinRoom}
          onCreateRoom={async (name, desc) => {
            analytics.trackRoomCreationStarted();
            try {
              const newR = await createRoomCloud(currentUser.id, name, desc);
              analytics.trackRoomCreated({ initialMembers: 1 });
              refreshState();
              setActiveRoom(newR);
            } catch {
              const fallback = db.createRoom(currentUser.id, name, desc);
              analytics.trackRoomCreated({ initialMembers: 1 });
              refreshState();
              setActiveRoom(fallback);
            }
          }}
          onJoinRoom={async (code) => {
            analytics.trackRoomJoinStarted();
            try {
              const joined = await joinRoomWithCodeCloud(currentUser.id, code);
              analytics.trackRoomJoined({ joinMethod: 'code' });
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
            db.clearAllData();
            setActiveRoom(null);
            refreshState();
          }}
          onSwitchToDesktopView={isNativeApp() ? undefined : () => setViewMode('desktop')}
          onLogout={handleLogout}
          isRealtimeLive={isRealtimeLive}
          onOpenSupabaseModal={() => setShowSupabaseModal(true)}
          onOpenCloudSyncSheet={() => setShowCloudSyncSheet(true)}
          onProfileUpdated={refreshState}
          notifications={
            (dbState.notifications || []).filter(
              (n) =>
                n.userId === currentUser.id ||
                !n.userId ||
                (n.userId === 'usr-rajdeep-1' && (currentUser.id === 'usr-rajdeep-1' || currentUser.name?.toLowerCase().includes('rajdeep')))
            )
          }
          onToggleNotificationRead={handleToggleNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onDeleteNotification={handleDeleteNotification}
          onClearReadNotifications={handleClearReadNotifications}
        />

        {showSecurityAudit && (
          <SecurityTestModal onClose={() => setShowSecurityAudit(false)} />
        )}

        {showCloudSyncSheet && (
          <CloudSyncSheet
            isOpen={showCloudSyncSheet}
            onClose={() => setShowCloudSyncSheet(false)}
            roomsCount={userRooms.length}
            expensesCount={(dbState.personalExpenses?.length || 0) + (dbState.sharedExpenses?.length || 0)}
            onForceSync={async () => {
              refreshState();
            }}
            onOpenDeveloperHub={() => {
              setShowCloudSyncSheet(false);
              setShowSupabaseModal(true);
            }}
          />
        )}

        {showSupabaseModal && (
          <SupabaseSyncModal
            isOpen={showSupabaseModal}
            onClose={() => setShowSupabaseModal(false)}
            onStateSynced={refreshState}
          />
        )}

        {/* Native Biometric & PIN App Lock Gateway */}
        <AppLockGateway
          isOpen={isAppLocked}
          currentUser={currentUser}
          onUnlock={() => setIsAppLocked(false)}
          onSwitchAccount={handleLogout}
        />

        {/* First-Login Profile Onboarding Modal */}
        {profileOnboardingUser && (
          <FirstLoginOnboardingModal
            isOpen={Boolean(profileOnboardingUser)}
            user={profileOnboardingUser.user}
            extractedFirstName={profileOnboardingUser.extractedFirstName}
            isGoogleUser={profileOnboardingUser.isGoogleUser}
            onCompleted={handleProfileOnboardingCompleted}
          />
        )}

        {/* Google First-Time 4-Digit PIN Setup Modal */}
        {googlePinSetupUser && (
          <GooglePinSetupModal
            isOpen={Boolean(googlePinSetupUser)}
            user={googlePinSetupUser}
            onSuccess={handleGooglePinSetupSuccess}
          />
        )}

        {/* OTA In-App Live Update Toast */}
        <UpdateNotificationToast />
      </div>
    );
  }


  // If in desktop view and authenticated as SuperAdmin, show dedicated Stitch-themed SuperAdmin Router
  if (viewMode === 'desktop' && currentUser.role === 'SUPER_ADMIN') {
    return (
      <AdminRouter
        currentUser={currentUser}
        allUsers={dbState.users}
        rooms={dbState.rooms}
        roomMembers={dbState.roomMembers}
        sharedExpenses={dbState.sharedExpenses}
        splits={dbState.expenseSplits}
        settlementPayments={dbState.settlementPayments}
        subscriptions={dbState.subscriptions}
        auditLogs={dbState.auditLogs}
        onSwitchToMobile={() => setViewMode('mobile')}
        onLogout={handleLogout}
        onDataMutated={refreshState}
      />
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
        rooms={userRooms}
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
            rooms={userRooms}
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
            rooms={userRooms}
            activeRoom={activeRoom}
            onSelectRoom={setActiveRoom}
            roomMembers={dbState.roomMembers}
            roomInvitations={dbState.roomInvitations}
            sharedExpenses={dbState.sharedExpenses}
            expenseSplits={dbState.expenseSplits}
            settlementPayments={dbState.settlementPayments}
            onAddSharedExpense={handleAddSharedExpense}
            onRecordSettlement={handleRecordSettlement}
            onLeaveRoom={handleLeaveRoom}
            onRemoveMember={handleRemoveMember}
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
          currentUser.role === 'SUPER_ADMIN' ? (
            <AdminRouter
              currentUser={currentUser}
              allUsers={dbState.users}
              rooms={dbState.rooms}
              roomMembers={dbState.roomMembers}
              sharedExpenses={dbState.sharedExpenses}
              splits={dbState.expenseSplits}
              settlementPayments={dbState.settlementPayments}
              subscriptions={dbState.subscriptions}
              auditLogs={dbState.auditLogs}
              onSwitchToMobile={() => setViewMode('mobile')}
              onLogout={handleLogout}
              onDataMutated={refreshState}
            />
          ) : (
            <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-8 text-center max-w-lg mx-auto my-12 shadow-2xl">
              <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Access Denied: SuperAdmin Required</h2>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                You are currently signed in as a student resident. The SuperAdmin platform portal and system health routes are strictly restricted.
              </p>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30"
              >
                Return to Personal Dashboard
              </button>
            </div>
          )
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

      {/* OTA In-App Live Update Toast */}
      <UpdateNotificationToast />
    </div>
  );
}

export default function App() {
  return (
    <NetworkProvider>
      <AppContent />
    </NetworkProvider>
  );
}

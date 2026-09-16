import React, { useState, useEffect, useCallback } from 'react';
import { AdminRoute } from './AdminSidebar';
import { AdminLayout } from './AdminLayout';
import { ToastMessage } from './common/Toast';
import {
  User,
  Room,
  RoomMember,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  UserSubscription,
  AuditLog,
  BugReport,
  BugStatus,
  FeatureSuggestion,
  ContactRequest,
  PlatformAnnouncement,
  PlatformSettings,
  SystemIncident,
} from '../../types';
import { db } from '../../lib/storage/mockStorage';
import {
  StepUpRiskLevel,
  checkStepUpRequired,
} from '../../lib/auth/superAdminSecurityService';
import {
  superAdminToggleUserSuspensionCloud,
  superAdminToggleRoomFreezeCloud,
  superAdminArchiveRoomCloud,
  superAdminResetRoomCodeCloud,
} from '../../lib/storage/cloudStorageAdapter';
import { StepUpAuthModal } from './common/StepUpAuthModal';

// Admin Page Imports
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsers } from './pages/AdminUsers';
import { AdminRooms } from './pages/AdminRooms';
import { AdminExpenses } from './pages/AdminExpenses';
import { AdminAnalytics } from './pages/AdminAnalytics';
import { AdminSupport } from './pages/AdminSupport';
import { AdminNotifications } from './pages/AdminNotifications';
import { AdminSecurity } from './pages/AdminSecurity';
import { AdminAuditLogs } from './pages/AdminAuditLogs';
import { AdminSystemHealth } from './pages/AdminSystemHealth';
import { AdminSettings } from './pages/AdminSettings';

interface AdminRouterProps {
  currentUser: User;
  allUsers: User[];
  rooms: Room[];
  roomMembers: RoomMember[];
  sharedExpenses: SharedExpense[];
  splits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  subscriptions?: UserSubscription[];
  auditLogs?: AuditLog[];
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
  onDataMutated?: () => void;
}

function parseUrlRoute(): { route: AdminRoute; entityId?: string } {
  const path = window.location.pathname.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const idFromQuery = searchParams.get('id') || undefined;

  if (path.includes('/admin/users')) return { route: 'users', entityId: idFromQuery };
  if (path.includes('/admin/rooms')) return { route: 'rooms', entityId: idFromQuery };
  if (path.includes('/admin/expenses')) return { route: 'expenses', entityId: idFromQuery };
  if (path.includes('/admin/analytics')) return { route: 'analytics' };
  if (path.includes('/admin/support')) return { route: 'support', entityId: idFromQuery };
  if (path.includes('/admin/notifications')) return { route: 'notifications' };
  if (path.includes('/admin/security')) return { route: 'security' };
  if (path.includes('/admin/audit-logs')) return { route: 'audit-logs' };
  if (path.includes('/admin/system-health')) return { route: 'system-health' };
  if (path.includes('/admin/settings')) return { route: 'settings' };

  return { route: 'dashboard' };
}

export const AdminRouter: React.FC<AdminRouterProps> = ({
  currentUser,
  allUsers,
  rooms,
  roomMembers,
  sharedExpenses,
  splits,
  settlementPayments,
  auditLogs = [],
  onSwitchToMobile,
  onLogout,
  onDataMutated,
}) => {
  // Routing state
  const [currentRoute, setCurrentRoute] = useState<AdminRoute>(() => parseUrlRoute().route);
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(
    () => parseUrlRoute().entityId
  );

  // Storage data states
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(() =>
    db.getPlatformSettings()
  );
  const [bugReports, setBugReports] = useState<BugReport[]>(() => db.getBugReports());
  const [featureSuggestions, setFeatureSuggestions] = useState<FeatureSuggestion[]>(() =>
    db.getFeatureSuggestions()
  );
  const [contactRequests, setContactRequests] = useState<ContactRequest[]>(
    () => (db as any).state?.contactRequests || []
  );
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>(() =>
    db.getAnnouncements()
  );
  const [systemIncidents, setSystemIncidents] = useState<SystemIncident[]>(
    () => (db as any).state?.systemIncidents || []
  );

  // Toast feedback
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Step-Up Security Modal State
  const [stepUpConfig, setStepUpConfig] = useState<{
    isOpen: boolean;
    actionTitle: string;
    actionDescription?: string;
    riskLevel: StepUpRiskLevel;
    confirmPhrase?: string;
    execute: () => Promise<void> | void;
  } | null>(null);

  const executeWithStepUp = async (
    riskLevel: StepUpRiskLevel,
    title: string,
    description: string,
    action: () => Promise<void> | void,
    confirmPhrase?: string
  ) => {
    if (checkStepUpRequired(riskLevel)) {
      setStepUpConfig({
        isOpen: true,
        actionTitle: title,
        actionDescription: description,
        riskLevel,
        confirmPhrase,
        execute: action,
      });
    } else {
      await action();
    }
  };

  const addToast = useCallback(
    (type: ToastMessage['type'], message: string, title?: string) => {
      const newToast: ToastMessage = {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        message,
        title,
      };
      setToasts((prev) => [...prev, newToast]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync route with browser history
  const handleNavigate = useCallback((route: AdminRoute, entityId?: string) => {
    setCurrentRoute(route);
    setSelectedEntityId(entityId);

    const basePath = `/admin/${route === 'dashboard' ? '' : route}`;
    const cleanPath = basePath.replace(/\/$/, '') || '/admin';
    const newUrl = entityId ? `${cleanPath}?id=${encodeURIComponent(entityId)}` : cleanPath;

    if (window.location.pathname !== cleanPath || window.location.search !== (entityId ? `?id=${entityId}` : '')) {
      window.history.pushState({ route, entityId }, '', newUrl);
    }
  }, []);

  // Browser back/forward button support
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseUrlRoute();
      setCurrentRoute(parsed.route);
      setSelectedEntityId(parsed.entityId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Refresh DB state
  const refreshStorageData = useCallback(() => {
    setPlatformSettings(db.getPlatformSettings());
    setBugReports([...db.getBugReports()]);
    setFeatureSuggestions([...db.getFeatureSuggestions()]);
    setAnnouncements([...db.getAnnouncements()]);
    setContactRequests([...((db as any).state?.contactRequests || [])]);
    setSystemIncidents([...((db as any).state?.systemIncidents || [])]);
    if (onDataMutated) onDataMutated();
  }, [onDataMutated]);

  // Operational Mutations
  const handleSuspendUser = async (userId: string, reason: string) => {
    await executeWithStepUp(
      2,
      'Suspend User Account',
      'This will immediately revoke room memberships and prevent the user from accessing the application.',
      async () => {
        try {
          db.superAdminToggleUserSuspension(currentUser.id, userId, true);
          await superAdminToggleUserSuspensionCloud(userId, true, reason);
          refreshStorageData();
          addToast('success', 'User account has been suspended.', 'User Suspended');
        } catch (err: any) {
          addToast('error', err?.message || 'Failed to suspend user.', 'Action Failed');
        }
      }
    );
  };

  const handleUnsuspendUser = async (userId: string) => {
    await executeWithStepUp(
      2,
      'Lift User Suspension',
      'This will restore the user account and permit them to access active rooms.',
      async () => {
        try {
          db.superAdminToggleUserSuspension(currentUser.id, userId, false);
          await superAdminToggleUserSuspensionCloud(userId, false);
          refreshStorageData();
          addToast('success', 'User account suspension lifted.', 'User Restored');
        } catch (err: any) {
          addToast('error', err?.message || 'Failed to restore user.', 'Action Failed');
        }
      }
    );
  };

  const handleFreezeRoom = async (roomId: string, reason: string) => {
    await executeWithStepUp(
      2,
      'Freeze Room Ledger',
      'Freezing prevents members from recording new shared expenses or settlements until unfrozen.',
      async () => {
        try {
          db.superAdminToggleRoomFreeze(currentUser.id, roomId, true);
          await superAdminToggleRoomFreezeCloud(roomId, true, reason);
          refreshStorageData();
          addToast('warning', 'Room ledger frozen during dispute investigation.', 'Room Frozen');
        } catch (err: any) {
          addToast('error', err?.message || 'Failed to freeze room.', 'Action Failed');
        }
      }
    );
  };

  const handleUnfreezeRoom = async (roomId: string) => {
    await executeWithStepUp(
      2,
      'Unfreeze Room Ledger',
      'Members will be able to record shared expenses and settle balances again.',
      async () => {
        try {
          db.superAdminToggleRoomFreeze(currentUser.id, roomId, false);
          await superAdminToggleRoomFreezeCloud(roomId, false);
          refreshStorageData();
          addToast('success', 'Room ledger unfrozen. Members can add expenses.', 'Room Restored');
        } catch (err: any) {
          addToast('error', err?.message || 'Failed to unfreeze room.', 'Action Failed');
        }
      }
    );
  };

  const handleArchiveRoom = async (roomId: string, reason: string) => {
    await executeWithStepUp(
      2,
      'Archive Room',
      'Archiving moves the room to the platform archive and hides it from normal member discovery.',
      async () => {
        try {
          db.superAdminArchiveRoom(currentUser.id, roomId, true);
          await superAdminArchiveRoomCloud(roomId, true, reason);
          refreshStorageData();
          addToast('info', 'Room moved to archive.', 'Room Archived');
        } catch (err: any) {
          addToast('error', err?.message || 'Failed to archive room.', 'Action Failed');
        }
      }
    );
  };

  const handleResetRoomCode = async (roomId: string) => {
    await executeWithStepUp(
      2,
      'Reset Room Invite Code',
      'The current invite code will be invalidated immediately and replaced with a new secure code.',
      async () => {
        try {
          const code = db.superAdminResetInviteCode(currentUser.id, roomId);
          await superAdminResetRoomCodeCloud(roomId);
          refreshStorageData();
          addToast('success', `New join code generated: ${code}`, 'Invite Code Reset');
        } catch (err: any) {
          addToast('error', err?.message || 'Failed to reset invite code.', 'Action Failed');
        }
      }
    );
  };

  const handleUpdateBugStatus = async (bugId: string, status: BugStatus, adminNotes?: string) => {
    try {
      db.updateBugReportStatus(currentUser.id, bugId, status, adminNotes);
      refreshStorageData();
      addToast('success', `Ticket #${bugId.slice(-6)} marked as ${status}`, 'Status Updated');
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to update ticket.', 'Update Failed');
    }
  };

  const handleCreateAnnouncement = async (
    data: Omit<PlatformAnnouncement, 'id' | 'sentAt' | 'recipientsCount' | 'status'>
  ) => {
    try {
      db.createAnnouncement(currentUser.id, {
        ...data,
        status: 'DELIVERED',
        recipientsCount: allUsers.length,
      });
      refreshStorageData();
      addToast('success', 'Announcement dispatched successfully!', 'Broadcast Sent');
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to broadcast announcement.', 'Error');
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<PlatformSettings>) => {
    await executeWithStepUp(
      2,
      'Update Platform Global Settings',
      'Modifying platform settings alters system policies, limits, and runtime parameters for all users.',
      async () => {
        try {
          db.updatePlatformSettings(currentUser.id, newSettings);
          refreshStorageData();
          addToast('success', 'Global platform parameters updated.', 'Settings Saved');
        } catch (err: any) {
          addToast('error', err?.message || 'Failed to update settings.', 'Error');
        }
      }
    );
  };

  const handleRevokeUserSession = async (userId: string, reason: string) => {
    await executeWithStepUp(
      2,
      'Revoke User Session',
      'Forces immediate re-authentication on the target user session.',
      async () => {
        try {
          db.logAdminAudit(currentUser.id, 'REVOKE_USER_SESSION', 'USER', userId, { reason });
          refreshStorageData();
          addToast('info', `Active session revoked for user.`, 'Session Invalidation');
        } catch {
          addToast('error', 'Failed to revoke session.', 'Error');
        }
      }
    );
  };

  const handleRevokeAllSessions = async (reason: string) => {
    await executeWithStepUp(
      3,
      'Force Revoke ALL Active Sessions',
      'DANGER: This will immediately invalidate tokens for EVERY user across the platform.',
      async () => {
        try {
          db.logAdminAudit(
            currentUser.id,
            'REVOKE_ALL_SESSIONS',
            'SYSTEM',
            'global',
            { reason }
          );
          refreshStorageData();
          addToast('warning', 'All active student sessions invalidated.', 'Global Revoke');
        } catch {
          addToast('error', 'Failed to execute global session revocation.', 'Error');
        }
      },
      'REVOKE ALL'
    );
  };

  const handleSendNotification = async (userId: string, title: string, message: string) => {
    try {
      db.createNotification({
        userId,
        type: 'SYSTEM_INFO',
        title,
        message,
        priority: 'MEDIUM',
        isRead: false,
        actionType: 'NONE',
      });
      refreshStorageData();
      addToast('success', `Message delivered to student.`, 'Notification Sent');
    } catch {
      addToast('error', 'Failed to send notification.', 'Error');
    }
  };

  const handlePurgeDemoData = async () => {
    try {
      localStorage.removeItem('roommate_saas_db_v1');
      window.location.reload();
    } catch {
      addToast('error', 'Failed to reset test seeds.', 'Reset Error');
    }
  };

  return (
    <AdminLayout
      currentRoute={currentRoute}
      onRouteChange={handleNavigate}
      currentUser={currentUser}
      allUsers={allUsers}
      rooms={rooms}
      sharedExpenses={sharedExpenses}
      bugReports={bugReports}
      auditLogs={auditLogs}
      onSwitchToMobile={onSwitchToMobile}
      onLogout={onLogout}
      toasts={toasts}
      onDismissToast={dismissToast}
    >
      {currentRoute === 'dashboard' && (
        <AdminDashboard
          currentUser={currentUser}
          allUsers={allUsers}
          rooms={rooms}
          sharedExpenses={sharedExpenses}
          expenseSplits={splits}
          settlementPayments={settlementPayments}
          auditLogs={auditLogs}
          bugReports={bugReports}
          onNavigate={(route, id) => handleNavigate(route as AdminRoute, id)}
        />
      )}

      {currentRoute === 'users' && (
        <AdminUsers
          users={allUsers}
          rooms={rooms}
          roomMembers={roomMembers}
          onToggleSuspension={(userId, suspend, reason) => {
            if (suspend) handleSuspendUser(userId, reason || 'Administrative suspension');
            else handleUnsuspendUser(userId);
          }}
          onRevokeSessions={(userId) => handleRevokeUserSession(userId, 'Revoked by admin')}
          onSendNotification={handleSendNotification}
          initialSelectedUserId={selectedEntityId}
        />
      )}

      {currentRoute === 'rooms' && (
        <AdminRooms
          rooms={rooms}
          roomMembers={roomMembers}
          sharedExpenses={sharedExpenses}
          allUsers={allUsers}
          onToggleFreeze={(roomId, freeze) => {
            if (freeze) handleFreezeRoom(roomId, 'Frozen during dispute');
            else handleUnfreezeRoom(roomId);
          }}
          onArchiveRoom={(roomId, archive) => {
            if (archive) handleArchiveRoom(roomId, 'Archived by admin');
            else {
              db.superAdminArchiveRoom(currentUser.id, roomId, false);
              refreshStorageData();
              addToast('info', 'Room restored from archive.', 'Room Restored');
            }
          }}
          onResetInviteCode={(roomId) => {
            handleResetRoomCode(roomId);
            return 'RESET';
          }}
          initialSelectedRoomId={selectedEntityId}
        />
      )}

      {currentRoute === 'expenses' && (
        <AdminExpenses
          sharedExpenses={sharedExpenses}
          rooms={rooms}
          allUsers={allUsers}
          splits={splits}
          settlementPayments={settlementPayments}
          initialSelectedExpenseId={selectedEntityId}
        />
      )}

      {currentRoute === 'analytics' && (
        <AdminAnalytics
          allUsers={allUsers}
          rooms={rooms}
          roomMembers={roomMembers}
          sharedExpenses={sharedExpenses}
          splits={splits}
          settlementPayments={settlementPayments}
        />
      )}

      {currentRoute === 'support' && (
        <AdminSupport
          bugReports={bugReports}
          featureSuggestions={featureSuggestions}
          contactRequests={contactRequests}
          allUsers={allUsers}
          onUpdateBugStatus={handleUpdateBugStatus}
          onSendNotification={handleSendNotification}
          initialSelectedTicketId={selectedEntityId}
        />
      )}

      {currentRoute === 'notifications' && (
        <AdminNotifications
          announcements={announcements}
          allUsers={allUsers}
          rooms={rooms}
          onCreateAnnouncement={handleCreateAnnouncement}
        />
      )}

      {currentRoute === 'security' && (
        <AdminSecurity
          currentUser={currentUser}
          allUsers={allUsers}
          auditLogs={auditLogs}
          onRevokeUserSession={handleRevokeUserSession}
          onRevokeAllSessions={handleRevokeAllSessions}
          onDataMutated={refreshStorageData}
        />
      )}

      {currentRoute === 'audit-logs' && <AdminAuditLogs auditLogs={auditLogs} />}

      {currentRoute === 'system-health' && (
        <AdminSystemHealth
          incidents={systemIncidents}
          onResolveIncident={async (id) => {
            const inc = systemIncidents.find((i) => i.id === id);
            if (inc) {
              inc.status = 'RESOLVED';
              inc.resolvedAt = new Date().toISOString();
              setSystemIncidents([...systemIncidents]);
              addToast('success', 'Incident marked resolved.', 'Resolved');
            }
          }}
        />
      )}

      {currentRoute === 'settings' && (
        <AdminSettings
          settings={platformSettings}
          onUpdateSettings={handleUpdateSettings}
          onPurgeDemoData={handlePurgeDemoData}
        />
      )}

      {/* Step-Up Re-Authentication Modal */}
      {stepUpConfig && (
        <StepUpAuthModal
          isOpen={stepUpConfig.isOpen}
          actionTitle={stepUpConfig.actionTitle}
          actionDescription={stepUpConfig.actionDescription}
          riskLevel={stepUpConfig.riskLevel}
          confirmPhrase={stepUpConfig.confirmPhrase}
          onSuccess={async () => {
            const exec = stepUpConfig.execute;
            setStepUpConfig(null);
            await exec();
          }}
          onCancel={() => setStepUpConfig(null)}
        />
      )}
    </AdminLayout>
  );
};

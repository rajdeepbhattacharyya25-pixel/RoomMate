import React, { useState, useEffect } from 'react';
import { AdminSidebar, AdminRoute } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { AdminCommandPalette } from './AdminCommandPalette';
import { ToastContainer, ToastMessage } from './common/Toast';
import { User, Room, SharedExpense, BugReport, AuditLog, InAppNotification } from '../../types';

interface AdminLayoutProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute, entityId?: string) => void;
  currentUser: User;
  allUsers: User[];
  rooms: Room[];
  sharedExpenses: SharedExpense[];
  bugReports?: BugReport[];
  auditLogs?: AuditLog[];
  notifications?: InAppNotification[];
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
  isCloudLive?: boolean;
  toasts?: ToastMessage[];
  onDismissToast?: (id: string) => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentRoute,
  onRouteChange,
  currentUser,
  allUsers,
  rooms,
  sharedExpenses,
  bugReports = [],
  auditLogs = [],
  notifications = [],
  onSwitchToMobile,
  onLogout,
  isCloudLive = true,
  toasts = [],
  onDismissToast,
  children,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openBugsCount = bugReports.filter((b) => b.status === 'OPEN' || b.status === 'INVESTIGATING').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex antialiased selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar */}
      <AdminSidebar
        currentRoute={currentRoute}
        onRouteChange={(route) => onRouteChange(route)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        currentUser={currentUser}
        onLogout={onLogout}
        counts={{
          users: allUsers.filter((u) => u.role === 'STUDENT').length,
          rooms: rooms.filter((r) => !r.isArchived).length,
          supportTickets: openBugsCount,
        }}
      />

      {/* Main Container Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          isSidebarCollapsed ? 'pl-20' : 'pl-64'
        }`}
      >
        {/* Persistent Topbar */}
        <AdminTopbar
          currentUser={currentUser}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onRouteChange={onRouteChange}
          onSwitchToMobile={onSwitchToMobile}
          onLogout={onLogout}
          isCloudLive={isCloudLive}
          notifications={notifications}
        />

        {/* Dynamic Page Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
          {children}
        </main>
      </div>

      {/* Command Palette Modal */}
      <AdminCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(route, entityId) => {
          onRouteChange(route, entityId);
          setIsCommandPaletteOpen(false);
        }}
        users={allUsers}
        rooms={rooms}
        expenses={sharedExpenses}
        tickets={bugReports}
        auditLogs={auditLogs}
      />

      {/* Toast Notification Container */}
      {onDismissToast && <ToastContainer toasts={toasts} onDismiss={onDismissToast} />}
    </div>
  );
};

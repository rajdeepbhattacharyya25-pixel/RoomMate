import React from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  Receipt,
  BarChart3,
  Headphones,
  Bell,
  Shield,
  FileText,
  Activity,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { User } from '../../types';

export type AdminRoute =
  | 'dashboard'
  | 'users'
  | 'rooms'
  | 'expenses'
  | 'analytics'
  | 'support'
  | 'notifications'
  | 'security'
  | 'audit-logs'
  | 'system-health'
  | 'settings';

interface AdminSidebarProps {
  currentRoute: AdminRoute;
  onRouteChange: (route: AdminRoute) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentUser: User;
  onLogout?: () => void;
  counts?: {
    users?: number;
    rooms?: number;
    supportTickets?: number;
  };
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentRoute,
  onRouteChange,
  isCollapsed,
  onToggleCollapse,
  currentUser: _currentUser,
  onLogout,
  counts = {},
}) => {
  const navItems: Array<{
    id: AdminRoute;
    label: string;
    icon: React.ReactNode;
    badge?: string | number;
    pulseDot?: boolean;
    section?: 'main' | 'admin';
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
      section: 'main',
    },
    {
      id: 'users',
      label: 'Users',
      icon: <Users className="w-4 h-4 shrink-0" />,
      badge: counts.users ? (counts.users > 999 ? `${(counts.users / 1000).toFixed(1)}k` : counts.users) : undefined,
      section: 'main',
    },
    {
      id: 'rooms',
      label: 'Rooms',
      icon: <Building2 className="w-4 h-4 shrink-0" />,
      badge: counts.rooms ? (counts.rooms > 999 ? `${(counts.rooms / 1000).toFixed(1)}k` : counts.rooms) : undefined,
      section: 'main',
    },
    {
      id: 'expenses',
      label: 'Expenses',
      icon: <Receipt className="w-4 h-4 shrink-0" />,
      section: 'main',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
      section: 'main',
    },
    {
      id: 'support',
      label: 'Support & Feedback',
      icon: <Headphones className="w-4 h-4 shrink-0" />,
      badge: counts.supportTickets ? counts.supportTickets : undefined,
      pulseDot: Boolean(counts.supportTickets && counts.supportTickets > 0),
      section: 'admin',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4 shrink-0" />,
      section: 'admin',
    },
    {
      id: 'security',
      label: 'Security',
      icon: <Shield className="w-4 h-4 shrink-0" />,
      section: 'admin',
    },
    {
      id: 'audit-logs',
      label: 'Audit Logs',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      section: 'admin',
    },
    {
      id: 'system-health',
      label: 'System Health',
      icon: <Activity className="w-4 h-4 shrink-0 text-emerald-600" />,
      badge: '99.98%',
      pulseDot: true,
      section: 'admin',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4 shrink-0" />,
      section: 'admin',
    },
  ];

  const mainItems = navItems.filter((item) => item.section === 'main');
  const adminItems = navItems.filter((item) => item.section === 'admin');

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 left-0 z-40 transition-all duration-200 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-100 justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white shadow-sm shadow-indigo-200 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-[15px] truncate">RoomMate</span>
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold px-1.5 py-0.2 rounded tracking-wider uppercase shrink-0">
                  Superadmin
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-400 truncate">Control Center</span>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Menu */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {/* Main Section */}
        <div>
          {!isCollapsed && (
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-1.5">
              Platform
            </p>
          )}
          <nav className="space-y-1">
            {mainItems.map((item) => {
              const isActive = currentRoute === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onRouteChange(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all group ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <span className={isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}>
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {item.badge}
                        </span>
                      )}
                      {isActive && !item.badge && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Administration Section */}
        <div>
          {!isCollapsed && (
            <p className="px-3 text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-1.5">
              Governance &amp; Ops
            </p>
          )}
          <nav className="space-y-1">
            {adminItems.map((item) => {
              const isActive = currentRoute === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onRouteChange(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all group ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium'
                  } ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <span className={isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}>
                    {item.icon}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.id === 'system-health'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.pulseDot && !item.badge && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/70 space-y-2">
        {!isCollapsed && (
          <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-semibold text-slate-700 truncate">Superadmin</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono shrink-0">Online</span>
          </div>
        )}

        {onLogout && (
          <button
            onClick={onLogout}
            title={isCollapsed ? 'Sign Out' : undefined}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors ${
              isCollapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        )}
      </div>
    </aside>
  );
};

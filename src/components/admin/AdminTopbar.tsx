import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  ChevronDown,
  Shield,
  Settings,
  LogOut,
  Smartphone,
  CheckCheck,
  X,
} from 'lucide-react';
import { User, InAppNotification } from '../../types';
import { AdminRoute } from './AdminSidebar';
import { formatRelativeTime } from '../../lib/utils/currencyFormatter';

interface AdminTopbarProps {
  currentUser: User;
  onOpenCommandPalette: () => void;
  onRouteChange: (route: AdminRoute) => void;
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
  isCloudLive?: boolean;
  notifications?: InAppNotification[];
  onDismissNotification?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  currentUser,
  onOpenCommandPalette,
  onRouteChange,
  onSwitchToMobile,
  onLogout,
  isCloudLive = true,
  notifications = [],
  onDismissNotification,
  onMarkAllNotificationsRead,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadNotifs = notifications.filter((n) => !n.isRead);

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-6 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Mobile brand mark (visible on small screens when sidebar is collapsed/hidden) */}
      <div className="flex items-center gap-2 lg:hidden mr-3 shrink-0">
        <img
          src="/logo.png"
          alt="RoomMate"
          className="w-7 h-7 rounded-lg object-contain shadow-2xs"
        />
        <span className="font-bold text-xs tracking-tight text-slate-900 hidden sm:inline">RoomMate</span>
      </div>

      {/* Search Input Container -> Triggers Ctrl+K */}
      <div className="flex-1 max-w-lg cursor-pointer" onClick={onOpenCommandPalette}>
        <div className="relative flex items-center group">
          <Search className="w-4 h-4 absolute left-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          <input
            type="text"
            readOnly
            placeholder="Search users, rooms, expenses... (Ctrl+K)"
            className="w-full pl-10 pr-16 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 cursor-pointer group-hover:border-indigo-300 group-hover:bg-white transition-all shadow-2xs"
          />
          <div className="absolute right-3 flex items-center gap-1 pointer-events-none">
            <kbd className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
              Ctrl
            </kbd>
            <kbd className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
              K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right Header Controls */}
      <div className="flex items-center gap-3">
        {/* Live Cloud Status Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{isCloudLive ? 'Cloud Systems Operational' : 'Offline Mock Vault'}</span>
        </div>

        {/* Mobile Preview Switcher (Desktop Web feature) */}
        {onSwitchToMobile && (
          <button
            onClick={onSwitchToMobile}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors shadow-2xs"
            title="Launch 390px Mobile Simulator in browser"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile App</span>
          </button>
        )}

        <div className="h-5 w-px bg-slate-200 hidden sm:block" />

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-84 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">System Notifications</span>
                  {unreadNotifs.length > 0 && (
                    <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                      {unreadNotifs.length} new
                    </span>
                  )}
                </div>
                {unreadNotifs.length > 0 && onMarkAllNotificationsRead && (
                  <button
                    onClick={onMarkAllNotificationsRead}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                    title="Mark all notifications as read"
                  >
                    <CheckCheck className="w-3 h-3" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">No recent notifications</div>
                ) : (
                  notifications.slice(0, 8).map((n) => (
                    <div
                      key={n.id}
                      className={`p-3 hover:bg-slate-50 transition-colors flex items-start justify-between gap-2.5 ${
                        !n.isRead ? 'bg-indigo-50/20' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {!n.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />
                          )}
                          <p className="text-xs font-bold text-slate-900 truncate">{n.title}</p>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug break-words">
                          {n.message}
                        </p>
                        {n.createdAt && (
                          <span className="text-[10px] text-slate-400 mt-1 block">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        )}
                      </div>
                      {onDismissNotification && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDismissNotification(n.id);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                          title="Dismiss notification"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="p-2 border-t border-slate-100 text-center bg-slate-50">
                <button
                  onClick={() => {
                    onRouteChange('notifications');
                    setNotifOpen(false);
                  }}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                >
                  Manage Announcements &rarr;
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SuperAdmin Profile Dropdown */}
        <div className="relative pl-1" ref={profileRef}>
          <div
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 cursor-pointer group p-1 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs ring-2 ring-indigo-100">
                SA
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="text-left hidden lg:block max-w-[130px]">
              <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                {currentUser.name || 'Superadmin'}
              </p>
              <p className="text-[10px] text-slate-400 font-mono truncate">{currentUser.email}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
          </div>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-start gap-2.5">
                <img
                  src="/logo.png"
                  alt="RoomMate"
                  className="w-7 h-7 rounded-lg object-contain shadow-2xs shrink-0 mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name || 'Superadmin'}</p>
                  <p className="text-[11px] text-slate-500 font-mono truncate">{currentUser.email}</p>
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    Platform Owner
                  </span>
                </div>
              </div>
              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => {
                    onRouteChange('security');
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span>Security &amp; MFA</span>
                </button>
                <button
                  onClick={() => {
                    onRouteChange('settings');
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Platform Settings</span>
                </button>
                <div className="my-1 border-t border-slate-100" />
                {onLogout && (
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

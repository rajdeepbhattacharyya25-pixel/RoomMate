import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  ChevronDown,
  Shield,
  Settings,
  LogOut,
  Smartphone,
} from 'lucide-react';
import { User, InAppNotification } from '../../types';
import { AdminRoute } from './AdminSidebar';

interface AdminTopbarProps {
  currentUser: User;
  onOpenCommandPalette: () => void;
  onRouteChange: (route: AdminRoute) => void;
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
  isCloudLive?: boolean;
  notifications?: InAppNotification[];
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  currentUser,
  onOpenCommandPalette,
  onRouteChange,
  onSwitchToMobile,
  onLogout,
  isCloudLive = true,
  notifications = [],
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
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-xs font-bold text-slate-900">System Notifications</span>
                <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                  {unreadNotifs.length} new
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">No recent notifications</div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <div key={n.id} className="p-3 hover:bg-slate-50 transition-colors">
                      <p className="text-xs font-bold text-slate-900">{n.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.message}</p>
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
              <div className="p-3 border-b border-slate-100 bg-slate-50">
                <p className="text-xs font-bold text-slate-900">{currentUser.name || 'Superadmin'}</p>
                <p className="text-[11px] text-slate-500 font-mono truncate">{currentUser.email}</p>
                <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                  Platform Owner
                </span>
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

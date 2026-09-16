import React from 'react';
import { User, Room } from '../types';
import { Shield, Lock, Users, CreditCard, LayoutDashboard, UserCheck, Flame, ShieldAlert, Cloud } from 'lucide-react';

interface NavbarProps {
  currentUser: User;
  allUsers: User[];
  onSwitchUser: (user: User) => void;
  activeTab: 'dashboard' | 'personal' | 'rooms' | 'subscription' | 'admin';
  onSelectTab: (tab: 'dashboard' | 'personal' | 'rooms' | 'subscription' | 'admin') => void;
  activeRoom: Room | null;
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
  onOpenSecurityAudit: () => void;
  onOpenSupabaseSync: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  allUsers,
  onSwitchUser,
  activeTab,
  onSelectTab,
  activeRoom: _activeRoom,
  rooms: _rooms,
  onSelectRoom: _onSelectRoom,
  onOpenSecurityAudit,
  onOpenSupabaseSync,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-[var(--border-subtle)] px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Logo */}
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-indigo-200 to-emerald-400 bg-clip-text text-transparent">
                  RoomMate
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  SaaS Core
                </span>
              </div>
              <p className="text-xs text-[var(--text-subtle)]">Live Together. Spend Smarter.</p>
            </div>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={onOpenSupabaseSync}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              title="Supabase Backend Hub"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Supabase</span>
            </button>
            <button
              onClick={onOpenSecurityAudit}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Audit</span>
            </button>
          </div>
        </div>

        {/* Center Nav Tabs */}
        <nav className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-[var(--border-subtle)] overflow-x-auto max-w-full">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-[var(--text-muted)] hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Unified Outflow</span>
          </button>

          <button
            onClick={() => onSelectTab('personal')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'personal'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'text-[var(--text-muted)] hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Private Vault</span>
          </button>

          <button
            onClick={() => onSelectTab('rooms')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'rooms'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-[var(--text-muted)] hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Shared Rooms</span>
          </button>

          <button
            onClick={() => onSelectTab('subscription')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'subscription'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-[var(--text-muted)] hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>My Plan</span>
          </button>

          {/* Super Admin Tab */}
          <button
            onClick={() => onSelectTab('admin')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'admin'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Platform Admin</span>
          </button>
        </nav>

        {/* Right Side: Supabase Hub, Security Auditor & Active User Switcher */}
        <div className="flex items-center gap-3">
          {/* Supabase Hub Button */}
          <button
            onClick={onOpenSupabaseSync}
            className="hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all font-medium"
            title="Open Supabase Cloud Database Hub"
          >
            <Cloud className="w-4 h-4 text-emerald-400" />
            <span>Supabase Hub</span>
          </button>

          {/* Security Audit Button */}
          <button
            onClick={onOpenSecurityAudit}
            className="hidden md:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-all font-medium"
            title="Run simulated IDOR and privacy boundary tests"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>IDOR Audit</span>
          </button>

          {/* Persona Switcher Dropdown */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)]">
            <UserCheck className="w-4 h-4 text-indigo-400" />
            <div className="flex flex-col">
              <span className="text-[10px] text-[var(--text-subtle)] font-medium leading-none">Testing As</span>
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const u = allUsers.find((user) => user.id === e.target.value);
                  if (u) onSwitchUser(u);
                }}
                className="!bg-transparent !p-0 !border-none !text-xs font-bold !text-white cursor-pointer focus:!ring-0"
              >
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                    {u.name} ({u.role === 'SUPER_ADMIN' ? '👑 Admin' : '🎓 Student'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

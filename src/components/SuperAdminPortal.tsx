import React, { useState } from 'react';
import { 
  User, 
  Room, 
  UserSubscription, 
  SubscriptionEvent, 
  AuditLog,
  RoomMember,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment
} from '../types';
import { 
  Shield, 
  Users, 
  CreditCard, 
  Search, 
  RefreshCw, 
  Snowflake, 
  Archive, 
  Eye, 
  Layers, 
  ChevronRight, 
  X, 
  Activity, 
  LogOut,
  Smartphone,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Key,
  ShieldCheck,
  TrendingUp,
  Receipt,
  Filter
} from 'lucide-react';

interface SuperAdminPortalProps {
  currentUser: User;
  allUsers: User[];
  rooms: Room[];
  roomMembers?: RoomMember[];
  sharedExpenses?: SharedExpense[];
  expenseSplits?: ExpenseSplit[];
  settlementPayments?: SettlementPayment[];
  subscriptions: UserSubscription[];
  subscriptionEvents: SubscriptionEvent[];
  auditLogs: AuditLog[];
  onToggleUserSuspension: (targetUserId: string, suspend: boolean) => void;
  onToggleRoomFreeze?: (roomId: string, freeze: boolean) => void;
  onArchiveRoom?: (roomId: string, archive: boolean) => void;
  onResetRoomInviteCode?: (roomId: string) => string;
  onUpdateUserPlan?: (userId: string, planCode: 'FREE' | 'PRO' | 'CAMPUS_MAX') => void;
  onOpenSupabaseSync?: () => void;
  onSwitchToMobile?: () => void;
  onLogout?: () => void;
}

export const SuperAdminPortal: React.FC<SuperAdminPortalProps> = ({
  currentUser,
  allUsers,
  rooms,
  roomMembers = [],
  sharedExpenses = [],
  expenseSplits: _expenseSplits = [],
  settlementPayments: _settlementPayments = [],
  subscriptions,
  subscriptionEvents: _subscriptionEvents = [],
  auditLogs,
  onToggleUserSuspension,
  onToggleRoomFreeze,
  onArchiveRoom,
  onResetRoomInviteCode,
  onUpdateUserPlan,
  onOpenSupabaseSync,
  onSwitchToMobile,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'users' | 'subscriptions' | 'audit'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState<'all' | 'active' | 'frozen' | 'archived'>('all');
  const [inspectedRoom, setInspectedRoom] = useState<Room | null>(null);
  const [resetCodeNotice, setResetCodeNotice] = useState<string | null>(null);

  // Platform Metrics
  const totalStudents = allUsers.filter((u) => u.role === 'STUDENT').length;
  const activeRooms = rooms.filter((r) => !r.isArchived && !r.isFrozen).length;
  const frozenRooms = rooms.filter((r) => r.isFrozen).length;
  const archivedRooms = rooms.filter((r) => r.isArchived).length;
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'ACTIVE').length;
  const suspendedCount = allUsers.filter((u) => u.isSuspended).length;

  // Monthly Recurring Revenue (MRR)
  const mrr = subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.priceInr, 0);

  // Gross Transaction Volume across all rooms
  const grossVolume = sharedExpenses.reduce((sum, e) => sum + e.totalAmount, 0);

  // Filtered Students
  const studentsList = allUsers
    .filter((u) => u.role === 'STUDENT')
    .filter(
      (u) =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Filtered Rooms
  const filteredRooms = rooms
    .filter((r) => {
      if (roomFilter === 'active') return !r.isArchived && !r.isFrozen;
      if (roomFilter === 'frozen') return r.isFrozen;
      if (roomFilter === 'archived') return r.isArchived;
      return true;
    })
    .filter((r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const handleResetInviteCode = (roomId: string) => {
    if (onResetRoomInviteCode) {
      const newCode = onResetRoomInviteCode(roomId);
      setResetCodeNotice(`Generated fresh invite code "${newCode}" for room.`);
      setTimeout(() => setResetCodeNotice(null), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      {/* 1. TOP ENTERPRISE NAVBAR (Stitch Refined Utility Style) */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 lg:px-8 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand & Context */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-slate-900">CampusFlow</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  Operations Console
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal">SaaS Governance & Multi-Room Ledger Management</p>
            </div>
          </div>

          {/* Quick System Status & Actions */}
          <div className="flex items-center gap-2.5">
            {/* Supabase Live Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Supabase Cloud Live</span>
            </div>

            {onOpenSupabaseSync && (
              <button
                onClick={onOpenSupabaseSync}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium border border-slate-200 transition-colors shadow-xs"
                title="Inspect PostgreSQL synchronization"
              >
                <Cloud className="w-3.5 h-3.5 text-indigo-600" />
                <span>Supabase Hub</span>
              </button>
            )}

            {onSwitchToMobile && (
              <button
                onClick={onSwitchToMobile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors"
                title="Launch 390px Mobile Simulator in browser"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mobile Preview</span>
              </button>
            )}

            <div className="h-5 w-px bg-slate-200 hidden sm:block" />

            {/* Admin User Chip */}
            <div className="flex items-center gap-2 pl-1">
              <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-bold font-mono">
                SA
              </div>
              <span className="text-xs text-slate-700 font-medium hidden lg:inline max-w-[150px] truncate font-mono">
                {currentUser.email}
              </span>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Sign Out of Platform Admin"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. SUB-NAVIGATION TABS (Segmented Apple/Stitch Controller) */}
      <div className="bg-white border-b border-slate-200 px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200/80">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>SaaS Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('rooms')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'rooms'
                  ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All Rooms ({rooms.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'users'
                  ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Students ({totalStudents})</span>
            </button>

            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'subscriptions'
                  ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Subscriptions (₹{mrr})</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-white text-indigo-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Audit Trail</span>
            </button>
          </nav>

          {/* Quick Info */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span>Platform Status:</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
            </span>
          </div>
        </div>
      </div>

      {/* Notice Toast */}
      {resetCodeNotice && (
        <div className="max-w-7xl mx-auto w-full px-6 lg:px-8 pt-4">
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-center justify-between animate-in fade-in">
            <span className="font-medium">{resetCodeNotice}</span>
            <button onClick={() => setResetCodeNotice(null)}>
              <X className="w-4 h-4 text-indigo-500 hover:text-indigo-700" />
            </button>
          </div>
        </div>
      )}

      {/* 3. MAIN DASHBOARD CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-8 py-8 space-y-8">
        {/* TAB 1: SAAS OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* 4 Clean Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* MRR */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Monthly Recurring Revenue</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                    ₹{mrr.toLocaleString('en-IN')}
                  </div>
                  <p className="text-xs text-emerald-600 font-medium mt-1">
                    {activeSubscriptions} active paying subscriptions
                  </p>
                </div>
              </div>

              {/* Gross Platform Volume */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Platform Gross Volume</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                    ₹{grossVolume.toLocaleString('en-IN')}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Across {sharedExpenses.length} shared flat expenses
                  </p>
                </div>
              </div>

              {/* Room Groups */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Registered Rooms</span>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                    {rooms.length}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {activeRooms} Active • {frozenRooms} Frozen • {archivedRooms} Archived
                  </p>
                </div>
              </div>

              {/* Student Accounts */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Student Residents</span>
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                    {totalStudents}
                  </div>
                  <p className="text-xs text-rose-600 font-medium mt-1">
                    {suspendedCount === 0 ? 'Zero account suspensions' : `${suspendedCount} suspended for abuse`}
                  </p>
                </div>
              </div>
            </div>

            {/* Split Grid: Room Operations & Subscription Tiers */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (8 cols): Recent Active Rooms Table */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Room Ledgers Quick Access</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Live monitoring of flatmates and shared outlays</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('rooms')}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                  >
                    <span>View All ({rooms.length})</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/75 border-b border-slate-200/80 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Room Name</th>
                        <th className="py-3 px-4">Members</th>
                        <th className="py-3 px-4">Outflow Volume</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {rooms.slice(0, 5).map((r) => {
                        const membersCount = roomMembers.filter((m) => m.roomId === r.id).length;
                        const roomExpenses = sharedExpenses.filter((e) => e.roomId === r.id);
                        const total = roomExpenses.reduce((sum, e) => sum + e.totalAmount, 0);

                        return (
                          <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              <div>{r.name}</div>
                              <div className="text-[11px] text-slate-400 font-normal truncate max-w-xs">{r.description || 'Hostel / Flat group'}</div>
                            </td>
                            <td className="py-3 px-4">{membersCount} members</td>
                            <td className="py-3 px-4 font-mono font-medium text-slate-900 tabular-nums">
                              ₹{total.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-4">
                              {r.isFrozen ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                  <Snowflake className="w-3 h-3" /> Frozen
                                </span>
                              ) : r.isArchived ? (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  Archived
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => setInspectedRoom(r)}
                                className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-indigo-600 border border-slate-200 font-semibold text-xs shadow-2xs"
                              >
                                Inspect
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column (4 cols): SaaS Tier Breakdown */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Subscription Plans Breakdown</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Live Razorpay recurring tiers</p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">Starter Free</div>
                        <div className="text-[11px] text-slate-500">1 Shared Room • Basic Vault</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-slate-900 font-mono">
                          {subscriptions.filter((s) => s.planCode === 'FREE').length}
                        </div>
                        <div className="text-[10px] text-slate-400">users</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-indigo-900">Campus Pro (₹49/mo)</div>
                        <div className="text-[11px] text-indigo-600">Unlimited Rooms • WhatsApp UPI</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-indigo-900 font-mono">
                          {subscriptions.filter((s) => s.planCode === 'PRO').length}
                        </div>
                        <div className="text-[10px] text-indigo-500">paying</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-emerald-900">Campus Max (₹149/mo)</div>
                        <div className="text-[11px] text-emerald-600">Entire Flat Pro • Multi-Room Host</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-emerald-900 font-mono">
                          {subscriptions.filter((s) => s.planCode === 'CAMPUS_MAX').length}
                        </div>
                        <div className="text-[10px] text-emerald-500">paying</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Security Insight */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>PostgreSQL Row-Level Security</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Student access is isolated at the database level. Students can never view private records or expenses from rooms they are not members of.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ALL ROOMS DIRECTORY */}
        {activeTab === 'rooms' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            {/* Filter & Search Bar */}
            <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Global Room Control Directory</h2>
                <p className="text-xs text-slate-500 mt-0.5">Inspect ledgers, freeze rooms during roommate disputes, or reset leaked invite codes.</p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                {/* Search */}
                <div className="relative flex-1 md:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search room name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200">
                  <button
                    onClick={() => setRoomFilter('all')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${roomFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setRoomFilter('active')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${roomFilter === 'active' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setRoomFilter('frozen')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${roomFilter === 'frozen' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Frozen
                  </button>
                  <button
                    onClick={() => setRoomFilter('archived')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${roomFilter === 'archived' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Archived
                  </button>
                </div>
              </div>
            </div>

            {/* Rooms Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3.5 px-4">Room Name & Info</th>
                    <th className="py-3.5 px-4">Invite Code</th>
                    <th className="py-3.5 px-4">Owner</th>
                    <th className="py-3.5 px-4">Members</th>
                    <th className="py-3.5 px-4">Total Outflow</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Governance Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No rooms match the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRooms.map((room) => {
                      const members = roomMembers.filter((m) => m.roomId === room.id);
                      const roomExpenses = sharedExpenses.filter((e) => e.roomId === room.id);
                      const roomTotal = roomExpenses.reduce((sum, e) => sum + e.totalAmount, 0);
                      const creator = allUsers.find((u) => u.id === room.createdBy);

                      return (
                        <tr key={room.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{room.name}</div>
                            <div className="text-[11px] text-slate-400 line-clamp-1">{room.description || 'Shared flat'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {room.id.substring(0, 6).toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{creator?.name || 'Unknown'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{creator?.email}</div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {members.length} members
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                            ₹{roomTotal.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4">
                            {room.isFrozen ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                <Snowflake className="w-3 h-3" /> Frozen
                              </span>
                            ) : room.isArchived ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                Archived
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Inspect */}
                              <button
                                onClick={() => setInspectedRoom(room)}
                                className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs"
                                title="Inspect room members and expenses"
                              >
                                Inspect
                              </button>

                              {/* Freeze */}
                              {onToggleRoomFreeze && (
                                <button
                                  onClick={() => onToggleRoomFreeze(room.id, !room.isFrozen)}
                                  className={`px-2.5 py-1 rounded-md text-xs font-medium border shadow-2xs transition-colors ${
                                    room.isFrozen
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                  }`}
                                  title={room.isFrozen ? 'Unfreeze room' : 'Freeze room to prevent new expenses during dispute'}
                                >
                                  {room.isFrozen ? 'Unfreeze' : 'Freeze'}
                                </button>
                              )}

                              {/* Reset Code */}
                              {onResetRoomInviteCode && (
                                <button
                                  onClick={() => handleResetInviteCode(room.id)}
                                  className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 shadow-2xs"
                                  title="Reset room invite code"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Archive */}
                              {onArchiveRoom && (
                                <button
                                  onClick={() => onArchiveRoom(room.id, !room.isArchived)}
                                  className="p-1 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 shadow-2xs"
                                  title={room.isArchived ? 'Restore room' : 'Archive room'}
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: STUDENT USER DIRECTORY */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Student Residents Directory</h2>
                <p className="text-xs text-slate-500 mt-0.5">Manage platform access, override plan tiers, or suspend accounts for policy violations.</p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by student name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3.5 px-4">Student</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Plan Tier</th>
                    <th className="py-3.5 px-4">Room Memberships</th>
                    <th className="py-3.5 px-4 text-right">Moderation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {studentsList.map((student) => {
                    const sub = subscriptions.find((s) => s.userId === student.id);
                    const userRooms = roomMembers.filter((m) => m.userId === student.id);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center border border-slate-200">
                              {student.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{student.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{student.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {student.isSuspended ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {onUpdateUserPlan ? (
                            <select
                              value={sub?.planCode || 'FREE'}
                              onChange={(e) => onUpdateUserPlan(student.id, e.target.value as any)}
                              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
                            >
                              <option value="FREE">Starter Free (₹0)</option>
                              <option value="PRO">Campus Pro (₹49)</option>
                              <option value="CAMPUS_MAX">Campus Max (₹149)</option>
                            </select>
                          ) : (
                            <span className="font-semibold text-slate-900">{sub ? sub.planName : 'Starter Free'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {userRooms.length} room{userRooms.length === 1 ? '' : 's'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {student.isSuspended ? (
                            <button
                              onClick={() => onToggleUserSuspension(student.id, false)}
                              className="px-3 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-colors shadow-2xs"
                            >
                              Reactivate Account
                            </button>
                          ) : (
                            <button
                              onClick={() => onToggleUserSuspension(student.id, true)}
                              className="px-3 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors shadow-2xs"
                            >
                              Suspend Account
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: SUBSCRIPTIONS & RAZORPAY METRICS */}
        {activeTab === 'subscriptions' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">SaaS Subscriptions & Payment Ledger</h2>
              <p className="text-xs text-slate-500 mt-0.5">Recurring revenue streams synced via Razorpay webhooks.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Plan Name</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Current Period End</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {subscriptions.map((sub) => {
                    const student = allUsers.find((u) => u.id === sub.userId);
                    return (
                      <tr key={sub.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{student?.name || 'Resident'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{student?.email}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{sub.planName}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                          ₹{sub.priceInr}/mo
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            sub.status === 'ACTIVE' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {sub.currentPeriodEnd.split('T')[0]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: SECURITY AUDIT TRAIL */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Security & Administrative Audit Trail</h2>
              <p className="text-xs text-slate-500 mt-0.5">Immutable record of room status changes, suspensions, and access events.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Resource</th>
                    <th className="py-3 px-4">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 text-slate-400">
                        {log.createdAt.split('T')[0]} {log.createdAt.split('T')[1]?.substring(0, 8)}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-indigo-700">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        [{log.resourceType}]
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 truncate max-w-md">
                        {log.metadata ? JSON.stringify(log.metadata) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* 4. MODAL: INSPECT ROOM LEDGER (Clean Natural Developer Modal) */}
      {inspectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">SuperAdmin Room Inspection</div>
                <h3 className="text-lg font-bold text-slate-900">{inspectedRoom.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{inspectedRoom.description || 'Hostel / Flat group'}</p>
              </div>
              <button
                onClick={() => setInspectedRoom(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[65vh] overflow-y-auto space-y-6">
              {/* Member Roster */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Room Members ({roomMembers.filter((m) => m.roomId === inspectedRoom.id).length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {roomMembers
                    .filter((m) => m.roomId === inspectedRoom.id)
                    .map((member) => {
                      const memberUser = allUsers.find((u) => u.id === member.userId);
                      return (
                        <div
                          key={member.id}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900">{memberUser?.name || 'Resident'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{memberUser?.email}</div>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                            {member.role}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Recent Room Shared Expenses */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Recent Shared Expenses ({sharedExpenses.filter((e) => e.roomId === inspectedRoom.id).length})
                </h4>
                <div className="space-y-2">
                  {sharedExpenses
                    .filter((e) => e.roomId === inspectedRoom.id)
                    .slice(0, 5)
                    .map((exp) => {
                      const payer = allUsers.find((u) => u.id === exp.paidBy);
                      return (
                        <div
                          key={exp.id}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{exp.title}</div>
                            <div className="text-[10px] text-slate-400">
                              Paid by {payer?.name || 'Unknown'} on {exp.expenseDate} • {exp.category}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-slate-900 tabular-nums">
                            ₹{exp.totalAmount.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              {onToggleRoomFreeze && (
                <button
                  onClick={() => {
                    onToggleRoomFreeze(inspectedRoom.id, !inspectedRoom.isFrozen);
                    setInspectedRoom({ ...inspectedRoom, isFrozen: !inspectedRoom.isFrozen });
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-2xs transition-colors ${
                    inspectedRoom.isFrozen
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  {inspectedRoom.isFrozen ? 'Unfreeze Room' : 'Freeze Room'}
                </button>
              )}
              <button
                onClick={() => setInspectedRoom(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Users,
  Building2,
  Receipt,
  Headphones,
  FileText,
  Activity,
  Settings,
  BellPlus,
  ArrowRight,
  X,
} from 'lucide-react';
import { User, Room, SharedExpense, BugReport, AuditLog } from '../../types';
import { AdminRoute } from './AdminSidebar';
import { formatInr } from '../../lib/utils/currencyFormatter';

interface AdminCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: AdminRoute, entityId?: string) => void;
  users: User[];
  rooms: Room[];
  expenses: SharedExpense[];
  tickets: BugReport[];
  auditLogs: AuditLog[];
}

interface PaletteItem {
  id: string;
  category: 'USERS' | 'ROOMS' | 'EXPENSES' | 'SUPPORT' | 'ACTIONS';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
}

export const AdminCommandPalette: React.FC<AdminCommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  users,
  rooms,
  expenses,
  tickets,
  auditLogs: _auditLogs,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle global keyboard shortcuts (Ctrl+K / Cmd+K and Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Results computation
  const results = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: PaletteItem[] = [];

    // Quick Actions
    const quickActions: PaletteItem[] = [
      {
        id: 'action-create-announcement',
        category: 'ACTIONS',
        title: 'Create Platform Announcement',
        subtitle: 'Broadcast notifications to all active residents',
        icon: <BellPlus className="w-4 h-4 text-indigo-600" />,
        action: () => onNavigate('notifications'),
      },
      {
        id: 'action-view-system-health',
        category: 'ACTIONS',
        title: 'Inspect System Health & Error Logs',
        subtitle: 'Review latency, database metrics and error telemetry',
        icon: <Activity className="w-4 h-4 text-emerald-600" />,
        action: () => onNavigate('system-health'),
      },
      {
        id: 'action-open-settings',
        category: 'ACTIONS',
        title: 'Open Platform Global Settings',
        subtitle: 'Configure join policies, auth, and maintenance mode',
        icon: <Settings className="w-4 h-4 text-slate-600" />,
        action: () => onNavigate('settings'),
      },
      {
        id: 'action-view-audit',
        category: 'ACTIONS',
        title: 'Review Administrative Audit Logs',
        subtitle: 'Inspect immutable records of administrative actions',
        icon: <FileText className="w-4 h-4 text-amber-600" />,
        action: () => onNavigate('audit-logs'),
      },
    ];

    if (!q) {
      return quickActions;
    }

    // Filter Users
    users
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((u) => {
        items.push({
          id: `user-${u.id}`,
          category: 'USERS',
          title: u.name,
          subtitle: `${u.email} • ${u.role === 'SUPER_ADMIN' ? 'Superadmin' : 'Student'}`,
          icon: <Users className="w-4 h-4 text-indigo-600" />,
          action: () => onNavigate('users', u.id),
        });
      });

    // Filter Rooms
    rooms
      .filter((r) => r.name.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q)))
      .slice(0, 4)
      .forEach((r) => {
        items.push({
          id: `room-${r.id}`,
          category: 'ROOMS',
          title: r.name,
          subtitle: `${r.description || 'Student Room'} • ${r.isFrozen ? 'Frozen' : r.isArchived ? 'Archived' : 'Active'}`,
          icon: <Building2 className="w-4 h-4 text-purple-600" />,
          action: () => onNavigate('rooms', r.id),
        });
      });

    // Filter Shared Expenses (Strictly shared, zero personal)
    expenses
      .filter((e) => e.title.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((e) => {
        items.push({
          id: `expense-${e.id}`,
          category: 'EXPENSES',
          title: e.title,
          subtitle: `${formatInr(e.totalAmount)} • ${e.category}`,
          icon: <Receipt className="w-4 h-4 text-emerald-600" />,
          action: () => onNavigate('expenses', e.id),
        });
      });

    // Filter Support Tickets
    tickets
      .filter((t) => t.description.toLowerCase().includes(q) || t.userName.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((t) => {
        items.push({
          id: `ticket-${t.id}`,
          category: 'SUPPORT',
          title: t.description.length > 50 ? t.description.substring(0, 50) + '...' : t.description,
          subtitle: `By ${t.userName} • ${t.status}`,
          icon: <Headphones className="w-4 h-4 text-amber-600" />,
          action: () => onNavigate('support', t.id),
        });
      });

    // Append matching quick actions
    quickActions
      .filter((a) => a.title.toLowerCase().includes(q) || a.subtitle?.toLowerCase().includes(q))
      .forEach((a) => items.push(a));

    return items;
  }, [query, users, rooms, expenses, tickets, onNavigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        results[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-100"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100 flex flex-col"
      >
        {/* Search Input */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 gap-3">
          <Search className="w-5 h-5 text-indigo-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search users, rooms, expenses, support tickets, audit logs..."
            className="flex-1 text-sm bg-transparent border-none text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-100">
          {results.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No results found for &ldquo;<span className="font-semibold text-slate-600">{query}</span>&rdquo;
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-50/80 text-slate-900'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-white border-indigo-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold truncate">{item.title}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 uppercase tracking-wider shrink-0">
                          {item.category}
                        </span>
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <ArrowRight className="w-4 h-4 text-indigo-600 shrink-0 ml-2" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-semibold bg-white border border-slate-200 px-1 py-0.5 rounded shadow-2xs">
                &uarr;
              </kbd>{' '}
              <kbd className="font-semibold bg-white border border-slate-200 px-1 py-0.5 rounded shadow-2xs">
                &darr;
              </kbd>{' '}
              navigate
            </span>
            <span>
              <kbd className="font-semibold bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                Enter
              </kbd>{' '}
              select
            </span>
            <span>
              <kbd className="font-semibold bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                Esc
              </kbd>{' '}
              close
            </span>
          </div>
          <span className="font-medium text-slate-500">RoomMate Ops</span>
        </div>
      </div>
    </div>
  );
};

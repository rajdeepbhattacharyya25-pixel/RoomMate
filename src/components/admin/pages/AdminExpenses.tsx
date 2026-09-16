import React, { useState, useMemo } from 'react';
import { Receipt, ShieldCheck, MoreHorizontal } from 'lucide-react';
import { SharedExpense, Room, User, ExpenseSplit, SettlementPayment } from '../../../types';
import { DataTable, Column } from '../common/DataTable';
import { StatusBadge } from '../common/StatusBadge';
import { AdminExpenseDetailModal } from './AdminExpenseDetailModal';
import { formatInr, formatRelativeTime } from '../../../lib/utils/currencyFormatter';

interface AdminExpensesProps {
  sharedExpenses: SharedExpense[];
  rooms: Room[];
  allUsers: User[];
  splits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  initialSelectedExpenseId?: string;
}

export const AdminExpenses: React.FC<AdminExpensesProps> = ({
  sharedExpenses,
  rooms,
  allUsers,
  splits,
  settlementPayments,
  initialSelectedExpenseId,
}) => {
  const [selectedExpense, setSelectedExpense] = useState<SharedExpense | null>(() => {
    if (initialSelectedExpenseId) {
      return sharedExpenses.find((e) => e.id === initialSelectedExpenseId) || null;
    }
    return null;
  });

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');

  const filteredExpenses = useMemo(() => {
    return sharedExpenses.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (roomFilter !== 'all' && e.roomId !== roomFilter) return false;
      return true;
    });
  }, [sharedExpenses, categoryFilter, roomFilter]);

  const totalVolume = filteredExpenses.reduce((sum, e) => sum + e.totalAmount, 0);

  const columns: Column<SharedExpense>[] = [
    {
      key: 'title',
      header: 'Expense Item',
      sortable: true,
      render: (e) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 block">{e.title}</span>
            <span className="text-[11px] text-slate-400 block">{e.notes || 'Shared bill'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total Amount',
      sortable: true,
      align: 'right',
      render: (e) => (
        <span className="font-bold font-mono text-slate-900 text-xs">{formatInr(e.totalAmount)}</span>
      ),
    },
    {
      key: 'room',
      header: 'Room',
      render: (e) => {
        const room = rooms.find((r) => r.id === e.roomId);
        return <span className="text-xs font-semibold text-slate-700">{room?.name || 'Room'}</span>;
      },
    },
    {
      key: 'paidBy',
      header: 'Paid By',
      render: (e) => {
        const payer = allUsers.find((u) => u.id === e.paidBy);
        return <span className="text-xs text-slate-700 font-medium">{payer?.name || 'Resident'}</span>;
      },
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (e) => <StatusBadge variant="info" label={e.category} size="sm" dot={false} />,
    },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (e) => <span className="text-xs text-slate-500">{formatRelativeTime(e.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (e) => (
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            setSelectedExpense(e);
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Inspect split calculation"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Shared Expenses Explorer</h1>
            <span className="text-xs font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
              {filteredExpenses.length} Shared Bills
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit shared room utilities, rent, groceries, and debt reconciliation across all houses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 bg-white border border-slate-200 rounded-lg text-right shadow-2xs">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Filtered Volume</span>
            <span className="text-sm font-bold font-mono text-slate-900">{formatInr(totalVolume)}</span>
          </div>
        </div>
      </div>

      {/* Privacy Guarantee Alert */}
      <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs text-slate-700 flex items-center gap-2.5">
        <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
        <span>
          <b>Privacy Rule Enforced:</b> Individual student personal expenses are strictly private user data. The
          SuperAdmin console only exposes shared room expenses and multi-person splits.
        </span>
      </div>

      {/* Expenses DataTable */}
      <DataTable
        columns={columns}
        data={filteredExpenses}
        keyExtractor={(e) => e.id}
        searchPlaceholder="Search bills by title or category..."
        searchFilter={(e, query) =>
          e.title.toLowerCase().includes(query.toLowerCase()) ||
          e.category.toLowerCase().includes(query.toLowerCase())
        }
        onRowClick={(e) => setSelectedExpense(e)}
        exportFilename="RoomMate_Shared_Expenses_Ledger"
        toolbarExtras={
          <div className="flex items-center gap-2">
            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              <option value="Rent">Rent</option>
              <option value="Electricity">Electricity</option>
              <option value="Groceries">Groceries</option>
              <option value="Water">Water</option>
              <option value="Wi-Fi">Wi-Fi</option>
              <option value="Gas">Gas</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Food">Food</option>
              <option value="Other">Other</option>
            </select>

            {/* Room Filter */}
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[140px] truncate"
            >
              <option value="all">All Rooms</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        }
        emptyMessage="No shared expenses match your criteria"
        emptySubtitle="Try selecting a different category or clearing filters."
      />

      {/* Expense Detail Modal */}
      {selectedExpense && (
        <AdminExpenseDetailModal
          expense={selectedExpense}
          onClose={() => setSelectedExpense(null)}
          splits={splits}
          settlementPayments={settlementPayments}
          allUsers={allUsers}
          rooms={rooms}
        />
      )}
    </div>
  );
};

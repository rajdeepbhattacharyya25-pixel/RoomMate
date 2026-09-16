import React, { useState, useMemo } from 'react';
import {
  Activity,
  Plus,
  CreditCard,
  Users,
  Crown,
  DoorOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Room, SharedExpense, SettlementPayment, RoomMember, User, RoomActivityItem } from '../../types';

interface RoomActivitySectionProps {
  room: Room;
  sharedExpenses: SharedExpense[];
  settlementPayments: SettlementPayment[];
  roomMembers: RoomMember[];
  allUsers: User[];
}

export const RoomActivitySection: React.FC<RoomActivitySectionProps> = ({
  room,
  sharedExpenses,
  settlementPayments,
  roomMembers,
  allUsers,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Compile timeline from shared bills and settlements (never personal expenses)
  const activities = useMemo(() => {
    const list: RoomActivityItem[] = [];

    // Shared bills
    sharedExpenses
      .filter((e) => e.roomId === room.id && !e.isDeleted)
      .forEach((e) => {
        const payer = allUsers.find((u) => u.id === e.paidBy);
        const payerName = payer ? payer.name : 'A roommate';
        list.push({
          id: `exp-${e.id}`,
          roomId: room.id,
          type: 'EXPENSE_ADDED',
          actorId: e.paidBy,
          actorName: payerName,
          description: `added "${e.title}" (${e.category})`,
          amount: e.totalAmount,
          timestamp: e.createdAt || e.expenseDate,
        });
      });

    // Settlements
    settlementPayments
      .filter((s) => s.roomId === room.id)
      .forEach((s) => {
        const payer = allUsers.find((u) => u.id === s.payerId);
        const payee = allUsers.find((u) => u.id === s.payeeId);
        const payerName = payer ? payer.name : 'A roommate';
        const payeeName = payee ? payee.name : 'a roommate';
        list.push({
          id: `settle-${s.id}`,
          roomId: room.id,
          type: 'SETTLEMENT_RECORDED',
          actorId: s.payerId,
          actorName: payerName,
          description: `settled with ${payeeName} via ${s.paymentMethod}`,
          amount: s.amount,
          timestamp: s.createdAt || s.paymentDate,
        });
      });

    // Members joined / left
    roomMembers
      .filter((m) => m.roomId === room.id)
      .forEach((m) => {
        const user = allUsers.find((u) => u.id === m.userId);
        const name = user ? user.name : 'A roommate';
        if (m.status === 'ACTIVE') {
          list.push({
            id: `join-${m.id}`,
            roomId: room.id,
            type: 'MEMBER_JOINED',
            actorId: m.userId,
            actorName: name,
            description: m.role === 'ROOM_ADMIN' ? 'created the room' : 'joined the room',
            timestamp: m.joinedAt,
          });
        } else if (m.leftAt) {
          list.push({
            id: `left-${m.id}`,
            roomId: room.id,
            type: 'MEMBER_LEFT',
            actorId: m.userId,
            actorName: name,
            description: m.status === 'REMOVED' ? 'was removed from the room' : 'left the room',
            timestamp: m.leftAt,
          });
        }
      });

    // Sort descending by timestamp
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [room.id, sharedExpenses, settlementPayments, roomMembers, allUsers]);

  if (activities.length === 0) return null;

  const displayList = isExpanded ? activities : activities.slice(0, 3);

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs font-bold text-slate-900">Room Activity</h3>
        </div>
        <span className="text-[11px] font-medium text-slate-400">
          {activities.length} event{activities.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {displayList.map((item) => {
          let icon = <Plus className="w-3.5 h-3.5 text-indigo-600" />;
          let iconBg = 'bg-indigo-50';

          if (item.type === 'SETTLEMENT_RECORDED') {
            icon = <CreditCard className="w-3.5 h-3.5 text-emerald-600" />;
            iconBg = 'bg-emerald-50';
          } else if (item.type === 'MEMBER_JOINED') {
            icon = <Users className="w-3.5 h-3.5 text-blue-600" />;
            iconBg = 'bg-blue-50';
          } else if (item.type === 'MEMBER_LEFT') {
            icon = <DoorOpen className="w-3.5 h-3.5 text-rose-600" />;
            iconBg = 'bg-rose-50';
          } else if (item.type === 'ADMIN_TRANSFERRED') {
            icon = <Crown className="w-3.5 h-3.5 text-amber-600" />;
            iconBg = 'bg-amber-50';
          }

          const timeStr = new Date(item.timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          });

          return (
            <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className={`w-7 h-7 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
                  {icon}
                </div>
                <div className="min-w-0">
                  <p className="text-slate-800 text-xs truncate">
                    <span className="font-bold">{item.actorName}</span>{' '}
                    <span className="text-slate-600">{item.description}</span>
                  </p>
                  <p className="text-[10px] text-slate-400">{timeStr}</p>
                </div>
              </div>

              {item.amount !== undefined && (
                <span className="font-mono font-bold text-xs text-slate-900 shrink-0">
                  ₹{item.amount.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {activities.length > 3 && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full pt-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1"
        >
          <span>{isExpanded ? 'Show Less' : `View All (${activities.length})`}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  User,
  Room,
  RoomMember,
  RoomInvitation,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  SplitMethod,
} from '../../types';
import { calculateRoomSummary } from '../../lib/ledger/engine';
import {
  Users,
  Plus,
  QrCode,
  Copy,
  Check,
  CreditCard,
  UserPlus,
  X,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Camera,
  Bolt,
  ShoppingBag,
  Home,
  Utensils,
  Receipt,
  CheckCircle2,
  MessageCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { WhatsAppNudgeModal } from './WhatsAppNudgeModal';
import { UpiIntentPayModal } from './UpiIntentPayModal';
import { SettlementProofModal } from './SettlementProofModal';
import { SettlementReceiptData } from '../../lib/payments/upiIntentService';

interface MobileRoomLedgerProps {
  currentUser: User;
  allUsers: User[];
  rooms: Room[];
  activeRoom: Room | null;
  onSelectRoom: (room: Room) => void;
  roomMembers: RoomMember[];
  roomInvitations: RoomInvitation[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  onAddSharedExpense: (data: {
    roomId: string;
    paidBy: string;
    title: string;
    totalAmount: number;
    category: SharedExpense['category'];
    splitMethod?: SplitMethod;
    participantUserIds: string[];
    customValues?: Record<string, number>;
    notes?: string;
    expenseDate?: string;
  }) => void;
  onRecordSettlement: (data: {
    roomId: string;
    payerId: string;
    payeeId: string;
    amount: number;
    paymentMethod: SettlementPayment['paymentMethod'];
    transactionRef?: string;
    notes?: string;
  }) => void;
  onCreateRoom: (name: string, description?: string) => void;
  onJoinRoom: (code: string) => void;
  showSplitModalInitially?: boolean;
  showSettleModalInitially?: boolean;
  onCloseModals?: () => void;
}

const CATEGORIES: Array<SharedExpense['category']> = [
  'Electricity',
  'Rent',
  'Groceries',
  'Wi-Fi',
  'Food',
  'Water',
  'Gas',
  'Cleaning',
  'Other',
];

export const MobileRoomLedger: React.FC<MobileRoomLedgerProps> = ({
  currentUser,
  allUsers,
  rooms,
  activeRoom,
  onSelectRoom,
  roomMembers,
  roomInvitations,
  sharedExpenses,
  expenseSplits,
  settlementPayments,
  onAddSharedExpense,
  onRecordSettlement,
  onCreateRoom,
  onJoinRoom,
  showSplitModalInitially = false,
  showSettleModalInitially = false,
  onCloseModals,
}) => {
  // Modals
  const [showSplitModal, setShowSplitModal] = useState(showSplitModalInitially);
  const [showSettleModal, setShowSettleModal] = useState(showSettleModalInitially);
  const [showUpiPayModal, setShowUpiPayModal] = useState(false);
  const [activeProofData, setActiveProofData] = useState<SettlementReceiptData | null>(null);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Split Form State
  const [title, setTitle] = useState('WiFi & Water Bill');
  const [amount, setAmount] = useState('1200');
  const [category, setCategory] = useState<SharedExpense['category']>('Wi-Fi');
  const [paidBy, setPaidBy] = useState(currentUser.id);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('EQUAL');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [customValues, _setCustomValues] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Settle Form State
  const [settlePayeeId, setSettlePayeeId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SettlementPayment['paymentMethod']>('UPI');
  const [transactionRef, setTransactionRef] = useState('');

  // Room Create/Join Form State
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Members of active room
  const activeMembers = activeRoom
    ? roomMembers.filter((m) => m.roomId === activeRoom.id && m.status === 'ACTIVE')
    : [];

  const activeUserObjects = activeMembers
    .map((m) => allUsers.find((u) => u.id === m.userId))
    .filter(Boolean) as User[];

  // Initialize participants if empty
  React.useEffect(() => {
    if (selectedParticipants.length === 0 && activeUserObjects.length > 0) {
      setSelectedParticipants(activeUserObjects.map((u) => u.id));
    }
  }, [activeUserObjects]);

  // Room Summary & Debts
  const summary = activeRoom
    ? calculateRoomSummary(
        activeRoom.id,
        currentUser.id,
        sharedExpenses,
        expenseSplits,
        settlementPayments,
        allUsers
      )
    : null;

  // Active Invite Code
  const activeInvite = activeRoom
    ? roomInvitations.find((inv) => inv.roomId === activeRoom.id && !inv.isRevoked)
    : null;

  // Copy invite code
  const handleCopyCode = () => {
    if (!activeInvite) return;
    navigator.clipboard.writeText(activeInvite.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Open split modal
  const handleOpenSplit = () => {
    setSelectedParticipants(activeUserObjects.map((u) => u.id));
    setShowSplitModal(true);
  };

  // Quick settle up click on a specific debt
  const handleStartSettle = (payeeId: string, suggestedAmount: number) => {
    setSettlePayeeId(payeeId);
    setSettleAmount(suggestedAmount > 0 ? String(suggestedAmount) : '');
    setShowUpiPayModal(true);
  };

  // WhatsApp Nudge Studio target state
  const [nudgeTarget, setNudgeTarget] = useState<{
    debtor: User;
    amount: number;
    items: Array<{ title: string; shareAmount: number }>;
  } | null>(null);

  // Open WhatsApp Nudge Studio for a debtor roommate
  const handleOpenNudge = (debtorId: string, amount: number) => {
    const debtor = allUsers.find((u) => u.id === debtorId);
    if (!debtor || !activeRoom) return;

    // Find shared expenses in this room paid by current user where debtor has a split
    const roomExpenses = sharedExpenses.filter(
      (e) => e.roomId === activeRoom.id && !e.isDeleted && e.paidBy === currentUser.id
    );
    const relevantItems = roomExpenses
      .map((e) => {
        const split = expenseSplits.find(
          (s) => s.sharedExpenseId === e.id && s.userId === debtorId
        );
        return split ? { title: e.title, shareAmount: split.shareAmount } : null;
      })
      .filter(Boolean) as Array<{ title: string; shareAmount: number }>;

    setNudgeTarget({ debtor, amount, items: relevantItems });
  };

  // Submit Split Expense
  const handleCreateSplit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRoom) return;
    const numAmount = Number(amount);
    if (!title.trim() || isNaN(numAmount) || numAmount <= 0) return;
    if (selectedParticipants.length === 0) return;

    onAddSharedExpense({
      roomId: activeRoom.id,
      paidBy,
      title: title.trim(),
      totalAmount: numAmount,
      category,
      splitMethod,
      participantUserIds: selectedParticipants,
      customValues: splitMethod !== 'EQUAL' ? customValues : undefined,
      notes: notes.trim(),
      expenseDate,
    });

    confetti({ particleCount: 60, spread: 60, origin: { y: 0.8 } });
    setTitle('');
    setAmount('');
    setNotes('');
    setShowSplitModal(false);
    if (onCloseModals) onCloseModals();
  };

  // Submit Settlement
  const handleRecordSettlementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !settlePayeeId) return;
    const numAmount = Number(settleAmount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    const finalRef = transactionRef.trim() || `CF-${Date.now().toString(36).toUpperCase()}`;

    onRecordSettlement({
      roomId: activeRoom.id,
      payerId: currentUser.id,
      payeeId: settlePayeeId,
      amount: numAmount,
      paymentMethod,
      transactionRef: finalRef,
    });

    const payee = allUsers.find((u) => u.id === settlePayeeId);
    if (payee) {
      setActiveProofData({
        amount: numAmount,
        payerName: currentUser.name,
        payeeName: payee.name,
        payeeUpiId: payee.email ? `${payee.name.toLowerCase().replace(/\s+/g, '')}@okaxis` : 'roommate@upi',
        roomName: activeRoom.name,
        paymentMethod,
        transactionRef: finalRef,
      });
      setShowProofModal(true);
    }

    confetti({ particleCount: 80, spread: 70, origin: { y: 0.8 } });
    setSettleAmount('');
    setTransactionRef('');
    setShowSettleModal(false);
    if (onCloseModals) onCloseModals();
  };

  // Handle 1-Tap UPI Intent Payment Completion & Proof Card Generation
  const handleUpiPaymentCompleted = (details: {
    payeeId: string;
    amount: number;
    paymentMethod: SettlementPayment['paymentMethod'];
    appUsed: string;
    transactionRef: string;
    notes?: string;
  }) => {
    if (!activeRoom) return;
    const payee = allUsers.find((u) => u.id === details.payeeId);
    if (!payee) return;

    onRecordSettlement({
      roomId: activeRoom.id,
      payerId: currentUser.id,
      payeeId: details.payeeId,
      amount: details.amount,
      paymentMethod: details.paymentMethod,
      transactionRef: details.transactionRef,
      notes: details.notes,
    });

    setActiveProofData({
      amount: details.amount,
      payerName: currentUser.name,
      payeeName: payee.name,
      payeeUpiId: payee.email ? `${payee.name.toLowerCase().replace(/\s+/g, '')}@okaxis` : 'roommate@upi',
      roomName: activeRoom.name,
      paymentMethod: `${details.appUsed} (UPI)`,
      transactionRef: details.transactionRef,
    });

    setShowUpiPayModal(false);
    setShowSettleModal(false);
    setShowProofModal(true);
    if (onCloseModals) onCloseModals();
  };


  const numAmount = Number(amount) || 0;
  const perPersonAmount = selectedParticipants.length > 0 ? (numAmount / selectedParticipants.length).toFixed(2) : '0.00';
  const payerUser = allUsers.find((u) => u.id === paidBy);
  const totalToCollect = paidBy === currentUser.id
    ? (numAmount - (selectedParticipants.includes(currentUser.id) ? numAmount / selectedParticipants.length : 0)).toFixed(0)
    : '0';

  return (
    <div className="space-y-4 pb-28 px-4 pt-3 bg-[#F9F9FF] min-h-full">
      {/* Horizontal Room Switcher Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
        {rooms.map((room) => {
          const isActive = activeRoom?.id === room.id;
          return (
            <button
              key={room.id}
              onClick={() => onSelectRoom(room)}
              className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shadow-2xs ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{room.name}</span>
            </button>
          );
        })}

        <button
          onClick={() => setShowCreateRoomModal(true)}
          className="min-h-[38px] px-3 rounded-full bg-white text-indigo-600 border border-indigo-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap hover:bg-indigo-50 shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Room</span>
        </button>

        <button
          onClick={() => setShowJoinModal(true)}
          className="min-h-[38px] px-3 rounded-full bg-white text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap hover:bg-slate-50 shadow-2xs"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Join</span>
        </button>
      </div>

      {/* Active Room Card & 6-Digit Invite Hub */}
      {activeRoom && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                {activeRoom.name}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {activeMembers.length} active roommates
              </p>
            </div>

            {/* 6-Digit Invite Code Badge */}
            {activeInvite && (
              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-indigo-700 text-xs font-mono font-bold flex items-center gap-1.5 border border-slate-200 transition-all active:scale-95"
                title="Copy Invite Code"
              >
                <span>#{activeInvite.inviteCode}</span>
                {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>

          {/* Action Triggers in Thumb Zone */}
          <div className="grid grid-cols-2 gap-2.5 pt-0.5">
            <button
              onClick={handleOpenSplit}
              className="h-11 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Add Bill / Split</span>
            </button>

            <button
              onClick={() => setShowUpiPayModal(true)}
              className="h-11 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-200 shadow-xs active:scale-95 transition-all"
            >
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span>Settle via UPI</span>
            </button>
          </div>
        </div>
      )}

      {/* Simplified Debts Matrix: Who Owes Whom */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Simplified Room Settlements
        </h2>

        {summary && summary.pairwiseDebts.length > 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] overflow-hidden">
            {summary.pairwiseDebts.map((debt, idx) => {
              const debtorId = debt.netAmount > 0 ? debt.userBId : debt.userAId;
              const creditorId = debt.netAmount > 0 ? debt.userAId : debt.userBId;
              const debtorName = debt.netAmount > 0 ? debt.userBName : debt.userAName;
              const creditorName = debt.netAmount > 0 ? debt.userAName : debt.userBName;
              const debtAmount = Math.abs(debt.netAmount);

              const isCurrentUserDebtor = debtorId === currentUser.id;
              const isCurrentUserCreditor = creditorId === currentUser.id;

              return (
                <div
                  key={idx}
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrentUserDebtor
                          ? 'bg-rose-100 text-rose-700'
                          : isCurrentUserCreditor
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {debtorName.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900">
                        {isCurrentUserDebtor
                          ? `You owe ${creditorName}`
                          : isCurrentUserCreditor
                          ? `${debtorName} owes you`
                          : `${debtorName} owes ${creditorName}`}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Direct pairwise balance
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        isCurrentUserDebtor
                          ? 'text-rose-600'
                          : isCurrentUserCreditor
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                      }`}
                    >
                      ₹{debtAmount.toLocaleString('en-IN')}
                    </span>

                    {isCurrentUserDebtor && (
                      <button
                        onClick={() => handleStartSettle(creditorId, debtAmount)}
                        className="px-2.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <span>Pay</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}

                    {isCurrentUserCreditor && (
                      <button
                        onClick={() => handleOpenNudge(debtorId, debtAmount)}
                        className="px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all border border-emerald-200 shadow-2xs"
                        title="Send 1-Tap WhatsApp Nudge"
                      >
                        <MessageCircle className="w-3.5 h-3.5 fill-[#25D366] text-[#25D366]" />
                        <span>Nudge</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200/80 p-5 text-center text-xs text-slate-500 shadow-xs">
            <ShieldCheck className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
            All settled up! No outstanding debts in this room.
          </div>
        )}
      </div>

      {/* Room Expenses History (Inset Table View) */}
      <div className="space-y-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          Shared Expenses History
        </h2>

        {sharedExpenses.filter((e) => activeRoom && e.roomId === activeRoom.id && !e.isDeleted).length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200/80 p-6 text-center text-xs text-slate-500 shadow-xs">
            No shared expenses in this room yet.
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] overflow-hidden">
            {sharedExpenses
              .filter((e) => activeRoom && e.roomId === activeRoom.id && !e.isDeleted)
              .map((exp) => {
                const payer = allUsers.find((u) => u.id === exp.paidBy);
                return (
                  <div
                    key={exp.id}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{exp.title}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                          {exp.category}
                        </span>
                        <span>•</span>
                        <span>Paid by {payer?.name || 'Roommate'}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-900 tabular-nums">
                        ₹{exp.totalAmount.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-indigo-600 font-medium">{exp.splitMethod}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* Stitch Screen 2 Modal: CampusFlow - Add Expense & Split With Roommates    */}
      {/* ========================================================================= */}
      {showSplitModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-[395px] bg-[#F9F9FF] border-t border-slate-200 rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-5">
            {/* iOS Modal Top Nav */}
            <nav className="px-4 py-3 flex items-center justify-between border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40 rounded-t-3xl">
              <button
                onClick={() => {
                  setShowSplitModal(false);
                  if (onCloseModals) onCloseModals();
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-900 active:opacity-60 transition-opacity"
                type="button"
              >
                Cancel
              </button>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Add Expense
              </h2>
              <button
                onClick={() => handleCreateSplit()}
                disabled={!title.trim() || !amount || Number(amount) <= 0 || selectedParticipants.length === 0}
                className="text-sm font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-40 active:opacity-60 transition-opacity"
                type="button"
              >
                Save
              </button>
            </nav>

            {/* Scrollable Form Body */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1 pb-32">
              {/* Hero Input & Details Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] space-y-3">
                {/* Big Prominent Amount Input */}
                <div className="flex flex-col items-center justify-center py-3 border-b border-slate-100">
                  <span className="text-xs font-medium text-slate-500 mb-1">Expense Amount</span>
                  <div className="flex items-baseline justify-center tracking-tight">
                    <span className="text-3xl font-bold text-slate-900 mr-1">₹</span>
                    <input
                      type="number"
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      autoFocus
                      className="text-3xl font-extrabold text-slate-900 w-44 text-center bg-transparent border-none p-0 focus:ring-0 tabular-nums placeholder:text-slate-300"
                    />
                  </div>

                  {numAmount > 0 && selectedParticipants.length > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                      <span>₹{perPersonAmount} / person across {selectedParticipants.length}</span>
                    </div>
                  )}
                </div>

                {/* Description and Date */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What was this for? (e.g. WiFi Bill)"
                      className="flex-1 bg-transparent p-0 border-none text-xs font-medium text-slate-900 focus:ring-0 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="h-[1px] bg-slate-100 ml-11" />

                  <div className="flex items-center justify-between pl-0.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-700">Date</span>
                    </div>
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-medium text-slate-800 border-none"
                    />
                  </div>
                </div>
              </div>

              {/* Category Horizontal Filter Chips */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Category</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {CATEGORIES.map((cat) => {
                    const isSelected = category === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {cat === 'Wi-Fi' && <Bolt className="w-3.5 h-3.5" />}
                        {cat === 'Groceries' && <ShoppingBag className="w-3.5 h-3.5" />}
                        {cat === 'Rent' && <Home className="w-3.5 h-3.5" />}
                        {cat === 'Food' && <Utensils className="w-3.5 h-3.5" />}
                        <span>{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Paid By Grouped Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                    {payerUser?.name.charAt(0) || 'R'}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Paid by</span>
                    <span className="text-xs font-semibold text-slate-900">
                      {paidBy === currentUser.id ? `${currentUser.name} (You)` : payerUser?.name}
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-indigo-600 border-none cursor-pointer"
                  >
                    {activeUserObjects.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.id === currentUser.id ? 'You' : u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Split Method Segmented Control */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Split Option</span>
                </div>
                <div className="bg-slate-100 p-1 rounded-xl flex items-center">
                  {(['EQUAL', 'EXACT', 'SHARES'] as SplitMethod[]).map((sm) => {
                    const isActive = splitMethod === sm;
                    return (
                      <button
                        key={sm}
                        type="button"
                        onClick={() => setSplitMethod(sm)}
                        className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        {sm === 'EQUAL' ? 'Equally' : sm === 'EXACT' ? 'Exact Amounts' : 'By Shares'}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 px-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Split equally among {selectedParticipants.length} roommates (₹{perPersonAmount} each)</span>
                </p>
              </div>

              {/* Roommates Split Checklist (Grouped Table View) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Split Breakdown ({selectedParticipants.length} Members)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedParticipants.length === activeUserObjects.length) {
                        setSelectedParticipants([currentUser.id]);
                      } else {
                        setSelectedParticipants(activeUserObjects.map((u) => u.id));
                      }
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:underline"
                  >
                    {selectedParticipants.length === activeUserObjects.length ? 'Select You Only' : 'Select All'}
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] overflow-hidden">
                  {activeUserObjects.map((u) => {
                    const isChecked = selectedParticipants.includes(u.id);
                    const isCurrentUser = u.id === currentUser.id;

                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          if (isChecked) {
                            if (selectedParticipants.length > 1) {
                              setSelectedParticipants(selectedParticipants.filter((id) => id !== u.id));
                            }
                          } else {
                            setSelectedParticipants([...selectedParticipants, u.id]);
                          }
                        }}
                        className="p-3.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-900 block">
                              {isCurrentUser ? `${u.name} (You)` : u.name}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {isCurrentUser ? 'Participant' : 'Roommate'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-slate-900 tabular-nums">
                            ₹{isChecked ? perPersonAmount : '0.00'}
                          </span>
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all ${
                              isChecked
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-300 bg-white'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attach Receipt / Screenshot Section */}
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                    <Receipt className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-900 block">Attach Receipt or Screenshot</span>
                    <span className="text-[10px] text-slate-400">JPEG, PNG or UPI transaction PDF</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Add</span>
                </span>
              </div>
            </div>

            {/* Bottom Sticky Action Bar */}
            <div className="p-4 bg-white/95 backdrop-blur-md border-t border-slate-200/80 rounded-b-3xl">
              <div className="flex items-center justify-between mb-2 px-1 text-xs">
                <span className="text-slate-500">Total to collect</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  ₹{totalToCollect} <span className="text-[11px] text-slate-400 font-normal">from {Math.max(0, selectedParticipants.length - 1)} people</span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleCreateSplit()}
                disabled={!title.trim() || !amount || Number(amount) <= 0 || selectedParticipants.length === 0}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-transform"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Confirm & Split Bill</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Up UPI Modal (Clean Light Mode) */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-[395px] bg-white border-t border-slate-200 rounded-t-3xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-5">
            <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-1" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <QrCode className="w-4.5 h-4.5" />
                </div>
                <h2 className="text-sm font-bold text-slate-900">Settle Roommate Debt</h2>
              </div>
              <button
                onClick={() => {
                  setShowSettleModal(false);
                  if (onCloseModals) onCloseModals();
                }}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordSettlementSubmit} className="space-y-3.5">
              {/* Payee Selection */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Pay To Roommate
                </label>
                <select
                  value={settlePayeeId}
                  onChange={(e) => setSettlePayeeId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select Roommate...</option>
                  {activeUserObjects
                    .filter((u) => u.id !== currentUser.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Settlement Amount */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Settlement Amount in ₹
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-lg font-bold text-indigo-600">₹</span>
                  <input
                    type="number"
                    step="any"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 tabular-nums"
                  />
                </div>
              </div>

              {/* Instant UPI Launch Button */}
              {settlePayeeId && settleAmount && Number(settleAmount) > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between text-xs text-emerald-800">
                    <span className="font-semibold">Instant UPI Pay</span>
                    <span className="font-mono text-[10px] text-emerald-700">
                      {allUsers.find((u) => u.id === settlePayeeId)?.name.toLowerCase().replace(/\s+/g, '') || 'roommate'}@okaxis
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettleModal(false);
                      setShowUpiPayModal(true);
                    }}
                    className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Launch 1-Tap UPI App Switcher</span>
                  </button>
                </div>
              )}

              {/* Payment Method */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['UPI', 'CASH', 'BANK_TRANSFER'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`h-9 rounded-xl text-xs font-semibold border transition-all ${
                        paymentMethod === m
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {m === 'BANK_TRANSFER' ? 'Bank' : m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Ref */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  UTR / Reference ID (Optional)
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="e.g. UPI Ref #32849182"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!settlePayeeId || !settleAmount || Number(settleAmount) <= 0}
                  className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Record & Clear Balance</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showCreateRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-[340px] bg-white rounded-2xl p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Create New Room</h3>
              <button
                onClick={() => setShowCreateRoomModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="e.g. Flat 401 Boys"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                if (newRoomName.trim()) {
                  onCreateRoom(newRoomName.trim());
                  setNewRoomName('');
                  setShowCreateRoomModal(false);
                }
              }}
              className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              Create Room
            </button>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-[340px] bg-white rounded-2xl p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Join Room by Code</h3>
              <button
                onClick={() => setShowJoinModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. CAMPUS42"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono tracking-widest uppercase focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                if (joinCode.trim()) {
                  onJoinRoom(joinCode.trim());
                  setJoinCode('');
                  setShowJoinModal(false);
                }
              }}
              className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              Join Room
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp Nudge Studio Bottom Sheet Modal */}
      {nudgeTarget && activeRoom && (
        <WhatsAppNudgeModal
          isOpen={Boolean(nudgeTarget)}
          onClose={() => setNudgeTarget(null)}
          currentUser={currentUser}
          debtorUser={nudgeTarget.debtor}
          roomName={activeRoom.name}
          totalAmount={nudgeTarget.amount}
          items={nudgeTarget.items}
          onRecordSettlement={(amount, method) => {
            const finalRef = `CF-NUDGE-${Date.now().toString(36).toUpperCase()}`;
            onRecordSettlement({
              roomId: activeRoom.id,
              payerId: nudgeTarget.debtor.id,
              payeeId: currentUser.id,
              amount,
              paymentMethod: method,
              transactionRef: finalRef,
              notes: 'Settled via 1-Tap WhatsApp Nudge',
            });
            setActiveProofData({
              amount,
              payerName: nudgeTarget.debtor.name,
              payeeName: currentUser.name,
              payeeUpiId: currentUser.email ? `${currentUser.name.toLowerCase().replace(/\s+/g, '')}@okaxis` : 'roommate@upi',
              roomName: activeRoom.name,
              paymentMethod: `${method} (WhatsApp Nudge)`,
              transactionRef: finalRef,
            });
            setShowProofModal(true);
          }}
        />
      )}

      {/* 1-Tap UPI Intent Switcher Bottom Sheet */}
      {activeRoom && (
        <UpiIntentPayModal
          isOpen={showUpiPayModal}
          onClose={() => {
            setShowUpiPayModal(false);
            if (onCloseModals) onCloseModals();
          }}
          currentUser={currentUser}
          availablePayees={activeUserObjects.filter((u) => u.id !== currentUser.id)}
          initialPayeeId={settlePayeeId}
          roomName={activeRoom.name}
          initialAmount={Number(settleAmount) || 0}
          onPaymentCompleted={handleUpiPaymentCompleted}
        />
      )}

      {/* Branded Settlement Proof Voucher Modal */}
      <SettlementProofModal
        isOpen={showProofModal}
        onClose={() => setShowProofModal(false)}
        receiptData={activeProofData}
        onDone={() => {
          setShowProofModal(false);
          setActiveProofData(null);
        }}
      />
    </div>
  );
};

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
} from '../types';
import { calculateRoomSummary, calculateSplits, round2 } from '../lib/ledger/engine';
import {
  Users,
  Plus,
  QrCode,
  Copy,
  Check,
  CreditCard,
  ArrowRight,
  ShieldCheck,
  Receipt,
  UserPlus,
  Send,
  Zap,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface RoomLedgerProps {
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
}

export const RoomLedger: React.FC<RoomLedgerProps> = ({
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
}) => {
  // Modals
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Add Expense Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<SharedExpense['category']>('Electricity');
  const [paidBy, setPaidBy] = useState(currentUser.id);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('EQUAL');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Settle Up Form State
  const [settlePayeeId, setSettlePayeeId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SettlementPayment['paymentMethod']>('UPI');
  const [transactionRef, setTransactionRef] = useState('');
  const [settleNotes, setSettleNotes] = useState('');

  // Create & Join Room Form State
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  if (!activeRoom) {
    return (
      <div className="glass-card p-12 text-center space-y-4">
        <Users className="w-12 h-12 text-indigo-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">No Room Selected</h2>
        <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
          Create a room for your flat/PG or join an existing one using an invite code.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setShowCreateRoomModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg"
          >
            + Create Flat / Room
          </button>
          <button
            onClick={() => setShowJoinModal(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold border border-slate-700"
          >
            Join with Code
          </button>
        </div>
      </div>
    );
  }

  // Active room data
  const currentMembers = roomMembers
    .filter((rm) => rm.roomId === activeRoom.id && rm.status === 'ACTIVE')
    .map((rm) => {
      const user = allUsers.find((u) => u.id === rm.userId);
      return {
        ...rm,
        name: user?.name || 'Unknown',
        email: user?.email || '',
        avatarUrl: user?.avatarUrl,
      };
    });

  const invitation = roomInvitations.find((i) => i.roomId === activeRoom.id && !i.isRevoked);

  const summary = calculateRoomSummary(
    activeRoom.id,
    currentUser.id,
    sharedExpenses,
    expenseSplits,
    settlementPayments,
    allUsers
  );

  const roomExpenses = sharedExpenses.filter((e) => e.roomId === activeRoom.id && !e.isDeleted);
  const roomSettlements = settlementPayments.filter((s) => s.roomId === activeRoom.id);

  // Initialize participants if modal opens
  const openAddExpense = () => {
    setSelectedParticipants(currentMembers.map((m) => m.userId));
    setPaidBy(currentUser.id);
    setShowAddExpenseModal(true);
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || Number(amount) <= 0 || selectedParticipants.length === 0) return;

    onAddSharedExpense({
      roomId: activeRoom.id,
      paidBy,
      title,
      totalAmount: Number(amount),
      category,
      splitMethod,
      participantUserIds: selectedParticipants,
      notes,
      expenseDate,
    });

    setTitle('');
    setAmount('');
    setNotes('');
    setShowAddExpenseModal(false);
  };

  const handleSettleUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlePayeeId || !settleAmount || Number(settleAmount) <= 0) return;

    onRecordSettlement({
      roomId: activeRoom.id,
      payerId: currentUser.id,
      payeeId: settlePayeeId,
      amount: Number(settleAmount),
      paymentMethod,
      transactionRef,
      notes: settleNotes,
    });

    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
    });

    setShowSettleModal(false);
    setSettleAmount('');
    setTransactionRef('');
  };

  const copyInvite = () => {
    if (invitation) {
      navigator.clipboard.writeText(invitation.inviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Preview splits
  const previewSplits =
    amount && Number(amount) > 0 && selectedParticipants.length > 0
      ? calculateSplits(Number(amount), selectedParticipants, splitMethod)
      : [];

  return (
    <div className="space-y-6">
      {/* Room Selector & Header Bar */}
      <div className="glass-card p-6 border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-lg shadow-inner">
              🏠
            </div>
            <div>
              <div className="flex items-center gap-2">
                {/* Room Switcher */}
                <select
                  value={activeRoom.id}
                  onChange={(e) => {
                    const r = rooms.find((room) => room.id === e.target.value);
                    if (r) onSelectRoom(r);
                  }}
                  className="!text-lg !font-extrabold !text-white !bg-transparent !border-none !p-0 cursor-pointer"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                      {r.name}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {currentMembers.length} Members
                </span>
              </div>
              <p className="text-xs text-[var(--text-subtle)] mt-0.5">{activeRoom.description || 'Shared household group ledger'}</p>
            </div>
          </div>

          {/* Quick Actions & Invite Code */}
          <div className="flex flex-wrap items-center gap-2.5">
            {invitation && (
              <div className="flex items-center gap-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs">
                <span className="text-[var(--text-subtle)]">Invite Code:</span>
                <span className="font-mono font-bold text-indigo-300 tracking-wider">
                  {invitation.inviteCode}
                </span>
                <button
                  onClick={copyInvite}
                  className="p-1 hover:text-white text-gray-400 transition-colors"
                  title="Copy invite code"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setShowQRModal(true)}
                  className="p-1 hover:text-white text-gray-400 transition-colors ml-1"
                  title="Show QR Code"
                >
                  <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                </button>
              </div>
            )}

            <button
              onClick={() => setShowJoinModal(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-700"
            >
              Join Another
            </button>
            <button
              onClick={() => setShowCreateRoomModal(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-700"
            >
              + New Room
            </button>
            <button
              onClick={openAddExpense}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>Add Bill</span>
            </button>
          </div>
        </div>
      </div>

      {/* Room Net Standing & Pairwise Debts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Balance Summary & Direct Settle Up Trigger */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              My Standing in {activeRoom.name}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
              Total Bills: ₹{summary.totalRoomExpenses}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-subtle)]">Paid by Me:</span>
              <span className="font-bold text-white">₹{summary.myTotalPaid}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-subtle)]">My Obligation Share:</span>
              <span className="font-bold text-purple-300">₹{summary.myTotalShare}</span>
            </div>
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-sm">
              <span className="font-bold text-gray-300">Net Room Balance:</span>
              {summary.myNetBalance > 0 ? (
                <span className="font-extrabold text-emerald-400">+₹{summary.myNetBalance} (Owed)</span>
              ) : summary.myNetBalance < 0 ? (
                <span className="font-extrabold text-rose-400">-₹{Math.abs(summary.myNetBalance)} (Owes)</span>
              ) : (
                <span className="font-bold text-emerald-400">All Settled ✅</span>
              )}
            </div>
          </div>

          {/* Settle Up Button */}
          <button
            onClick={() => {
              // Pre-select first person I owe
              const iOwe = summary.pairwiseDebts.find((d) => {
                if (d.userAId === currentUser.id && d.netAmount < 0) return true;
                if (d.userBId === currentUser.id && d.netAmount > 0) return true;
                return false;
              });
              if (iOwe) {
                const payee = iOwe.userAId === currentUser.id ? iOwe.userBId : iOwe.userAId;
                setSettlePayeeId(payee);
                setSettleAmount(String(Math.abs(iOwe.netAmount)));
              }
              setShowSettleModal(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all"
          >
            <Zap className="w-4 h-4" />
            <span>Settle Up / Record Payment</span>
          </button>
        </div>

        {/* Right 2 Cols: Precise Pairwise Debts Matrix */}
        <div className="lg:col-span-2 glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Two-Way Pairwise Ledger Matrix</span>
              <span className="text-[10px] text-gray-400 font-normal">
                (Mutual offsetting & partial repayments)
              </span>
            </h3>
          </div>

          {summary.pairwiseDebts.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-[var(--border-subtle)]">
              <Check className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
              <p className="text-xs text-gray-300 font-semibold">Zero Outstanding Debts in this Room!</p>
              <p className="text-[11px] text-[var(--text-subtle)]">Everyone has fully settled all shared split obligations.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {summary.pairwiseDebts.map((debt, idx) => {
                const bOwesA = debt.netAmount > 0;
                const creditor = bOwesA ? debt.userAName : debt.userBName;
                const debtor = bOwesA ? debt.userBName : debt.userAName;
                const creditorId = bOwesA ? debt.userAId : debt.userBId;
                const debtorId = bOwesA ? debt.userBId : debt.userAId;
                const absAmount = Math.abs(debt.netAmount);

                const isMeInvolved = debtorId === currentUser.id || creditorId === currentUser.id;

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl flex items-center justify-between transition-all ${
                      isMeInvolved
                        ? 'bg-slate-900/90 border border-indigo-500/30'
                        : 'bg-slate-950/50 border border-[var(--border-subtle)] opacity-80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs text-indigo-300">
                        {debtor.substring(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <span className={debtorId === currentUser.id ? 'text-rose-400' : 'text-gray-200'}>
                            {debtorId === currentUser.id ? 'You' : debtor}
                          </span>
                          <span className="text-[var(--text-subtle)] font-normal">owes</span>
                          <span className={creditorId === currentUser.id ? 'text-emerald-400' : 'text-gray-200'}>
                            {creditorId === currentUser.id ? 'You' : creditor}
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--text-subtle)]">
                          Bills: ₹{bOwesA ? debt.explanation.aPaidForB : debt.explanation.bPaidForA} | Direct Paid: ₹
                          {bOwesA ? debt.explanation.settlementsBToA : debt.explanation.settlementsAToB}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm font-black ${
                          debtorId === currentUser.id
                            ? 'text-rose-400'
                            : creditorId === currentUser.id
                            ? 'text-emerald-400'
                            : 'text-gray-300'
                        }`}
                      >
                        ₹{absAmount.toFixed(2)}
                      </span>
                      {debtorId === currentUser.id && (
                        <button
                          onClick={() => {
                            setSettlePayeeId(creditorId);
                            setSettleAmount(String(absAmount));
                            setShowSettleModal(true);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/40"
                        >
                          Pay
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Shared Bills Feed & Settlement History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Shared Expenses */}
        <div className="lg:col-span-2 glass-card overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-400" />
              <span>Room Expenses & Point-in-Time Splits</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-gray-400">
                {roomExpenses.length}
              </span>
            </h3>
          </div>

          {roomExpenses.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--text-subtle)]">
              No shared expenses recorded yet. Click "+ Add Bill" to log electricity, Wi-Fi, or groceries.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {roomExpenses.map((exp) => {
                const payer = allUsers.find((u) => u.id === exp.paidBy);
                const splits = expenseSplits.filter((s) => s.sharedExpenseId === exp.id);
                const mySplit = splits.find((s) => s.userId === currentUser.id);

                return (
                  <div key={exp.id} className="p-4 space-y-2 hover:bg-slate-900/40 transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                          {exp.category.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{exp.title}</h4>
                          <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] mt-0.5">
                            <span className="text-indigo-300 font-medium">
                              Paid by {exp.paidBy === currentUser.id ? 'You' : payer?.name || 'Someone'}
                            </span>
                            <span>•</span>
                            <span>{exp.expenseDate}</span>
                            <span>•</span>
                            <span className="text-gray-400">{exp.splitMethod} Split</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-base font-black text-white">
                          ₹{exp.totalAmount.toLocaleString('en-IN')}
                        </span>
                        {mySplit && (
                          <div className="text-[11px] text-purple-300 font-semibold">
                            Your Share: ₹{mySplit.shareAmount}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Point-in-time frozen split chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {splits.map((s) => {
                        const memberUser = allUsers.find((u) => u.id === s.userId);
                        return (
                          <span
                            key={s.id}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-950/60 border border-[var(--border-subtle)] text-gray-300 flex items-center gap-1"
                          >
                            <span>{memberUser?.name || 'User'}:</span>
                            <span className="font-bold text-indigo-300">₹{s.shareAmount}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Settlement Transactions History */}
        <div className="glass-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <span>Direct Payment History</span>
          </h3>

          {roomSettlements.length === 0 ? (
            <p className="text-xs text-[var(--text-subtle)] py-6 text-center">No payment transfers recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {roomSettlements.map((pmt) => {
                const payer = allUsers.find((u) => u.id === pmt.payerId);
                const payee = allUsers.find((u) => u.id === pmt.payeeId);

                return (
                  <div key={pmt.id} className="p-3 rounded-xl bg-slate-950/60 border border-[var(--border-subtle)] space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <div className="flex items-center gap-1">
                        <span>{pmt.payerId === currentUser.id ? 'You' : payer?.name}</span>
                        <ArrowRight className="w-3 h-3 text-emerald-400" />
                        <span>{pmt.payeeId === currentUser.id ? 'You' : payee?.name}</span>
                      </div>
                      <span className="text-emerald-400 font-extrabold">+₹{pmt.amount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-subtle)]">
                      <span>Method: {pmt.paymentMethod}</span>
                      <span>{pmt.paymentDate}</span>
                    </div>
                    {pmt.notes && <p className="text-[10px] text-gray-400 italic">{pmt.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* 1. Add Shared Expense Modal */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card max-w-lg w-full p-6 border-indigo-500/30 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Add Shared Room Bill</h3>
              </div>
              <button
                onClick={() => setShowAddExpenseModal(false)}
                className="text-gray-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Bill Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Electricity Bill, Wi-Fi Recharge, Groceries"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Total Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="1200"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SharedExpense['category'])}
                    className="w-full"
                  >
                    <option value="Electricity">Electricity</option>
                    <option value="Wi-Fi">Wi-Fi / Broadband</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Gas">Gas Cylinder</option>
                    <option value="Water">Water Supply</option>
                    <option value="Cleaning">Cleaning Supplies / Maid</option>
                    <option value="Food">Common Food</option>
                    <option value="Rent">Rent</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Paid Out-of-Pocket By *
                  </label>
                  <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="w-full">
                    {currentMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} {m.userId === currentUser.id ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Split Method
                  </label>
                  <select
                    value={splitMethod}
                    onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
                    className="w-full"
                  >
                    <option value="EQUAL">Equal Split (=)</option>
                  </select>
                </div>
              </div>

              {/* Participants Selector (Point-in-Time Frozen) */}
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1.5">
                  Split Among ({selectedParticipants.length} selected)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {currentMembers.map((m) => {
                    const isChecked = selectedParticipants.includes(m.userId);
                    return (
                      <label
                        key={m.userId}
                        className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-indigo-600/20 border-indigo-500/40 text-white'
                            : 'bg-slate-900/50 border-slate-800 text-gray-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedParticipants([...selectedParticipants, m.userId]);
                            } else {
                              setSelectedParticipants(selectedParticipants.filter((id) => id !== m.userId));
                            }
                          }}
                          className="rounded !bg-slate-800"
                        />
                        <span className="font-semibold">{m.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Point-in-time calculation preview */}
              {previewSplits.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-indigo-500/30 space-y-1.5">
                  <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">
                    Split Breakdown Preview
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {previewSplits.map((ps) => {
                      const user = allUsers.find((u) => u.id === ps.userId);
                      return (
                        <div key={ps.userId} className="flex justify-between text-[11px] text-gray-300">
                          <span>{user?.name}:</span>
                          <span className="font-bold text-white">₹{ps.shareAmount}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30"
                >
                  Record Bill & Freeze Splits
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Settle Up / Partial Payment Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card max-w-md w-full p-6 border-emerald-500/30 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Settle Up / Record Payment</h3>
              </div>
              <button
                onClick={() => setShowSettleModal(false)}
                className="text-gray-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSettleUp} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Recipient (Roommate you paid) *
                </label>
                <select
                  value={settlePayeeId}
                  onChange={(e) => setSettlePayeeId(e.target.value)}
                  className="w-full"
                  required
                >
                  <option value="">Select Roommate...</option>
                  {currentMembers
                    .filter((m) => m.userId !== currentUser.id)
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Amount Paid (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 20 (Partial) or full amount"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full"
                  required
                />
                <p className="text-[10px] text-[var(--text-subtle)] mt-1">
                  Supports partial payments! (e.g. ₹25 owed - ₹20 paid = ₹5 remaining)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as SettlementPayment['paymentMethod'])}
                    className="w-full"
                  >
                    <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer / IMPS</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    UPI Reference ID (Opt)
                  </label>
                  <input
                    type="text"
                    placeholder="UPI-123456"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid ₹20 for chai/electricity"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                >
                  Record Direct Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Create Room Modal */}
      {showCreateRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card max-w-md w-full p-6 border-indigo-500/30 space-y-4">
            <h3 className="text-base font-bold text-white">Create New Flat / Room</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Room Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Flat 302 - Emerald PG"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Description (Opt)</label>
                <input
                  type="text"
                  placeholder="e.g. 4-sharing PG flat near North Campus"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowCreateRoomModal(false)} className="text-xs text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newRoomName) {
                    onCreateRoom(newRoomName, newRoomDesc);
                    setNewRoomName('');
                    setNewRoomDesc('');
                    setShowCreateRoomModal(false);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Join Room Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card max-w-md w-full p-6 border-indigo-500/30 space-y-4">
            <h3 className="text-base font-bold text-white">Join Room with 6-Digit Code</h3>
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Invite Code</label>
              <input
                type="text"
                placeholder="e.g. FLAT302"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                className="w-full font-mono uppercase tracking-widest text-center !text-lg"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowJoinModal(false)} className="text-xs text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (joinCodeInput) {
                    onJoinRoom(joinCodeInput);
                    setJoinCodeInput('');
                    setShowJoinModal(false);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. QR Code Modal */}
      {showQRModal && invitation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card max-w-sm w-full p-6 text-center space-y-4">
            <h3 className="text-base font-bold text-white">Room Invite QR</h3>
            <div className="p-4 bg-white rounded-2xl w-48 h-48 mx-auto flex items-center justify-center shadow-lg">
              {/* Modern SVG QR Code representation */}
              <div className="space-y-1 text-slate-900 font-mono text-center">
                <QrCode className="w-32 h-32 text-slate-900 mx-auto" />
                <span className="text-xs font-black tracking-widest block">{invitation.inviteCode}</span>
              </div>
            </div>
            <p className="text-xs text-[var(--text-subtle)]">
              Flatmates can scan this or enter code <span className="text-white font-mono font-bold">{invitation.inviteCode}</span> to join {activeRoom.name}.
            </p>
            <button
              onClick={() => setShowQRModal(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

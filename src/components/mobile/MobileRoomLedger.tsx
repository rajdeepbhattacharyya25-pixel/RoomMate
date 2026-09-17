import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  User,
  Room,
  RoomMember,
  RoomInvitation,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  SplitMethod,
  JoinPolicy,
  InvitePolicy,
  RoomJoinRequest,
} from '../../types';
import { calculateRoomSummary, calculateSplits, round2 } from '../../lib/ledger/engine';
import {
  Users,
  Plus,
  Minus,
  QrCode,
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
  AlertCircle,
  Sparkles,
  MessageCircle,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Download,
  History,
  MoreVertical,
  Bell,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useNetworkStatus } from '../../context/NetworkContext';
import { WhatsAppNudgeModal } from './WhatsAppNudgeModal';
import { UpiIntentPayModal } from './UpiIntentPayModal';
import { SettlementProofModal } from './SettlementProofModal';
import { SettlementReceiptData } from '../../lib/payments/upiIntentService';
import { MobileLeaveRoomModal } from './MobileLeaveRoomModal';
import { MobileBottomSheet } from './MobileBottomSheet';
import { RoomExportBottomSheet } from './RoomExportBottomSheet';
import { RoomInviteModal } from './RoomInviteModal';
import { RoomMembersModal } from './RoomMembersModal';
import { RoomSettingsModal } from './RoomSettingsModal';
import { TransferOwnershipModal } from './TransferOwnershipModal';
import { JoinRoomModal } from './JoinRoomModal';
import { JoinRequestReviewModal } from './JoinRequestReviewModal';
import { RoomActivitySection } from './RoomActivitySection';
import { CurrencyInput } from '../common/CurrencyInput';
import {
  RoomExportFormat,
  gatherRoomExportData,
  exportRoomToFormat,
  MONTH_NAMES,
} from '../../lib/services/roomExpenseExportService';
import { hapticImpact, hapticSelection, hapticSuccess, hapticWarning } from '../../lib/native/haptics';

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
    splitMethod?: SharedExpense['splitMethod'];
    participantUserIds: string[];
    customValues?: Record<string, number>;
    notes?: string;
    expenseDate?: string;
  }) => void;
  onRecordSettlement: (data: {
    id?: string;
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
  onLeaveRoom?: (roomId: string) => Promise<void>;
  onRemoveMember?: (roomId: string, targetUserId: string) => Promise<void>;
  roomJoinRequests?: Array<RoomJoinRequest & { user: User }>;
  onApproveJoinRequest?: (requestId: string) => Promise<void>;
  onDeclineJoinRequest?: (requestId: string) => Promise<void>;
  onTransferOwnership?: (roomId: string, newAdminId: string) => Promise<void>;
  onRegenerateInvite?: (roomId: string, expirationHours?: number) => Promise<RoomInvitation | void>;
  onUpdateRoomPolicies?: (roomId: string, policies: { joinPolicy?: JoinPolicy; invitePolicy?: InvitePolicy }) => Promise<void>;
  onResolveInvite?: (tokenOrCode: string) => Promise<{
    room: { id: string; name: string; description?: string; joinPolicy: JoinPolicy; invitePolicy: InvitePolicy };
    memberCount: number;
    adminName: string;
    invite: RoomInvitation;
  }>;
  onRequestJoinRoom?: (tokenOrCode: string) => Promise<{
    status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
    room: Room;
    message?: string;
  }>;
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

const SHARED_QUICK_CHIPS = [
  'WiFi Bill 📶',
  'Room Groceries 🛒',
  'Electricity ⚡',
  'Maid / Cook 🧹',
  'Water Cans 💧',
  'Dinner Swiggy 🍕',
  'Flat Rent 🏠',
  'Gas Cylinder ⛽',
  'Cleaning Items 🧼',
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
  onLeaveRoom,
  onRemoveMember,
  roomJoinRequests = [],
  onApproveJoinRequest,
  onDeclineJoinRequest,
  onTransferOwnership,
  onRegenerateInvite,
  onUpdateRoomPolicies,
  onResolveInvite,
  onRequestJoinRoom,
  showSplitModalInitially = false,
  showSettleModalInitially = false,
  onCloseModals,
}) => {
  const { isOnline } = useNetworkStatus();

  // Modals
  const [showSplitModal, setShowSplitModal] = useState(showSplitModalInitially);
  const [prevSplitTrigger, setPrevSplitTrigger] = useState(showSplitModalInitially);
  if (showSplitModalInitially !== prevSplitTrigger) {
    setPrevSplitTrigger(showSplitModalInitially);
    if (showSplitModalInitially) {
      setShowSplitModal(true);
    }
  }

  const [showSettleModal, setShowSettleModal] = useState(showSettleModalInitially);
  const [prevSettleTrigger, setPrevSettleTrigger] = useState(showSettleModalInitially);
  if (showSettleModalInitially !== prevSettleTrigger) {
    setPrevSettleTrigger(showSettleModalInitially);
    if (showSettleModalInitially) {
      setShowSettleModal(true);
    }
  }

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showRoomSettingsModal, setShowRoomSettingsModal] = useState(false);
  const [showTransferOwnershipModal, setShowTransferOwnershipModal] = useState(false);
  const [showUpiPayModal, setShowUpiPayModal] = useState(false);
  const [activeProofData, setActiveProofData] = useState<SettlementReceiptData | null>(null);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [reviewingJoinRequest, setReviewingJoinRequest] = useState<(RoomJoinRequest & { user: User; room?: Room }) | null>(null);

  // Month Filtering & Export State
  const currentActualDate = useMemo(() => new Date(), []);
  const currentActualMonth = currentActualDate.getMonth();
  const currentActualYear = currentActualDate.getFullYear();

  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(currentActualMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentActualYear);
  const [showMonthPickerModal, setShowMonthPickerModal] = useState<boolean>(false);
  const [showRoomExportSheet, setShowRoomExportSheet] = useState<boolean>(false);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  const isCurrentMonth = selectedMonthIndex === currentActualMonth && selectedYear === currentActualYear;

  const handlePrevMonth = () => {
    hapticSelection();
    if (selectedMonthIndex === 0) {
      setSelectedMonthIndex(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonthIndex((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    hapticSelection();
    if (selectedMonthIndex === 11) {
      setSelectedMonthIndex(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonthIndex((m) => m + 1);
    }
  };

  const handleSelectMonth = (yr: number, mIdx: number) => {
    hapticSelection();
    setSelectedYear(yr);
    setSelectedMonthIndex(mIdx);
    setShowMonthPickerModal(false);
  };

  // Available unique historical months in this room
  const availableRoomMonths = useMemo(() => {
    if (!activeRoom) return [];
    const map = new Map<string, { year: number; monthIndex: number; total: number; count: number }>();

    // Ensure current actual month is present
    map.set(`${currentActualYear}-${currentActualMonth}`, {
      year: currentActualYear,
      monthIndex: currentActualMonth,
      total: 0,
      count: 0,
    });

    for (const exp of sharedExpenses) {
      if (exp.roomId !== activeRoom.id || exp.isDeleted) continue;
      const d = new Date(exp.expenseDate || exp.createdAt);
      if (isNaN(d.getTime())) continue;
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${m}`;
      const existing = map.get(key);
      if (existing) {
        existing.total += exp.totalAmount;
        existing.count += 1;
      } else {
        map.set(key, { year: y, monthIndex: m, total: exp.totalAmount, count: 1 });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.monthIndex - a.monthIndex;
    });
  }, [activeRoom, sharedExpenses, currentActualYear, currentActualMonth]);

  // Gather authorized dataset for selected room & month
  const monthlyRoomData = useMemo(() => {
    if (!activeRoom) return null;
    return gatherRoomExportData({
      roomId: activeRoom.id,
      monthIndex: selectedMonthIndex,
      year: selectedYear,
      currentUser,
      activeRoom,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      allUsers,
    });
  }, [
    activeRoom,
    selectedMonthIndex,
    selectedYear,
    currentUser,
    sharedExpenses,
    expenseSplits,
    settlementPayments,
    allUsers,
  ]);

  // Export Trigger Handler
  const handleRoomExport = useCallback(async (format: RoomExportFormat) => {
    if (!monthlyRoomData) return;
    await exportRoomToFormat(monthlyRoomData, format);
  }, [monthlyRoomData]);

  // Split Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<SharedExpense['category']>('Groceries');
  const [paidBy, setPaidBy] = useState(currentUser.id);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('EQUAL');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Split Form Validation & Focus Refs
  const splitAmountInputRef = useRef<HTMLInputElement>(null);
  const splitTitleInputRef = useRef<HTMLInputElement>(null);
  const [splitValidationErrors, setSplitValidationErrors] = useState<{
    amount?: string;
    title?: string;
    participants?: string;
  }>({});

  // Settle Form State
  const [settlePayeeId, setSettlePayeeId] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SettlementPayment['paymentMethod']>('UPI');
  const [transactionRef, setTransactionRef] = useState('');

  // Settle Form Validation & Focus Refs
  const settleAmountInputRef = useRef<HTMLInputElement>(null);
  const [settleValidationErrors, setSettleValidationErrors] = useState<{
    payee?: string;
    amount?: string;
  }>({});

  // Room Create Form State
  const [newRoomName, setNewRoomName] = useState('');

  // Members of active room
  const activeMembers = activeRoom
    ? roomMembers.filter((m) => m.roomId === activeRoom.id && m.status === 'ACTIVE')
    : [];

  const activeUserObjects = activeMembers
    .map((m) => allUsers.find((u) => u.id === m.userId))
    .filter(Boolean) as User[];

  const myMembership = activeRoom
    ? roomMembers.filter((m) => m.roomId === activeRoom.id && m.userId === currentUser.id && m.status === 'ACTIVE')[0]
    : null;
  const isRoomAdmin = myMembership?.role === 'ROOM_ADMIN';

  const currentAdminMember = activeRoom
    ? roomMembers.find(
        (m) =>
          m.roomId === activeRoom.id &&
          m.status === 'ACTIVE' &&
          (m.role === 'ROOM_ADMIN' || (activeRoom.adminUserId && m.userId === activeRoom.adminUserId))
      )
    : null;
  const currentAdminUser = currentAdminMember
    ? allUsers.find((u) => u.id === currentAdminMember.userId)
    : (activeRoom?.adminUserId ? allUsers.find((u) => u.id === activeRoom.adminUserId) : null);
  const currentAdminName = currentAdminUser?.name || 'Room Admin';

  const activePendingJoinRequests = useMemo(() => {
    if (!activeRoom || !roomJoinRequests) return [];
    return roomJoinRequests.filter((r) => r.roomId === activeRoom.id && r.status === 'PENDING');
  }, [activeRoom, roomJoinRequests]);

  // Initialize participants if empty
  const [prevRoomIdForParticipants, setPrevRoomIdForParticipants] = useState<string | null>(activeRoom?.id || null);
  if (activeRoom?.id !== prevRoomIdForParticipants) {
    setPrevRoomIdForParticipants(activeRoom?.id || null);
    if (activeUserObjects.length > 0) {
      setSelectedParticipants(activeUserObjects.map((u) => u.id));
    }
  }

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

  // Former members who have unresolved balance with currentUser in this room
  const formerMembersWithDebts = useMemo(() => {
    if (!activeRoom || !summary) return [];
    const inactiveMemberUserIds = new Set(
      roomMembers
        .filter((m) => m.roomId === activeRoom.id && m.status !== 'ACTIVE')
        .map((m) => m.userId)
    );

    const involvedInactiveIds = new Set<string>();
    for (const debt of summary.pairwiseDebts) {
      if (debt.userAId === currentUser.id && inactiveMemberUserIds.has(debt.userBId)) {
        involvedInactiveIds.add(debt.userBId);
      } else if (debt.userBId === currentUser.id && inactiveMemberUserIds.has(debt.userAId)) {
        involvedInactiveIds.add(debt.userAId);
      }
    }

    return Array.from(involvedInactiveIds)
      .map((id) => allUsers.find((u) => u.id === id))
      .filter(Boolean) as User[];
  }, [activeRoom, summary, roomMembers, allUsers, currentUser.id]);

  // Active Invite Code
  const activeInvite = activeRoom
    ? roomInvitations.find((inv) => inv.roomId === activeRoom.id && !inv.isRevoked)
    : null;

  // Open split modal
  const handleOpenSplit = () => {
    hapticImpact('MEDIUM');
    setSelectedParticipants(activeUserObjects.map((u) => u.id));
    setShowSplitModal(true);
  };

  // Quick settle up click on a specific debt
  const handleStartSettle = (payeeId: string, suggestedAmount: number) => {
    hapticImpact('MEDIUM');
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

  // Submit Split Expense with guided scroll & field validation
  const handleCreateSplit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRoom) return;
    const numAmount = Number(amount);
    const newErrors: { amount?: string; title?: string; participants?: string } = {};

    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Please enter a bill amount greater than ₹0';
    }

    if (!title.trim()) {
      newErrors.title = 'Please enter a description (e.g. WiFi Bill, Groceries)';
    }

    if (selectedParticipants.length === 0) {
      newErrors.participants = 'Please select at least 1 roommate to split with';
    }

    if (newErrors.amount) {
      setSplitValidationErrors(newErrors);
      hapticWarning();
      splitAmountInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      splitAmountInputRef.current?.focus();
      return;
    }

    if (newErrors.title) {
      setSplitValidationErrors(newErrors);
      hapticWarning();
      splitTitleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      splitTitleInputRef.current?.focus();
      return;
    }

    if (newErrors.participants) {
      setSplitValidationErrors(newErrors);
      hapticWarning();
      return;
    }

    setSplitValidationErrors({});
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
    hapticSuccess();
    setTitle('');
    setAmount('');
    setNotes('');
    setShowSplitModal(false);
    if (onCloseModals) onCloseModals();
  };

  // Submit Settlement with guided field validation
  const handleRecordSettlementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom) return;
    const numAmount = Number(settleAmount);
    const newErrors: { payee?: string; amount?: string } = {};

    if (!settlePayeeId) {
      newErrors.payee = 'Please select which roommate to settle with';
    }

    if (!settleAmount || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Please enter an amount greater than ₹0';
    }

    if (newErrors.payee || newErrors.amount) {
      setSettleValidationErrors(newErrors);
      hapticWarning();
      if (newErrors.amount) {
        settleAmountInputRef.current?.focus();
      }
      return;
    }

    setSettleValidationErrors({});
    hapticSuccess();
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
    setSettlePayeeId('');
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

  // Point-in-time calculation preview
  const previewSplits = useMemo(() => {
    if (numAmount <= 0 || selectedParticipants.length === 0) return [];
    return calculateSplits(numAmount, selectedParticipants, splitMethod, customValues);
  }, [numAmount, selectedParticipants, splitMethod, customValues]);

  // Validation status for non-equal split modes
  const splitValidation = useMemo(() => {
    if (splitMethod === 'EQUAL') {
      return { isValid: selectedParticipants.length > 0 && numAmount > 0, diff: 0, sum: numAmount, message: '' };
    }
    if (splitMethod === 'EXACT') {
      const sumExact = round2(selectedParticipants.reduce((acc, uid) => acc + (customValues[uid] || 0), 0));
      const diff = round2(numAmount - sumExact);
      const isValid = Math.abs(diff) <= 0.05 && numAmount > 0;
      return {
        isValid,
        diff,
        sum: sumExact,
        message: isValid
          ? `✓ ₹${numAmount.toLocaleString('en-IN')} fully allocated`
          : diff > 0
          ? `₹${diff.toFixed(2)} left to allocate`
          : `Over-allocated by ₹${Math.abs(diff).toFixed(2)}`,
      };
    }
    if (splitMethod === 'PERCENTAGE') {
      const sumPct = round2(selectedParticipants.reduce((acc, uid) => acc + (customValues[uid] || 0), 0));
      const diff = round2(100 - sumPct);
      const isValid = Math.abs(diff) <= 0.05 && numAmount > 0;
      return {
        isValid,
        diff,
        sum: sumPct,
        message: isValid
          ? '✓ 100% fully allocated'
          : diff > 0
          ? `${diff.toFixed(1)}% left to allocate`
          : `Over-allocated by ${Math.abs(diff).toFixed(1)}%`,
      };
    }
    if (splitMethod === 'SHARES') {
      const totalShares = selectedParticipants.reduce((acc, uid) => acc + (customValues[uid] && customValues[uid] > 0 ? customValues[uid] : 1), 0);
      return {
        isValid: totalShares > 0 && numAmount > 0,
        diff: 0,
        sum: totalShares,
        message: `Total ${totalShares} share${totalShares !== 1 ? 's' : ''} across ${selectedParticipants.length} roommates`,
      };
    }
    return { isValid: true, diff: 0, sum: 0, message: '' };
  }, [splitMethod, selectedParticipants, customValues, numAmount]);

  // Handle switching split methods with smart initial values
  const handleSelectSplitMethod = (method: SplitMethod) => {
    hapticSelection();
    setSplitMethod(method);
    const count = selectedParticipants.length;
    if (count === 0) return;

    if (method === 'EXACT') {
      const base = numAmount > 0 ? Math.floor((numAmount / count) * 100) / 100 : 0;
      const initial: Record<string, number> = {};
      selectedParticipants.forEach((uid, idx) => {
        initial[uid] = idx === 0 ? round2(numAmount - base * (count - 1)) : base;
      });
      setCustomValues(initial);
    } else if (method === 'PERCENTAGE') {
      const base = Math.floor((100 / count) * 10) / 10;
      const initial: Record<string, number> = {};
      selectedParticipants.forEach((uid, idx) => {
        initial[uid] = idx === 0 ? round2(100 - base * (count - 1)) : base;
      });
      setCustomValues(initial);
    } else if (method === 'SHARES') {
      const initial: Record<string, number> = {};
      selectedParticipants.forEach((uid) => {
        initial[uid] = customValues[uid] && customValues[uid] > 0 ? customValues[uid] : 1;
      });
      setCustomValues(initial);
    }
  };

  // Helper to distribute remaining balance evenly among selected participants
  const handleDistributeRemaining = () => {
    hapticImpact('LIGHT');
    const count = selectedParticipants.length;
    if (count === 0 || !splitValidation.diff) return;

    if (splitMethod === 'EXACT') {
      const share = Math.floor((splitValidation.diff / count) * 100) / 100;
      const updated = { ...customValues };
      selectedParticipants.forEach((uid, idx) => {
        const cur = updated[uid] || 0;
        updated[uid] = round2(cur + (idx === 0 ? splitValidation.diff - share * (count - 1) : share));
      });
      setCustomValues(updated);
    } else if (splitMethod === 'PERCENTAGE') {
      const share = Math.floor((splitValidation.diff / count) * 10) / 10;
      const updated = { ...customValues };
      selectedParticipants.forEach((uid, idx) => {
        const cur = updated[uid] || 0;
        updated[uid] = round2(cur + (idx === 0 ? splitValidation.diff - share * (count - 1) : share));
      });
      setCustomValues(updated);
    }
  };

  const totalToCollect = paidBy === currentUser.id
    ? (numAmount - (selectedParticipants.includes(currentUser.id) ? (previewSplits.find(s => s.userId === currentUser.id)?.shareAmount || 0) : 0)).toFixed(0)
    : '0';

  return (
    <div className="space-y-4 pb-28 sm:pb-nav-safe px-4 pt-3 bg-[#F9F9FF] min-h-full">
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

      {/* 0-Rooms Empty State Card */}
      {(!activeRoom || rooms.length === 0) && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-6 text-center space-y-3.5 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
            <Home className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">No Shared Rooms Yet</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Create a room for your flat, PG, or hostel, or join your flatmates using a 6-character invite code.
            </p>
          </div>
          <div className="flex gap-2 justify-center pt-1">
            <button
              onClick={() => setShowCreateRoomModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Room</span>
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-xs flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Join with Code</span>
            </button>
          </div>
        </div>
      )}

      {/* Admin Pending Join Requests Alert Banner */}
      {activeRoom && isRoomAdmin && activePendingJoinRequests.length > 0 && (
        <div
          onClick={() => {
            hapticImpact('MEDIUM');
            setReviewingJoinRequest(activePendingJoinRequests[0]);
          }}
          className="rounded-2xl bg-gradient-to-r from-amber-500/15 via-indigo-500/10 to-purple-500/15 border-2 border-amber-400/50 p-3.5 shadow-sm flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0 animate-pulse shadow-xs">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">New Join Request</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                  {activePendingJoinRequests.length} pending
                </span>
              </div>
              <p className="text-[11px] text-slate-600 truncate">
                <strong>{activePendingJoinRequests[0].user.name}</strong> wants to join {activeRoom.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 shrink-0 ml-2">
            <span>Review</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Redesigned Room Identity & Actions Card */}
      {activeRoom && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 space-y-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          {/* Header Row: Room Name, Admin & Overflow Menu */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  {activeRoom.name}
                </h1>
                {/* Admin Identifier */}
                <div className="flex items-center gap-1 text-xs text-amber-800 font-semibold mt-0.5">
                  <span>👑</span>
                  <span>{currentAdminName} · Admin</span>
                  {currentAdminUser?.id === currentUser.id && (
                    <span className="text-[10px] text-amber-700 font-normal">(You)</span>
                  )}
                </div>
              </div>

              {/* Overflow ⋮ Menu Button */}
              <button
                type="button"
                onClick={() => setShowRoomSettingsModal(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors active:scale-95"
                title="Room Settings & Management"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>

            {/* Tappable Member Count Badge */}
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowMembersModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200/80 transition-all active:scale-95"
              >
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>{activeMembers.length} members</span>
                <ChevronRight className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Primary Financial Action: Full Width Add Bill / Split */}
          <div>
            <button
              onClick={handleOpenSplit}
              className="w-full h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Add Bill / Split</span>
            </button>
          </div>

          {/* Secondary Actions: Invite & Settle */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => setShowInviteModal(true)}
              className="h-10 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-200/90 shadow-2xs active:scale-95 transition-all"
            >
              <QrCode className="w-3.5 h-3.5 text-indigo-600" />
              <span>Invite</span>
            </button>

            <button
              onClick={() => setShowUpiPayModal(true)}
              className="h-10 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 border border-slate-200 shadow-2xs active:scale-95 transition-all"
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
              <span>Settle via UPI</span>
            </button>
          </div>
        </div>
      )}

      {/* Simplified Debts Matrix: Who Owes Whom */}
      {activeRoom && (
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

              const isDebtorFormer = roomMembers.some(
                (m) => m.roomId === activeRoom?.id && m.userId === debtorId && m.status !== 'ACTIVE'
              );
              const isCreditorFormer = roomMembers.some(
                (m) => m.roomId === activeRoom?.id && m.userId === creditorId && m.status !== 'ACTIVE'
              );

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
                      <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                        <span>
                          {isCurrentUserDebtor
                            ? `You owe ${creditorName}`
                            : isCurrentUserCreditor
                            ? `${debtorName} owes you`
                            : `${debtorName} owes ${creditorName}`}
                        </span>
                        {(isDebtorFormer || isCreditorFormer) && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            Former
                          </span>
                        )}
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
      )}

      {/* Room Activity Feed */}
      {activeRoom && (
        <RoomActivitySection
          room={activeRoom}
          allUsers={allUsers}
          sharedExpenses={sharedExpenses}
          settlementPayments={settlementPayments}
          roomMembers={roomMembers}
        />
      )}

      {/* Shared Expenses History Section with Monthly Filter, Summary & Export */}
      {activeRoom && (
        <div className="space-y-3">
          {/* Section Header with Export Action */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Shared Expenses History
            </h2>

          {activeRoom && (
            <button
              type="button"
              onClick={() => {
                hapticImpact('LIGHT');
                setShowRoomExportSheet(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200/80 transition-all active:scale-95 shadow-2xs"
              title={`Export ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear} Shared Expenses`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          )}
        </div>

        {/* 1. Month Selector & Monthly KPI Summary Card */}
        {activeRoom && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-3">
            {/* Month Switcher Controls */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setShowMonthPickerModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold text-xs hover:bg-indigo-100 active:scale-95 transition-all shadow-2xs"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>
                  {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
                </span>
                {isCurrentMonth && (
                  <span className="text-[9px] bg-indigo-600 text-white px-1.5 py-0.2 rounded-full font-bold">
                    Current
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-indigo-500 ml-0.5" />
              </button>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={isCurrentMonth}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 flex items-center justify-center active:scale-95 transition-all"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Compact Room-Level Monthly Summary */}
            {monthlyRoomData && (
              <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 font-medium block">Total Shared</span>
                    <span className="text-base font-extrabold text-slate-900 tabular-nums">
                      ₹{monthlyRoomData.summary.totalSharedSpending.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100/70">
                    <span className="text-[10px] text-indigo-600 font-medium block">My Share</span>
                    <span className="text-base font-extrabold text-indigo-950 tabular-nums">
                      ₹{monthlyRoomData.summary.myShare.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs px-1 text-slate-600">
                  <span>I Paid: <strong className="text-slate-900">₹{monthlyRoomData.summary.iPaid.toLocaleString('en-IN')}</strong></span>
                  {monthlyRoomData.summary.iOwe > 0 && (
                    <span className="text-rose-600 font-semibold">I Owe: ₹{monthlyRoomData.summary.iOwe.toLocaleString('en-IN')}</span>
                  )}
                  {monthlyRoomData.summary.othersOweMe > 0 && (
                    <span className="text-emerald-600 font-semibold">Owed to Me: ₹{monthlyRoomData.summary.othersOweMe.toLocaleString('en-IN')}</span>
                  )}
                  {monthlyRoomData.summary.iOwe === 0 && monthlyRoomData.summary.othersOweMe === 0 && (
                    <span className="text-slate-400">All settled</span>
                  )}
                </div>

                {/* Status Count Badges */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium whitespace-nowrap">
                    {monthlyRoomData.summary.sharedBillsCount} bill{monthlyRoomData.summary.sharedBillsCount !== 1 ? 's' : ''}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-100 whitespace-nowrap">
                    {monthlyRoomData.summary.settledBillsCount} settled
                  </span>
                  {monthlyRoomData.summary.partiallySettledBillsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-100 whitespace-nowrap">
                      {monthlyRoomData.summary.partiallySettledBillsCount} partially paid
                    </span>
                  )}
                  {monthlyRoomData.summary.outstandingSettlementsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium border border-rose-100 whitespace-nowrap">
                      {monthlyRoomData.summary.outstandingSettlementsCount} outstanding
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Roommate Settlement Breakdown Table */}
        {monthlyRoomData && monthlyRoomData.settlements.length > 0 && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900">
                Roommate Settlement Breakdown
              </h3>
              <span className="text-[10px] text-slate-400 font-medium">
                {MONTH_NAMES[selectedMonthIndex].slice(0, 3)} {selectedYear}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-semibold uppercase">
                    <th className="pb-1.5 pl-1">Roommate</th>
                    <th className="pb-1.5 text-right">Paid</th>
                    <th className="pb-1.5 text-right">Fair Share</th>
                    <th className="pb-1.5 text-right">Balance</th>
                    <th className="pb-1.5 text-center pr-1">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyRoomData.settlements.map((s) => (
                    <tr key={s.userId} className="hover:bg-slate-50/50">
                      <td className="py-2 pl-1 font-semibold text-slate-900 truncate max-w-[95px]">
                        {s.name}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">
                        ₹{s.totalPaid.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-600">
                        ₹{s.fairShare.toLocaleString('en-IN')}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-bold ${
                          s.netBalance > 0
                            ? 'text-emerald-600'
                            : s.netBalance < 0
                            ? 'text-rose-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {s.netBalance > 0
                          ? `+₹${s.netBalance.toLocaleString('en-IN')}`
                          : s.netBalance < 0
                          ? `-₹${Math.abs(s.netBalance).toLocaleString('en-IN')}`
                          : '₹0'}
                      </td>
                      <td className="py-2 text-center pr-1">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            s.status === 'Receive'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : s.status === 'Pay'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. Month-Specific Shared Expense History List */}
        {!monthlyRoomData || monthlyRoomData.expenses.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200/80 p-6 text-center shadow-xs flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2.5 shadow-2xs">
              <Receipt className="w-6 h-6 stroke-[1.8]" />
            </div>
            <h3 className="text-xs font-bold text-slate-900 mb-1">
              No Shared Expenses in {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
            </h3>
            <p className="text-[11px] text-slate-500 max-w-[260px] mb-3.5 leading-relaxed">
              No room bills were recorded for this month. Log a bill to track splits.
            </p>
            <button
              type="button"
              onClick={handleOpenSplit}
              className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Bill / Split</span>
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-2xl divide-y divide-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] overflow-hidden">
            {monthlyRoomData.expenses.map((exp) => {
              const payer = allUsers.find((u) => u.id === exp.paidBy);
              const splitsForExp = monthlyRoomData.detailedSplits.filter((s) => s.expenseId === exp.id);
              const mySplit = splitsForExp.find((s) => s.roommateId === currentUser.id);
              const isExpanded = expandedExpenseId === exp.id;

              const d = new Date(exp.expenseDate || exp.createdAt);
              const dateStr = !isNaN(d.getTime())
                ? `${String(d.getDate()).padStart(2, '0')} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`
                : '';

              return (
                <div key={exp.id} className="transition-colors">
                  <div
                    onClick={() => {
                      hapticSelection();
                      setExpandedExpenseId((prev) => (prev === exp.id ? null : exp.id));
                    }}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50/80 cursor-pointer transition-colors select-none"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                        <span className="truncate">{exp.title}</span>
                        {dateStr && (
                          <span className="text-[10px] text-slate-400 font-normal shrink-0">
                            • {dateStr}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                          {exp.category}
                        </span>
                        <span>•</span>
                        <span>Paid by {payer?.name || 'Roommate'}</span>
                        {mySplit && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-slate-700">
                              Your share: ₹{mySplit.shareAmount.toLocaleString('en-IN')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-2 shrink-0">
                      <div>
                        <div className="text-xs font-bold text-slate-900 tabular-nums">
                          ₹{exp.totalAmount.toLocaleString('en-IN')}
                        </div>
                        {mySplit ? (
                          <div
                            className={`text-[10px] font-semibold ${
                              mySplit.status === 'Settled'
                                ? 'text-emerald-600'
                                : mySplit.status === 'Partially Paid'
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {mySplit.status}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">{exp.splitMethod}</div>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expandable Itemized Roommate Split Breakdown */}
                  {isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 bg-slate-50/70 border-t border-slate-100 space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                        <span>Split Breakdown ({splitsForExp.length} roommates)</span>
                        <span>{exp.splitMethod}</span>
                      </div>

                      <div className="space-y-1.5">
                        {splitsForExp.map((split) => (
                          <div
                            key={split.roommateId}
                            className="p-2 rounded-xl bg-white border border-slate-200/80 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-semibold text-slate-900 flex items-center gap-1">
                                <span>{split.roommateName}</span>
                                {split.roommateId === currentUser.id && (
                                  <span className="text-[10px] text-slate-400 font-normal">(You)</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <span>Share: ₹{split.shareAmount.toLocaleString('en-IN')}</span>
                                {split.paidAmount > 0 && split.status !== 'Settled' && (
                                  <>
                                    <span>•</span>
                                    <span className="text-emerald-600">Paid: ₹{split.paidAmount}</span>
                                    <span>•</span>
                                    <span className="text-rose-600">Rem: ₹{split.remainingAmount}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                split.status === 'Settled'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : split.status === 'Partially Paid'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              }`}
                            >
                              {split.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ========================================================================= */}
      {/* RoomMate Modal: Add Expense & Split With Roommates                        */}
      {/* ========================================================================= */}
      {/* Add Shared Expense & Split Bottom Sheet */}
      <MobileBottomSheet
        isOpen={showSplitModal}
        onClose={() => {
          setShowSplitModal(false);
          if (onCloseModals) onCloseModals();
        }}
        title="Add Shared Expense"
        subtitle={`Split with ${activeRoom?.name || 'Room'}`}
        icon={<Users className="w-4.5 h-4.5" />}
        maxHeight="92vh"
        headerRight={
          <button
            onClick={() => handleCreateSplit()}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 px-2.5 py-1 rounded-lg bg-indigo-50 active:scale-95 transition-all"
            type="button"
          >
            Save
          </button>
        }
      >
        {!isOnline && (
          <div className="mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center gap-2 text-xs text-amber-800">
            <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-medium">
              Operating Offline: Split will be saved to local vault and synced automatically once connected.
            </span>
          </div>
        )}

        {/* Form Body */}
        <div className="space-y-4 pb-4">
              {/* Hero Input & Details Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] space-y-3">
                {/* Big Prominent Amount Input */}
                <div className="flex flex-col items-center justify-center py-3 border-b border-slate-100">
                  <div className="flex items-center justify-between w-full mb-1 px-1">
                    <span className="text-xs font-medium text-slate-500">
                      Expense Amount <span className="text-rose-500 font-bold">*</span>
                    </span>
                    {splitValidationErrors.amount && (
                      <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1 animate-pulse">
                        <AlertCircle className="w-3 h-3" />
                        Required
                      </span>
                    )}
                  </div>
                  <div className={`flex items-baseline justify-center tracking-tight px-3 py-1 rounded-xl transition-all ${
                    splitValidationErrors.amount
                      ? 'bg-rose-50/40 ring-2 ring-rose-500/20'
                      : ''
                  }`}>
                    <span className="text-3xl font-bold text-slate-900 mr-1">₹</span>
                    <input
                      ref={splitAmountInputRef}
                      type="number"
                      step="any"
                      inputMode="decimal"
                      pattern="[0-9]*[.]?[0-9]*"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        if (splitValidationErrors.amount) {
                          setSplitValidationErrors((prev) => ({ ...prev, amount: undefined }));
                        }
                      }}
                      placeholder="0"
                      autoFocus
                      className="text-3xl font-extrabold text-slate-900 w-44 text-center bg-transparent border-none p-0 focus:ring-0 tabular-nums placeholder:text-slate-300 outline-none"
                    />
                  </div>
                  {splitValidationErrors.amount && (
                    <span className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {splitValidationErrors.amount}
                    </span>
                  )}

                  {numAmount > 0 && selectedParticipants.length > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                      <span>₹{perPersonAmount} / person across {selectedParticipants.length}</span>
                    </div>
                  )}
                </div>

                {/* Description and Date */}
                <div className="space-y-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1 pl-1">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <span>Description</span>
                        <span className="text-rose-500 font-bold">*</span>
                      </span>
                      {splitValidationErrors.title && (
                        <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1 animate-pulse">
                          <AlertCircle className="w-3 h-3" />
                          Required
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                      splitValidationErrors.title
                        ? 'bg-rose-50/40 border-2 border-rose-400 ring-2 ring-rose-500/20'
                        : 'bg-slate-50 border border-slate-200'
                    }`}>
                      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-600 flex-shrink-0 shadow-2xs">
                        <Receipt className="w-4 h-4 text-indigo-600" />
                      </div>
                      <input
                        ref={splitTitleInputRef}
                        type="text"
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          if (splitValidationErrors.title) {
                            setSplitValidationErrors((prev) => ({ ...prev, title: undefined }));
                          }
                        }}
                        placeholder="What was this for? (e.g. WiFi Bill, Groceries)"
                        className="flex-1 bg-transparent p-0 border-none text-base md:text-xs font-medium text-slate-900 focus:ring-0 placeholder:text-slate-400 outline-none"
                      />
                    </div>
                    {splitValidationErrors.title && (
                      <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 pl-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{splitValidationErrors.title}</span>
                      </p>
                    )}

                    {/* Quick Shared Description Suggestions */}
                    <div className="pt-2">
                      <span className="text-[10px] text-slate-400 font-medium block mb-1">
                        Quick 1-tap presets:
                      </span>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                        {SHARED_QUICK_CHIPS.map((chip) => {
                          const cleanName = chip.replace(/\s[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
                          const isSelected = title.toLowerCase() === cleanName.toLowerCase();
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => {
                                hapticSelection();
                                setTitle(cleanName);
                                if (splitValidationErrors.title) {
                                  setSplitValidationErrors((prev) => ({ ...prev, title: undefined }));
                                }
                                splitTitleInputRef.current?.focus();
                              }}
                              className={`h-7 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all active:scale-95 flex items-center gap-1 border shrink-0 ${
                                isSelected
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold shadow-2xs'
                                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-200/60'
                              }`}
                            >
                              {chip}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="h-[1px] bg-slate-100" />

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
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-800 border-none"
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
                        onClick={() => {
                          hapticSelection();
                          setCategory(cat);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold shadow-2xs'
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
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Split Mode</span>
                </div>
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
                  {[
                    { id: 'EQUAL' as SplitMethod, label: 'Equal (=)' },
                    { id: 'EXACT' as SplitMethod, label: 'Exact (₹)' },
                    { id: 'PERCENTAGE' as SplitMethod, label: 'Percent (%)' },
                    { id: 'SHARES' as SplitMethod, label: 'Shares (x)' },
                  ].map((sm) => {
                    const isActive = splitMethod === sm.id;
                    return (
                      <button
                        key={sm.id}
                        type="button"
                        onClick={() => handleSelectSplitMethod(sm.id)}
                        className={`flex-1 py-1.5 text-center rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-white text-indigo-700 font-bold shadow-2xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        {sm.label}
                      </button>
                    );
                  })}
                </div>

                {/* Live Allocation Status Banner */}
                <div className="px-1">
                  {splitMethod === 'EQUAL' ? (
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Split equally among {selectedParticipants.length} roommates (₹{perPersonAmount} each)</span>
                    </p>
                  ) : (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {splitValidation.isValid ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                        <span className={`font-semibold ${splitValidation.isValid ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {splitValidation.message}
                        </span>
                      </div>

                      {splitValidation.diff > 0 && (
                        <button
                          type="button"
                          onClick={handleDistributeRemaining}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1 active:scale-95 transition-all flex-shrink-0"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Fill Remainder</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Roommates Split Breakdown (Grouped Table View with Custom Inputs) */}
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
                    const previewShare = previewSplits.find((s) => s.userId === u.id)?.shareAmount || 0;

                    return (
                      <div
                        key={u.id}
                        className={`p-3.5 flex items-center justify-between transition-colors ${
                          isChecked ? 'hover:bg-slate-50/80' : 'bg-slate-50/50 opacity-60'
                        }`}
                      >
                        <div
                          className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 pr-2"
                          onClick={() => {
                            hapticSelection();
                            if (isChecked) {
                              if (selectedParticipants.length > 1) {
                                setSelectedParticipants(selectedParticipants.filter((id) => id !== u.id));
                              }
                            } else {
                              setSelectedParticipants([...selectedParticipants, u.id]);
                            }
                          }}
                        >
                          <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {u.name.charAt(0)}
                          </div>
                          <div className="min-w-0 truncate">
                            <span className="text-xs font-semibold text-slate-900 block truncate">
                              {isCurrentUser ? `${u.name} (You)` : u.name}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {isChecked ? 'Participating' : 'Excluded'}
                            </span>
                          </div>
                        </div>

                        {/* Split Amount / Interactive Custom Controls */}
                        {splitMethod === 'EQUAL' && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-900 tabular-nums">
                              ₹{isChecked ? perPersonAmount : '0.00'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  if (selectedParticipants.length > 1) {
                                    setSelectedParticipants(selectedParticipants.filter((id) => id !== u.id));
                                  }
                                } else {
                                  setSelectedParticipants([...selectedParticipants, u.id]);
                                }
                              }}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all ${
                                isChecked
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-slate-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </button>
                          </div>
                        )}

                        {splitMethod === 'EXACT' && (
                          <div className="flex items-center gap-2">
                            <CurrencyInput
                              size="sm"
                              step="any"
                              disabled={!isChecked}
                              value={isChecked ? (customValues[u.id] ?? '') : ''}
                              onChange={(_val, num) => {
                                setCustomValues((prev) => ({ ...prev, [u.id]: num }));
                              }}
                              placeholder="0"
                              containerClassName="w-24"
                              className="text-right"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  if (selectedParticipants.length > 1) {
                                    setSelectedParticipants(selectedParticipants.filter((id) => id !== u.id));
                                  }
                                } else {
                                  setSelectedParticipants([...selectedParticipants, u.id]);
                                }
                              }}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all ${
                                isChecked
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-slate-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </button>
                          </div>
                        )}

                        {splitMethod === 'PERCENTAGE' && (
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block tabular-nums">
                                ₹{isChecked ? previewShare.toFixed(2) : '0.00'}
                              </span>
                            </div>
                            <div className="relative flex items-center">
                              <input
                                type="number"
                                step="any"
                                disabled={!isChecked}
                                value={isChecked ? (customValues[u.id] ?? '') : ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCustomValues((prev) => ({ ...prev, [u.id]: val }));
                                }}
                                placeholder="0"
                                className="w-16 pr-5 pl-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 text-right focus:ring-1 focus:ring-indigo-500 tabular-nums disabled:opacity-40"
                              />
                              <span className="absolute right-1.5 text-xs font-bold text-slate-400">%</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  if (selectedParticipants.length > 1) {
                                    setSelectedParticipants(selectedParticipants.filter((id) => id !== u.id));
                                  }
                                } else {
                                  setSelectedParticipants([...selectedParticipants, u.id]);
                                }
                              }}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all ${
                                isChecked
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-slate-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </button>
                          </div>
                        )}

                        {splitMethod === 'SHARES' && (
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block tabular-nums">
                                ₹{isChecked ? previewShare.toFixed(2) : '0.00'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
                              <button
                                type="button"
                                disabled={!isChecked || (customValues[u.id] || 1) <= 1}
                                onClick={() => {
                                  const cur = customValues[u.id] || 1;
                                  if (cur > 1) {
                                    setCustomValues((prev) => ({ ...prev, [u.id]: cur - 1 }));
                                  }
                                }}
                                className="w-5 h-5 rounded flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-5 text-center text-xs font-bold text-slate-900 tabular-nums">
                                {isChecked ? (customValues[u.id] || 1) : 0}
                              </span>
                              <button
                                type="button"
                                disabled={!isChecked}
                                onClick={() => {
                                  const cur = customValues[u.id] || 1;
                                  setCustomValues((prev) => ({ ...prev, [u.id]: cur + 1 }));
                                }}
                                className="w-5 h-5 rounded flex items-center justify-center text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  if (selectedParticipants.length > 1) {
                                    setSelectedParticipants(selectedParticipants.filter((id) => id !== u.id));
                                  }
                                } else {
                                  setSelectedParticipants([...selectedParticipants, u.id]);
                                }
                              }}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-all ${
                                isChecked
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-slate-300 bg-white'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </button>
                          </div>
                        )}
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
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-transform"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Confirm & Split Bill</span>
              </button>
            </div>
      </MobileBottomSheet>

      {/* Settle Up UPI Modal (Clean Light Mode) */}
      <MobileBottomSheet
        isOpen={showSettleModal}
        onClose={() => {
          setShowSettleModal(false);
          if (onCloseModals) onCloseModals();
        }}
        title="Settle Roommate Debt"
        subtitle="Record payment or clear balance"
        icon={<QrCode className="w-4.5 h-4.5" />}
        maxHeight="90vh"
      >
        {!isOnline && (
          <div className="mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center gap-2 text-xs text-amber-800">
            <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-medium">
              Operating Offline: Settlement will be logged locally and queued for cloud sync.
            </span>
          </div>
        )}

        <form onSubmit={handleRecordSettlementSubmit} className="space-y-3.5 pb-4">
              {/* Payee Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <span>Pay To Roommate</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  {settleValidationErrors.payee && (
                    <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1 animate-pulse">
                      <AlertCircle className="w-3 h-3" />
                      Required
                    </span>
                  )}
                </div>
                <select
                  value={settlePayeeId}
                  onChange={(e) => {
                    setSettlePayeeId(e.target.value);
                    if (settleValidationErrors.payee) {
                      setSettleValidationErrors((prev) => ({ ...prev, payee: undefined }));
                    }
                  }}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs text-slate-900 outline-none transition-all ${
                    settleValidationErrors.payee
                      ? 'bg-rose-50/40 border-2 border-rose-400 ring-2 ring-rose-500/20'
                      : 'bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-indigo-500'
                  }`}
                >
                  <option value="">Select Roommate...</option>
                  <optgroup label="Active Roommates">
                    {activeUserObjects
                      .filter((u) => u.id !== currentUser.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </optgroup>
                  {formerMembersWithDebts.length > 0 && (
                    <optgroup label="Former Roommates (Unsettled Balance)">
                      {formerMembersWithDebts.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} (Former Member)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {settleValidationErrors.payee && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{settleValidationErrors.payee}</span>
                  </p>
                )}
              </div>

              {/* Settlement Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <span>Settlement Amount in ₹</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  {settleValidationErrors.amount && (
                    <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1 animate-pulse">
                      <AlertCircle className="w-3 h-3" />
                      Required
                    </span>
                  )}
                </div>
                <CurrencyInput
                  ref={settleAmountInputRef}
                  size="md"
                  value={settleAmount}
                  onChange={(val) => {
                    setSettleAmount(val);
                    if (settleValidationErrors.amount) {
                      setSettleValidationErrors((prev) => ({ ...prev, amount: undefined }));
                    }
                  }}
                  hasError={Boolean(settleValidationErrors.amount)}
                  placeholder="0"
                />
                {settleValidationErrors.amount && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{settleValidationErrors.amount}</span>
                  </p>
                )}

                {/* Settle Up 1-Tap Quick Amount Presets */}
                <div className="pt-2">
                  <span className="text-[10px] text-slate-400 font-medium block mb-1">
                    Quick Settlement Presets:
                  </span>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {[100, 200, 500, 1000, 2000].map((presetVal) => (
                      <button
                        key={presetVal}
                        type="button"
                        onClick={() => {
                          hapticSelection();
                          setSettleAmount(String(presetVal));
                          if (settleValidationErrors.amount) {
                            setSettleValidationErrors((prev) => ({ ...prev, amount: undefined }));
                          }
                        }}
                        className={`h-7 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all active:scale-95 flex items-center gap-1 border shrink-0 ${
                          Number(settleAmount) === presetVal
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-300 font-bold shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/60'
                        }`}
                      >
                        ₹{presetVal}
                      </button>
                    ))}
                  </div>
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
                  className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-xs active:scale-98 transition-all"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Record & Clear Balance</span>
                </button>
              </div>
            </form>
      </MobileBottomSheet>

      {/* Create Room Modal */}
      {showCreateRoomModal && (
        <div
          onClick={() => setShowCreateRoomModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[340px] bg-white rounded-2xl p-5 space-y-4 shadow-2xl border border-slate-200"
          >
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

      {/* Join Room Modal with QR Scanner, Token Preview & Direct Join */}
      <JoinRoomModal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        currentUser={currentUser}
        onResolveInvite={onResolveInvite || (async (tok: string) => {
          return {
            room: { id: 'room', name: 'Room', joinPolicy: 'INSTANT' as const, invitePolicy: 'ALL_MEMBERS' as const },
            memberCount: 2,
            adminName: 'Admin',
            invite: { id: 'inv', roomId: 'room', inviteCode: tok, token: tok, createdBy: 'u', isRevoked: false, createdAt: new Date().toISOString() },
          };
        })}
        onRequestJoin={onRequestJoinRoom || (async (code: string) => {
          onJoinRoom(code);
          return { status: 'JOINED' as const, room: activeRoom || rooms[0] };
        })}
        onRoomJoined={(room: Room) => {
          onSelectRoom(room);
        }}
      />

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
          availablePayees={[
            ...activeUserObjects.filter((u) => u.id !== currentUser.id),
            ...formerMembersWithDebts,
          ]}
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

      {/* Leave Room Modal */}
      {activeRoom && (
        <MobileLeaveRoomModal
          isOpen={showLeaveModal}
          onClose={() => setShowLeaveModal(false)}
          roomId={activeRoom.id}
          roomName={activeRoom.name}
          currentUserId={currentUser.id}
          summary={summary}
          isRoomAdmin={Boolean(isRoomAdmin)}
          otherActiveMemberCount={activeMembers.filter((m) => m.userId !== currentUser.id).length}
          onOpenTransferOwnership={() => {
            setShowLeaveModal(false);
            setShowTransferOwnershipModal(true);
          }}
          onConfirmLeave={async () => {
            if (onLeaveRoom) {
              await onLeaveRoom(activeRoom.id);
            }
          }}
          onStartSettle={(payeeId, amt) => {
            setSettlePayeeId(payeeId);
            setSettleAmount(String(amt));
            setShowSettleModal(true);
          }}
          onNudgeRoommates={(text) => {
            const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
          }}
        />
      )}

      {/* Room Invite & QR Code Modal */}
      {activeRoom && (
        <RoomInviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          room={activeRoom}
          invitation={activeInvite || null}
          currentUser={currentUser}
          roomMembers={roomMembers}
          onRegenerateInvite={async (hrs?: number) => {
            if (onRegenerateInvite && activeRoom) {
              return await onRegenerateInvite(activeRoom.id, hrs);
            }
          }}
        />
      )}

      {/* Room Members & Pending Approvals Modal */}
      {activeRoom && (
        <RoomMembersModal
          isOpen={showMembersModal}
          onClose={() => setShowMembersModal(false)}
          room={activeRoom}
          currentUser={currentUser}
          allUsers={allUsers}
          roomMembers={roomMembers}
          joinRequests={roomJoinRequests.filter((r) => r.roomId === activeRoom.id)}
          onRemoveMember={
            onRemoveMember
              ? async (targetUserId: string) => {
                  await onRemoveMember(activeRoom.id, targetUserId);
                }
              : undefined
          }
          onApproveRequest={onApproveJoinRequest}
          onDeclineRequest={onDeclineJoinRequest}
          onOpenTransferOwnership={() => setShowTransferOwnershipModal(true)}
          onOpenInvite={() => setShowInviteModal(true)}
        />
      )}

      {/* Role-Based Room Settings Overflow Menu Modal */}
      {activeRoom && (
        <RoomSettingsModal
          isOpen={showRoomSettingsModal}
          onClose={() => setShowRoomSettingsModal(false)}
          room={activeRoom}
          currentUser={currentUser}
          allUsers={allUsers}
          roomMembers={roomMembers}
          joinRequests={roomJoinRequests.filter((r) => r.roomId === activeRoom.id)}
          onOpenMembers={() => setShowMembersModal(true)}
          onOpenInvite={() => setShowInviteModal(true)}
          onOpenTransferOwnership={() => setShowTransferOwnershipModal(true)}
          onOpenLeaveRoom={() => setShowLeaveModal(true)}
          onUpdatePolicies={async (policies) => {
            if (onUpdateRoomPolicies && activeRoom) {
              await onUpdateRoomPolicies(activeRoom.id, policies);
            }
          }}
        />
      )}

      {/* Transfer Ownership Modal */}
      {activeRoom && (
        <TransferOwnershipModal
          isOpen={showTransferOwnershipModal}
          onClose={() => setShowTransferOwnershipModal(false)}
          room={activeRoom}
          currentUser={currentUser}
          roomMembers={roomMembers}
          allUsers={allUsers}
          onTransferOwnership={async (newAdminId: string) => {
            if (onTransferOwnership && activeRoom) {
              await onTransferOwnership(activeRoom.id, newAdminId);
            }
          }}
        />
      )}

      {/* Admin Join Request Review Modal */}
      {activeRoom && reviewingJoinRequest && (
        <JoinRequestReviewModal
          isOpen={!!reviewingJoinRequest}
          onClose={() => setReviewingJoinRequest(null)}
          request={reviewingJoinRequest}
          roomName={activeRoom.name}
          onApprove={async (reqId) => {
            if (onApproveJoinRequest) await onApproveJoinRequest(reqId);
            setReviewingJoinRequest(null);
          }}
          onDecline={async (reqId) => {
            if (onDeclineJoinRequest) await onDeclineJoinRequest(reqId);
            setReviewingJoinRequest(null);
          }}
        />
      )}

      {/* Specific Month History Drawer / Modal (Native Bottom Sheet) */}
      <MobileBottomSheet
        isOpen={showMonthPickerModal}
        onClose={() => setShowMonthPickerModal(false)}
        title="Select Month History"
        subtitle={`Room history for ${activeRoom?.name || 'Room'}`}
        icon={<History className="w-4.5 h-4.5" />}
        maxHeight="85vh"
      >
        <div className="space-y-2 pt-1 pb-4">
          {availableRoomMonths.map((item) => {
            const isSelected = item.year === selectedYear && item.monthIndex === selectedMonthIndex;
            const isCurrent = item.year === currentActualYear && item.monthIndex === currentActualMonth;

            return (
              <button
                key={`${item.year}-${item.monthIndex}`}
                onClick={() => handleSelectMonth(item.year, item.monthIndex)}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.99] ${
                  isSelected
                    ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {MONTH_NAMES[item.monthIndex].slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900">
                        {MONTH_NAMES[item.monthIndex]} {item.year}
                      </span>
                      {isCurrent && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {item.count} room bill{item.count !== 1 ? 's' : ''} logged
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-slate-900 tabular-nums">
                    ₹{item.total.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-400">Total</div>
                </div>
              </button>
            );
          })}
        </div>
      </MobileBottomSheet>

      {/* Room Export Bottom Sheet */}
      <RoomExportBottomSheet
        isOpen={showRoomExportSheet}
        onClose={() => setShowRoomExportSheet(false)}
        roomName={activeRoom?.name || 'Room'}
        monthLabel={`${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`}
        onExport={handleRoomExport}
      />
    </div>
  );
};


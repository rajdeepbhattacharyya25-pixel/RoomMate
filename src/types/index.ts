export type UserRole = 'SUPER_ADMIN' | 'STUDENT';
export type RoomMemberRole = 'ROOM_ADMIN' | 'MEMBER';
export type RoomMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'SUSPENDED' | 'CANCELLED';
export type SplitMethod = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';
export type PaymentMethod = 'UPI' | 'CASH' | 'BANK_TRANSFER' | 'OTHER';

export interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  isSuspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planCode: 'FREE' | 'PRO' | 'CAMPUS_MAX';
  planName: string;
  priceInr: number;
  status: SubscriptionStatus;
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  gracePeriodUntil?: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionEvent {
  id: string;
  userId: string;
  razorpayEventId: string; // Strict idempotency key
  eventType: 'subscription.charged' | 'subscription.halted' | 'payment.failed' | 'payment.authorized';
  payload: Record<string, unknown>;
  processedAt: string;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  createdBy: string; // user id
  isArchived: boolean;
  isFrozen?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoomInvitation {
  id: string;
  roomId: string;
  inviteCode: string; // 6-digit alphanumeric
  createdBy: string;
  expiresAt: string;
  isRevoked: boolean;
  createdAt: string;
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  role: RoomMemberRole;
  status: RoomMemberStatus;
  joinedAt: string;
  leftAt?: string;
}

export interface PersonalExpense {
  id: string;
  userId: string; // 100% PRIVATE to this user
  title: string;
  amount: number;
  category: 'Food' | 'Shopping' | 'Travel' | 'Entertainment' | 'Academics' | 'Health' | 'Other';
  notes?: string;
  expenseDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface SharedExpense {
  id: string;
  roomId: string;
  createdBy: string; // User who recorded it
  paidBy: string; // User who physically paid
  title: string;
  totalAmount: number;
  category: 'Rent' | 'Electricity' | 'Groceries' | 'Water' | 'Wi-Fi' | 'Gas' | 'Cleaning' | 'Food' | 'Other';
  splitMethod: SplitMethod;
  notes?: string;
  expenseDate: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseSplit {
  id: string;
  sharedExpenseId: string;
  userId: string;
  shareAmount: number; // Point-in-time frozen obligation
  createdAt: string;
}

export interface SettlementPayment {
  id: string;
  roomId: string;
  payerId: string; // User who paid money
  payeeId: string; // User who received money
  amount: number;
  paymentMethod: PaymentMethod;
  transactionRef?: string;
  notes?: string;
  paymentDate: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

// Derived Analytical Types
export interface PairwiseDebt {
  userAId: string;
  userBId: string;
  userAName: string;
  userBName: string;
  netAmount: number; // Positive: B owes A | Negative: A owes B
  explanation: {
    aPaidForB: number;
    bPaidForA: number;
    settlementsAToB: number;
    settlementsBToA: number;
  };
}

export interface RoomFinancialSummary {
  roomId: string;
  totalRoomExpenses: number;
  myTotalPaid: number;
  myTotalShare: number;
  myNetBalance: number; // Positive: room owes me | Negative: I owe room
  pairwiseDebts: PairwiseDebt[];
}

export interface UserUnifiedDashboard {
  personalTotal: number;
  sharedObligationsTotal: number;
  totalOutflow: number; // personal + shared obligations
  netReceivables: number; // money others owe me across all rooms
  netPayables: number; // money I owe others across all rooms
  activeRoomsCount: number;
}

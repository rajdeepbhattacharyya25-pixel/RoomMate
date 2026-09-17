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
  upiQrUrl?: string;
  upiId?: string;
  fcmToken?: string;
  role: UserRole;
  isSuspended: boolean;
  onboardingCompleted?: boolean;
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

export type JoinPolicy = 'APPROVAL_REQUIRED' | 'INSTANT';
export type InvitePolicy = 'ALL_MEMBERS' | 'ADMIN_ONLY';
export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface Room {
  id: string;
  name: string;
  description?: string;
  createdBy: string; // original creator user id
  adminUserId?: string; // current active admin user id
  joinPolicy?: JoinPolicy; // default APPROVAL_REQUIRED
  invitePolicy?: InvitePolicy; // default ALL_MEMBERS
  isArchived: boolean;
  isFrozen?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoomInvitation {
  id: string;
  roomId: string;
  token: string; // secure unpredictable invite token e.g. 7Hk92LmX...
  inviteCode: string; // 6-digit alphanumeric fallback
  createdBy: string;
  expiresAt?: string;
  isRevoked: boolean;
  createdAt: string;
}

export interface RoomJoinRequest {
  id: string;
  roomId: string;
  userId: string;
  status: JoinRequestStatus;
  createdAt: string;
  updatedAt?: string;
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

export interface RoomActivityItem {
  id: string;
  roomId: string;
  type: 'EXPENSE_ADDED' | 'SETTLEMENT_RECORDED' | 'MEMBER_JOINED' | 'MEMBER_LEFT' | 'ADMIN_TRANSFERRED' | 'INVITE_REGENERATED';
  actorId: string;
  actorName: string;
  description: string;
  amount?: number;
  timestamp: string;
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
  entityType?: string;
  entityId?: string;
  details?: string;
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

// In-App Notification System Types
export type NotificationPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type NotificationType =
  // HIGH Priority (Urgent financial / security / admin actions)
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_DUE_TO_YOU'
  | 'ADMIN_APPROVAL_REQUIRED'
  | 'ROOM_JOIN_REQUEST'
  | 'ACCOUNT_SECURITY'
  | 'PAYMENT_FAILED'
  | 'EXPENSE_DISPUTE'
  | 'ROOM_POLICY_CHANGED'
  // MEDIUM Priority (Shared bills & active room changes)
  | 'EXPENSE_ADDED'
  | 'BILL_ADDED'
  | 'PARTIAL_PAYMENT_RECEIVED'
  | 'MEMBER_JOINED'
  | 'EXPENSE_MODIFIED'
  | 'SETTLEMENT_REMINDER'
  | 'BUDGET_THRESHOLD_REACHED'
  // LOW / CASUAL Priority (Informational & settled state)
  | 'EXPENSE_SETTLED'
  | 'MONTHLY_REPORT_GENERATED'
  | 'HISTORY_UPDATED'
  | 'GENERAL_ACTIVITY'
  | 'SYSTEM_INFO';

export type NotificationActionType =
  | 'PAY_NOW'
  | 'VIEW_EXPENSE'
  | 'VIEW_INVITATION'
  | 'REVIEW'
  | 'VIEW_DETAILS'
  | 'VIEW_BALANCE'
  | 'NONE';

export interface InAppNotification {
  id: string;
  userId: string;
  roomId?: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  actionType?: NotificationActionType;
  actionTarget?: string; // ID of expense, settlement, room, or join request
  metadata?: {
    amount?: number;
    currency?: string;
    payerName?: string;
    payerId?: string;
    payeeName?: string;
    payeeId?: string;
    roomName?: string;
    category?: string;
    groupCount?: number;
    groupedEventIds?: string[];
  };
  eventId?: string; // Strict idempotency key
  isDeleted?: boolean;
}

export type BugCategory =
  | 'EXPENSE_SPLIT'
  | 'PAYMENT_UPI'
  | 'ROOM_MANAGEMENT'
  | 'UI_GLITCH'
  | 'SYNC_OFFLINE'
  | 'OTHER';

export type BugSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type BugStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';

export interface BugReportDiagnostics {
  route: string;
  appVersion: string;
  platform: string;
  networkOnline: boolean;
  viewport: {
    width: number;
    height: number;
    pixelRatio: number;
  };
  userAgent: string;
  roomId?: string;
  roomName?: string;
  recentLogs?: string[];
  timestamp: string;
  osVersion?: string;
  networkStatus?: string;
  screenResolution?: string;
}

export interface BugReport {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  category: BugCategory;
  severity: BugSeverity;
  status: BugStatus;
  description: string;
  screenshotUrl?: string;
  diagnostics: BugReportDiagnostics;
  adminNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// SuperAdmin Feature Suggestions
export type FeatureSuggestionStatus =
  | 'NEW'
  | 'REVIEWING'
  | 'PLANNED'
  | 'IN_DEVELOPMENT'
  | 'IMPLEMENTED'
  | 'DECLINED';

export interface FeatureSuggestion {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  description: string;
  category: string;
  status: FeatureSuggestionStatus;
  votesCount?: number;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// SuperAdmin Contact Requests
export interface ContactRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  phone?: string;
  subject: string;
  message: string;
  status: 'NEW' | 'IN_REVIEW' | 'RESOLVED';
  createdAt: string;
}

// SuperAdmin Announcements
export type AnnouncementAudience = 'EVERYONE' | 'SELECTED_USERS' | 'SELECTED_ROOMS';
export type AnnouncementPriority = 'NORMAL' | 'IMPORTANT' | 'CRITICAL';
export type AnnouncementDelivery = 'IN_APP' | 'PUSH' | 'EMAIL';

export interface PlatformAnnouncement {
  id: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  targetUserIds?: string[];
  targetRoomIds?: string[];
  priority: AnnouncementPriority;
  deliveryChannels: AnnouncementDelivery[];
  recipientsCount: number;
  status: 'DRAFT' | 'DELIVERED' | 'FAILED';
  sentAt: string;
  createdBy: string;
}

// SuperAdmin Global Platform Settings
export interface PlatformSettings {
  appName: string;
  supportEmail: string;
  supportPhone: string;
  googleAuthEnabled: boolean;
  emailVerificationRequired: boolean;
  sessionTimeoutMinutes: number;
  maxRoomMembers: number;
  defaultJoinPolicy: JoinPolicy;
  defaultInvitePolicy: InvitePolicy;
  qrExpirationHours: number;
  maxExpenseAmount: number;
  defaultSplitMethod: SplitMethod;
  currencyCode: string;
  globalNotificationsEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

// SuperAdmin System Health & Incident Logging
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPERATIONAL' | 'INVESTIGATING' | 'MONITORING' | 'RESOLVED';

export interface SystemIncident {
  id: string;
  service: 'Application' | 'Database' | 'Authentication' | 'API' | 'Notifications' | 'Crashlytics' | 'PostHog' | (string & {});
  error: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurrences: number;
  details?: string;
  createdAt: string;
  resolvedAt?: string;
}


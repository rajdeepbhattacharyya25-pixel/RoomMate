import {
  User,
  UserSubscription,
  SubscriptionEvent,
  Room,
  RoomMember,
  RoomInvitation,
  RoomJoinRequest,
  JoinPolicy,
  InvitePolicy,
  PersonalExpense,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  AuditLog,
  InAppNotification,
  BugReport,
  BugStatus,
  FeatureSuggestion,
  FeatureSuggestionStatus,
  ContactRequest,
  PlatformAnnouncement,
  PlatformSettings,
  SystemIncident,
  UserRole,
} from '../../types';
import {
  SuperAdminSecuritySettings,
  SuperAdminDevice,
  SecurityAuditRecord,
  StepUpRiskLevel,
} from '../auth/superAdminSecurityService';
import { calculateSplits, round2 } from '../ledger/engine';
const PRIMARY_STORAGE_KEY = 'roommate_saas_db_v1';
const LEGACY_STORAGE_KEY = 'campusflow_saas_db_v3';

export function generateSecureUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  appName: 'RoomMate',
  supportEmail: 'admin@roommate.app',
  supportPhone: '+91 98765 43210',
  googleAuthEnabled: true,
  emailVerificationRequired: true,
  sessionTimeoutMinutes: 1440,
  maxRoomMembers: 12,
  defaultJoinPolicy: 'APPROVAL_REQUIRED',
  defaultInvitePolicy: 'ALL_MEMBERS',
  qrExpirationHours: 72,
  maxExpenseAmount: 200000,
  defaultSplitMethod: 'EQUAL',
  currencyCode: 'INR',
  globalNotificationsEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: 'Platform is undergoing routine maintenance.',
};

export interface DatabaseState {
  users: User[];
  subscriptions: UserSubscription[];
  subscriptionEvents: SubscriptionEvent[];
  rooms: Room[];
  roomMembers: RoomMember[];
  roomInvitations: RoomInvitation[];
  roomJoinRequests: RoomJoinRequest[];
  personalExpenses: PersonalExpense[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  auditLogs: AuditLog[];
  notifications: InAppNotification[];
  bugReports: BugReport[];
  featureSuggestions: FeatureSuggestion[];
  contactRequests: ContactRequest[];
  announcements: PlatformAnnouncement[];
  settings: PlatformSettings;
  systemIncidents: SystemIncident[];
  superAdminSecuritySettings?: Record<string, SuperAdminSecuritySettings>;
  superAdminRecoveryCodes?: Array<{ userId: string; codeHash: string; isConsumed: boolean; consumedAt?: string }>;
  superAdminTrustedDevices?: SuperAdminDevice[];
  securityAuditLogs?: SecurityAuditRecord[];
}

export const INITIAL_DATA: DatabaseState = {
  users: [],
  subscriptions: [],
  subscriptionEvents: [],
  rooms: [],
  roomMembers: [],
  roomInvitations: [],
  roomJoinRequests: [],
  personalExpenses: [],
  sharedExpenses: [],
  expenseSplits: [],
  settlementPayments: [],
  auditLogs: [],
  notifications: [],
  bugReports: [],
  featureSuggestions: [],
  contactRequests: [],
  announcements: [],
  settings: DEFAULT_PLATFORM_SETTINGS,
  systemIncidents: [],
  superAdminSecuritySettings: {},
  superAdminRecoveryCodes: [],
  superAdminTrustedDevices: [],
  securityAuditLogs: [],
};


const DUMMY_USER_IDS = new Set(['usr-rajdeep-1', 'usr-sneha-2', 'usr-amit-3']);
const DUMMY_ROOM_IDS = new Set(['room-flat-302']);
const DUMMY_INVITE_CODES = new Set(['FLAT02', 'rm_inv_flat302_token_7Hk92LmX']);
const DUMMY_NOTIFICATION_IDS = new Set(['notif-seed-1', 'notif-seed-2', 'notif-seed-3']);
const DUMMY_BUG_IDS = new Set(['bug-1024', 'bug-1025', 'bug-1026']);
const DUMMY_FEATURE_IDS = new Set(['feat-218', 'feat-219', 'feat-220']);
const DUMMY_CONTACT_IDS = new Set(['req-301']);

export const DEFAULT_STAGING_SEEDS: DatabaseState = {
  users: [
    {
      id: 'usr-superadmin-master',
      name: 'Superadmin',
      email: 'admin@roommate.app',
      phone: '+91 99999 00000',
      role: 'SUPER_ADMIN',
      isSuspended: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
  subscriptions: [],
  subscriptionEvents: [],
  rooms: [],
  roomMembers: [],
  roomInvitations: [],
  roomJoinRequests: [],
  personalExpenses: [],
  sharedExpenses: [],
  expenseSplits: [],
  settlementPayments: [],
  auditLogs: [],
  notifications: [],
  bugReports: [],
  featureSuggestions: [],
  contactRequests: [],
  announcements: [],
  settings: DEFAULT_PLATFORM_SETTINGS,
  systemIncidents: [],
  superAdminSecuritySettings: {},
  superAdminRecoveryCodes: [],
  superAdminTrustedDevices: [],
  securityAuditLogs: [],
};

class MockDatabase {
  private state: DatabaseState;

  constructor() {
    this.state = this.load();
  }

  private load(): DatabaseState {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return JSON.parse(JSON.stringify(DEFAULT_STAGING_SEEDS));
    }
    // Purge legacy mock data caches
    try {
      localStorage.removeItem('campusflow_saas_db_v2');
      localStorage.removeItem('campusflow_saas_db_v1');
    } catch {
      // ignore
    }
    let raw = localStorage.getItem(PRIMARY_STORAGE_KEY);
    if (!raw) {
      // Check legacy CampusFlow v3 storage key for seamless migration
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        raw = legacyRaw;
        try {
          localStorage.setItem(PRIMARY_STORAGE_KEY, legacyRaw);
        } catch {
          // ignore
        }
      }
    }
    if (!raw) {
      this.save(DEFAULT_STAGING_SEEDS);
      return JSON.parse(JSON.stringify(DEFAULT_STAGING_SEEDS));
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.users || !Array.isArray(parsed.users) || parsed.users.length === 0) {
        this.save(DEFAULT_STAGING_SEEDS);
        return JSON.parse(JSON.stringify(DEFAULT_STAGING_SEEDS));
      }

      // Automatic sanitization of legacy hardcoded dummy data from existing device localStorage
      let hadLegacyDummyData = false;
      if (Array.isArray(parsed.users)) {
        const filteredUsers = parsed.users.filter((u: User) => !DUMMY_USER_IDS.has(u.id));
        if (filteredUsers.length !== parsed.users.length) {
          parsed.users = filteredUsers;
          hadLegacyDummyData = true;
        }
      }
      if (Array.isArray(parsed.rooms)) {
        const filteredRooms = parsed.rooms.filter((r: Room) => !DUMMY_ROOM_IDS.has(r.id));
        if (filteredRooms.length !== parsed.rooms.length) {
          parsed.rooms = filteredRooms;
          hadLegacyDummyData = true;
        }
      }
      if (Array.isArray(parsed.roomMembers)) {
        const filteredMembers = parsed.roomMembers.filter(
          (m: RoomMember) => !DUMMY_ROOM_IDS.has(m.roomId) && !DUMMY_USER_IDS.has(m.userId)
        );
        if (filteredMembers.length !== parsed.roomMembers.length) {
          parsed.roomMembers = filteredMembers;
          hadLegacyDummyData = true;
        }
      }
      if (Array.isArray(parsed.roomInvitations)) {
        const filteredInvites = parsed.roomInvitations.filter(
          (inv: RoomInvitation) => !DUMMY_ROOM_IDS.has(inv.roomId) && !DUMMY_INVITE_CODES.has(inv.inviteCode)
        );
        if (filteredInvites.length !== parsed.roomInvitations.length) {
          parsed.roomInvitations = filteredInvites;
          hadLegacyDummyData = true;
        }
      }
      if (Array.isArray(parsed.notifications)) {
        const filteredNotifs = parsed.notifications.filter(
          (n: InAppNotification) =>
            !DUMMY_NOTIFICATION_IDS.has(n.id) &&
            !DUMMY_ROOM_IDS.has(n.roomId || '') &&
            !DUMMY_USER_IDS.has(n.userId)
        );
        if (filteredNotifs.length !== parsed.notifications.length) {
          parsed.notifications = filteredNotifs;
          hadLegacyDummyData = true;
        }
      }
      if (Array.isArray(parsed.bugReports)) {
        const filteredBugs = parsed.bugReports.filter((b: BugReport) => !DUMMY_BUG_IDS.has(b.id));
        if (filteredBugs.length !== parsed.bugReports.length) {
          parsed.bugReports = filteredBugs;
          hadLegacyDummyData = true;
        }
      }
      if (Array.isArray(parsed.featureSuggestions)) {
        const filteredFeats = parsed.featureSuggestions.filter((f: FeatureSuggestion) => !DUMMY_FEATURE_IDS.has(f.id));
        if (filteredFeats.length !== parsed.featureSuggestions.length) {
          parsed.featureSuggestions = filteredFeats;
          hadLegacyDummyData = true;
        }
      }
      if (Array.isArray(parsed.contactRequests)) {
        const filteredReqs = parsed.contactRequests.filter((c: ContactRequest) => !DUMMY_CONTACT_IDS.has(c.id));
        if (filteredReqs.length !== parsed.contactRequests.length) {
          parsed.contactRequests = filteredReqs;
          hadLegacyDummyData = true;
        }
      }

      if (!parsed.roomJoinRequests) {
        parsed.roomJoinRequests = [];
      }
      if (!parsed.notifications || !Array.isArray(parsed.notifications)) {
        parsed.notifications = [];
      }
      if (!parsed.bugReports || !Array.isArray(parsed.bugReports)) {
        parsed.bugReports = [];
      }
      if (!parsed.featureSuggestions || !Array.isArray(parsed.featureSuggestions)) {
        parsed.featureSuggestions = [];
      }
      if (!parsed.contactRequests || !Array.isArray(parsed.contactRequests)) {
        parsed.contactRequests = [];
      }
      if (!parsed.announcements || !Array.isArray(parsed.announcements)) {
        parsed.announcements = [];
      }
      if (!parsed.settings) {
        parsed.settings = { ...DEFAULT_PLATFORM_SETTINGS };
      }
      if (!parsed.systemIncidents || !Array.isArray(parsed.systemIncidents)) {
        parsed.systemIncidents = [];
      }

      // Guarantee SuperAdmin master user exists
      if (Array.isArray(parsed.users)) {
        const hasAdmin = parsed.users.some((u: User) => u.role === 'SUPER_ADMIN');
        if (!hasAdmin) {
          const masterAdmin = DEFAULT_STAGING_SEEDS.users.find((u) => u.role === 'SUPER_ADMIN')!;
          parsed.users.unshift(masterAdmin);
          hadLegacyDummyData = true;
        }
      }

      // Migrate existing rooms and invites to ensure tokens and policies exist
      if (Array.isArray(parsed.rooms)) {
        parsed.rooms.forEach((r: Room) => {
          if (!r.joinPolicy) r.joinPolicy = 'APPROVAL_REQUIRED';
          if (!r.invitePolicy) r.invitePolicy = 'ALL_MEMBERS';
          if (!r.adminUserId && Array.isArray(parsed.roomMembers)) {
            const adminMem = parsed.roomMembers.find(
              (m: RoomMember) => m.roomId === r.id && m.role === 'ROOM_ADMIN' && m.status === 'ACTIVE'
            );
            if (adminMem) r.adminUserId = adminMem.userId;
          }
        });
      }
      if (Array.isArray(parsed.roomInvitations)) {
        parsed.roomInvitations.forEach((inv: RoomInvitation) => {
          if (!inv.token) {
            inv.token = 'rm_inv_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
          }
        });
      }

      if (hadLegacyDummyData) {
        this.save(parsed);
      }

      return parsed;
    } catch {
      this.save(DEFAULT_STAGING_SEEDS);
      return JSON.parse(JSON.stringify(DEFAULT_STAGING_SEEDS));
    }
  }

  private save(state: DatabaseState): void {
    this.state = state;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(PRIMARY_STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.error('Failed to save to localStorage', err);
      }
    }
  }

  public saveState(state: DatabaseState): void {
    this.save(state);
  }

  public restorePersonalExpenses(userId: string, expenses: PersonalExpense[]): number {
    const existingIds = new Set(this.state.personalExpenses.map((e) => e.id));
    let added = 0;
    for (const exp of expenses) {
      if (!existingIds.has(exp.id)) {
        this.state.personalExpenses.unshift({
          ...exp,
          userId,
          createdAt: exp.createdAt || new Date().toISOString(),
          updatedAt: exp.updatedAt || new Date().toISOString(),
        });
        existingIds.add(exp.id);
        added++;
      }
    }
    this.save(this.state);
    return added;
  }

  public resetToSeedData(): void {
    this.save(JSON.parse(JSON.stringify(DEFAULT_STAGING_SEEDS)));
  }

  public resetToDefault(): void {
    this.save(JSON.parse(JSON.stringify(INITIAL_DATA)));
  }

  public clearAllData(): void {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    this.save(JSON.parse(JSON.stringify(INITIAL_DATA)));
  }

  public upsertUser(user: User): User {
    const idx = this.state.users.findIndex(
      (u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase()
    );
    if (idx >= 0) {
      this.state.users[idx] = {
        ...this.state.users[idx],
        ...user,
        updatedAt: new Date().toISOString(),
      };
    } else {
      this.state.users.push({
        ...user,
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      // Also ensure a default active subscription exists
      if (!this.state.subscriptions.some((s) => s.userId === user.id)) {
        this.state.subscriptions.push({
          id: 'sub-' + Math.random().toString(36).substring(2, 9),
          userId: user.id,
          planCode: 'FREE',
          planName: 'Starter Free',
          priceInr: 0,
          status: 'ACTIVE',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          cancelAtPeriodEnd: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    this.save(this.state);
    return user;
  }

  public getState(): DatabaseState {
    return this.state;
  }

  // --- SECURITY ENFORCED DATA ACCESS METHODS (Simulating RLS) ---

  /**
   * 100% Strict Personal Expense Isolation
   */
  public getPersonalExpenses(requesterUserId: string): PersonalExpense[] {
    // Only return records where userId === requesterUserId
    return this.state.personalExpenses.filter((e) => e.userId === requesterUserId);
  }

  public createPersonalExpense(
    requesterUserId: string,
    data: Omit<PersonalExpense, 'id' | 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): PersonalExpense {
    const newExp: PersonalExpense = {
      id: data.id || generateSecureUuid(),
      userId: requesterUserId,
      title: data.title,
      amount: round2(data.amount),
      category: data.category,
      notes: data.notes,
      expenseDate: data.expenseDate || new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.personalExpenses.unshift(newExp);
    this.save(this.state);
    return newExp;
  }

  public deletePersonalExpense(requesterUserId: string, expenseId: string): boolean {
    const exp = this.state.personalExpenses.find((e) => e.id === expenseId);
    if (!exp) return false;
    if (exp.userId !== requesterUserId) {
      throw new Error('IDOR_VIOLATION: Unauthorized deletion of another user’s personal expense!');
    }
    const idx = this.state.personalExpenses.findIndex((e) => e.id === expenseId);
    if (idx >= 0) {
      this.state.personalExpenses.splice(idx, 1);
    }
    this.save(this.state);
    return true;
  }

  /**
   * Room Data Access (Requires active membership in room)
   */
  public getRoomExpenses(requesterUserId: string, roomId: string): SharedExpense[] {
    const isMember = this.state.roomMembers.some(
      (rm) => rm.roomId === roomId && rm.userId === requesterUserId && rm.status === 'ACTIVE'
    );
    if (!isMember) {
      throw new Error(`ACCESS_DENIED: User ${requesterUserId} is not an active member of room ${roomId}`);
    }
    return this.state.sharedExpenses.filter((e) => e.roomId === roomId && !e.isDeleted);
  }

  public createSharedExpense(
    requesterUserId: string,
    data: {
      id?: string;
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
    }
  ): SharedExpense {
    // Validate requester is room member
    const isMember = this.state.roomMembers.some(
      (rm) => rm.roomId === data.roomId && rm.userId === requesterUserId && rm.status === 'ACTIVE'
    );
    if (!isMember) {
      throw new Error(`ACCESS_DENIED: Cannot add expense to unjoined room ${data.roomId}`);
    }

    const expId = data.id || generateSecureUuid();
    const newExpense: SharedExpense = {
      id: expId,
      roomId: data.roomId,
      createdBy: requesterUserId,
      paidBy: data.paidBy,
      title: data.title,
      totalAmount: round2(data.totalAmount),
      category: data.category,
      splitMethod: data.splitMethod || 'EQUAL',
      notes: data.notes,
      expenseDate: data.expenseDate || new Date().toISOString().split('T')[0],
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Calculate point-in-time splits
    const splits = calculateSplits(
      newExpense.totalAmount,
      data.participantUserIds,
      newExpense.splitMethod,
      data.customValues
    );

    const splitRecords: ExpenseSplit[] = splits.map((s) => ({
      id: generateSecureUuid(),
      sharedExpenseId: expId,
      userId: s.userId,
      shareAmount: s.shareAmount,
      createdAt: new Date().toISOString(),
    }));

    this.state.sharedExpenses.unshift(newExpense);
    this.state.expenseSplits.push(...splitRecords);
    this.save(this.state);
    return newExpense;
  }

  public recordSettlementPayment(
    requesterUserId: string,
    data: {
      id?: string;
      roomId: string;
      payerId: string;
      payeeId: string;
      amount: number;
      paymentMethod: SettlementPayment['paymentMethod'];
      transactionRef?: string;
      notes?: string;
    }
  ): SettlementPayment {
    // Idempotency check: if settlement with this ID already exists, return it
    if (data.id) {
      const existing = this.state.settlementPayments.find((s) => s.id === data.id);
      if (existing) {
        return existing;
      }
    }

    // Verify room membership / affiliation
    const member = this.state.roomMembers.find(
      (rm) => rm.roomId === data.roomId && rm.userId === requesterUserId
    );
    if (!member) {
      throw new Error('ACCESS_DENIED: User has no affiliation with this room');
    }

    // Active members can record; former members can only record if they are a party
    const isParty = data.payerId === requesterUserId || data.payeeId === requesterUserId;
    if (member.status !== 'ACTIVE' && !isParty) {
      throw new Error('ACCESS_DENIED: Inactive members can only record settlements where they are a party');
    }

    const newPayment: SettlementPayment = {
      id: data.id || generateSecureUuid(),
      roomId: data.roomId,
      payerId: data.payerId,
      payeeId: data.payeeId,
      amount: round2(data.amount),
      paymentMethod: data.paymentMethod,
      transactionRef: data.transactionRef,
      notes: data.notes,
      paymentDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };

    this.state.settlementPayments.unshift(newPayment);
    this.save(this.state);
    return newPayment;
  }

  public leaveRoom(
    requesterUserId: string,
    roomId: string
  ): { success: boolean; newAdminId?: string; isArchived: boolean } {
    const memberIndex = this.state.roomMembers.findIndex(
      (rm) => rm.roomId === roomId && rm.userId === requesterUserId && rm.status === 'ACTIVE'
    );
    if (memberIndex === -1) {
      throw new Error(`NOT_AN_ACTIVE_MEMBER: User ${requesterUserId} is not an active member of room ${roomId}`);
    }

    let newAdminId: string | undefined;
    let isArchived = false;

    const member = this.state.roomMembers[memberIndex];

    if (member.role === 'ROOM_ADMIN') {
      // Find oldest remaining active member by joinedAt
      const otherActiveMembers = this.state.roomMembers
        .filter((rm) => rm.roomId === roomId && rm.status === 'ACTIVE' && rm.userId !== requesterUserId)
        .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

      if (otherActiveMembers.length > 0) {
        newAdminId = otherActiveMembers[0].userId;
        otherActiveMembers[0].role = 'ROOM_ADMIN';
      } else {
        // Last member leaving: archive room, but keep all ledger records intact
        const room = this.state.rooms.find((r) => r.id === roomId);
        if (room) {
          room.isArchived = true;
          room.updatedAt = new Date().toISOString();
        }
        isArchived = true;
      }
    }

    member.role = 'MEMBER';
    member.status = 'LEFT';
    member.leftAt = new Date().toISOString();

    this.save(this.state);
    return { success: true, newAdminId, isArchived };
  }

  public removeMember(
    adminUserId: string,
    roomId: string,
    targetUserId: string
  ): { success: boolean } {
    const admin = this.state.roomMembers.find(
      (rm) => rm.roomId === roomId && rm.userId === adminUserId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
    );
    if (!admin) {
      throw new Error('UNAUTHORIZED: Only an active room admin can remove members');
    }

    if (adminUserId === targetUserId) {
      throw new Error('CANNOT_REMOVE_SELF: Room admin cannot remove themselves, use leave flow instead');
    }

    const target = this.state.roomMembers.find(
      (rm) => rm.roomId === roomId && rm.userId === targetUserId
    );
    if (!target || target.status !== 'ACTIVE') {
      throw new Error('TARGET_NOT_ACTIVE: Target member is not an active member of this room');
    }

    if (target.role === 'ROOM_ADMIN') {
      throw new Error('ADMIN_CANNOT_BE_REMOVED: Room admins cannot be removed');
    }

    target.status = 'REMOVED';
    target.leftAt = new Date().toISOString();

    this.save(this.state);
    return { success: true };
  }

  public joinRoomWithCode(userId: string, inviteCode: string): Room {
    const inv = this.state.roomInvitations.find(
      (i) => (i.inviteCode.toUpperCase() === inviteCode.trim().toUpperCase() || i.token === inviteCode.trim()) && !i.isRevoked
    );
    if (!inv) {
      throw new Error('Invalid or expired room invite code');
    }

    if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new Error('This room invitation has expired');
    }

    const room = this.state.rooms.find((r) => r.id === inv.roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const existingMember = this.state.roomMembers.find(
      (rm) => rm.roomId === room.id && rm.userId === userId
    );

    if (existingMember) {
      existingMember.status = 'ACTIVE';
      existingMember.joinedAt = new Date().toISOString();
      existingMember.leftAt = undefined;
    } else {
      this.state.roomMembers.push({
        id: generateSecureUuid(),
        roomId: room.id,
        userId,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: new Date().toISOString(),
      });
    }

    this.save(this.state);
    return room;
  }

  public createRoom(userId: string, name: string, description?: string): Room {
    const roomId = generateSecureUuid();
    const newRoom: Room = {
      id: roomId,
      name,
      description,
      createdBy: userId,
      adminUserId: userId,
      joinPolicy: 'APPROVAL_REQUIRED',
      invitePolicy: 'ALL_MEMBERS',
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Creator becomes ROOM_ADMIN
    const newAdminMember: RoomMember = {
      id: generateSecureUuid(),
      roomId,
      userId,
      role: 'ROOM_ADMIN',
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
    };

    // Generate 6-character alphanumeric invite code + 24-char secure token
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = 'rm_inv_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    const newInv: RoomInvitation = {
      id: generateSecureUuid(),
      roomId,
      token,
      inviteCode: code,
      createdBy: userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
      createdAt: new Date().toISOString(),
    };

    this.state.rooms.unshift(newRoom);
    this.state.roomMembers.push(newAdminMember);
    this.state.roomInvitations.push(newInv);
    this.save(this.state);
    return newRoom;
  }

  /**
   * Resolve an invitation token or code to sanitized room preview without exposing ledger data
   */
  public resolveInvite(tokenOrCode: string): {
    room: { id: string; name: string; description?: string; joinPolicy: JoinPolicy; invitePolicy: InvitePolicy };
    memberCount: number;
    adminName: string;
    invite: RoomInvitation;
  } {
    const clean = tokenOrCode.trim();
    const inv = this.state.roomInvitations.find((i) =>
      (!i.isRevoked && (i.token === clean || i.inviteCode.toUpperCase() === clean.toUpperCase()))
    );

    if (!inv) {
      throw new Error('INVITE_UNAVAILABLE: This room invitation is no longer valid or does not exist.');
    }

    if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now()) {
      throw new Error('INVITE_EXPIRED: This room invitation has expired.');
    }

    const room = this.state.rooms.find((r) => r.id === inv.roomId);
    if (!room || room.isArchived) {
      throw new Error('ROOM_NOT_FOUND: The room associated with this invitation is no longer active.');
    }

    const activeMembers = this.state.roomMembers.filter((m) => m.roomId === room.id && m.status === 'ACTIVE');
    const adminMember = activeMembers.find((m) => m.role === 'ROOM_ADMIN') || activeMembers[0];
    const adminUser = adminMember ? this.state.users.find((u) => u.id === adminMember.userId) : null;

    return {
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        joinPolicy: room.joinPolicy || 'APPROVAL_REQUIRED',
        invitePolicy: room.invitePolicy || 'ALL_MEMBERS',
      },
      memberCount: activeMembers.length,
      adminName: adminUser ? adminUser.name : 'Admin',
      invite: inv,
    };
  }

  /**
   * Request to join room (handles Instant Join vs Approval Required)
   */
  public requestJoinRoom(
    userId: string,
    tokenOrCode: string
  ): {
    status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
    room: Room;
    message?: string;
    requestId?: string;
  } {
    const { room: resolvedRoom, invite: _invite } = this.resolveInvite(tokenOrCode);
    const room = this.state.rooms.find((r) => r.id === resolvedRoom.id)!;

    // Check if already an active member
    const existing = this.state.roomMembers.find((rm) => rm.roomId === room.id && rm.userId === userId);
    if (existing && existing.status === 'ACTIVE') {
      return { status: 'ALREADY_MEMBER', room, message: "You're already a member of this room." };
    }

    const policy = room.joinPolicy || 'APPROVAL_REQUIRED';

    if (policy === 'INSTANT') {
      if (existing) {
        existing.status = 'ACTIVE';
        existing.joinedAt = new Date().toISOString();
        existing.leftAt = undefined;
      } else {
        this.state.roomMembers.push({
          id: 'rm-' + Math.random().toString(36).substr(2, 9),
          roomId: room.id,
          userId,
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: new Date().toISOString(),
        });
      }
      this.save(this.state);
      return { status: 'JOINED', room, message: `Welcome to ${room.name}!` };
    }

    // Approval required mode: Check if already pending
    const existingRequest = this.state.roomJoinRequests.find(
      (req) => req.roomId === room.id && req.userId === userId && req.status === 'PENDING'
    );
    if (existingRequest) {
      return {
        status: 'PENDING',
        room,
        message: `Your request to join ${room.name} is waiting for admin approval.`,
        requestId: existingRequest.id,
      };
    }

    // Create pending join request
    const newReq: RoomJoinRequest = {
      id: 'req-' + Math.random().toString(36).substr(2, 9),
      roomId: room.id,
      userId,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.state.roomJoinRequests.unshift(newReq);
    this.save(this.state);

    return {
      status: 'PENDING',
      room,
      message: `Join request sent to the room admin of ${room.name}.`,
      requestId: newReq.id,
    };
  }

  /**
   * Get pending join requests for a room (Admin only)
   */
  public getRoomJoinRequests(requesterAdminId: string, roomId: string): Array<RoomJoinRequest & { user: User }> {
    const admin = this.state.roomMembers.find(
      (rm) => rm.roomId === roomId && rm.userId === requesterAdminId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
    );
    if (!admin) {
      throw new Error('UNAUTHORIZED: Only room admins can view join requests');
    }

    return this.state.roomJoinRequests
      .filter((req) => req.roomId === roomId && req.status === 'PENDING')
      .map((req) => {
        const user = this.state.users.find((u) => u.id === req.userId);
        return {
          ...req,
          user: user || {
            id: req.userId,
            name: 'New Roommate',
            email: 'user@roommate.app',
            role: 'STUDENT' as const,
            isSuspended: false,
            createdAt: req.createdAt,
            updatedAt: req.createdAt,
          },
        };
      });
  }

  /**
   * Admin approve join request
   */
  public approveJoinRequest(adminUserId: string, requestId: string): { success: boolean; room: Room; request: RoomJoinRequest } {
    const req = this.state.roomJoinRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'PENDING') {
      throw new Error('REQUEST_NOT_FOUND: Join request not found or already processed');
    }

    const admin = this.state.roomMembers.find(
      (rm) => rm.roomId === req.roomId && rm.userId === adminUserId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
    );
    if (!admin) {
      throw new Error('UNAUTHORIZED: Only room admins can approve join requests');
    }

    req.status = 'APPROVED';
    req.updatedAt = new Date().toISOString();

    const existingMember = this.state.roomMembers.find(
      (rm) => rm.roomId === req.roomId && rm.userId === req.userId
    );

    if (existingMember) {
      existingMember.status = 'ACTIVE';
      existingMember.joinedAt = new Date().toISOString();
      existingMember.leftAt = undefined;
    } else {
      this.state.roomMembers.push({
        id: 'rm-' + Math.random().toString(36).substr(2, 9),
        roomId: req.roomId,
        userId: req.userId,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: new Date().toISOString(),
      });
    }

    const room = this.state.rooms.find((r) => r.id === req.roomId)!;
    this.save(this.state);
    return { success: true, room, request: req };
  }

  /**
   * Admin decline join request
   */
  public declineJoinRequest(adminUserId: string, requestId: string): { success: boolean } {
    const req = this.state.roomJoinRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'PENDING') {
      throw new Error('REQUEST_NOT_FOUND: Join request not found or already processed');
    }

    const admin = this.state.roomMembers.find(
      (rm) => rm.roomId === req.roomId && rm.userId === adminUserId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
    );
    if (!admin) {
      throw new Error('UNAUTHORIZED: Only room admins can decline join requests');
    }

    req.status = 'DECLINED';
    req.updatedAt = new Date().toISOString();
    this.save(this.state);
    return { success: true };
  }

  /**
   * Check status of a join request
   */
  public checkJoinRequestStatus(requestId: string): {
    status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'NOT_FOUND';
    room?: Room;
    adminName?: string;
  } {
    const req = this.state.roomJoinRequests.find((r) => r.id === requestId);
    if (!req) {
      return { status: 'NOT_FOUND' };
    }

    const room = this.state.rooms.find((r) => r.id === req.roomId);
    const adminMember = this.state.roomMembers.find(
      (m) => m.roomId === req.roomId && m.role === 'ROOM_ADMIN' && m.status === 'ACTIVE'
    ) || this.state.roomMembers.find((m) => m.roomId === req.roomId && m.status === 'ACTIVE');
    const adminUser = adminMember ? this.state.users.find((u) => u.id === adminMember.userId) : null;

    return {
      status: req.status,
      room,
      adminName: adminUser ? adminUser.name : 'Admin',
    };
  }

  /**
   * Transfer room ownership to another active member
   */
  public transferOwnership(
    currentAdminId: string,
    roomId: string,
    newAdminId: string
  ): { success: boolean; room: Room } {
    const currentAdmin = this.state.roomMembers.find(
      (rm) => rm.roomId === roomId && rm.userId === currentAdminId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
    );
    if (!currentAdmin) {
      throw new Error('UNAUTHORIZED: Only the current room admin can transfer ownership');
    }

    if (currentAdminId === newAdminId) {
      throw new Error('CANNOT_TRANSFER_TO_SELF: You are already the room admin');
    }

    const newAdmin = this.state.roomMembers.find(
      (rm) => rm.roomId === roomId && rm.userId === newAdminId && rm.status === 'ACTIVE'
    );
    if (!newAdmin) {
      throw new Error('TARGET_NOT_ACTIVE: Target member must be an active roommate');
    }

    // Atomic role swap
    currentAdmin.role = 'MEMBER';
    newAdmin.role = 'ROOM_ADMIN';

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (room) {
      room.adminUserId = newAdminId;
      room.updatedAt = new Date().toISOString();
    }

    this.save(this.state);
    return { success: true, room: room! };
  }

  /**
   * Regenerate invite token and code for a room (Admin or authorized member)
   */
  public regenerateInvite(
    requesterUserId: string,
    roomId: string,
    expirationHours?: number
  ): RoomInvitation {
    const member = this.state.roomMembers.find(
      (rm) => rm.roomId === roomId && rm.userId === requesterUserId && rm.status === 'ACTIVE'
    );
    if (!member) {
      throw new Error('ACCESS_DENIED: User is not an active member of this room');
    }

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const invitePolicy = room.invitePolicy || 'ALL_MEMBERS';
    if (invitePolicy === 'ADMIN_ONLY' && member.role !== 'ROOM_ADMIN') {
      throw new Error('UNAUTHORIZED: Only room admins can regenerate invites under the current room policy');
    }

    // Revoke all existing invites for this room
    this.state.roomInvitations
      .filter((inv) => inv.roomId === roomId && !inv.isRevoked)
      .forEach((inv) => {
        inv.isRevoked = true;
      });

    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newToken = 'rm_inv_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
    const expiresAt =
      expirationHours && expirationHours > 0
        ? new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString()
        : undefined;

    const newInv: RoomInvitation = {
      id: 'inv-' + Math.random().toString(36).substr(2, 9),
      roomId,
      token: newToken,
      inviteCode: newCode,
      createdBy: requesterUserId,
      expiresAt,
      isRevoked: false,
      createdAt: new Date().toISOString(),
    };

    this.state.roomInvitations.push(newInv);
    this.save(this.state);
    return newInv;
  }

  /**
   * Update Room Policies (join policy & invite policy)
   */
  public updateRoomPolicies(
    adminUserId: string,
    roomId: string,
    policies: { joinPolicy?: JoinPolicy; invitePolicy?: InvitePolicy }
  ): Room {
    const admin = this.state.roomMembers.find(
      (rm) => rm.roomId === roomId && rm.userId === adminUserId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
    );
    if (!admin) {
      throw new Error('UNAUTHORIZED: Only the room admin can configure room policies');
    }

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error('Room not found');

    if (policies.joinPolicy) room.joinPolicy = policies.joinPolicy;
    if (policies.invitePolicy) room.invitePolicy = policies.invitePolicy;
    room.updatedAt = new Date().toISOString();

    this.save(this.state);
    return room;
  }

  /**
   * User Subscription Lifecycle & Idempotent Razorpay Webhook Simulation
   */
  public processRazorpayWebhook(
    eventId: string,
    eventType: SubscriptionEvent['eventType'],
    userId: string,
    payload: Record<string, unknown>
  ): { success: boolean; duplicate: boolean } {
    // Idempotency check
    const existing = this.state.subscriptionEvents.find((e) => e.razorpayEventId === eventId);
    if (existing) {
      return { success: true, duplicate: true };
    }

    const sub = this.state.subscriptions.find((s) => s.userId === userId);
    if (sub) {
      if (eventType === 'subscription.charged') {
        sub.status = 'ACTIVE';
        sub.planCode = 'PRO';
        sub.planName = 'Campus Pro';
        sub.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        sub.gracePeriodUntil = undefined;
      } else if (eventType === 'payment.failed') {
        sub.status = 'GRACE_PERIOD';
        sub.gracePeriodUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      } else if (eventType === 'subscription.halted') {
        sub.status = 'SUSPENDED';
      }
      sub.updatedAt = new Date().toISOString();
    }

    this.state.subscriptionEvents.unshift({
      id: 'evt-' + Math.random().toString(36).substr(2, 9),
      userId,
      razorpayEventId: eventId,
      eventType,
      payload,
      processedAt: new Date().toISOString(),
    });

    this.save(this.state);
    return { success: true, duplicate: false };
  }

  /**
   * Core Security Assertion: Enforces role, session, and step-up freshness
   */
  public assertSuperAdminAccess(callerId: string, riskLevel: StepUpRiskLevel = 1, deviceId?: string): User {
    if (!callerId) {
      throw new Error('UNAUTHORIZED: Valid authentication session required');
    }

    const admin = this.state.users.find((u) => u.id === callerId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('FORBIDDEN: Caller lacks SUPER_ADMIN platform authorization');
    }

    if (admin.isSuspended) {
      throw new Error('FORBIDDEN: This administrator account is suspended');
    }

    if (!this.state.superAdminSecuritySettings) {
      this.state.superAdminSecuritySettings = {};
    }

    const settings = this.state.superAdminSecuritySettings[callerId] || {
      userId: callerId,
      totpEnrolled: true,
      backupTotpEnrolled: false,
      biometricEnabled: false,
      recoveryCodesConfigured: true,
      recoveryCodesRemaining: 8,
      mfaRequired: true,
      failedMfaAttempts: 0,
      updatedAt: new Date().toISOString(),
    };

    if (settings.lockedUntil && new Date(settings.lockedUntil).getTime() > Date.now()) {
      throw new Error('ACCOUNT_LOCKED: Security lockout active due to repeated authentication failures');
    }

    // Device Revocation Check
    if (deviceId && this.state.superAdminTrustedDevices) {
      const dev = this.state.superAdminTrustedDevices.find(
        (d) => d.userId === callerId && d.deviceId === deviceId
      );
      if (dev && (!dev.isTrusted || dev.revokedAt)) {
        throw new Error('DEVICE_REVOKED: This device session has been revoked by an administrator.');
      }
    }

    // Authentication Assurance Level (AAL) Check for Risk Level >= 2
    if (riskLevel >= 2 && settings.currentAal === 'aal1') {
      throw new Error('MFA_REQUIRED: Operation requires AAL2 authentication assurance');
    }

    // Step-Up Verification Freshness Gate
    if (riskLevel === 2) {
      const isFresh =
        settings.lastStepUpAt &&
        Date.now() - new Date(settings.lastStepUpAt).getTime() <= 10 * 60 * 1000 &&
        (settings.lastStepUpLevel || 2) >= 2;
      if (!isFresh) {
        throw new Error('STEP_UP_REQUIRED: Fresh identity re-authentication required for sensitive operations (valid 10 mins)');
      }
    }

    if (riskLevel === 3) {
      const isFresh =
        settings.lastStepUpAt &&
        Date.now() - new Date(settings.lastStepUpAt).getTime() <= 60 * 1000 &&
        (settings.lastStepUpLevel || 1) >= 3;
      if (!isFresh) {
        throw new Error('STEP_UP_REQUIRED: Critical action requires immediate Level 3 re-authentication (single-use, valid 60s)');
      }

      // Atomically consume Level 3 step-up
      settings.lastStepUpLevel = 1;
      settings.lastStepUpAt = undefined;
      this.save(this.state);
    }

    return admin;
  }

  /**
   * Role Escalation Prevention: Strictly prevents unauthorized users from changing roles
   */
  public updateUserRole(callerId: string, targetUserId: string, newRole: UserRole, deviceId?: string): boolean {
    this.assertSuperAdminAccess(callerId, 2, deviceId);

    if (callerId === targetUserId && newRole !== 'SUPER_ADMIN') {
      throw new Error('INVALID_ACTION: SuperAdmin cannot demote their own account');
    }

    const target = this.state.users.find((u) => u.id === targetUserId);
    if (!target) return false;

    target.role = newRole;
    target.updatedAt = new Date().toISOString();

    this.logSecurityEvent(
      callerId,
      'ROLE_MODIFIED',
      'SUCCESS',
      'USER',
      targetUserId,
      { targetEmail: target.email, newRole }
    );

    this.save(this.state);
    return true;
  }

  public getSuperAdminSecuritySettings(userId: string): SuperAdminSecuritySettings {
    if (!this.state.superAdminSecuritySettings) {
      this.state.superAdminSecuritySettings = {};
    }
    if (!this.state.superAdminSecuritySettings[userId]) {
      this.state.superAdminSecuritySettings[userId] = {
        userId,
        totpEnrolled: false,
        backupTotpEnrolled: false,
        biometricEnabled: false,
        recoveryCodesConfigured: false,
        recoveryCodesRemaining: 0,
        mfaRequired: true,
        failedMfaAttempts: 0,
        updatedAt: new Date().toISOString(),
      };
      this.save(this.state);
    }
    return this.state.superAdminSecuritySettings[userId];
  }

  public updateSuperAdminSecuritySettings(
    userId: string,
    updates: Partial<SuperAdminSecuritySettings>
  ): SuperAdminSecuritySettings {
    const current = this.getSuperAdminSecuritySettings(userId);
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.state.superAdminSecuritySettings![userId] = updated;
    this.save(this.state);
    return updated;
  }

  public resetSuperAdminMfa(userId: string): SuperAdminSecuritySettings {
    if (!this.state.superAdminSecuritySettings) {
      this.state.superAdminSecuritySettings = {};
    }
    const existingHash = this.state.superAdminSecuritySettings[userId]?.masterPasswordHash;
    const fresh: SuperAdminSecuritySettings = {
      userId,
      masterPasswordHash: existingHash,
      totpEnrolled: false,
      totpFactorId: undefined,
      totpSecret: undefined,
      backupTotpEnrolled: false,
      backupTotpFactorId: undefined,
      biometricEnabled: false,
      recoveryCodesConfigured: false,
      recoveryCodesRemaining: 0,
      mfaRequired: true,
      failedMfaAttempts: 0,
      updatedAt: new Date().toISOString(),
    };
    this.state.superAdminSecuritySettings[userId] = fresh;
    if (this.state.superAdminRecoveryCodes) {
      this.state.superAdminRecoveryCodes = this.state.superAdminRecoveryCodes.filter((c) => c.userId !== userId);
    }
    this.save(this.state);
    return fresh;
  }

  public getSuperAdminTrustedDevices(userId: string): SuperAdminDevice[] {
    if (!this.state.superAdminTrustedDevices) {
      this.state.superAdminTrustedDevices = [];
    }
    return this.state.superAdminTrustedDevices.filter((d) => d.userId === userId);
  }

  public registerSuperAdminDevice(
    userId: string,
    device: { deviceId: string; deviceName: string; platform: string; browser: string; ipAddress?: string }
  ): SuperAdminDevice {
    if (!this.state.superAdminTrustedDevices) {
      this.state.superAdminTrustedDevices = [];
    }
    const existing = this.state.superAdminTrustedDevices.find(
      (d) => d.userId === userId && d.deviceId === device.deviceId
    );
    if (existing) {
      existing.lastActiveAt = new Date().toISOString();
      existing.isTrusted = true;
      existing.revokedAt = undefined;
      this.save(this.state);
      return existing;
    }

    const newDev: SuperAdminDevice = {
      id: 'dev-' + Math.random().toString(36).substr(2, 9),
      userId,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      platform: device.platform,
      browser: device.browser,
      ipAddress: device.ipAddress || '127.0.0.1',
      isTrusted: true,
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.state.superAdminTrustedDevices.push(newDev);
    this.save(this.state);
    return newDev;
  }

  public revokeSuperAdminDevice(userId: string, deviceId: string, callerDeviceId?: string): boolean {
    this.assertSuperAdminAccess(userId, 2, callerDeviceId);

    if (!this.state.superAdminTrustedDevices) return false;
    const found = this.state.superAdminTrustedDevices.find(
      (d) => d.userId === userId && d.deviceId === deviceId
    );
    if (found) {
      found.isTrusted = false;
      found.revokedAt = new Date().toISOString();
      this.logSecurityEvent(userId, 'DEVICE_REVOKED', 'SUCCESS', 'DEVICE', deviceId);
      this.save(this.state);
      return true;
    }
    return false;
  }

  public revokeAllOtherDevices(userId: string, currentDeviceId: string): number {
    this.assertSuperAdminAccess(userId, 3, currentDeviceId);

    if (!this.state.superAdminTrustedDevices) return 0;
    let count = 0;
    for (const dev of this.state.superAdminTrustedDevices) {
      if (dev.userId === userId && dev.deviceId !== currentDeviceId && dev.isTrusted) {
        dev.isTrusted = false;
        dev.revokedAt = new Date().toISOString();
        count++;
      }
    }
    this.logSecurityEvent(userId, 'ALL_OTHER_SESSIONS_REVOKED', 'SUCCESS', 'SECURITY', userId, { revokedCount: count });
    this.save(this.state);
    return count;
  }

  public storeRecoveryCodes(
    userId: string,
    codeHashes: string[],
    deviceId?: string,
    isInitialEnrollment = false
  ): number {
    if (!isInitialEnrollment) {
      this.assertSuperAdminAccess(userId, 3, deviceId);
    } else {
      this.assertSuperAdminAccess(userId, 1, deviceId);
    }

    if (codeHashes.length !== 8) {
      throw new Error('INVALID_ARGUMENT: Canonical recovery code count must be exactly 8');
    }

    if (!this.state.superAdminRecoveryCodes) {
      this.state.superAdminRecoveryCodes = [];
    }
    // Invalidate previous unused codes
    for (const c of this.state.superAdminRecoveryCodes) {
      if (c.userId === userId && !c.isConsumed) {
        c.isConsumed = true;
        c.consumedAt = new Date().toISOString();
      }
    }

    for (const h of codeHashes) {
      this.state.superAdminRecoveryCodes.push({
        userId,
        codeHash: h,
        isConsumed: false,
      });
    }

    this.updateSuperAdminSecuritySettings(userId, {
      recoveryCodesConfigured: true,
      recoveryCodesRemaining: codeHashes.length,
    });

    this.logSecurityEvent(userId, 'RECOVERY_CODES_REGENERATED', 'SUCCESS', 'SECURITY', userId, { count: codeHashes.length });
    this.save(this.state);
    return codeHashes.length;
  }

  public verifyRecoveryCode(
    userId: string,
    codeHash: string,
    riskLevel: StepUpRiskLevel = 2,
    deviceId?: string
  ): { success: boolean; remainingCodes?: number; error?: string } {
    this.assertSuperAdminAccess(userId, 1, deviceId);

    if (!this.state.superAdminRecoveryCodes) {
      return { success: false, error: 'Invalid authentication code.' };
    }

    const matched = this.state.superAdminRecoveryCodes.find(
      (c) => c.userId === userId && c.codeHash === codeHash && !c.isConsumed
    );

    if (!matched) {
      this.logSecurityEvent(userId, 'RECOVERY_CODE_FAILED', 'FAILURE', 'SECURITY', userId);
      return { success: false, error: 'Invalid authentication code.' };
    }

    matched.isConsumed = true;
    matched.consumedAt = new Date().toISOString();

    const remaining = this.state.superAdminRecoveryCodes.filter(
      (c) => c.userId === userId && !c.isConsumed
    ).length;

    this.updateSuperAdminSecuritySettings(userId, {
      recoveryCodesRemaining: remaining,
      lastStepUpAt: new Date().toISOString(),
      lastStepUpLevel: riskLevel,
    });

    this.logSecurityEvent(userId, 'RECOVERY_CODE_CONSUMED', 'SUCCESS', 'SECURITY', userId, { remaining, riskLevel });
    this.save(this.state);
    return { success: true, remainingCodes: remaining };
  }

  public insertSecurityAuditLogDirectly(): never {
    throw new Error('SECURITY_VIOLATION: Security audit logs cannot be inserted directly by clients.');
  }

  public updateSecurityAuditLog(): never {
    throw new Error('SECURITY_VIOLATION: Security audit logs are immutable and cannot be updated.');
  }

  public deleteSecurityAuditLog(): never {
    throw new Error('SECURITY_VIOLATION: Security audit logs are immutable and cannot be deleted.');
  }

  public logSecurityEvent(
    actorId: string,
    eventType: string,
    result: 'SUCCESS' | 'FAILURE' | 'BLOCKED',
    targetEntity?: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ): SecurityAuditRecord {
    if (!this.state.securityAuditLogs) {
      this.state.securityAuditLogs = [];
    }

    const rec: SecurityAuditRecord = {
      id: 'sec-' + Math.random().toString(36).substr(2, 9),
      actorId,
      eventType,
      result,
      targetEntity,
      targetEntityId: targetId,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    };

    this.state.securityAuditLogs.unshift(rec);
    this.save(this.state);
    return rec;
  }

  public getSecurityAuditLogs(): SecurityAuditRecord[] {
    return this.state.securityAuditLogs || [];
  }

  /**
   * Super Admin Account Control
   */
  public superAdminToggleUserSuspension(superAdminId: string, targetUserId: string, suspend: boolean, deviceId?: string): boolean {
    this.assertSuperAdminAccess(superAdminId, 2, deviceId);

    if (superAdminId === targetUserId && suspend) {
      throw new Error('INVALID_ACTION: SuperAdmin cannot suspend their own account');
    }

    const target = this.state.users.find((u) => u.id === targetUserId);
    if (!target) return false;

    target.isSuspended = suspend;
    target.updatedAt = new Date().toISOString();

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: suspend ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
      resourceType: 'USER',
      resourceId: targetUserId,
      metadata: { targetEmail: target.email },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return true;
  }

  /**
   * Super Admin Room Freeze / Unfreeze
   */
  public superAdminToggleRoomFreeze(superAdminId: string, roomId: string, freeze: boolean, deviceId?: string): boolean {
    this.assertSuperAdminAccess(superAdminId, 2, deviceId);

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room) return false;

    room.isFrozen = freeze;
    room.updatedAt = new Date().toISOString();

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: freeze ? 'ROOM_FROZEN' : 'ROOM_UNFROZEN',
      resourceType: 'ROOM',
      resourceId: roomId,
      metadata: { roomName: room.name },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return true;
  }

  /**
   * Super Admin Room Archive / Restore
   */
  public superAdminArchiveRoom(superAdminId: string, roomId: string, archive: boolean, deviceId?: string): boolean {
    this.assertSuperAdminAccess(superAdminId, 2, deviceId);

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room) return false;

    room.isArchived = archive;
    room.updatedAt = new Date().toISOString();

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: archive ? 'ROOM_ARCHIVED' : 'ROOM_RESTORED',
      resourceType: 'ROOM',
      resourceId: roomId,
      metadata: { roomName: room.name },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return true;
  }

  /**
   * Super Admin Invalidate and Reset Room Invite Code
   */
  public superAdminResetInviteCode(superAdminId: string, roomId: string, deviceId?: string): string {
    this.assertSuperAdminAccess(superAdminId, 2, deviceId);

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error('Room not found');

    // Revoke old active invitations
    this.state.roomInvitations
      .filter((inv) => inv.roomId === roomId && !inv.isRevoked)
      .forEach((inv) => {
        inv.isRevoked = true;
      });

    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const token = 'tok_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const newInv: RoomInvitation = {
      id: 'inv-' + Math.random().toString(36).substr(2, 9),
      roomId,
      inviteCode: newCode,
      token,
      createdBy: superAdminId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
      createdAt: new Date().toISOString(),
    };
    this.state.roomInvitations.push(newInv);

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: 'ROOM_CODE_RESET',
      resourceType: 'ROOM',
      resourceId: roomId,
      metadata: { roomName: room.name, newCode },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return newCode;
  }

  /**
   * Super Admin User Plan Override
   */
  public superAdminUpdateUserPlan(superAdminId: string, targetUserId: string, planCode: 'FREE' | 'PRO' | 'CAMPUS_MAX'): boolean {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

    const user = this.state.users.find((u) => u.id === targetUserId);
    if (!user) return false;

    let sub = this.state.subscriptions.find((s) => s.userId === targetUserId);
    const planName = planCode === 'PRO' ? 'Campus Pro' : planCode === 'CAMPUS_MAX' ? 'Campus Max' : 'Starter Free';
    const priceInr = planCode === 'PRO' ? 49 : planCode === 'CAMPUS_MAX' ? 149 : 0;

    if (sub) {
      sub.planCode = planCode;
      sub.planName = planName;
      sub.priceInr = priceInr;
      sub.status = 'ACTIVE';
      sub.updatedAt = new Date().toISOString();
    } else {
      sub = {
        id: 'sub-' + Math.random().toString(36).substr(2, 9),
        userId: targetUserId,
        planCode,
        planName,
        priceInr,
        status: 'ACTIVE',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancelAtPeriodEnd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.state.subscriptions.push(sub);
    }

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: 'USER_PLAN_OVERRIDE',
      resourceType: 'SUBSCRIPTION',
      resourceId: sub.id,
      metadata: { targetEmail: user.email, planCode },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return true;
  }

  // --- IN-APP NOTIFICATIONS ---
  public getNotifications(userId: string): InAppNotification[] {
    return (this.state.notifications || [])
      .filter((n) => n.userId === userId && !n.isDeleted);
  }

  public createNotification(data: Omit<InAppNotification, 'id' | 'createdAt'>): InAppNotification {
    if (!this.state.notifications) {
      this.state.notifications = [];
    }

    // Deduplication check
    if (data.eventId) {
      const existing = this.state.notifications.find(
        (n) => n.userId === data.userId && n.eventId === data.eventId
      );
      if (existing) {
        return existing;
      }
    }

    const newNotif: InAppNotification = {
      ...data,
      id: 'notif-' + Math.random().toString(36).substring(2, 11),
      createdAt: new Date().toISOString(),
      isDeleted: false,
    };

    this.state.notifications.unshift(newNotif);
    this.save(this.state);
    return newNotif;
  }

  public markNotificationRead(notificationId: string): void {
    const notif = (this.state.notifications || []).find((n) => n.id === notificationId);
    if (notif && !notif.isRead) {
      notif.isRead = true;
      notif.readAt = new Date().toISOString();
      this.save(this.state);
    }
  }

  public toggleNotificationRead(notificationId: string): void {
    const notif = (this.state.notifications || []).find((n) => n.id === notificationId);
    if (notif) {
      notif.isRead = !notif.isRead;
      notif.readAt = notif.isRead ? new Date().toISOString() : undefined;
      this.save(this.state);
    }
  }

  public markAllNotificationsRead(userId?: string, ids?: string[]): void {
    let changed = false;
    (this.state.notifications || []).forEach((n) => {
      const match = ids && ids.length > 0 ? ids.includes(n.id) : (userId ? n.userId === userId : true);
      if (match && !n.isRead) {
        n.isRead = true;
        n.readAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) {
      this.save(this.state);
    }
  }

  public deleteNotification(notificationId: string): void {
    const notif = (this.state.notifications || []).find((n) => n.id === notificationId);
    if (notif) {
      notif.isDeleted = true;
      this.save(this.state);
    }
  }

  public clearReadNotifications(userId?: string, ids?: string[]): void {
    let changed = false;
    (this.state.notifications || []).forEach((n) => {
      const match = ids && ids.length > 0 ? ids.includes(n.id) : (userId ? n.userId === userId : true);
      if (match && n.isRead && !n.isDeleted) {
        n.isDeleted = true;
        changed = true;
      }
    });
    if (changed) {
      this.save(this.state);
    }
  }

  // --- SUPERADMIN OPERATIONS ENGINE ---

  public getPlatformSettings(): PlatformSettings {
    return this.state.settings || DEFAULT_PLATFORM_SETTINGS;
  }

  public updatePlatformSettings(superAdminId: string, updates: Partial<PlatformSettings>): PlatformSettings {
    this.assertSuperAdminAccess(superAdminId, 2);

    this.state.settings = {
      ...(this.state.settings || DEFAULT_PLATFORM_SETTINGS),
      ...updates,
    };

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: 'PLATFORM_SETTINGS_UPDATED',
      resourceType: 'SETTINGS',
      metadata: { changedKeys: Object.keys(updates) },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return this.state.settings;
  }

  public getBugReports(): BugReport[] {
    return this.state.bugReports || [];
  }

  public updateBugReportStatus(superAdminId: string, bugId: string, status: BugStatus, adminNotes?: string): BugReport | null {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

    const bug = (this.state.bugReports || []).find((b) => b.id === bugId);
    if (!bug) return null;

    bug.status = status;
    if (adminNotes !== undefined) bug.adminNotes = adminNotes;
    if (status === 'RESOLVED') bug.resolvedAt = new Date().toISOString();
    bug.updatedAt = new Date().toISOString();

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: 'BUG_REPORT_STATUS_CHANGED',
      resourceType: 'SUPPORT_TICKET',
      resourceId: bugId,
      metadata: { newStatus: status, bugTitle: bug.description.substring(0, 40) },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return bug;
  }

  public getFeatureSuggestions(): FeatureSuggestion[] {
    return this.state.featureSuggestions || [];
  }

  public updateFeatureSuggestionStatus(superAdminId: string, featureId: string, status: FeatureSuggestionStatus, adminNotes?: string): FeatureSuggestion | null {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

    const feat = (this.state.featureSuggestions || []).find((f) => f.id === featureId);
    if (!feat) return null;

    feat.status = status;
    if (adminNotes !== undefined) feat.adminNotes = adminNotes;
    feat.updatedAt = new Date().toISOString();

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: 'FEATURE_SUGGESTION_STATUS_CHANGED',
      resourceType: 'FEATURE_SUGGESTION',
      resourceId: featureId,
      metadata: { newStatus: status, featureTitle: feat.title },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return feat;
  }

  public getContactRequests(): ContactRequest[] {
    return this.state.contactRequests || [];
  }

  public updateContactRequestStatus(
    superAdminId: string,
    contactId: string,
    status: 'NEW' | 'IN_REVIEW' | 'RESOLVED',
    adminNotes?: string
  ): ContactRequest | null {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

    if (!this.state.contactRequests) this.state.contactRequests = [];
    const req = this.state.contactRequests.find((c) => c.id === contactId);
    if (!req) return null;

    req.status = status;
    if (adminNotes !== undefined) (req as any).adminNotes = adminNotes;

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: 'CONTACT_REQUEST_STATUS_CHANGED',
      resourceType: 'CONTACT_REQUEST',
      resourceId: contactId,
      metadata: { newStatus: status, subject: req.subject },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return req;
  }

  public getAnnouncements(): PlatformAnnouncement[] {
    return this.state.announcements || [];
  }

  public createAnnouncement(superAdminId: string, data: Omit<PlatformAnnouncement, 'id' | 'sentAt' | 'createdBy'>): PlatformAnnouncement {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

    const newAnn: PlatformAnnouncement = {
      ...data,
      id: 'ann-' + Math.random().toString(36).substr(2, 9),
      sentAt: new Date().toISOString(),
      createdBy: superAdminId,
    };

    if (!this.state.announcements) this.state.announcements = [];
    this.state.announcements.unshift(newAnn);

    // If in-app delivery, dispatch notifications to users
    if (data.deliveryChannels.includes('IN_APP')) {
      const targetUsers = data.audience === 'EVERYONE'
        ? this.state.users.filter((u) => u.role === 'STUDENT')
        : data.audience === 'SELECTED_USERS' && data.targetUserIds
        ? this.state.users.filter((u) => data.targetUserIds!.includes(u.id))
        : [];

      for (const student of targetUsers) {
        this.createNotification({
          userId: student.id,
          type: 'SYSTEM_INFO',
          title: data.title,
          message: data.message,
          priority: data.priority === 'CRITICAL' ? 'HIGH' : data.priority === 'IMPORTANT' ? 'MEDIUM' : 'LOW',
          isRead: false,
          actionType: 'NONE',
        });
      }
    }

    this.state.auditLogs.unshift({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action: 'ANNOUNCEMENT_PUBLISHED',
      resourceType: 'ANNOUNCEMENT',
      resourceId: newAnn.id,
      metadata: { title: newAnn.title, audience: newAnn.audience, priority: newAnn.priority },
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return newAnn;
  }

  public logAdminAudit(superAdminId: string, action: string, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>): AuditLog {
    const log: AuditLog = {
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      userId: superAdminId,
      action,
      resourceType,
      resourceId,
      metadata,
      createdAt: new Date().toISOString(),
    };

    this.state.auditLogs.unshift(log);
    this.save(this.state);
    return log;
  }

  public deleteUserAccount(userId: string): void {
    // 1. Remove user's personal expenses
    this.state.personalExpenses = (this.state.personalExpenses || []).filter((e) => e.userId !== userId);

    // 2. Remove in-app notifications
    this.state.notifications = (this.state.notifications || []).filter((n) => n.userId !== userId);

    // 3. Remove join requests & invitations created by user
    this.state.roomJoinRequests = (this.state.roomJoinRequests || []).filter((r) => r.userId !== userId);
    this.state.roomInvitations = (this.state.roomInvitations || []).filter((inv) => inv.createdBy !== userId);

    // 4. Handle room ownership and memberships
    const userMemberships = (this.state.roomMembers || []).filter((rm) => rm.userId === userId);
    for (const membership of userMemberships) {
      const remainingActiveMembers = (this.state.roomMembers || [])
        .filter((rm) => rm.roomId === membership.roomId && rm.userId !== userId && rm.status === 'ACTIVE')
        .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

      if (remainingActiveMembers.length === 0) {
        // Sole member in room: delete the room and its expenses/splits/settlements
        this.state.rooms = this.state.rooms.filter((r) => r.id !== membership.roomId);
        this.state.sharedExpenses = this.state.sharedExpenses.filter((e) => e.roomId !== membership.roomId);
        this.state.settlementPayments = this.state.settlementPayments.filter((s) => s.roomId !== membership.roomId);
      } else {
        // Transfer room admin if this user was admin
        const room = this.state.rooms.find((r) => r.id === membership.roomId);
        if (room && (room.createdBy === userId || room.adminUserId === userId || membership.role === 'ROOM_ADMIN')) {
          const nextAdmin = remainingActiveMembers[0];
          nextAdmin.role = 'ROOM_ADMIN';
          room.adminUserId = nextAdmin.userId;
          room.createdBy = nextAdmin.userId;
        }
      }
    }

    // Remove user from roomMembers
    this.state.roomMembers = (this.state.roomMembers || []).filter((rm) => rm.userId !== userId);

    // 5. Nullify or sanitize shared expenses & settlement payments
    this.state.sharedExpenses = (this.state.sharedExpenses || []).map((exp) => {
      const isPayer = exp.paidBy === userId;
      const isCreator = exp.createdBy === userId;
      if (!isPayer && !isCreator) return exp;
      return {
        ...exp,
        paidBy: isPayer ? '' : exp.paidBy,
        createdBy: isCreator ? '' : exp.createdBy,
      };
    });

    this.state.expenseSplits = (this.state.expenseSplits || []).filter((sp) => sp.userId !== userId);

    this.state.settlementPayments = (this.state.settlementPayments || []).map((set) => {
      const isPayer = set.payerId === userId;
      const isPayee = set.payeeId === userId;
      if (!isPayer && !isPayee) return set;
      return {
        ...set,
        payerId: isPayer ? '' : set.payerId,
        payeeId: isPayee ? '' : set.payeeId,
      };
    });

    // 6. Subscriptions
    this.state.subscriptions = (this.state.subscriptions || []).filter((s) => s.userId !== userId);

    // 7. Remove user from users list
    this.state.users = this.state.users.filter((u) => u.id !== userId);

    // 8. Audit logs: decouple user ID
    this.state.auditLogs = (this.state.auditLogs || []).map((log) => {
      if (log.userId === userId) {
        return { ...log, userId: undefined };
      }
      return log;
    });

    this.save(this.state);
  }

  public getSystemIncidents(callerId?: string): SystemIncident[] {
    if (callerId) {
      this.assertSuperAdminAccess(callerId, 1);
    }
    return this.state.systemIncidents || [];
  }

  public createSystemIncident(
    incident: Omit<SystemIncident, 'id' | 'createdAt'>,
    callerId?: string
  ): SystemIncident {
    if (callerId) {
      this.assertSuperAdminAccess(callerId, 1);
    }
    if (!this.state.systemIncidents) this.state.systemIncidents = [];

    // Idempotency / Duplicate Suppression:
    // If an active (unresolved) incident already exists for this service, update it rather than duplicating
    const existingActive = this.state.systemIncidents.find(
      (i) => i.service === incident.service && i.status !== 'RESOLVED'
    );

    if (existingActive) {
      existingActive.occurrences = (existingActive.occurrences || 1) + 1;
      existingActive.error = incident.error;
      existingActive.severity = incident.severity;
      if (incident.details !== undefined) {
        existingActive.details = incident.details;
      }
      this.save(this.state);
      return existingActive;
    }

    const newInc: SystemIncident = {
      ...incident,
      id: 'inc-' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
    };
    this.state.systemIncidents.unshift(newInc);
    this.save(this.state);
    return newInc;
  }

  public updateSystemIncidentStatus(
    incidentId: string,
    newStatus: SystemIncident['status'],
    callerId?: string
  ): boolean {
    if (callerId) {
      this.assertSuperAdminAccess(callerId, 1);
    }
    if (!this.state.systemIncidents) return false;
    const inc = this.state.systemIncidents.find((i) => i.id === incidentId);
    if (!inc) return false;

    if (newStatus === 'RESOLVED') {
      return this.resolveSystemIncident(incidentId, callerId);
    }

    inc.status = newStatus;
    if (inc.resolvedAt) {
      delete inc.resolvedAt;
      delete inc.durationSeconds;
    }
    this.save(this.state);
    return true;
  }

  public resolveSystemIncident(incidentId: string, callerId?: string): boolean {
    if (callerId) {
      this.assertSuperAdminAccess(callerId, 1);
    }
    if (!this.state.systemIncidents) return false;
    const inc = this.state.systemIncidents.find((i) => i.id === incidentId);
    if (!inc) return false;

    const resolvedAt = new Date().toISOString();
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(resolvedAt).getTime() - new Date(inc.createdAt).getTime()) / 1000)
    );

    inc.status = 'RESOLVED';
    inc.resolvedAt = resolvedAt;
    inc.durationSeconds = durationSeconds;
    this.save(this.state);
    return true;
  }
}

export const db = new MockDatabase();


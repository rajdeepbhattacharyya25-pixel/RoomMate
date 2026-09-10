import {
  User,
  UserSubscription,
  SubscriptionEvent,
  Room,
  RoomMember,
  RoomInvitation,
  PersonalExpense,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  AuditLog,
} from '../../types';
import { calculateSplits, round2 } from '../ledger/engine';

const STORAGE_KEY = 'campusflow_saas_db_v2';

export interface DatabaseState {
  users: User[];
  subscriptions: UserSubscription[];
  subscriptionEvents: SubscriptionEvent[];
  rooms: Room[];
  roomMembers: RoomMember[];
  roomInvitations: RoomInvitation[];
  personalExpenses: PersonalExpense[];
  sharedExpenses: SharedExpense[];
  expenseSplits: ExpenseSplit[];
  settlementPayments: SettlementPayment[];
  auditLogs: AuditLog[];
}

export const INITIAL_DATA: DatabaseState = {
  users: [
    {
      id: 'usr-admin-1',
      email: 'admin@campusflow.io',
      phone: '+91 99999 00000',
      name: 'Super Admin',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      role: 'SUPER_ADMIN',
      isSuspended: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'usr-rajdeep-1',
      email: 'rajdeep@campus.edu',
      phone: '+91 98765 43210',
      name: 'Rajdeep',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-01-02T10:00:00Z',
      updatedAt: '2026-01-02T10:00:00Z',
    },
    {
      id: 'usr-sneha-2',
      email: 'sneha@campus.edu',
      phone: '+91 98765 43211',
      name: 'Sneha',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-01-02T11:00:00Z',
      updatedAt: '2026-01-02T11:00:00Z',
    },
    {
      id: 'usr-aryan-3',
      email: 'aryan@campus.edu',
      phone: '+91 98765 43212',
      name: 'Aryan',
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&q=80',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-01-02T12:00:00Z',
      updatedAt: '2026-01-02T12:00:00Z',
    },
    {
      id: 'usr-pooja-4',
      email: 'pooja@campus.edu',
      phone: '+91 98765 43213',
      name: 'Pooja',
      avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&q=80',
      role: 'STUDENT',
      isSuspended: false,
      createdAt: '2026-01-03T09:00:00Z',
      updatedAt: '2026-01-03T09:00:00Z',
    },
  ],

  subscriptions: [
    {
      id: 'sub-rajdeep',
      userId: 'usr-rajdeep-1',
      planCode: 'PRO',
      planName: 'Campus Pro',
      priceInr: 49,
      status: 'ACTIVE',
      razorpayCustomerId: 'cust_rzp_001',
      razorpaySubscriptionId: 'sub_rzp_001',
      currentPeriodStart: '2026-09-01T00:00:00Z',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'sub-sneha',
      userId: 'usr-sneha-2',
      planCode: 'PRO',
      planName: 'Campus Pro',
      priceInr: 49,
      status: 'ACTIVE',
      razorpayCustomerId: 'cust_rzp_002',
      razorpaySubscriptionId: 'sub_rzp_002',
      currentPeriodStart: '2026-09-01T00:00:00Z',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'sub-aryan',
      userId: 'usr-aryan-3',
      planCode: 'FREE',
      planName: 'Starter Free',
      priceInr: 0,
      status: 'TRIAL',
      currentPeriodStart: '2026-09-01T00:00:00Z',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'sub-pooja',
      userId: 'usr-pooja-4',
      planCode: 'PRO',
      planName: 'Campus Pro',
      priceInr: 49,
      status: 'GRACE_PERIOD',
      gracePeriodUntil: '2026-09-12T00:00:00Z',
      currentPeriodStart: '2026-08-01T00:00:00Z',
      currentPeriodEnd: '2026-09-01T00:00:00Z',
      cancelAtPeriodEnd: false,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-09-02T00:00:00Z',
    },
  ],

  subscriptionEvents: [
    {
      id: 'evt-001',
      userId: 'usr-rajdeep-1',
      razorpayEventId: 'evt_rzp_init_001',
      eventType: 'subscription.charged',
      payload: { amount: 4900, status: 'paid', cycle: 'monthly' },
      processedAt: '2026-09-01T00:00:05Z',
    },
  ],

  rooms: [
    {
      id: 'room-flat-302',
      name: 'Flat 302 - Emerald PG',
      description: '4-sharing 2BHK flat near North Campus',
      createdBy: 'usr-rajdeep-1',
      isArchived: false,
      createdAt: '2026-01-02T10:00:00Z',
      updatedAt: '2026-01-02T10:00:00Z',
    },
    {
      id: 'room-hostel-14',
      name: 'Hostel Block B - Room 14',
      description: 'Engineering Hostel 2-bed room',
      createdBy: 'usr-aryan-3',
      isArchived: false,
      createdAt: '2026-01-10T10:00:00Z',
      updatedAt: '2026-01-10T10:00:00Z',
    },
  ],

  roomInvitations: [
    {
      id: 'inv-302',
      roomId: 'room-flat-302',
      inviteCode: 'FLAT302',
      createdBy: 'usr-rajdeep-1',
      expiresAt: '2026-12-31T23:59:59Z',
      isRevoked: false,
      createdAt: '2026-01-02T10:00:00Z',
    },
  ],

  roomMembers: [
    {
      id: 'rm-1',
      roomId: 'room-flat-302',
      userId: 'usr-rajdeep-1',
      role: 'ROOM_ADMIN',
      status: 'ACTIVE',
      joinedAt: '2026-01-02T10:00:00Z',
    },
    {
      id: 'rm-2',
      roomId: 'room-flat-302',
      userId: 'usr-sneha-2',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: '2026-01-02T11:00:00Z',
    },
    {
      id: 'rm-3',
      roomId: 'room-flat-302',
      userId: 'usr-aryan-3',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: '2026-01-02T12:00:00Z',
    },
    {
      id: 'rm-4',
      roomId: 'room-flat-302',
      userId: 'usr-pooja-4',
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt: '2026-01-03T09:00:00Z',
    },
    {
      id: 'rm-5',
      roomId: 'room-hostel-14',
      userId: 'usr-aryan-3',
      role: 'ROOM_ADMIN',
      status: 'ACTIVE',
      joinedAt: '2026-01-10T10:00:00Z',
    },
  ],

  // 100% PRIVATE PERSONAL EXPENSES FOR RAJDEEP
  personalExpenses: [
    {
      id: 'pe-rajdeep-1',
      userId: 'usr-rajdeep-1',
      title: 'Food outside / Cafe',
      amount: 1240,
      category: 'Food',
      notes: 'Treat with classmates at cafe',
      expenseDate: '2026-09-02',
      createdAt: '2026-09-02T14:30:00Z',
      updatedAt: '2026-09-02T14:30:00Z',
    },
    {
      id: 'pe-rajdeep-2',
      userId: 'usr-rajdeep-1',
      title: 'College Hoodie & Shoes',
      amount: 850,
      category: 'Shopping',
      notes: 'Winter sale purchase',
      expenseDate: '2026-09-04',
      createdAt: '2026-09-04T18:15:00Z',
      updatedAt: '2026-09-04T18:15:00Z',
    },
    {
      id: 'pe-rajdeep-3',
      userId: 'usr-rajdeep-1',
      title: 'Metro Smart Card Recharge',
      amount: 600,
      category: 'Travel',
      notes: 'Monthly commute',
      expenseDate: '2026-09-05',
      createdAt: '2026-09-05T09:00:00Z',
      updatedAt: '2026-09-05T09:00:00Z',
    },
    {
      id: 'pe-rajdeep-4',
      userId: 'usr-rajdeep-1',
      title: 'Spotify & Netflix Student Plan',
      amount: 300,
      category: 'Entertainment',
      notes: 'Personal entertainment subscriptions',
      expenseDate: '2026-09-06',
      createdAt: '2026-09-06T12:00:00Z',
      updatedAt: '2026-09-06T12:00:00Z',
    },
    // August 2026 Historical Expenses
    {
      id: 'pe-rajdeep-aug-1',
      userId: 'usr-rajdeep-1',
      title: 'Semester Textbooks & Lab Kits',
      amount: 2400,
      category: 'Academics',
      notes: 'Third semester engineering textbooks',
      expenseDate: '2026-08-12',
      createdAt: '2026-08-12T11:00:00Z',
      updatedAt: '2026-08-12T11:00:00Z',
    },
    {
      id: 'pe-rajdeep-aug-2',
      userId: 'usr-rajdeep-1',
      title: 'Room Shifting Cab & Porter',
      amount: 1150,
      category: 'Travel',
      notes: 'Luggage transfer from hostel to Flat 302',
      expenseDate: '2026-08-20',
      createdAt: '2026-08-20T16:30:00Z',
      updatedAt: '2026-08-20T16:30:00Z',
    },
    {
      id: 'pe-rajdeep-aug-3',
      userId: 'usr-rajdeep-1',
      title: 'Welcome Dinner with Seniors',
      amount: 1800,
      category: 'Food',
      notes: 'College society orientation dinner',
      expenseDate: '2026-08-27',
      createdAt: '2026-08-27T21:00:00Z',
      updatedAt: '2026-08-27T21:00:00Z',
    },
    // July 2026 Historical Expenses
    {
      id: 'pe-rajdeep-jul-1',
      userId: 'usr-rajdeep-1',
      title: 'Admission Stationery & ID Card',
      amount: 3200,
      category: 'Academics',
      notes: 'College registration & stationery fees',
      expenseDate: '2026-07-14',
      createdAt: '2026-07-14T10:00:00Z',
      updatedAt: '2026-07-14T10:00:00Z',
    },
    {
      id: 'pe-rajdeep-jul-2',
      userId: 'usr-rajdeep-1',
      title: 'Campus Food Court Recharge',
      amount: 1500,
      category: 'Food',
      notes: 'Preloaded canteen smartcard',
      expenseDate: '2026-07-22',
      createdAt: '2026-07-22T13:45:00Z',
      updatedAt: '2026-07-22T13:45:00Z',
    },
  ],

  // SHARED EXPENSES IN FLAT 302
  sharedExpenses: [
    {
      id: 'se-elec-01',
      roomId: 'room-flat-302',
      createdBy: 'usr-rajdeep-1',
      paidBy: 'usr-rajdeep-1', // Rajdeep paid ₹1,200 out of pocket
      title: 'Electricity Bill - August',
      totalAmount: 1200,
      category: 'Electricity',
      splitMethod: 'EQUAL',
      notes: 'BSES Power Discom bill',
      expenseDate: '2026-09-01',
      isDeleted: false,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    },
    {
      id: 'se-groc-02',
      roomId: 'room-flat-302',
      createdBy: 'usr-sneha-2',
      paidBy: 'usr-sneha-2', // Sneha paid ₹800
      title: 'Common Groceries & Spices',
      totalAmount: 800,
      category: 'Groceries',
      splitMethod: 'EQUAL',
      notes: 'Blinkit order: Rice, Oil, Onions, Milk',
      expenseDate: '2026-09-03',
      isDeleted: false,
      createdAt: '2026-09-03T11:00:00Z',
      updatedAt: '2026-09-03T11:00:00Z',
    },
    {
      id: 'se-wifi-03',
      roomId: 'room-flat-302',
      createdBy: 'usr-rajdeep-1',
      paidBy: 'usr-rajdeep-1', // Rajdeep paid ₹600
      title: 'High-Speed Wi-Fi (Airtel Fiber)',
      totalAmount: 600,
      category: 'Wi-Fi',
      splitMethod: 'EQUAL',
      notes: 'Monthly 200Mbps broadband plan',
      expenseDate: '2026-09-05',
      isDeleted: false,
      createdAt: '2026-09-05T08:00:00Z',
      updatedAt: '2026-09-05T08:00:00Z',
    },
  ],

  // POINT-IN-TIME FROZEN SPLITS
  expenseSplits: [
    // Splits for Electricity ₹1,200 (4 members -> ₹300 each)
    { id: 'es-1', sharedExpenseId: 'se-elec-01', userId: 'usr-rajdeep-1', shareAmount: 300, createdAt: '2026-09-01T10:00:00Z' },
    { id: 'es-2', sharedExpenseId: 'se-elec-01', userId: 'usr-sneha-2', shareAmount: 300, createdAt: '2026-09-01T10:00:00Z' },
    { id: 'es-3', sharedExpenseId: 'se-elec-01', userId: 'usr-aryan-3', shareAmount: 300, createdAt: '2026-09-01T10:00:00Z' },
    { id: 'es-4', sharedExpenseId: 'se-elec-01', userId: 'usr-pooja-4', shareAmount: 300, createdAt: '2026-09-01T10:00:00Z' },

    // Splits for Groceries ₹800 (4 members -> ₹200 each)
    { id: 'es-5', sharedExpenseId: 'se-groc-02', userId: 'usr-rajdeep-1', shareAmount: 200, createdAt: '2026-09-03T11:00:00Z' },
    { id: 'es-6', sharedExpenseId: 'se-groc-02', userId: 'usr-sneha-2', shareAmount: 200, createdAt: '2026-09-03T11:00:00Z' },
    { id: 'es-7', sharedExpenseId: 'se-groc-02', userId: 'usr-aryan-3', shareAmount: 200, createdAt: '2026-09-03T11:00:00Z' },
    { id: 'es-8', sharedExpenseId: 'se-groc-02', userId: 'usr-pooja-4', shareAmount: 200, createdAt: '2026-09-03T11:00:00Z' },

    // Splits for Wi-Fi ₹600 (4 members -> ₹150 each)
    { id: 'es-9', sharedExpenseId: 'se-wifi-03', userId: 'usr-rajdeep-1', shareAmount: 150, createdAt: '2026-09-05T08:00:00Z' },
    { id: 'es-10', sharedExpenseId: 'se-wifi-03', userId: 'usr-sneha-2', shareAmount: 150, createdAt: '2026-09-05T08:00:00Z' },
    { id: 'es-11', sharedExpenseId: 'se-wifi-03', userId: 'usr-aryan-3', shareAmount: 150, createdAt: '2026-09-05T08:00:00Z' },
    { id: 'es-12', sharedExpenseId: 'se-wifi-03', userId: 'usr-pooja-4', shareAmount: 150, createdAt: '2026-09-05T08:00:00Z' },
  ],

  // SETTLEMENT PAYMENTS (Partial payment record: Sneha paid ₹200 to Rajdeep via UPI)
  settlementPayments: [
    {
      id: 'sp-1',
      roomId: 'room-flat-302',
      payerId: 'usr-sneha-2',
      payeeId: 'usr-rajdeep-1',
      amount: 200,
      paymentMethod: 'UPI',
      transactionRef: 'UPI-REF-992144',
      notes: 'Partial payment for electricity bill via Google Pay',
      paymentDate: '2026-09-04',
      createdAt: '2026-09-04T16:00:00Z',
    },
  ],

  auditLogs: [
    {
      id: 'log-1',
      userId: 'usr-rajdeep-1',
      action: 'ROOM_CREATED',
      resourceType: 'ROOM',
      resourceId: 'room-flat-302',
      metadata: { name: 'Flat 302 - Emerald PG' },
      createdAt: '2026-01-02T10:00:00Z',
    },
  ],
};

class MockDatabase {
  private state: DatabaseState;

  constructor() {
    this.state = this.load();
  }

  private load(): DatabaseState {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.save(INITIAL_DATA);
      return INITIAL_DATA;
    }
    try {
      return JSON.parse(raw);
    } catch {
      this.save(INITIAL_DATA);
      return INITIAL_DATA;
    }
  }

  private save(state: DatabaseState): void {
    this.state = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  public resetToSeedData(): void {
    this.save(JSON.parse(JSON.stringify(INITIAL_DATA)));
  }

  public resetToDefault(): void {
    this.save(INITIAL_DATA);
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
    data: Omit<PersonalExpense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): PersonalExpense {
    const newExp: PersonalExpense = {
      id: 'pe-' + Math.random().toString(36).substr(2, 9),
      userId: requesterUserId,
      ...data,
      amount: round2(data.amount),
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
    this.state.personalExpenses = this.state.personalExpenses.filter((e) => e.id !== expenseId);
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

    const expId = 'se-' + Math.random().toString(36).substr(2, 9);
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
      id: 'es-' + Math.random().toString(36).substr(2, 9),
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
      roomId: string;
      payerId: string;
      payeeId: string;
      amount: number;
      paymentMethod: SettlementPayment['paymentMethod'];
      transactionRef?: string;
      notes?: string;
    }
  ): SettlementPayment {
    // Verify room membership
    const isMember = this.state.roomMembers.some(
      (rm) => rm.roomId === data.roomId && rm.userId === requesterUserId && rm.status === 'ACTIVE'
    );
    if (!isMember) {
      throw new Error('ACCESS_DENIED: Cannot record settlement in unjoined room');
    }

    const newPayment: SettlementPayment = {
      id: 'sp-' + Math.random().toString(36).substr(2, 9),
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

  public joinRoomWithCode(userId: string, inviteCode: string): Room {
    const inv = this.state.roomInvitations.find(
      (i) => i.inviteCode.toUpperCase() === inviteCode.trim().toUpperCase() && !i.isRevoked
    );
    if (!inv) {
      throw new Error('Invalid or expired room invite code');
    }

    const room = this.state.rooms.find((r) => r.id === inv.roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const existingMember = this.state.roomMembers.find(
      (rm) => rm.roomId === room.id && rm.userId === userId
    );

    if (existingMember) {
      if (existingMember.status === 'LEFT' || existingMember.status === 'REMOVED') {
        existingMember.status = 'ACTIVE';
        existingMember.joinedAt = new Date().toISOString();
        existingMember.leftAt = undefined;
      }
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
    return room;
  }

  public createRoom(userId: string, name: string, description?: string): Room {
    const roomId = 'room-' + Math.random().toString(36).substr(2, 9);
    const newRoom: Room = {
      id: roomId,
      name,
      description,
      createdBy: userId,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Creator becomes ROOM_ADMIN
    this.state.rooms.unshift(newRoom);
    this.state.roomMembers.push({
      id: 'rm-' + Math.random().toString(36).substr(2, 9),
      roomId,
      userId,
      role: 'ROOM_ADMIN',
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
    });

    // Generate 6-character alphanumeric invite code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.state.roomInvitations.push({
      id: 'inv-' + Math.random().toString(36).substr(2, 9),
      roomId,
      inviteCode: code,
      createdBy: userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
      createdAt: new Date().toISOString(),
    });

    this.save(this.state);
    return newRoom;
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
   * Super Admin Account Control
   */
  public superAdminToggleUserSuspension(superAdminId: string, targetUserId: string, suspend: boolean): boolean {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
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
  public superAdminToggleRoomFreeze(superAdminId: string, roomId: string, freeze: boolean): boolean {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

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
  public superAdminArchiveRoom(superAdminId: string, roomId: string, archive: boolean): boolean {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

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
  public superAdminResetInviteCode(superAdminId: string, roomId: string): string {
    const admin = this.state.users.find((u) => u.id === superAdminId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('ACCESS_DENIED: Super Admin privileges required');
    }

    const room = this.state.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error('Room not found');

    // Revoke old active invitations
    this.state.roomInvitations
      .filter((inv) => inv.roomId === roomId && !inv.isRevoked)
      .forEach((inv) => {
        inv.isRevoked = true;
      });

    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newInv = {
      id: 'inv-' + Math.random().toString(36).substr(2, 9),
      roomId,
      inviteCode: newCode,
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
}

export const db = new MockDatabase();

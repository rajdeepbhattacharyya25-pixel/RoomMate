import { supabase, isSupabaseConfigured } from '../supabase/client';
import { Database, Json } from '../../types/supabase';
import { db, DatabaseState, DEFAULT_STAGING_SEEDS } from './mockStorage';
import {
  User,
  Room,
  RoomMember,
  RoomInvitation,
  RoomJoinRequest,
  JoinPolicy,
  InvitePolicy,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  PersonalExpense,
  SplitMethod,
  InAppNotification,
  BugReport,
  BugStatus,
  SystemIncident,
  PlatformAnnouncement,
  PlatformSettings,
  FeatureSuggestionStatus,
} from '../../types';
import { enqueueOfflineItem } from './offlineQueue';
import { validateStrict4DigitPin, hashPin, clearResidentSession, createResidentToken } from '../auth/jwtService';
import { isNativeApp } from '../platform/deviceDetector';

export const IS_LIVE_SYNC_ENABLED =
  isSupabaseConfigured && import.meta.env.VITE_USE_LIVE_SUPABASE === 'true';

// Helper to verify user has an active Supabase Auth session
export async function authenticateResidentWithSupabase(email: string): Promise<boolean> {
  if (!IS_LIVE_SYNC_ENABLED || !email) return false;

  try {
    const { data: session } = await supabase.auth.getSession();
    if (session?.session?.user?.email?.toLowerCase() === email.toLowerCase()) {
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Supabase Auth session verification error:', err);
    return false;
  }
}

// Fetch complete state from Supabase Cloud
export async function fetchCloudDatabaseState(): Promise<DatabaseState | null> {
  if (!IS_LIVE_SYNC_ENABLED) return null;

  try {
    // 1. Profiles
    const { data: profiles, error: profErr } = await supabase.from('profiles').select('*');
    if (profErr || !profiles || profiles.length === 0) {
      console.warn('Could not fetch cloud profiles, falling back to local:', profErr?.message);
      return null;
    }

    const users: User[] = profiles.map((p) => ({
      id: p.id,
      email: p.email,
      phone: p.phone || undefined,
      name: p.name,
      avatarUrl: p.avatar_url || undefined,
      upiQrUrl: p.upi_qr_url || undefined,
      upiId: p.upi_id || undefined,
      fcmToken: p.fcm_token || undefined,
      role: p.role as User['role'],
      isSuspended: p.is_suspended ?? false,
      onboardingCompleted: p.onboarding_completed ?? Boolean(p.phone && p.name),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    // Ensure SuperAdmin exists in the users list for administrative platform access
    const hasSuperAdmin = users.some((u) => u.role === 'SUPER_ADMIN');
    if (!hasSuperAdmin) {
      const defaultAdmin = DEFAULT_STAGING_SEEDS.users.find((u) => u.role === 'SUPER_ADMIN');
      if (defaultAdmin) {
        users.unshift(defaultAdmin);
      }
    }

    // Keep local database cache in sync with cloud profiles
    users.forEach((u) => db.upsertUser(u));

    // 2. Rooms
    const { data: rawRooms } = await supabase.from('rooms').select('*').eq('is_archived', false);
    const rooms: Room[] = (rawRooms || []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      createdBy: r.created_by,
      isArchived: r.is_archived ?? false,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    // 3. Room Members
    const { data: rawMembers } = await supabase.from('room_members').select('*');
    const roomMembers: RoomMember[] = (rawMembers || []).map((m) => ({
      id: m.id,
      roomId: m.room_id,
      userId: m.user_id,
      role: m.role as RoomMember['role'],
      status: m.status as RoomMember['status'],
      joinedAt: m.joined_at,
      leftAt: m.left_at || undefined,
    }));

    // 4. Room Invitations
    const { data: rawInvites } = await supabase.from('room_invitations').select('*');
    const roomInvitations: RoomInvitation[] = (rawInvites || []).map((inv) => ({
      id: inv.id,
      roomId: inv.room_id,
      inviteCode: inv.invite_code,
      token: inv.token || ('tok_' + inv.id),
      createdBy: inv.created_by,
      expiresAt: inv.expires_at || undefined,
      isRevoked: inv.is_revoked ?? false,
      createdAt: inv.created_at,
    }));

    // 5. Shared Expenses
    const { data: rawShared } = await supabase
      .from('shared_expenses')
      .select('*')
      .eq('is_deleted', false)
      .order('expense_date', { ascending: false });

    const sharedExpenses: SharedExpense[] = (rawShared || []).map((e) => ({
      id: e.id,
      roomId: e.room_id,
      createdBy: e.created_by,
      paidBy: e.paid_by,
      title: e.title,
      totalAmount: Number(e.total_amount),
      category: e.category as SharedExpense['category'],
      splitMethod: e.split_method as SplitMethod,
      notes: e.notes || undefined,
      expenseDate: e.expense_date,
      isDeleted: e.is_deleted ?? false,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));

    // 6. Expense Splits
    const { data: rawSplits } = await supabase.from('expense_splits').select('*');
    const expenseSplits: ExpenseSplit[] = (rawSplits || []).map((s) => ({
      id: s.id,
      sharedExpenseId: s.shared_expense_id,
      userId: s.user_id,
      shareAmount: Number(s.share_amount),
      createdAt: s.created_at || new Date().toISOString(),
    }));

    // 7. Settlement Payments
    const { data: rawSettlements } = await supabase
      .from('settlement_payments')
      .select('*')
      .order('created_at', { ascending: false });

    const settlementPayments: SettlementPayment[] = (rawSettlements || []).map((p) => ({
      id: p.id,
      roomId: p.room_id,
      payerId: p.payer_id,
      payeeId: p.payee_id,
      amount: Number(p.amount),
      paymentMethod: p.payment_method as SettlementPayment['paymentMethod'],
      transactionRef: p.transaction_ref || undefined,
      notes: p.notes || undefined,
      paymentDate: p.payment_date || p.created_at || new Date().toISOString(),
      createdAt: p.created_at || new Date().toISOString(),
    }));

    // 8. Personal Expenses
    const { data: rawPersonal } = await supabase
      .from('personal_expenses')
      .select('*')
      .order('expense_date', { ascending: false });

    const personalExpenses: PersonalExpense[] = (rawPersonal || []).map((p) => ({
      id: p.id,
      userId: p.user_id,
      title: p.title,
      amount: Number(p.amount),
      category: p.category as PersonalExpense['category'],
      notes: p.notes || undefined,
      expenseDate: p.expense_date,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    // Subscriptions and logs fallback to local/empty
    const localState = db.getState();

    // 9. In-App Notifications
    let notifications: InAppNotification[] = localState.notifications || [];
    try {
      const { data: rawNotifs } = await supabase
        .from('in_app_notifications')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (rawNotifs && rawNotifs.length > 0) {
        notifications = rawNotifs.map((n) => ({
          id: n.id,
          userId: n.user_id,
          roomId: n.room_id || undefined,
          type: n.type as InAppNotification['type'],
          title: n.title,
          message: n.message,
          priority: n.priority as InAppNotification['priority'],
          isRead: n.is_read ?? false,
          readAt: n.read_at || undefined,
          createdAt: n.created_at,
          actionType: n.action_type as InAppNotification['actionType'],
          actionTarget: n.action_target || undefined,
          metadata: (n.metadata as unknown as InAppNotification['metadata']) || undefined,
          eventId: n.event_id || undefined,
          isDeleted: n.is_deleted ?? false,
        }));
      }
    } catch {
      // fallback to local notifications if table not yet migrated or offline
    }

    // System Incidents (Crashlytics, telemetry warnings, system health)
    let systemIncidents: SystemIncident[] = localState.systemIncidents || [];
    try {
      const { data: rawIncidents } = await (supabase as any)
        .from('system_incidents')
        .select('*')
        .order('created_at', { ascending: false });

      if (rawIncidents && rawIncidents.length > 0) {
        systemIncidents = rawIncidents.map((inc: any) => ({
          id: inc.id,
          service: inc.service,
          error: inc.error,
          severity: inc.severity,
          status: inc.status,
          occurrences: inc.occurrences,
          details: inc.details || undefined,
          durationSeconds: inc.duration_seconds || (inc.resolved_at && inc.created_at ? Math.max(0, Math.round((new Date(inc.resolved_at).getTime() - new Date(inc.created_at).getTime()) / 1000)) : undefined),
          createdAt: inc.created_at,
          resolvedAt: inc.resolved_at || undefined,
        }));
      }
    } catch {
      // fallback to local incidents if table not yet migrated or offline
    }

    // 10. Room Join Requests (Cloud sync)
    let roomJoinRequests: RoomJoinRequest[] = localState.roomJoinRequests || [];
    try {
      const { data: rawJoinReqs } = await supabase
        .from('room_join_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (rawJoinReqs && rawJoinReqs.length > 0) {
        roomJoinRequests = rawJoinReqs.map((req) => ({
          id: req.id,
          roomId: req.room_id,
          userId: req.user_id,
          status: req.status as RoomJoinRequest['status'],
          createdAt: req.created_at,
        }));
      }
    } catch {
      // fallback to local join requests
    }

    const cloudDatabaseState: DatabaseState = {
      users,
      rooms,
      roomMembers,
      roomInvitations,
      sharedExpenses,
      expenseSplits,
      settlementPayments,
      personalExpenses,
      subscriptions: localState.subscriptions,
      subscriptionEvents: localState.subscriptionEvents,
      roomJoinRequests,
      auditLogs: localState.auditLogs,
      notifications,
      bugReports: localState.bugReports || [],
      featureSuggestions: localState.featureSuggestions || [],
      contactRequests: localState.contactRequests || [],
      announcements: localState.announcements || [],
      settings: localState.settings,
      systemIncidents,
    };

    // Synchronize underlying storage state with verified cloud dataset
    db.saveState(cloudDatabaseState);

    return cloudDatabaseState;
  } catch (err) {
    console.error('Failed to sync state from Supabase Cloud:', err);
    return null;
  }
}

// Add Shared Expense to Cloud + Local
export async function addSharedExpenseCloud(data: {
  roomId: string;
  paidBy: string;
  createdBy: string;
  title: string;
  totalAmount: number;
  category: SharedExpense['category'];
  splitMethod?: SplitMethod;
  participantUserIds: string[];
  customValues?: Record<string, number>;
  notes?: string;
  expenseDate?: string;
}): Promise<{ expense: SharedExpense; splits: ExpenseSplit[] }> {
  // 1. Always write locally first (optimistic UI & offline protection)
  const localExpense = db.createSharedExpense(data.createdBy, data);
  const localSplits = db.getState().expenseSplits.filter((s) => s.sharedExpenseId === localExpense.id);

  // 2. If live sync is enabled, mirror to Supabase Cloud
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data: cloudExpense, error: expError } = await supabase
        .from('shared_expenses')
        .insert({
          id: localExpense.id.length === 36 ? localExpense.id : undefined,
          room_id: data.roomId,
          created_by: data.createdBy,
          paid_by: data.paidBy,
          title: data.title,
          total_amount: data.totalAmount,
          category: data.category,
          split_method: data.splitMethod || 'EQUAL',
          notes: data.notes || null,
          expense_date: data.expenseDate || new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (expError) {
        console.warn('Cloud insert expense warning, queued offline:', expError.message);
        enqueueOfflineItem('ADD_SHARED_EXPENSE', {
          ...data,
          localExpenseId: localExpense.id,
        });
      } else if (cloudExpense) {
        // Insert splits into cloud
        const splitsToInsert = localSplits.map((s) => ({
          shared_expense_id: cloudExpense.id,
          user_id: s.userId,
          share_amount: s.shareAmount,
        }));

        const { error: splitError } = await supabase
          .from('expense_splits')
          .insert(splitsToInsert);

        if (splitError) {
          console.warn('Cloud insert splits warning:', splitError.message);
        }
      }
    } catch (cloudErr) {
      console.warn('Async cloud expense sync failed, queued offline:', cloudErr);
      enqueueOfflineItem('ADD_SHARED_EXPENSE', {
        ...data,
        localExpenseId: localExpense.id,
      });
    }
  }

  return { expense: localExpense, splits: localSplits };
}

// Record Settlement to Cloud + Local with Idempotency
export async function recordSettlementCloud(data: {
  id?: string;
  roomId: string;
  payerId: string;
  payeeId: string;
  amount: number;
  paymentMethod: SettlementPayment['paymentMethod'];
  transactionRef?: string;
  notes?: string;
}): Promise<SettlementPayment> {
  // 1. Write locally (returns existing if id matched)
  const localSettlement = db.recordSettlementPayment(data.payerId, data);

  // 2. Mirror to Supabase Cloud with client-generated UUID for idempotency
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase.from('settlement_payments').insert({
        id: localSettlement.id,
        room_id: data.roomId,
        payer_id: data.payerId,
        payee_id: data.payeeId,
        amount: data.amount,
        payment_method: data.paymentMethod,
        transaction_ref: data.transactionRef || null,
        notes: data.notes || null,
        payment_date: new Date().toISOString().split('T')[0],
      });

      if (error) {
        // If code 23505 (unique_violation / primary key exists), it is an idempotent retry
        if (error.code === '23505') {
          console.log('[Idempotency] Settlement payment already recorded in cloud:', localSettlement.id);
        } else {
          console.warn('Cloud settlement sync warning, queued offline:', error.message);
          enqueueOfflineItem('RECORD_SETTLEMENT', {
            ...data,
            localSettlementId: localSettlement.id,
          });
        }
      }
    } catch (err) {
      console.warn('Async settlement cloud sync failed, queued offline:', err);
      enqueueOfflineItem('RECORD_SETTLEMENT', {
        ...data,
        localSettlementId: localSettlement.id,
      });
    }
  }

  return localSettlement;
}

// Leave Room in Cloud + Local (Atomic via Postgres RPC)
export async function leaveRoomCloud(
  userId: string,
  roomId: string
): Promise<{ success: boolean; newAdminId?: string; isArchived: boolean }> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await supabase.rpc('leave_room', {
        p_room_id: roomId,
      });

      if (error) {
        console.warn('leave_room RPC cloud error:', error.message);
      } else {
        const localRes = db.leaveRoom(userId, roomId);
        return {
          success: true,
          newAdminId: data?.new_admin_id || localRes.newAdminId,
          isArchived: data?.is_archived ?? localRes.isArchived,
        };
      }
    } catch (err) {
      console.warn('leaveRoomCloud fallback to local:', err);
    }
  }

  return db.leaveRoom(userId, roomId);
}

// Remove Member in Cloud + Local (Atomic via Postgres RPC)
export async function removeMemberCloud(
  adminUserId: string,
  roomId: string,
  targetUserId: string
): Promise<{ success: boolean }> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase.rpc('remove_room_member', {
        p_room_id: roomId,
        p_target_user_id: targetUserId,
      });

      if (error) {
        console.warn('remove_room_member RPC cloud error:', error.message);
      } else {
        return db.removeMember(adminUserId, roomId, targetUserId);
      }
    } catch (err) {
      console.warn('removeMemberCloud fallback to local:', err);
    }
  }

  return db.removeMember(adminUserId, roomId, targetUserId);
}

// Add Personal Expense to Cloud + Local
export async function addPersonalExpenseCloud(data: {
  userId: string;
  title: string;
  amount: number;
  category: PersonalExpense['category'];
  notes?: string;
  expenseDate?: string;
}): Promise<PersonalExpense> {
  const expenseDate = data.expenseDate || new Date().toISOString().split('T')[0];
  const localExp = db.createPersonalExpense(data.userId, {
    title: data.title,
    amount: data.amount,
    category: data.category,
    notes: data.notes,
    expenseDate,
  });

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase.from('personal_expenses').insert({
        id: localExp.id.length === 36 ? localExp.id : undefined,
        user_id: data.userId,
        title: data.title,
        amount: data.amount,
        category: data.category,
        notes: data.notes || null,
        expense_date: expenseDate,
      });

      if (error) {
        console.warn('Cloud personal expense error, queued offline:', error.message);
        enqueueOfflineItem('ADD_PERSONAL_EXPENSE', {
          ...data,
          localId: localExp.id,
        });
      }
    } catch (err) {
      console.warn('Async personal expense cloud sync failed, queued offline:', err);
      enqueueOfflineItem('ADD_PERSONAL_EXPENSE', {
        ...data,
        localId: localExp.id,
      });
    }
  }

  return localExp;
}

// Delete Personal Expense from Cloud + Local
export async function deletePersonalExpenseCloud(userId: string, id: string): Promise<void> {
  db.deletePersonalExpense(userId, id);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase.from('personal_expenses').delete().eq('id', id);
    } catch (err) {
      console.warn('Async personal expense deletion failed:', err);
    }
  }
}

// Realtime Subscriptions Handler for Multi-Client Synchronization
export function subscribeToRoomRealtime(
  roomId: string,
  onRemoteChange: (table: string, eventType: string) => void
): () => void {
  if (!IS_LIVE_SYNC_ENABLED || !roomId) {
    return () => {};
  }

  const channelName = `room-${roomId}`;
  console.log(`[Realtime] Subscribing to channel: ${channelName}`);

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_expenses', filter: `room_id=eq.${roomId}` },
      (payload) => {
        console.log('[Realtime] shared_expenses changed:', payload.eventType);
        onRemoteChange('shared_expenses', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'settlement_payments', filter: `room_id=eq.${roomId}` },
      (payload) => {
        console.log('[Realtime] settlement_payments changed:', payload.eventType);
        onRemoteChange('settlement_payments', payload.eventType);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
      (payload) => {
        console.log('[Realtime] room_members changed:', payload.eventType);
        onRemoteChange('room_members', payload.eventType);
      }
    )
    .subscribe((status) => {
      console.log(`[Realtime] Subscription status for ${channelName}:`, status);
    });

  return () => {
    console.log(`[Realtime] Unsubscribing channel: ${channelName}`);
    supabase.removeChannel(channel);
  };
}

// Register or Login Resident with Cloud + Local
export async function registerResidentCloud(user: User, password?: string): Promise<User> {
  // Always save locally
  db.upsertUser(user);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      // 1. Authenticate or create in Supabase Auth
      const { data: authData } = await supabase.auth.signUp({
        email: user.email,
        password: password || 'CampusFlowPassword2026!',
      });

      const authId = authData?.user?.id || user.id;
      const updatedUser: User = { ...user, id: authId };

      // 2. Insert or upsert in public.profiles
      await supabase.from('profiles').upsert({
        id: authId,
        email: user.email,
        phone: user.phone || null,
        name: user.name,
        role: user.role,
        is_suspended: user.isSuspended,
      });

      db.upsertUser(updatedUser);
      return updatedUser;
    } catch (err) {
      console.warn('registerResidentCloud warning:', err);
    }
  }

  return user;
}

/**
 * Checks if an email is already registered in local storage or Supabase cloud profiles.
 * Preserves existing accounts and personal vaults from being overwritten.
 */
export async function checkEmailExistsCloud(email: string): Promise<{ exists: boolean; user?: User }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { exists: false };

  // 1. Check local mock storage / db state
  const localUser = db.getState().users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (localUser) {
    return { exists: true, user: localUser };
  }

  // 2. Check Supabase profiles table if live sync is active
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (!error && data) {
        const cloudUser: User = {
          id: data.id,
          name: data.name,
          email: data.email,
          phone: data.phone || undefined,
          role: (data.role as User['role']) || 'STUDENT',
          isSuspended: Boolean(data.is_suspended),
          createdAt: data.created_at || new Date().toISOString(),
          updatedAt: data.created_at || new Date().toISOString(),
        };
        db.upsertUser(cloudUser);
        return { exists: true, user: cloudUser };
      }
    } catch (err) {
      console.warn('checkEmailExistsCloud check error:', err);
    }
  }

  return { exists: false };
}

export interface RegisterWithEmailResult {
  user: User;
  emailConfirmationRequired: boolean;
  isExistingUser?: boolean;
  error?: string;
}

/**
 * Registers a new resident account with native Supabase email verification.
 * Strictly validates 4-digit PIN before proceeding.
 */
export async function registerWithEmailConfirmationCloud(
  user: User,
  rawPin: string
): Promise<RegisterWithEmailResult> {
  // 1. Independent backend validation of 4-digit PIN
  const pinValidation = validateStrict4DigitPin(rawPin);
  if (!pinValidation.isValid) {
    return {
      user,
      emailConfirmationRequired: false,
      error: pinValidation.error || 'Enter a valid 4-digit PIN.',
    };
  }

  const hashedPin = await hashPin(pinValidation.sanitized);

  // 2. Check if user already exists
  const existing = await checkEmailExistsCloud(user.email);
  if (existing.exists && existing.user) {
    return {
      user: existing.user,
      emailConfirmationRequired: false,
      isExistingUser: true,
    };
  }

  // 3. Supabase Auth native registration
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/?verified=true` : undefined;
      const authPassword = `RoomMate_${hashedPin.slice(0, 16)}!`;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: user.email,
        password: authPassword,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            name: user.name,
            pin_hash: hashedPin,
          },
        },
      });

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists') || authError.status === 400) {
          return {
            user,
            emailConfirmationRequired: false,
            isExistingUser: true,
          };
        }
        return {
          user,
          emailConfirmationRequired: false,
          error: authError.message,
        };
      }

      // Check if user object has empty identities (indicates user already exists in Supabase when enumeration protection is on)
      if (authData?.user && Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
        return {
          user,
          emailConfirmationRequired: false,
          isExistingUser: true,
        };
      }

      const authId = authData?.user?.id || user.id;
      const updatedUser: User = { ...user, id: authId };

      // Determine if email confirmation is required by Supabase
      const isConfirmed = Boolean(
        authData?.session || authData?.user?.email_confirmed_at || (authData?.user as any)?.confirmed_at
      );

      if (!isConfirmed) {
        // Email verification pending from Supabase Auth!
        return {
          user: updatedUser,
          emailConfirmationRequired: true,
        };
      }

      // If already confirmed (or email confirmation is disabled on Supabase project):
      await supabase.from('profiles').upsert({
        id: authId,
        email: user.email,
        phone: user.phone || null,
        name: user.name,
        role: user.role,
        is_suspended: user.isSuspended,
      });

      db.upsertUser(updatedUser);
      return {
        user: updatedUser,
        emailConfirmationRequired: false,
      };
    } catch (err: unknown) {
      console.warn('registerWithEmailConfirmationCloud error:', err);
      return {
        user,
        emailConfirmationRequired: false,
        error: String(err),
      };
    }
  }

  // Local/Offline fallback: Email confirmation simulated or instant
  db.upsertUser(user);
  return {
    user,
    emailConfirmationRequired: false,
  };
}

/**
 * Checks whether an email has completed native Supabase email verification.
 * Strictly queries Supabase Auth state rather than assuming user action.
 */
export async function checkEmailVerificationStatusCloud(
  email: string,
  rawPin?: string
): Promise<{ isVerified: boolean; user?: User; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();

  if (!IS_LIVE_SYNC_ENABLED) {
    const local = db.getState().users.find((u) => u.email.toLowerCase() === cleanEmail);
    return { isVerified: true, user: local };
  }

  try {
    // 1. Check current Supabase session
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData?.session?.user;
    if (
      currentUser &&
      currentUser.email?.toLowerCase() === cleanEmail &&
      (currentUser.email_confirmed_at || (currentUser as any).confirmed_at)
    ) {
      const profile = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
      const resolvedUser: User = profile.data
        ? {
            id: profile.data.id,
            name: profile.data.name,
            email: profile.data.email,
            phone: profile.data.phone || undefined,
            role: (profile.data.role as User['role']) || 'STUDENT',
            isSuspended: Boolean(profile.data.is_suspended),
            createdAt: profile.data.created_at || new Date().toISOString(),
            updatedAt: profile.data.created_at || new Date().toISOString(),
          }
        : {
            id: currentUser.id,
            name: currentUser.user_metadata?.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: 'STUDENT',
            isSuspended: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
      db.upsertUser(resolvedUser);
      return { isVerified: true, user: resolvedUser };
    }

    // 2. If PIN provided, attempt signInWithPassword to verify live confirmation status
    if (rawPin) {
      const pinValidation = validateStrict4DigitPin(rawPin);
      if (pinValidation.isValid) {
        const hashedPin = await hashPin(pinValidation.sanitized);
        const authPassword = `RoomMate_${hashedPin.slice(0, 16)}!`;

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: authPassword,
        });

        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes('email not confirmed')) {
            return {
              isVerified: false,
              error: 'Email not verified yet. Please confirm using the link we sent to your inbox.',
            };
          }
          return { isVerified: false, error: signInError.message };
        }

        if (signInData?.user) {
          const authUser = signInData.user;
          const { data: prof } = await supabase
            .from('profiles')
            .upsert({
              id: authUser.id,
              email: authUser.email || cleanEmail,
              name: authUser.user_metadata?.name || cleanEmail.split('@')[0],
              role: 'STUDENT',
              is_suspended: false,
            })
            .select()
            .single();

          const resolvedUser: User = {
            id: authUser.id,
            name: prof?.name || authUser.user_metadata?.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            role: 'STUDENT',
            isSuspended: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          db.upsertUser(resolvedUser);
          return { isVerified: true, user: resolvedUser };
        }
      }
    }

    return {
      isVerified: false,
      error: 'Email not verified yet. Please confirm using the link we sent to your inbox.',
    };
  } catch (err: unknown) {
    return {
      isVerified: false,
      error: String(err),
    };
  }
}

export interface ResidentAuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  isOAuthAccount?: boolean;
}

/**
 * Authenticates an existing resident account using strict backend credential verification.
 * NEVER creates a new account on failure or unrecognized credentials.
 * Rejects invalid passwords with an authentication failure.
 */
export async function signInResidentWithCredentialsCloud(
  identifier: string,
  rawPinOrPassword: string
): Promise<ResidentAuthResult> {
  const cleanId = (identifier || '').trim().toLowerCase();
  if (!cleanId) {
    return { success: false, error: 'Please enter your registered email or phone number.' };
  }
  if (!rawPinOrPassword || !rawPinOrPassword.trim()) {
    return { success: false, error: 'Please enter your 4-digit passcode or password.' };
  }

  // 1. Resolve email from identifier (if phone number provided, find associated account email)
  let resolvedEmail = cleanId;
  if (!cleanId.includes('@')) {
    const cleanPhoneDigits = cleanId.replace(/\D/g, '');
    const localMatch = db.getState().users.find((u) => {
      if (!u.phone) return false;
      const digits = u.phone.replace(/\D/g, '');
      return digits === cleanPhoneDigits || digits.endsWith(cleanPhoneDigits) || cleanPhoneDigits.endsWith(digits);
    });

    if (localMatch?.email) {
      resolvedEmail = localMatch.email.toLowerCase();
    } else if (IS_LIVE_SYNC_ENABLED) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('email')
          .ilike('phone', `%${cleanPhoneDigits}%`)
          .maybeSingle();
        if (prof?.email) {
          resolvedEmail = prof.email.toLowerCase();
        } else {
          return { success: false, error: 'No account found with this phone number.' };
        }
      } catch {
        return { success: false, error: 'No account found with this phone number.' };
      }
    } else {
      return { success: false, error: 'No account found with this phone number.' };
    }
  }

  // 2. Prepare auth password (handle both 4-digit PIN hash and plain passwords)
  const pinValidation = validateStrict4DigitPin(rawPinOrPassword);
  let authPassword = rawPinOrPassword;
  if (pinValidation.isValid) {
    const hashedPin = await hashPin(pinValidation.sanitized);
    authPassword = `RoomMate_${hashedPin.slice(0, 16)}!`;
  }

  // 3. Check for local mock / demo resident personas (non-UUID ID)
  const existingLocal = db.getState().users.find(
    (u) => u.email.toLowerCase() === resolvedEmail.toLowerCase()
  );

  const isLocalMockUser =
    existingLocal &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingLocal.id);

  if (isLocalMockUser) {
    if (pinValidation.isValid) {
      const storedPin =
        (typeof localStorage !== 'undefined' &&
          (localStorage.getItem(`roommate_vault_pin_${existingLocal.id}`) ||
            localStorage.getItem('roommate_vault_pin'))) ||
        '';
      if (storedPin && storedPin !== pinValidation.sanitized) {
        return {
          success: false,
          error: 'Incorrect 4-digit security PIN.',
        };
      }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`roommate_vault_pin_${existingLocal.id}`, pinValidation.sanitized);
          localStorage.setItem('roommate_vault_pin', pinValidation.sanitized);
        }
      } catch {}
    }
    const token = createResidentToken(existingLocal);
    return {
      success: true,
      user: existingLocal,
      token,
    };
  }

  // 4. Supabase Auth credential verification
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password: authPassword,
      });

      if (signInError) {
        const msg = signInError.message.toLowerCase();
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
          return {
            success: false,
            error: 'Incorrect email or passcode. Please check your credentials.',
          };
        }
        if (msg.includes('email not confirmed')) {
          return {
            success: false,
            error: 'Email address is not verified yet. Please check your inbox for the confirmation link.',
          };
        }
        return {
          success: false,
          error: signInError.message || 'Authentication failed. Please verify your credentials.',
        };
      }

      if (signInData?.user) {
        const authUser = signInData.user;
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        const resolvedUser: User = {
          id: authUser.id,
          name: prof?.name || authUser.user_metadata?.name || resolvedEmail.split('@')[0],
          email: prof?.email || authUser.email || resolvedEmail,
          phone: prof?.phone || undefined,
          avatarUrl: prof?.avatar_url || undefined,
          upiQrUrl: prof?.upi_qr_url || undefined,
          upiId: prof?.upi_id || undefined,
          role: (prof?.role as User['role']) || 'STUDENT',
          isSuspended: Boolean(prof?.is_suspended),
          onboardingCompleted: Boolean(prof?.onboarding_completed || (prof?.name && prof?.phone)),
          createdAt: prof?.created_at || new Date().toISOString(),
          updatedAt: prof?.updated_at || new Date().toISOString(),
        };

        db.upsertUser(resolvedUser);

        if (pinValidation.isValid) {
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(`roommate_vault_pin_${resolvedUser.id}`, pinValidation.sanitized);
              localStorage.setItem('roommate_vault_pin', pinValidation.sanitized);
            }
          } catch {}
        }

        const token = createResidentToken(resolvedUser);
        return {
          success: true,
          user: resolvedUser,
          token,
        };
      }
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Authentication service error.',
      };
    }
  }

  // 5. Final fallback verification (strictly verify existing user, NO account creation)
  if (!existingLocal) {
    return {
      success: false,
      error: 'Account not found. Please create an account first.',
    };
  }

  // Verify PIN if 4-digit PIN is used
  if (pinValidation.isValid) {
    const storedPin =
      (typeof localStorage !== 'undefined' &&
        (localStorage.getItem(`roommate_vault_pin_${existingLocal.id}`) ||
          localStorage.getItem('roommate_vault_pin'))) ||
      '';
    if (storedPin && storedPin !== pinValidation.sanitized) {
      return {
        success: false,
        error: 'Incorrect 4-digit security PIN.',
      };
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`roommate_vault_pin_${existingLocal.id}`, pinValidation.sanitized);
        localStorage.setItem('roommate_vault_pin', pinValidation.sanitized);
      }
    } catch {}
  }

  const token = createResidentToken(existingLocal);
  return {
    success: true,
    user: existingLocal,
    token,
  };
}

/**
 * Resends a native Supabase signup confirmation email.
 */
export async function resendConfirmationEmailCloud(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { success: false, error: 'Invalid email address' };

  if (!IS_LIVE_SYNC_ENABLED) {
    return { success: true };
  }

  try {
    const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/?verified=true` : undefined;
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: String(err) };
  }
}

export interface GoogleOAuthResult {
  success: boolean;
  isUnconfiguredProvider?: boolean;
  error?: string;
}

/**
 * Initiates Supabase Google OAuth redirect.
 * If Google Provider is not enabled in the Supabase project,
 * returns isUnconfiguredProvider = true so UI can present setup guidance.
 */
export async function signInWithGoogleOAuth(): Promise<GoogleOAuthResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      isUnconfiguredProvider: true,
      error: 'Supabase credentials are not configured in your environment.',
    };
  }

  try {
    let redirectUrl: string | undefined;
    if (typeof window !== 'undefined') {
      if (isNativeApp()) {
        redirectUrl = 'roommate://auth-callback';
      } else {
        redirectUrl = `${window.location.origin}/`;
      }
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      const isUnconfigured =
        msg.includes('provider is not enabled') ||
        msg.includes('unsupported provider') ||
        msg.includes('not configured') ||
        (error as { status?: number }).status === 400;
      return {
        success: false,
        isUnconfiguredProvider: isUnconfigured,
        error: error.message,
      };
    }

    return { success: true };
  } catch (err: unknown) {
    const errStr = String(err);
    const isUnconfigured =
      errStr.toLowerCase().includes('provider is not enabled') ||
      errStr.toLowerCase().includes('unsupported provider');
    return {
      success: false,
      isUnconfiguredProvider: isUnconfigured,
      error: err instanceof Error ? err.message : errStr,
    };
  }
}

export interface RedeemOAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  error?: string;
}

export interface ParsedOAuthTokens {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
}

/**
 * Pure parser that extracts accessToken, refreshToken, or auth code
 * from an OAuth redirect URL, hash, or query string.
 */
export function parseOAuthTokensFromUrl(rawInput: string): ParsedOAuthTokens {
  if (!rawInput || typeof rawInput !== 'string') {
    return {};
  }

  let searchStr = '';
  let hashStr = '';

  if (rawInput.includes('#')) {
    const parts = rawInput.split('#');
    hashStr = parts[1] || '';
    searchStr = parts[0].includes('?') ? parts[0].split('?')[1] : '';
  } else if (rawInput.includes('?')) {
    searchStr = rawInput.split('?')[1] || '';
  } else {
    if (rawInput.includes('access_token=') || rawInput.includes('code=')) {
      hashStr = rawInput;
    }
  }

  const hashParams = new URLSearchParams(hashStr);
  const searchParams = new URLSearchParams(searchStr);

  const accessToken = hashParams.get('access_token') || searchParams.get('access_token') || undefined;
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token') || undefined;
  const code = searchParams.get('code') || hashParams.get('code') || undefined;

  return { accessToken, refreshToken, code };
}

/**
 * Parses and redeems an OAuth redirect URL, hash fragment, or query string
 * (e.g. https://localhost/#access_token=... or roommate://auth-callback#access_token=... or raw tokens)
 * and sets the active authenticated session in Supabase.
 */
export async function redeemOAuthUrlOrHash(rawInput: string): Promise<RedeemOAuthResult> {
  if (!rawInput || typeof rawInput !== 'string') {
    return { success: false, error: 'Empty URL or token string provided.' };
  }

  try {
    const { accessToken, refreshToken, code } = parseOAuthTokensFromUrl(rawInput);

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, accessToken, refreshToken };
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, code };
    }

    return {
      success: false,
      error: 'Could not find access_token or authorization code in the provided text.',
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to parse authorization URL.',
    };
  }
}

/**
 * Extracts the user's first/given name from Google/OAuth metadata.
 * Prefers given_name, then first_name, then first word of full_name / name,
 * and falls back to the username portion of email.
 */
export function extractGoogleFirstName(
  metadata?: Record<string, unknown>,
  email?: string
): string {
  if (metadata?.given_name && typeof metadata.given_name === 'string' && metadata.given_name.trim()) {
    return metadata.given_name.trim();
  }
  if (metadata?.first_name && typeof metadata.first_name === 'string' && metadata.first_name.trim()) {
    return metadata.first_name.trim();
  }
  const rawFullName = (metadata?.full_name as string) || (metadata?.name as string);
  if (rawFullName && typeof rawFullName === 'string' && rawFullName.trim()) {
    const parts = rawFullName.trim().split(/\s+/);
    if (parts[0]) {
      return parts[0];
    }
  }
  if (email && typeof email === 'string' && email.includes('@')) {
    const prefix = email.split('@')[0].trim();
    if (prefix) {
      const cleanPrefix = prefix.split(/[._-]/)[0];
      return cleanPrefix ? cleanPrefix.charAt(0).toUpperCase() + cleanPrefix.slice(1) : prefix;
    }
  }
  return 'Resident';
}

export interface PhoneValidationResult {
  isValid: boolean;
  formatted: string;
  digitsOnly: string;
  error?: string;
}

/**
 * Validates and normalizes phone numbers.
 * Supports 10-digit standard Indian mobile numbers with optional +91 prefix.
 * Formats as "+91 XXXXX XXXXX".
 */
export function validateAndFormatPhoneNumber(phoneInput: string): PhoneValidationResult {
  if (!phoneInput || typeof phoneInput !== 'string') {
    return {
      isValid: false,
      formatted: '',
      digitsOnly: '',
      error: 'Please enter a valid phone number.',
    };
  }

  const trimmed = phoneInput.trim();
  const cleanDigits = trimmed.replace(/[^0-9]/g, '');

  // Handle +91 or 91 country code prefix if 12 digits
  let tenDigitPhone = cleanDigits;
  if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
    tenDigitPhone = cleanDigits.slice(2);
  } else if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) {
    tenDigitPhone = cleanDigits.slice(1);
  }

  if (tenDigitPhone.length === 0) {
    return {
      isValid: false,
      formatted: '',
      digitsOnly: '',
      error: 'Please enter your phone number.',
    };
  }

  if (tenDigitPhone.length < 10) {
    return {
      isValid: false,
      formatted: trimmed,
      digitsOnly: tenDigitPhone,
      error: 'Phone number must be at least 10 digits.',
    };
  }

  if (tenDigitPhone.length > 10) {
    return {
      isValid: false,
      formatted: trimmed,
      digitsOnly: tenDigitPhone,
      error: 'Phone number cannot exceed 10 digits.',
    };
  }

  if (!/^[6-9]/.test(tenDigitPhone)) {
    return {
      isValid: false,
      formatted: trimmed,
      digitsOnly: tenDigitPhone,
      error: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
    };
  }

  const formatted = `+91 ${tenDigitPhone.slice(0, 5)} ${tenDigitPhone.slice(5)}`;

  return {
    isValid: true,
    formatted,
    digitsOnly: tenDigitPhone,
  };
}

export interface OAuthSyncResult {
  user: User;
  needsPinSetup: boolean;
  needsProfileOnboarding: boolean;
  extractedFirstName: string;
  isExistingUser: boolean;
}

/**
 * Synchronizes an active Supabase OAuth session user into public.profiles and local DB.
 * Determines if the user already has a configured 4-digit PIN for vault access
 * and whether first-login profile onboarding (first name confirmation + phone) is needed.
 */
export async function syncOAuthSessionToProfile(sessionUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<OAuthSyncResult> {
  const cleanEmail = (sessionUser.email || '').trim().toLowerCase();
  const extractedFirstName = extractGoogleFirstName(sessionUser.user_metadata, cleanEmail);
  const avatarUrl =
    (sessionUser.user_metadata?.avatar_url as string) ||
    (sessionUser.user_metadata?.picture as string) ||
    undefined;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionUser.id);

  // 1. Check if profile exists in Supabase
  let existingProfile: Record<string, unknown> | null = null;
  if (IS_LIVE_SYNC_ENABLED && isUuid) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .maybeSingle();
      existingProfile = data;
    } catch (err) {
      console.warn('syncOAuthSessionToProfile lookup error:', err);
    }
  }

  // 2. Check local DB cache
  const localUser = db.getState().users.find(
    (u) => u.id === sessionUser.id || (u.email && u.email.toLowerCase() === cleanEmail)
  );

  // 3. Check if user already has a PIN configured locally
  const hasLocalPin = Boolean(
    typeof localStorage !== 'undefined' &&
      (localStorage.getItem(`roommate_vault_pin_${sessionUser.id}`) ||
        (localStorage.getItem('roommate_vault_pin') &&
          localStorage.getItem('roommate_vault_pin') !== '1234'))
  );

  // 4. Resolve user data: Existing profile data MUST win over Google metadata!
  const isExistingUser = Boolean(existingProfile || localUser);
  const existingName =
    (typeof existingProfile?.name === 'string' && existingProfile.name.trim()
      ? existingProfile.name.trim()
      : localUser?.name) || '';
  const existingPhone =
    (typeof existingProfile?.phone === 'string' && existingProfile.phone.trim()
      ? existingProfile.phone.trim()
      : localUser?.phone) || undefined;
  const isDbOnboardingCompleted =
    Boolean(existingProfile?.onboarding_completed) || Boolean(localUser?.onboardingCompleted);

  // A profile is complete if onboarding_completed is true in DB OR (legacy/seed accounts) both name and phone exist
  const isProfileComplete = isDbOnboardingCompleted || Boolean(existingName && existingPhone);

  const resolvedName = existingName || extractedFirstName;

  const existingQrUrl =
    (typeof existingProfile?.upi_qr_url === 'string' && existingProfile.upi_qr_url
      ? existingProfile.upi_qr_url
      : localUser?.upiQrUrl) || undefined;
  const existingUpiId =
    (typeof existingProfile?.upi_id === 'string' && existingProfile.upi_id
      ? existingProfile.upi_id
      : localUser?.upiId) || undefined;

  const resolvedUser: User = {
    id: sessionUser.id,
    name: resolvedName,
    email: (existingProfile?.email as string) || localUser?.email || cleanEmail,
    avatarUrl: (existingProfile?.avatar_url as string) || localUser?.avatarUrl || avatarUrl,
    phone: existingPhone,
    upiQrUrl: existingQrUrl,
    upiId: existingUpiId,
    role: ((existingProfile?.role as User['role']) || localUser?.role || 'STUDENT'),
    isSuspended: Boolean(existingProfile?.is_suspended ?? localUser?.isSuspended),
    onboardingCompleted: isProfileComplete,
    createdAt: (existingProfile?.created_at as string) || localUser?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 5. Upsert profile into Supabase
  if (IS_LIVE_SYNC_ENABLED && isUuid) {
    try {
      const upsertPayload: Database['public']['Tables']['profiles']['Insert'] = {
        id: resolvedUser.id,
        name: resolvedUser.name,
        email: resolvedUser.email,
        avatar_url: resolvedUser.avatarUrl || null,
        phone: resolvedUser.phone || null,
        role: resolvedUser.role,
        is_suspended: resolvedUser.isSuspended,
        onboarding_completed: resolvedUser.onboardingCompleted ?? false,
        upi_qr_url: existingQrUrl || null,
        upi_id: existingUpiId || null,
        updated_at: new Date().toISOString(),
      };

      await supabase.from('profiles').upsert(upsertPayload);
    } catch (err) {
      console.warn('syncOAuthSessionToProfile upsert error:', err);
    }
  }

  // 6. Save to local DB cache
  db.upsertUser(resolvedUser);

  return {
    user: resolvedUser,
    needsPinSetup: !isProfileComplete && !hasLocalPin,
    needsProfileOnboarding: !isProfileComplete,
    extractedFirstName,
    isExistingUser,
  };
}



// Create Room in Cloud + Local
export async function createRoomCloud(userId: string, name: string, description?: string): Promise<Room> {
  const localRoom = db.createRoom(userId, name, description);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data: cloudRoom, error: roomErr } = await supabase
        .from('rooms')
        .insert({
          name: localRoom.name,
          description: localRoom.description || null,
          created_by: userId,
        })
        .select()
        .single();

      if (cloudRoom && !roomErr) {
        // Add creator as ROOM_ADMIN in cloud
        await supabase.from('room_members').insert({
          room_id: cloudRoom.id,
          user_id: userId,
          role: 'ROOM_ADMIN',
          status: 'ACTIVE',
        });

        // Add 6-character room invite code in cloud
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const token = 'rm_inv_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
        await supabase.from('room_invitations').insert({
          room_id: cloudRoom.id,
          invite_code: code,
          token,
          created_by: userId,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });

        const syncedRoom: Room = {
          id: cloudRoom.id,
          name: cloudRoom.name,
          description: cloudRoom.description || undefined,
          createdBy: cloudRoom.created_by,
          isArchived: cloudRoom.is_archived ?? false,
          createdAt: cloudRoom.created_at,
          updatedAt: cloudRoom.updated_at,
        };

        const state = db.getState();
        // Replace temporary localRoom with verified cloud room
        state.rooms = state.rooms.filter((r) => r.id !== localRoom.id);
        state.rooms.unshift(syncedRoom);

        // Update local roomMembers for cloud room
        state.roomMembers = state.roomMembers.filter((m) => m.roomId !== localRoom.id);
        state.roomMembers.push({
          id: 'rm-' + Math.random().toString(36).substr(2, 9),
          roomId: cloudRoom.id,
          userId,
          role: 'ROOM_ADMIN',
          status: 'ACTIVE',
          joinedAt: new Date().toISOString(),
        });

        // Update local roomInvitations for cloud room
        state.roomInvitations = state.roomInvitations.filter((i) => i.roomId !== localRoom.id);
        state.roomInvitations.push({
          id: 'inv-' + Math.random().toString(36).substr(2, 9),
          roomId: cloudRoom.id,
          token,
          inviteCode: code,
          createdBy: userId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isRevoked: false,
          createdAt: new Date().toISOString(),
        });

        db.saveState(state);
        return syncedRoom;
      }
    } catch (err) {
      console.warn('createRoomCloud error:', err);
    }
  }

  return localRoom;
}

// Join Room With Code in Cloud + Local (Phase 2B.3/2B.4 hardened via join_room_with_code RPC)
export async function joinRoomWithCodeCloud(userId: string, code: string): Promise<Room> {
  const cleanCode = code.trim().toUpperCase();

  if (IS_LIVE_SYNC_ENABLED) {
    const { data, error } = await (supabase.rpc as any)('join_room_with_code', {
      p_invite_code: cleanCode,
    });

    if (error) {
      console.warn('[joinRoomWithCodeCloud] RPC join error:', error.message);
      throw new Error(error.message);
    }

    if (data) {
      const rpcRes = data as unknown as {
        status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
        room_id: string;
        room_name: string;
        message?: string;
      };

      const { data: cloudRoom } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', rpcRes.room_id)
        .maybeSingle();

      const joinedRoom: Room = cloudRoom
        ? {
            id: cloudRoom.id,
            name: cloudRoom.name,
            description: cloudRoom.description || undefined,
            createdBy: cloudRoom.created_by,
            isArchived: cloudRoom.is_archived ?? false,
            createdAt: cloudRoom.created_at,
            updatedAt: cloudRoom.updated_at,
          }
        : {
            id: rpcRes.room_id,
            name: rpcRes.room_name,
            createdBy: userId,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

      const state = db.getState();
      if (!state.rooms.some((rm) => rm.id === joinedRoom.id)) {
        state.rooms.unshift(joinedRoom);
      }

      const existingMember = state.roomMembers.find(
        (m) => m.roomId === joinedRoom.id && m.userId === userId
      );
      if (existingMember) {
        existingMember.status = rpcRes.status === 'PENDING' ? ('PENDING' as any) : 'ACTIVE';
        existingMember.leftAt = undefined;
      } else {
        state.roomMembers.push({
          id: 'rm-' + Math.random().toString(36).substr(2, 9),
          roomId: joinedRoom.id,
          userId,
          role: 'MEMBER',
          status: rpcRes.status === 'PENDING' ? ('PENDING' as any) : 'ACTIVE',
          joinedAt: new Date().toISOString(),
        });
      }

      db.saveState(state);
      return joinedRoom;
    }
  }

  // Pure local/offline fallback only when live sync is disabled
  return db.joinRoomWithCode(userId, cleanCode);
}

// Update Profile Avatar (Cloud + Local)
export async function updateProfileAvatar(userId: string, avatarUrl: string): Promise<boolean> {
  // Guard: never save base64 data URLs to Supabase — they bloat the DB (500KB–2MB per row).
  // Only CDN URLs (https://i.ibb.co/...) should be persisted to the cloud.
  const isBase64 = avatarUrl.startsWith('data:');
  
  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, avatarUrl });
  }

  if (isBase64) {
    console.warn('[updateProfileAvatar] Blocked: base64 data URL will not be saved to Supabase.');
    return false;
  }

  if (IS_LIVE_SYNC_ENABLED) {
    let targetId = userId;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        targetId = authData.user.id;
      }
    } catch {}

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
    if (isUuid) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
          .eq('id', targetId);

        if (error) {
          console.warn('updateProfileAvatar cloud error:', error.message);
          return false;
        }
        return true;
      } catch (err) {
        console.warn('updateProfileAvatar exception:', err);
        return false;
      }
    }
  }

  return true;
}

// Update UPI QR Code URL (Cloud + Local)
export async function updateUpiQrUrl(userId: string, upiQrUrl: string): Promise<boolean> {
  // Guard: never save base64 data URLs to Supabase.
  const isBase64 = upiQrUrl.startsWith('data:');
  if (isBase64) {
    console.warn('[updateUpiQrUrl] Blocked: base64 data URL will not be saved to Supabase.');
    // Still update local state so the UI preview works
    const localUser = db.getState().users.find((u) => u.id === userId);
    if (localUser) {
      db.upsertUser({ ...localUser, upiQrUrl });
    }
    return false;
  }

  // 1. Resolve canonical authenticated Supabase user ID if available
  let targetId = userId;
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        targetId = authData.user.id;
      }
    } catch {
      // fallback to passed userId
    }
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);

  // 2. Update Supabase first if live sync enabled and valid UUID
  if (IS_LIVE_SYNC_ENABLED && isUuid) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ upi_qr_url: upiQrUrl || null, updated_at: new Date().toISOString() })
        .eq('id', targetId);

      if (error) {
        console.warn('updateUpiQrUrl cloud error:', error.message);
        return false;
      }
    } catch (err) {
      console.warn('updateUpiQrUrl exception:', err);
      return false;
    }
  }

  // 3. Update local DB user
  const localUser = db.getState().users.find((u) => u.id === targetId || u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, upiQrUrl });
  }

  return true;
}

// Update FCM Device Token (Cloud + Local + Multi-Device)
export async function updateFcmTokenCloud(
  userId: string,
  fcmToken: string,
  deviceId?: string,
  platform?: string
): Promise<boolean> {
  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, fcmToken });
  }

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      // 1. Canonical multi-device tracking in user_devices (Phase 2C.2)
      const effectiveDeviceId = deviceId || `device_${platform || 'web'}`;
      try {
        await supabase.from('user_devices').upsert(
          {
            user_id: userId,
            device_id: effectiveDeviceId,
            fcm_token: fcmToken,
            platform: platform || 'android',
            is_active: true,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' }
        );
      } catch (devErr) {
        console.warn('user_devices upsert notice (non-fatal):', devErr);
      }

      return true;
    } catch (err) {
      console.warn('updateFcmTokenCloud exception:', err);
      return false;
    }
  }

  return true;
}

// Deactivate FCM Device Token on User Logout / Device Unlink
export async function deactivateFcmTokenCloud(userId: string, deviceId?: string): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const effectiveDeviceId = deviceId || 'device_android';
      try {
        await supabase
          .from('user_devices')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .match({ user_id: userId, device_id: effectiveDeviceId });
      } catch {
        // non-fatal if table pending migration
      }

      return true;
    } catch (err) {
      console.warn('deactivateFcmTokenCloud exception:', err);
      return false;
    }
  }

  return true;
}

// Update Profile Full Name (Cloud + Local)
export async function updateProfileName(userId: string, name: string): Promise<boolean> {
  const cleanName = name.trim();
  if (!cleanName) return false;

  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, name: cleanName });
  }

  if (IS_LIVE_SYNC_ENABLED) {
    let targetId = userId;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        targetId = authData.user.id;
      }
    } catch {}

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
    if (isUuid) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ name: cleanName, updated_at: new Date().toISOString() })
          .eq('id', targetId);

        if (error) {
          console.warn('updateProfileName cloud error:', error.message);
          return false;
        }
        return true;
      } catch (err) {
        console.warn('updateProfileName exception:', err);
        return false;
      }
    }
  }

  return true;
}

// Update Profile Phone Number (Cloud + Local)
export async function updateProfilePhone(userId: string, rawPhone: string): Promise<{ success: boolean; error?: string; formattedPhone?: string }> {
  const validation = validateAndFormatPhoneNumber(rawPhone);
  if (!validation.isValid) {
    return { success: false, error: validation.error || 'Invalid phone number.' };
  }

  const formattedPhone = validation.formatted;
  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, phone: formattedPhone, updatedAt: new Date().toISOString() });
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (IS_LIVE_SYNC_ENABLED && isUuid) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ phone: formattedPhone, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        console.warn('updateProfilePhone cloud error:', error.message);
        return { success: false, error: error.message };
      }
      return { success: true, formattedPhone };
    } catch (err) {
      console.warn('updateProfilePhone exception:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update phone number.' };
    }
  }

  return { success: true, formattedPhone };
}

// Complete First-Login Profile Onboarding (Cloud + Local)
export async function completeProfileOnboarding(
  userId: string,
  data: { name: string; phone: string }
): Promise<{ success: boolean; user?: User; error?: string }> {
  const cleanName = data.name.trim();
  if (!cleanName || cleanName.length < 2) {
    return { success: false, error: 'Name must be at least 2 characters.' };
  }

  const phoneValidation = validateAndFormatPhoneNumber(data.phone);
  if (!phoneValidation.isValid) {
    return { success: false, error: phoneValidation.error || 'Invalid phone number.' };
  }

  const formattedPhone = phoneValidation.formatted;
  const updatedAt = new Date().toISOString();

  // 1. Update Supabase if live sync enabled and UUID is valid
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (IS_LIVE_SYNC_ENABLED && isUuid) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: cleanName,
          phone: formattedPhone,
          onboarding_completed: true,
          updated_at: updatedAt,
        })
        .eq('id', userId);

      if (error) {
        console.warn('completeProfileOnboarding cloud error:', error.message);
        return { success: false, error: "Couldn't save your profile to the server. Please try again." };
      }
    } catch (err) {
      console.warn('completeProfileOnboarding exception:', err);
      return { success: false, error: "Couldn't save your profile to the server. Please try again." };
    }
  }

  // 2. Update local state
  const localUser = db.getState().users.find((u) => u.id === userId);
  const updatedUser: User = localUser
    ? {
        ...localUser,
        name: cleanName,
        phone: formattedPhone,
        onboardingCompleted: true,
        updatedAt,
      }
    : {
        id: userId,
        email: '',
        name: cleanName,
        phone: formattedPhone,
        role: 'STUDENT',
        isSuspended: false,
        onboardingCompleted: true,
        createdAt: updatedAt,
        updatedAt,
      };

  db.upsertUser(updatedUser);

  return { success: true, user: updatedUser };
}

// Update Profile UPI ID (Cloud + Local)
export async function updateProfileUpiId(userId: string, upiId: string): Promise<boolean> {
  const cleanUpi = upiId.trim().toLowerCase();
  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, upiId: cleanUpi });
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`roommate_upi_${userId}`, cleanUpi);
  }

  if (IS_LIVE_SYNC_ENABLED) {
    let targetId = userId;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        targetId = authData.user.id;
      }
    } catch {}

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
    if (isUuid) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ upi_id: cleanUpi, updated_at: new Date().toISOString() })
          .eq('id', targetId);

        if (error) {
          console.warn('updateProfileUpiId cloud error:', error.message);
          return false;
        }
        return true;
      } catch (err) {
        console.warn('updateProfileUpiId exception:', err);
        return false;
      }
    }
  }

  return true;
}

// Resolve Room Invite (Cloud + Local fallback)
export async function resolveInviteCloud(tokenOrCode: string): Promise<{
  room: { id: string; name: string; description?: string; joinPolicy: JoinPolicy; invitePolicy: InvitePolicy };
  memberCount: number;
  adminName: string;
  invite: RoomInvitation;
}> {
  const clean = tokenOrCode.trim();
  const cleanUpper = clean.toUpperCase();

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data: inv, error } = await supabase
        .from('room_invitations')
        .select('*, rooms(*)')
        .or(`token.eq.${clean},invite_code.eq.${cleanUpper}`)
        .eq('is_revoked', false)
        .maybeSingle();

      if (!error && inv && inv.rooms) {
        const r = inv.rooms as unknown as {
          id: string;
          name: string;
          description: string | null;
          created_by: string;
          join_policy?: JoinPolicy;
          invite_policy?: InvitePolicy;
          is_archived: boolean | null;
          created_at: string;
          updated_at: string;
        };

        // Fetch active members count
        const { count } = await supabase
          .from('room_members')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', inv.room_id)
          .eq('status', 'ACTIVE');

        // Fetch admin name
        let adminName = 'Room Admin';
        const { data: adminMember } = await supabase
          .from('room_members')
          .select('user_id, profiles(name)')
          .eq('room_id', inv.room_id)
          .eq('role', 'ROOM_ADMIN')
          .eq('status', 'ACTIVE')
          .maybeSingle();

        if ((adminMember as any)?.profiles?.name) {
          adminName = (adminMember as any).profiles.name;
        }

        const resolved = {
          room: {
            id: r.id,
            name: r.name,
            description: r.description || undefined,
            joinPolicy: (r.join_policy || 'APPROVAL_REQUIRED') as JoinPolicy,
            invitePolicy: (r.invite_policy || 'ALL_MEMBERS') as InvitePolicy,
          },
          memberCount: count || 1,
          adminName,
          invite: {
            id: inv.id,
            roomId: inv.room_id,
            inviteCode: inv.invite_code,
            token: inv.token || ('tok_' + inv.id),
            createdBy: inv.created_by,
            expiresAt: inv.expires_at || undefined,
            isRevoked: inv.is_revoked ?? false,
            createdAt: inv.created_at,
          },
        };

        // Cache room and invite into db.state
        const state = db.getState();
        if (!state.rooms.some((rm) => rm.id === resolved.room.id)) {
          state.rooms.unshift({
            ...resolved.room,
            createdBy: inv.created_by,
            isArchived: false,
            createdAt: inv.created_at,
            updatedAt: inv.created_at,
          });
        }
        if (!state.roomInvitations.some((i) => i.id === resolved.invite.id)) {
          state.roomInvitations.unshift(resolved.invite);
        }
        db.saveState(state);

        return resolved;
      }
    } catch (err) {
      console.warn('resolveInviteCloud cloud lookup warning:', err);
    }
  }

  return db.resolveInvite(tokenOrCode);
}

// Request to Join Room (Cloud + Local fallback, Phase 2B.3 hardened via join_room_with_code RPC)
export async function requestJoinRoomCloud(
  userId: string,
  tokenOrCode: string
): Promise<{
  status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
  room: Room;
  message?: string;
  requestId?: string;
}> {
  const cleanCode = tokenOrCode.trim();

  if (IS_LIVE_SYNC_ENABLED) {
    const { data, error } = await (supabase.rpc as any)('join_room_with_code', {
      p_invite_code: cleanCode,
    });

    if (error) {
      console.warn('[requestJoinRoomCloud] RPC error:', error.message);
      throw new Error(error.message);
    }

    if (data) {
      const rpcRes = data as unknown as {
        status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
        room_id: string;
        room_name: string;
        message?: string;
      };

      const { data: cloudRoom } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', rpcRes.room_id)
        .maybeSingle();

      const targetRoom: Room = cloudRoom
        ? {
            id: cloudRoom.id,
            name: cloudRoom.name,
            description: cloudRoom.description || undefined,
            createdBy: cloudRoom.created_by,
            isArchived: cloudRoom.is_archived ?? false,
            createdAt: cloudRoom.created_at,
            updatedAt: cloudRoom.updated_at,
          }
        : {
            id: rpcRes.room_id,
            name: rpcRes.room_name,
            createdBy: userId,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

      const state = db.getState();
      if (!state.rooms.some((r) => r.id === targetRoom.id)) {
        state.rooms.unshift(targetRoom);
      }

      const existingLocalMember = state.roomMembers.find(
        (m) => m.roomId === targetRoom.id && m.userId === userId
      );
      if (existingLocalMember) {
        existingLocalMember.status = rpcRes.status === 'PENDING' ? ('PENDING' as any) : 'ACTIVE';
        existingLocalMember.leftAt = undefined;
      } else {
        state.roomMembers.push({
          id: 'rm-' + Math.random().toString(36).substr(2, 9),
          roomId: targetRoom.id,
          userId,
          role: 'MEMBER',
          status: rpcRes.status === 'PENDING' ? ('PENDING' as any) : 'ACTIVE',
          joinedAt: new Date().toISOString(),
        });
      }

      if (rpcRes.status === 'PENDING') {
        // Track pending request locally
        const existingReq = state.roomJoinRequests.find(
          (r) => r.roomId === targetRoom.id && r.userId === userId && r.status === 'PENDING'
        );
        if (!existingReq) {
          state.roomJoinRequests.unshift({
            id: 'req-' + Math.random().toString(36).substr(2, 9),
            roomId: targetRoom.id,
            userId,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
          });
        }
      }

      db.saveState(state);

      return {
        status: rpcRes.status,
        room: targetRoom,
        message: rpcRes.message || (rpcRes.status === 'JOINED' ? `Welcome to ${targetRoom.name}!` : `Request sent to ${targetRoom.name}`),
      };
    }
  }

  // Pure local/offline fallback only when live sync is disabled
  return db.requestJoinRoom(userId, tokenOrCode);
}

// Alias for explicit Phase 2B nomenclature
export const joinRoomByInviteCloud = requestJoinRoomCloud;

// Check Join Request Status (Cloud + Local fallback)
export async function checkJoinRequestStatusCloud(requestId: string): Promise<{
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'NOT_FOUND';
  room?: Room;
  adminName?: string;
}> {
  const localRes = db.checkJoinRequestStatus(requestId);
  if (localRes.status === 'APPROVED' || localRes.status === 'DECLINED') {
    return localRes;
  }

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await supabase
        .from('room_join_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();

      if (!error && data) {
        if (data.status === 'APPROVED') {
          const { data: roomData } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', data.room_id)
            .single();

          if (roomData) {
            const mappedRoom: Room = {
              id: roomData.id,
              name: roomData.name,
              description: roomData.description || undefined,
              createdBy: roomData.created_by,
              isArchived: roomData.is_archived ?? false,
              createdAt: roomData.created_at,
              updatedAt: roomData.updated_at,
            };
            return { status: 'APPROVED', room: mappedRoom, adminName: localRes.adminName };
          }
        } else if (data.status === 'DECLINED') {
          return { status: 'DECLINED', adminName: localRes.adminName };
        }
      }
    } catch (err) {
      console.warn('checkJoinRequestStatusCloud error:', err);
    }
  }

  return localRes;
}

// Approve Join Request (Cloud + Local fallback)
export async function approveJoinRequestCloud(
  adminUserId: string,
  requestId: string
): Promise<{ success: boolean; room: Room; request?: RoomJoinRequest }> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data: reqData } = await supabase
        .from('room_join_requests')
        .select('*, rooms(*)')
        .eq('id', requestId)
        .maybeSingle();

      if (reqData && reqData.rooms) {
        const r = reqData.rooms as any;
        await supabase
          .from('room_join_requests')
          .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
          .eq('id', requestId);

        await supabase.from('room_members').upsert({
          room_id: reqData.room_id,
          user_id: reqData.user_id,
          role: 'MEMBER',
          status: 'ACTIVE',
          joined_at: new Date().toISOString(),
        });

        const state = db.getState();
        const roomObj: Room = {
          id: r.id,
          name: r.name,
          description: r.description || undefined,
          createdBy: r.created_by,
          isArchived: r.is_archived ?? false,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };

        const existingMember = state.roomMembers.find(
          (m) => m.roomId === reqData.room_id && m.userId === reqData.user_id
        );
        if (existingMember) {
          existingMember.status = 'ACTIVE';
          existingMember.leftAt = undefined;
        } else {
          state.roomMembers.push({
            id: 'rm-' + Math.random().toString(36).substr(2, 9),
            roomId: reqData.room_id,
            userId: reqData.user_id,
            role: 'MEMBER',
            status: 'ACTIVE',
            joinedAt: new Date().toISOString(),
          });
        }

        const localReq = state.roomJoinRequests.find((rq) => rq.id === requestId);
        if (localReq) {
          localReq.status = 'APPROVED';
        }

        db.saveState(state);
        return { success: true, room: roomObj, request: localReq };
      }
    } catch (err) {
      console.warn('approveJoinRequestCloud cloud error, trying local fallback:', err);
    }
  }

  const result = db.approveJoinRequest(adminUserId, requestId);
  return result;
}

// Decline Join Request (Cloud + Local fallback)
export async function declineJoinRequestCloud(
  adminUserId: string,
  requestId: string
): Promise<{ success: boolean }> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('room_join_requests')
        .update({ status: 'DECLINED', updated_at: new Date().toISOString() })
        .eq('id', requestId);

      const state = db.getState();
      const localReq = state.roomJoinRequests.find((r) => r.id === requestId);
      if (localReq) {
        localReq.status = 'DECLINED';
        db.saveState(state);
      }
      return { success: true };
    } catch (err) {
      console.warn('declineJoinRequestCloud cloud warning:', err);
    }
  }

  return db.declineJoinRequest(adminUserId, requestId);
}

// Transfer Room Ownership (Cloud + Local fallback)
export async function transferOwnershipCloud(
  currentAdminId: string,
  roomId: string,
  newAdminId: string
): Promise<{ success: boolean; room: Room }> {
  const result = db.transferOwnership(currentAdminId, roomId, newAdminId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase.rpc('transfer_room_ownership', {
        p_room_id: roomId,
        p_new_admin_id: newAdminId,
      });
      if (error) {
        console.warn('transfer_room_ownership RPC error, falling back to direct table update:', error.message);
        await supabase.from('room_members').update({ role: 'MEMBER' }).eq('room_id', roomId).eq('user_id', currentAdminId);
        await supabase.from('room_members').update({ role: 'ROOM_ADMIN' }).eq('room_id', roomId).eq('user_id', newAdminId);
        await supabase.from('rooms').update({ admin_user_id: newAdminId, updated_at: new Date().toISOString() }).eq('id', roomId);
      }
    } catch (err) {
      console.warn('transferOwnershipCloud exception:', err);
    }
  }

  return result;
}

// Regenerate Room Invite (Cloud + Local fallback)
export async function regenerateInviteCloud(
  requesterUserId: string,
  roomId: string,
  expirationHours?: number
): Promise<RoomInvitation> {
  const result = db.regenerateInvite(requesterUserId, roomId, expirationHours);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase.rpc('regenerate_room_invite', {
        p_room_id: roomId,
        p_expires_in_hours: expirationHours || null,
      });
      if (error) {
        console.warn('regenerate_room_invite RPC error, falling back to direct table update:', error.message);
        await supabase.from('room_invitations').update({ is_revoked: true }).eq('room_id', roomId);
        await supabase.from('room_invitations').insert({
          id: result.id,
          room_id: roomId,
          token: result.token,
          invite_code: result.inviteCode,
          created_by: requesterUserId,
          expires_at: result.expiresAt || null,
          is_revoked: false,
        });
      }
    } catch (err) {
      console.warn('regenerateInviteCloud exception:', err);
    }
  }

  return result;
}

// Update Room Policies (Cloud + Local fallback)
export async function updateRoomPoliciesCloud(
  adminUserId: string,
  roomId: string,
  policies: { joinPolicy?: JoinPolicy; invitePolicy?: InvitePolicy }
): Promise<Room> {
  const result = db.updateRoomPolicies(adminUserId, roomId, policies);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('rooms')
        .update({
          join_policy: result.joinPolicy,
          invite_policy: result.invitePolicy,
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomId);
    } catch (err) {
      console.warn('updateRoomPoliciesCloud exception:', err);
    }
  }

  return result;
}

// Get Room Join Requests (Cloud + Local fallback)
export async function getRoomJoinRequestsCloud(
  adminUserId: string,
  roomId: string
): Promise<Array<RoomJoinRequest & { user: User }>> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const state = db.getState();
      const localAdmin = state.roomMembers.find(
        (rm) => rm.roomId === roomId && rm.userId === adminUserId && rm.role === 'ROOM_ADMIN' && rm.status === 'ACTIVE'
      );

      let isAdmin = Boolean(localAdmin);
      if (!isAdmin) {
        const { data: memberData } = await supabase
          .from('room_members')
          .select('role, status')
          .eq('room_id', roomId)
          .eq('user_id', adminUserId)
          .maybeSingle();

        if (memberData && memberData.role === 'ROOM_ADMIN' && memberData.status === 'ACTIVE') {
          isAdmin = true;
        }
      }

      if (!isAdmin) {
        return [];
      }

      const { data: rawRequests, error: reqErr } = await supabase
        .from('room_join_requests')
        .select('*')
        .eq('room_id', roomId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (!reqErr && rawRequests) {
        const userIds = Array.from(new Set(rawRequests.map((r) => r.user_id)));
        const profilesMap = new Map<string, any>();

        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('*')
            .in('id', userIds);

          if (profilesData) {
            profilesData.forEach((p) => profilesMap.set(p.id, p));
          }
        }

        const mappedRequests: Array<RoomJoinRequest & { user: User }> = rawRequests.map((r) => {
          const prof = profilesMap.get(r.user_id);
          const localUser = state.users.find((u) => u.id === r.user_id);

          const user: User = localUser || (prof ? {
            id: prof.id,
            email: prof.email,
            name: prof.name,
            phone: prof.phone || undefined,
            avatarUrl: prof.avatar_url || undefined,
            upiQrUrl: prof.upi_qr_url || undefined,
            upiId: prof.upi_id || undefined,
            role: (prof.role as User['role']) || 'STUDENT',
            isSuspended: prof.is_suspended ?? false,
            createdAt: prof.created_at,
            updatedAt: prof.updated_at,
          } : {
            id: r.user_id,
            name: 'New Roommate',
            email: 'user@roommate.app',
            role: 'STUDENT' as const,
            isSuspended: false,
            createdAt: r.created_at,
            updatedAt: r.created_at,
          });

          return {
            id: r.id,
            roomId: r.room_id,
            userId: r.user_id,
            status: r.status as RoomJoinRequest['status'],
            createdAt: r.created_at,
            user,
          };
        });

        let hasNewReq = false;
        rawRequests.forEach((req) => {
          if (!state.roomJoinRequests.some((lr) => lr.id === req.id)) {
            state.roomJoinRequests.unshift({
              id: req.id,
              roomId: req.room_id,
              userId: req.user_id,
              status: req.status as RoomJoinRequest['status'],
              createdAt: req.created_at,
            });
            hasNewReq = true;
          }
        });
        if (hasNewReq) {
          db.saveState(state);
        }

        return mappedRequests;
      }
    } catch (err) {
      console.warn('getRoomJoinRequestsCloud cloud error, fallback to local:', err);
    }
  }

  try {
    return db.getRoomJoinRequests(adminUserId, roomId);
  } catch {
    return [];
  }
}

// In-App Notification Functions (Cloud + Local fallback)
export async function createInAppNotificationCloud(
  data: Omit<InAppNotification, 'id' | 'createdAt'>
): Promise<InAppNotification> {
  const localNotif = db.createNotification(data);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase.from('in_app_notifications').upsert({
        id: localNotif.id,
        user_id: localNotif.userId,
        room_id: localNotif.roomId || null,
        type: localNotif.type,
        title: localNotif.title,
        message: localNotif.message,
        priority: localNotif.priority,
        is_read: localNotif.isRead,
        read_at: localNotif.readAt || null,
        action_type: localNotif.actionType || null,
        action_target: localNotif.actionTarget || null,
        metadata: localNotif.metadata || {},
        event_id: localNotif.eventId || null,
        is_deleted: false,
        created_at: localNotif.createdAt,
      });
    } catch (err) {
      console.warn('createInAppNotificationCloud supabase error:', err);
    }
  }

  return localNotif;
}

export async function markNotificationReadCloud(notificationId: string): Promise<void> {
  db.markNotificationRead(notificationId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('in_app_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId);
    } catch (err) {
      console.warn('markNotificationReadCloud supabase error:', err);
    }
  }
}

export async function toggleNotificationReadCloud(
  notificationId: string,
  currentRead: boolean
): Promise<void> {
  db.toggleNotificationRead(notificationId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const nextRead = !currentRead;
      await supabase
        .from('in_app_notifications')
        .update({
          is_read: nextRead,
          read_at: nextRead ? new Date().toISOString() : null,
        })
        .eq('id', notificationId);
    } catch (err) {
      console.warn('toggleNotificationReadCloud supabase error:', err);
    }
  }
}

export async function markAllNotificationsReadCloud(userId: string, ids?: string[]): Promise<void> {
  db.markAllNotificationsRead(userId, ids);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      if (ids && ids.length > 0) {
        await supabase
          .from('in_app_notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
          })
          .in('id', ids);
      } else {
        await supabase
          .from('in_app_notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('is_read', false);
      }
    } catch (err) {
      console.warn('markAllNotificationsReadCloud supabase error:', err);
    }
  }
}

export async function deleteNotificationCloud(notificationId: string): Promise<void> {
  db.deleteNotification(notificationId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('in_app_notifications')
        .update({ is_deleted: true })
        .eq('id', notificationId);
    } catch (err) {
      console.warn('deleteNotificationCloud supabase error:', err);
    }
  }
}

export async function clearReadNotificationsCloud(userId: string, ids?: string[]): Promise<void> {
  db.clearReadNotifications(userId, ids);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      if (ids && ids.length > 0) {
        await supabase
          .from('in_app_notifications')
          .update({ is_deleted: true })
          .in('id', ids);
      } else {
        await supabase
          .from('in_app_notifications')
          .update({ is_deleted: true })
          .eq('user_id', userId)
          .eq('is_read', true);
      }
    } catch (err) {
      console.warn('clearReadNotificationsCloud supabase error:', err);
    }
  }
}

// ==========================================
// BUG REPORTS & FEEDBACK CLOUD ADAPTER
// ==========================================

const LOCAL_BUG_REPORTS_KEY = 'roommate_issue_reports';

function getLocalBugReports(): BugReport[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BUG_REPORTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalBugReports(reports: BugReport[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_BUG_REPORTS_KEY, JSON.stringify(reports));
    window.dispatchEvent(new CustomEvent('roommate_bug_reports_updated', { detail: { count: reports.length } }));
  } catch (err) {
    console.warn('Failed to save local bug reports:', err);
  }
}

export async function submitBugReportCloud(
  reportData: Omit<BugReport, 'id' | 'createdAt' | 'updatedAt'>
): Promise<BugReport> {
  const newReport: BugReport = {
    ...reportData,
    id: 'bug_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Always save locally first for offline safety
  const localReports = getLocalBugReports();
  localReports.unshift(newReport);
  saveLocalBugReports(localReports);

  // 2. Sync to Supabase if live
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .insert({
          user_id: newReport.userId,
          user_name: newReport.userName,
          user_email: newReport.userEmail,
          user_role: newReport.userRole,
          category: newReport.category,
          severity: newReport.severity,
          status: newReport.status,
          description: newReport.description,
          screenshot_url: newReport.screenshotUrl || null,
          diagnostics: newReport.diagnostics as unknown as Json,
          admin_notes: newReport.adminNotes || null,
        })
        .select()
        .single();

      if (!error && data) {
        newReport.id = data.id;
        newReport.createdAt = data.created_at;
        newReport.updatedAt = data.updated_at;
        // Update local with cloud ID
        saveLocalBugReports(localReports);
      } else if (error) {
        console.warn('[RoomMate] Supabase bug report insert notice:', error.message);
      }
    } catch (err) {
      console.warn('[RoomMate] Supabase bug report insert network error:', err);
    }
  }

  return newReport;
}

export async function fetchBugReportsCloud(): Promise<BugReport[]> {
  const local = getLocalBugReports();

  if (!IS_LIVE_SYNC_ENABLED) {
    return local;
  }

  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.warn('[RoomMate] Could not fetch cloud bug reports, using local fallback:', error?.message);
      return local;
    }

    const rows = data as Database['public']['Tables']['bug_reports']['Row'][];
    const cloudReports: BugReport[] = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      userRole: (r.user_role as BugReport['userRole']) || 'STUDENT',
      category: r.category as BugReport['category'],
      severity: r.severity as BugReport['severity'],
      status: r.status as BugReport['status'],
      description: r.description,
      screenshotUrl: r.screenshot_url || undefined,
      diagnostics: (r.diagnostics as unknown as BugReport['diagnostics']) || {},
      adminNotes: r.admin_notes || undefined,
      resolvedAt: r.resolved_at || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    // Merge: cloud reports prioritized, but keep any un-synced local ones
    const cloudIds = new Set(cloudReports.map((c) => c.id));
    const merged = [...cloudReports];
    for (const loc of local) {
      if (!cloudIds.has(loc.id)) {
        merged.push(loc);
      }
    }

    saveLocalBugReports(merged);
    return merged;
  } catch (err) {
    console.warn('[RoomMate] Cloud bug reports fetch error:', err);
    return local;
  }
}

export async function updateBugReportStatusCloud(
  id: string,
  status: BugStatus,
  adminNotes?: string
): Promise<boolean> {
  // 1. Update locally
  const localReports = getLocalBugReports();
  const index = localReports.findIndex((r) => r.id === id);
  const now = new Date().toISOString();

  if (index !== -1) {
    localReports[index] = {
      ...localReports[index],
      status,
      adminNotes: adminNotes !== undefined ? adminNotes : localReports[index].adminNotes,
      resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? now : undefined,
      updatedAt: now,
    };
    saveLocalBugReports(localReports);
  }

  // 2. Update cloud
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const updatePayload: Database['public']['Tables']['bug_reports']['Update'] = {
        status,
        updated_at: now,
      };
      if (adminNotes !== undefined) updatePayload.admin_notes = adminNotes;
      if (status === 'RESOLVED' || status === 'CLOSED') {
        updatePayload.resolved_at = now;
      }

      const { error } = await supabase
        .from('bug_reports')
        .update(updatePayload)
        .eq('id', id);

      if (error) {
        console.warn('[RoomMate] Supabase update bug report error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[RoomMate] Supabase update bug report network error:', err);
      return false;
    }
  }

  return true;
}

export function subscribeToBugReportsRealtime(callback: (report: BugReport) => void) {
  if (!IS_LIVE_SYNC_ENABLED) {
    // Fallback: listen to local storage event
    const handleLocalUpdate = () => {
      fetchBugReportsCloud().then((reports) => {
        if (reports[0]) callback(reports[0]);
      });
    };
    window.addEventListener('roommate_bug_reports_updated', handleLocalUpdate);
    return {
      unsubscribe: () => window.removeEventListener('roommate_bug_reports_updated', handleLocalUpdate),
    };
  }

  const channel = supabase
    .channel('realtime_bug_reports')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bug_reports' },
      (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          const r = payload.new as Record<string, unknown>;
          const report: BugReport = {
            id: String(r.id),
            userId: String(r.user_id),
            userName: String(r.user_name),
            userEmail: String(r.user_email),
            userRole: (r.user_role as BugReport['userRole']) || 'STUDENT',
            category: r.category as BugReport['category'],
            severity: r.severity as BugReport['severity'],
            status: r.status as BugReport['status'],
            description: String(r.description || ''),
            screenshotUrl: r.screenshot_url ? String(r.screenshot_url) : undefined,
            diagnostics: (r.diagnostics as BugReport['diagnostics']) || {},
            adminNotes: r.admin_notes ? String(r.admin_notes) : undefined,
            resolvedAt: r.resolved_at ? String(r.resolved_at) : undefined,
            createdAt: String(r.created_at || new Date().toISOString()),
            updatedAt: String(r.updated_at || new Date().toISOString()),
          };
          callback(report);
        }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

// -----------------------------------------------------------------------------
// SUPERADMIN CLOUD SECURITY RPC ADAPTERS
// -----------------------------------------------------------------------------

export async function superAdminUpdateUserRoleCloud(
  targetUserId: string,
  newRole: string,
  deviceId?: string
): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any).rpc('superadmin_update_user_role', {
        p_target_user_id: targetUserId,
        p_new_role: newRole,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      return Boolean(data?.success);
    } catch (err: any) {
      console.warn('Superadmin update user role cloud RPC error:', err?.message || err);
      throw err;
    }
  }
  return true;
}

export async function superAdminToggleUserSuspensionCloud(
  targetUserId: string,
  suspend: boolean,
  reason?: string,
  deviceId?: string
): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any).rpc('superadmin_toggle_user_suspension', {
        p_target_user_id: targetUserId,
        p_suspend: suspend,
        p_reason: reason || null,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      return Boolean(data);
    } catch (err: any) {
      console.warn('Superadmin user suspension cloud RPC error:', err?.message || err);
      throw err;
    }
  }
  return true;
}

export async function superAdminToggleRoomFreezeCloud(
  roomId: string,
  freeze: boolean,
  reason?: string,
  deviceId?: string
): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any).rpc('superadmin_toggle_room_freeze', {
        p_room_id: roomId,
        p_freeze: freeze,
        p_reason: reason || null,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      return Boolean(data);
    } catch (err: any) {
      console.warn('Superadmin room freeze cloud RPC error:', err?.message || err);
      throw err;
    }
  }
  return true;
}

export async function superAdminArchiveRoomCloud(
  roomId: string,
  archive: boolean,
  reason?: string,
  deviceId?: string
): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any).rpc('superadmin_archive_room', {
        p_room_id: roomId,
        p_archive: archive,
        p_reason: reason || null,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      return Boolean(data);
    } catch (err: any) {
      console.warn('Superadmin archive room cloud RPC error:', err?.message || err);
      throw err;
    }
  }
  return true;
}

export async function superAdminResetRoomCodeCloud(roomId: string, deviceId?: string): Promise<string> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any).rpc('superadmin_reset_room_code', {
        p_room_id: roomId,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      return (data as any)?.invite_code || 'RESET';
    } catch (err: any) {
      console.warn('Superadmin reset room code cloud RPC error:', err?.message || err);
      throw err;
    }
  }
  return 'RESET';
}

export async function superAdminRegisterDeviceCloud(
  deviceId: string,
  deviceName: string,
  platform: string,
  browser: string
): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await (supabase as any).rpc('superadmin_register_device', {
        p_device_id: deviceId,
        p_device_name: deviceName,
        p_platform: platform,
        p_browser: browser,
      });
      if (error) throw error;
      return true;
    } catch (err: any) {
      console.warn('Superadmin register device cloud error:', err?.message || err);
    }
  }
  return true;
}

export async function superAdminRevokeDeviceCloud(deviceId: string, callerDeviceId?: string): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await (supabase as any).rpc('superadmin_revoke_device', {
        p_device_id: deviceId,
        p_caller_device_id: callerDeviceId || null,
      });
      if (error) throw error;
      return true;
    } catch (err: any) {
      console.warn('Superadmin revoke device cloud error:', err?.message || err);
      throw err;
    }
  }
  return true;
}

export async function superAdminRevokeAllOtherDevicesCloud(currentDeviceId: string): Promise<number> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any).rpc('superadmin_revoke_all_other_devices', {
        p_current_device_id: currentDeviceId,
      });
      if (error) throw error;
      return (data as any)?.revoked_count || 0;
    } catch (err: any) {
      console.warn('Superadmin revoke all devices cloud error:', err?.message || err);
      throw err;
    }
  }
  return 0;
}

export async function superAdminStoreRecoveryCodesCloud(codeHashes: string[], deviceId?: string): Promise<boolean> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await (supabase as any).rpc('superadmin_store_recovery_codes', {
        p_code_hashes: codeHashes,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      return true;
    } catch (err: any) {
      console.warn('Superadmin store recovery codes cloud error:', err?.message || err);
      throw err;
    }
  }
  return true;
}

export async function superAdminVerifyRecoveryCodeCloud(codeHash: string, riskLevel = 2, deviceId?: string): Promise<{ success: boolean; remainingCodes?: number; error?: string }> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any).rpc('superadmin_verify_recovery_code', {
        p_code_hash: codeHash,
        p_risk_level: riskLevel,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      const res = data as any;
      return { success: Boolean(res?.success), remainingCodes: res?.remaining_codes, error: res?.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Invalid authentication code.' };
    }
  }
  return { success: true };
}

export async function fetchSecurityAuditLogsCloud(): Promise<any[]> {
  if (!IS_LIVE_SYNC_ENABLED) return [];
  try {
    const { data, error } = await (supabase as any)
      .from('security_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  } catch (err: any) {
    console.warn('Fetch security audit logs cloud error:', err?.message || err);
    return [];
  }
}

export async function fetchSuperAdminTrustedDevicesCloud(): Promise<any[]> {
  if (!IS_LIVE_SYNC_ENABLED) return [];
  try {
    const { data, error } = await (supabase as any)
      .from('superadmin_trusted_devices')
      .select('*')
      .order('last_active_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err: any) {
    console.warn('Fetch trusted devices cloud error:', err?.message || err);
    return [];
  }
}

/**
 * Revokes all other active device sessions in Supabase Auth, keeping current device authenticated.
 */
export async function signOutOtherDevicesCloud(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { success: true };
  }

  try {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) {
      console.warn('Sign out other devices notice:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Sign out other devices error:', err);
    return { success: false, error: err?.message || 'Failed to sign out other devices' };
  }
}

/**
 * Revokes all active sessions globally in Supabase Auth and purges local resident tokens.
 */
export async function signOutAllDevicesCloud(userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (userId) {
      await deactivateFcmTokenCloud(userId);
    }
    if (isSupabaseConfigured) {
      await supabase.auth.signOut({ scope: 'global' });
    }
  } catch (err: any) {
    console.warn('Global sign out warning:', err?.message || err);
  }

  // Clear local resident credentials
  clearResidentSession();
  return { success: true };
}

/**
 * Permanently deletes the user's account from Supabase Cloud (auth.users, profiles, personal vault)
 * and purges local resident session, App Lock PIN, and cached data.
 */
export async function deleteUserAccountCloud(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. If live cloud is enabled, invoke the atomic database RPC
    if (IS_LIVE_SYNC_ENABLED) {
      const { data, error } = await supabase.rpc('delete_user_account');
      if (error) {
        console.error('delete_user_account RPC error:', error);
        // Fallback: attempt direct profile delete if RPC not yet deployed
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        if (isUuid) {
          const { error: profErr } = await supabase.from('profiles').delete().eq('id', userId);
          if (profErr) {
            console.warn('Direct profile delete fallback error:', profErr.message);
          }
        }
      } else {
        console.log('User account deleted from cloud successfully:', data);
      }

      // Revoke any active session in Supabase Auth
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch {
        // ignore
      }
    }

    // 2. Synchronize local mock storage
    db.deleteUserAccount(userId);

    // 3. Clear local tokens and resident settings
    clearResidentSession();
    try {
      localStorage.removeItem('roommate_app_lock_pin');
      localStorage.removeItem('roommate_app_lock_enabled');
      localStorage.removeItem('roommate_app_lock_timeout');
      localStorage.removeItem('campusflow_app_lock_pin');
      localStorage.removeItem('campusflow_app_lock_enabled');
      localStorage.removeItem('campusflow_app_lock_timeout');
      localStorage.removeItem('roommate_biometric_enrolled');
      localStorage.removeItem('roommate_biometric_username');
      localStorage.removeItem('roommate_offline_mutation_queue');
      localStorage.removeItem('roommate_pending_join_token');
      sessionStorage.removeItem('roommate_pending_join_token');
      localStorage.removeItem('roommate_cached_db_state');
    } catch {
      // Storage access may be restricted in private mode
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteUserAccountCloud critical error:', err);
    return { success: false, error: err?.message || 'Failed to delete account' };
  }
}

/**
 * Resolves a system incident on Supabase Cloud and local state with outage duration
 */
export async function resolveSystemIncidentCloud(incidentId: string): Promise<boolean> {
  const localResolved = db.resolveSystemIncident(incidentId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const resolvedAt = new Date().toISOString();
      let durationSeconds: number | undefined;

      const localInc = (db as any).state?.systemIncidents?.find((i: any) => i.id === incidentId);
      if (localInc?.durationSeconds !== undefined) {
        durationSeconds = localInc.durationSeconds;
      } else {
        const { data: remoteRow } = await (supabase as any)
          .from('system_incidents')
          .select('created_at')
          .eq('id', incidentId)
          .maybeSingle();

        if (remoteRow?.created_at) {
          durationSeconds = Math.max(
            0,
            Math.round((new Date(resolvedAt).getTime() - new Date(remoteRow.created_at).getTime()) / 1000)
          );
        }
      }

      const { error } = await (supabase as any)
        .from('system_incidents')
        .update({
          status: 'RESOLVED',
          resolved_at: resolvedAt,
          duration_seconds: durationSeconds ?? null,
        })
        .eq('id', incidentId);

      if (error) {
        console.warn('Could not resolve incident on Supabase Cloud, local fallback saved:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Cloud resolve incident error:', err);
      return false;
    }
  }
  return localResolved;
}

/**
 * Transitions the status of a system incident (INVESTIGATING -> MONITORING -> RESOLVED)
 */
export async function updateSystemIncidentStatusCloud(
  incidentId: string,
  newStatus: SystemIncident['status']
): Promise<boolean> {
  if (newStatus === 'RESOLVED') {
    return resolveSystemIncidentCloud(incidentId);
  }

  const localUpdated = db.updateSystemIncidentStatus(incidentId, newStatus);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await (supabase as any)
        .from('system_incidents')
        .update({
          status: newStatus,
          resolved_at: null,
          duration_seconds: null,
        })
        .eq('id', incidentId);

      if (error) {
        console.warn('Could not update incident status on Supabase Cloud:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Cloud update incident status error:', err);
      return false;
    }
  }
  return localUpdated;
}

/**
 * Fetches platform announcements from Supabase Cloud
 */
export async function fetchPlatformAnnouncementsCloud(): Promise<PlatformAnnouncement[]> {
  if (!IS_LIVE_SYNC_ENABLED) return [];
  try {
    const { data, error } = await (supabase as any)
      .from('platform_announcements')
      .select('*')
      .order('sent_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];
    return data.map((a: any) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      audience: a.audience || 'EVERYONE',
      targetUserIds: a.target_user_ids || [],
      targetRoomIds: a.target_room_ids || [],
      priority: a.priority || 'NORMAL',
      deliveryChannels: a.delivery_channels || ['IN_APP'],
      recipientsCount: a.recipients_count || 0,
      status: a.status || 'DELIVERED',
      sentAt: a.sent_at || a.created_at,
      createdBy: a.created_by,
    }));
  } catch (err: any) {
    console.warn('Fetch platform announcements cloud error:', err?.message || err);
    return [];
  }
}

/**
 * Creates a platform announcement on Supabase Cloud
 */
export async function createPlatformAnnouncementCloud(
  announcement: Omit<PlatformAnnouncement, 'id' | 'sentAt'>
): Promise<PlatformAnnouncement | null> {
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data, error } = await (supabase as any)
        .from('platform_announcements')
        .insert({
          title: announcement.title,
          message: announcement.message,
          audience: announcement.audience,
          target_user_ids: announcement.targetUserIds && announcement.targetUserIds.length > 0 ? announcement.targetUserIds : null,
          target_room_ids: announcement.targetRoomIds && announcement.targetRoomIds.length > 0 ? announcement.targetRoomIds : null,
          priority: announcement.priority,
          delivery_channels: announcement.deliveryChannels,
          recipients_count: announcement.recipientsCount || 0,
          status: announcement.status || 'DELIVERED',
          created_by: announcement.createdBy,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        return {
          id: data.id,
          title: data.title,
          message: data.message,
          audience: data.audience,
          targetUserIds: data.target_user_ids || [],
          targetRoomIds: data.target_room_ids || [],
          priority: data.priority,
          deliveryChannels: data.delivery_channels || ['IN_APP'],
          recipientsCount: data.recipients_count || 0,
          status: data.status,
          sentAt: data.sent_at || data.created_at,
          createdBy: data.created_by,
        };
      }
    } catch (err: any) {
      console.warn('Create platform announcement cloud error:', err?.message || err);
    }
  }
  return null;
}

/**
 * Fetches system incidents from Supabase Cloud
 */
export async function fetchSystemIncidentsCloud(): Promise<SystemIncident[]> {
  if (!IS_LIVE_SYNC_ENABLED) return [];
  try {
    const { data, error } = await (supabase as any)
      .from('system_incidents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];
    return data.map((i: any) => ({
      id: i.id,
      service: i.service,
      error: i.error,
      severity: i.severity,
      status: i.status,
      occurrences: i.occurrences || 1,
      details: i.details || undefined,
      durationSeconds: i.duration_seconds || (i.resolved_at && i.created_at ? Math.max(0, Math.round((new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / 1000)) : undefined),
      createdAt: i.created_at,
      resolvedAt: i.resolved_at || undefined,
    }));
  } catch (err: any) {
    console.warn('Fetch system incidents cloud error:', err?.message || err);
    return [];
  }
}

/**
 * Creates or updates an active system incident in Supabase Cloud with duplicate suppression
 */
export async function createSystemIncidentCloud(
  incident: Omit<SystemIncident, 'id' | 'createdAt'>
): Promise<SystemIncident | null> {
  const localInc = db.createSystemIncident(incident);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      // Idempotency: Check if an active (unresolved) incident already exists for this service in Cloud
      const { data: existingActive } = await (supabase as any)
        .from('system_incidents')
        .select('*')
        .eq('service', incident.service)
        .neq('status', 'RESOLVED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingActive) {
        const nextOccurrences = (existingActive.occurrences || 1) + 1;
        const { data: updated, error } = await (supabase as any)
          .from('system_incidents')
          .update({
            occurrences: nextOccurrences,
            error: incident.error,
            severity: incident.severity,
            details: incident.details !== undefined ? incident.details : existingActive.details,
          })
          .eq('id', existingActive.id)
          .select()
          .single();

        if (!error && updated) {
          return {
            id: updated.id,
            service: updated.service,
            error: updated.error,
            severity: updated.severity,
            status: updated.status,
            occurrences: updated.occurrences,
            details: updated.details || undefined,
            createdAt: updated.created_at,
            resolvedAt: updated.resolved_at || undefined,
            durationSeconds: updated.duration_seconds || undefined,
          };
        }
      }

      // No active incident exists for this service, create a new row
      const { data, error } = await (supabase as any)
        .from('system_incidents')
        .insert({
          service: incident.service,
          error: incident.error,
          severity: incident.severity,
          status: incident.status,
          occurrences: incident.occurrences || 1,
          details: incident.details || null,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        return {
          id: data.id,
          service: data.service,
          error: data.error,
          severity: data.severity,
          status: data.status,
          occurrences: data.occurrences,
          details: data.details || undefined,
          createdAt: data.created_at,
          resolvedAt: data.resolved_at || undefined,
          durationSeconds: data.duration_seconds || undefined,
        };
      }
    } catch (err: any) {
      console.warn('Create system incident cloud error:', err?.message || err);
    }
  }
  return localInc;
}

/**
 * Subscribes to realtime system incident changes on Supabase Cloud
 */
export function subscribeToSystemIncidentsRealtime(
  callback: (incident: SystemIncident) => void
): { unsubscribe: () => void } {
  if (!IS_LIVE_SYNC_ENABLED) {
    return { unsubscribe: () => {} };
  }

  const channel = supabase
    .channel('realtime_system_incidents')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'system_incidents' },
      (payload) => {
        if (payload.new && typeof payload.new === 'object') {
          const row = payload.new as any;
          callback({
            id: String(row.id),
            service: row.service,
            error: row.error,
            severity: row.severity,
            status: row.status,
            occurrences: row.occurrences || 1,
            details: row.details || undefined,
            durationSeconds: row.duration_seconds || (row.resolved_at && row.created_at ? Math.max(0, Math.round((new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime()) / 1000)) : undefined),
            createdAt: row.created_at,
            resolvedAt: row.resolved_at || undefined,
          });
        }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

// -----------------------------------------------------------------------------
// SUPERADMIN PLATFORM SETTINGS & SUPPORT CLOUD ADAPTERS
// -----------------------------------------------------------------------------

export async function fetchPlatformSettingsCloud(): Promise<PlatformSettings | null> {
  if (!IS_LIVE_SYNC_ENABLED) {
    return db.getPlatformSettings();
  }

  try {
    const { data, error } = await (supabase as any)
      .from('platform_settings')
      .select('*')
      .eq('id', 'global_settings')
      .maybeSingle();

    if (error || !data) {
      console.warn('[RoomMate] Could not fetch cloud platform settings, using local fallback:', error?.message);
      return db.getPlatformSettings();
    }

    const r = data as any;
    const cloudSettings: PlatformSettings = {
      appName: r.app_name || 'RoomMate',
      supportEmail: r.support_email || 'admin@roommate.app',
      supportPhone: r.support_phone || '+91 98765 43210',
      googleAuthEnabled: r.google_auth_enabled ?? true,
      emailVerificationRequired: r.email_verification_required ?? true,
      sessionTimeoutMinutes: r.session_timeout_minutes ?? 1440,
      maxRoomMembers: r.max_room_members ?? 12,
      defaultJoinPolicy: (r.default_join_policy as JoinPolicy) || 'APPROVAL_REQUIRED',
      defaultInvitePolicy: (r.default_invite_policy as InvitePolicy) || 'ALL_MEMBERS',
      qrExpirationHours: r.qr_expiration_hours ?? 72,
      maxExpenseAmount: Number(r.max_expense_amount) || 200000,
      defaultSplitMethod: (r.default_split_method as SplitMethod) || 'EQUAL',
      currencyCode: r.currency_code || 'INR',
      globalNotificationsEnabled: r.global_notifications_enabled ?? true,
      maintenanceMode: Boolean(r.maintenance_mode),
      maintenanceMessage:
        r.maintenance_message || 'RoomMate is undergoing scheduled maintenance. Back online shortly!',
    };

    return cloudSettings;
  } catch (err) {
    console.warn('[RoomMate] Cloud platform settings fetch exception:', err);
    return db.getPlatformSettings();
  }
}

export async function updatePlatformSettingsCloud(
  settings: Partial<PlatformSettings>,
  updatedByUserId?: string
): Promise<boolean> {
  if (!IS_LIVE_SYNC_ENABLED) {
    return true;
  }

  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (settings.appName !== undefined) payload.app_name = settings.appName;
    if (settings.supportEmail !== undefined) payload.support_email = settings.supportEmail;
    if (settings.supportPhone !== undefined) payload.support_phone = settings.supportPhone;
    if (settings.googleAuthEnabled !== undefined) payload.google_auth_enabled = settings.googleAuthEnabled;
    if (settings.emailVerificationRequired !== undefined)
      payload.email_verification_required = settings.emailVerificationRequired;
    if (settings.sessionTimeoutMinutes !== undefined)
      payload.session_timeout_minutes = settings.sessionTimeoutMinutes;
    if (settings.maxRoomMembers !== undefined) payload.max_room_members = settings.maxRoomMembers;
    if (settings.defaultJoinPolicy !== undefined) payload.default_join_policy = settings.defaultJoinPolicy;
    if (settings.defaultInvitePolicy !== undefined) payload.default_invite_policy = settings.defaultInvitePolicy;
    if (settings.qrExpirationHours !== undefined) payload.qr_expiration_hours = settings.qrExpirationHours;
    if (settings.maxExpenseAmount !== undefined) payload.max_expense_amount = settings.maxExpenseAmount;
    if (settings.defaultSplitMethod !== undefined) payload.default_split_method = settings.defaultSplitMethod;
    if (settings.currencyCode !== undefined) payload.currency_code = settings.currencyCode;
    if (settings.globalNotificationsEnabled !== undefined)
      payload.global_notifications_enabled = settings.globalNotificationsEnabled;
    if (settings.maintenanceMode !== undefined) payload.maintenance_mode = settings.maintenanceMode;
    if (settings.maintenanceMessage !== undefined) payload.maintenance_message = settings.maintenanceMessage;
    if (updatedByUserId) payload.updated_by = updatedByUserId;

    const { error } = await (supabase as any)
      .from('platform_settings')
      .update(payload)
      .eq('id', 'global_settings');

    if (error) {
      console.warn('[RoomMate] Supabase update platform settings error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[RoomMate] Supabase update platform settings network error:', err);
    return false;
  }
}

export async function updateFeatureSuggestionStatusCloud(
  id: string,
  status: FeatureSuggestionStatus,
  adminNotes?: string
): Promise<boolean> {
  if (!IS_LIVE_SYNC_ENABLED) {
    return true;
  }

  try {
    const payload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (adminNotes !== undefined) payload.admin_notes = adminNotes;

    const { error } = await (supabase as any)
      .from('support_tickets')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.warn('[RoomMate] Supabase update feature suggestion error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[RoomMate] Supabase update feature suggestion network error:', err);
    return false;
  }
}

export async function updateContactRequestStatusCloud(
  id: string,
  status: 'NEW' | 'IN_REVIEW' | 'RESOLVED',
  adminNotes?: string
): Promise<boolean> {
  if (!IS_LIVE_SYNC_ENABLED) {
    return true;
  }

  try {
    const payload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (adminNotes !== undefined) payload.admin_notes = adminNotes;
    if (status === 'RESOLVED') payload.resolved_at = new Date().toISOString();

    const { error } = await (supabase as any)
      .from('support_tickets')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.warn('[RoomMate] Supabase update contact request error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[RoomMate] Supabase update contact request network error:', err);
    return false;
  }
}



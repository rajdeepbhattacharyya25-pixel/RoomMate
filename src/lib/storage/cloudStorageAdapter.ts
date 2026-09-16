import { supabase, isSupabaseConfigured } from '../supabase/client';
import { Database, Json } from '../../types/supabase';
import { db, DatabaseState } from './mockStorage';
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
} from '../../types';
import { enqueueOfflineItem } from './offlineQueue';
import { validateStrict4DigitPin, hashPin, clearResidentSession } from '../auth/jwtService';
import { isNativeApp } from '../platform/deviceDetector';

export const IS_LIVE_SYNC_ENABLED =
  isSupabaseConfigured && import.meta.env.VITE_USE_LIVE_SUPABASE === 'true';

// Helper to authenticate user with Supabase Auth for RLS
export async function authenticateResidentWithSupabase(email: string): Promise<boolean> {
  if (!IS_LIVE_SYNC_ENABLED) return false;

  try {
    const { data: session } = await supabase.auth.getSession();
    if (session?.session?.user?.email?.toLowerCase() === email.toLowerCase()) {
      return true;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: 'CampusFlowPassword2026!',
    });

    if (error) {
      console.warn('Supabase Auth auto-login notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Supabase Auth connection offline:', err);
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

    return {
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
      roomJoinRequests: localState.roomJoinRequests || [],
      auditLogs: localState.auditLogs,
      notifications,
      bugReports: localState.bugReports || [],
      featureSuggestions: localState.featureSuggestions || [],
      contactRequests: localState.contactRequests || [],
      announcements: localState.announcements || [],
      settings: localState.settings,
      systemIncidents: localState.systemIncidents || [],
    };
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

    const code = searchParams.get('code') || hashParams.get('code');
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

  const resolvedUser: User = {
    id: sessionUser.id,
    name: resolvedName,
    email: (existingProfile?.email as string) || localUser?.email || cleanEmail,
    avatarUrl: (existingProfile?.avatar_url as string) || localUser?.avatarUrl || avatarUrl,
    phone: existingPhone,
    role: ((existingProfile?.role as User['role']) || localUser?.role || 'STUDENT'),
    isSuspended: Boolean(existingProfile?.is_suspended ?? localUser?.isSuspended),
    onboardingCompleted: isProfileComplete,
    createdAt: (existingProfile?.created_at as string) || localUser?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 5. Upsert profile into Supabase
  if (IS_LIVE_SYNC_ENABLED && isUuid) {
    try {
      await supabase.from('profiles').upsert({
        id: resolvedUser.id,
        name: resolvedUser.name,
        email: resolvedUser.email,
        avatar_url: resolvedUser.avatarUrl || null,
        phone: resolvedUser.phone || null,
        role: resolvedUser.role,
        is_suspended: resolvedUser.isSuspended,
        onboarding_completed: resolvedUser.onboardingCompleted ?? false,
      });
    } catch (err) {
      console.warn('syncOAuthSessionToProfile upsert error:', err);
    }
  }

  // 5. Save to local DB cache
  db.upsertUser(resolvedUser);

  return {
    user: resolvedUser,
    needsPinSetup: !hasLocalPin,
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
        await supabase.from('room_invitations').insert({
          room_id: cloudRoom.id,
          invite_code: code,
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
        db.getState().rooms.unshift(syncedRoom);
        return syncedRoom;
      }
    } catch (err) {
      console.warn('createRoomCloud error:', err);
    }
  }

  return localRoom;
}

// Join Room With Code in Cloud + Local
export async function joinRoomWithCodeCloud(userId: string, code: string): Promise<Room> {
  const cleanCode = code.trim().toUpperCase();

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { data: invite, error: invErr } = await supabase
        .from('room_invitations')
        .select('*, rooms(*)')
        .eq('invite_code', cleanCode)
        .eq('is_revoked', false)
        .single();

      if (!invErr && invite && invite.rooms) {
        // Add member in Supabase
        await supabase.from('room_members').upsert({
          room_id: invite.room_id,
          user_id: userId,
          role: 'MEMBER',
          status: 'ACTIVE',
        });

        const r = invite.rooms as unknown as {
          id: string;
          name: string;
          description: string | null;
          created_by: string;
          is_archived: boolean | null;
          created_at: string;
          updated_at: string;
        };

        const joinedRoom: Room = {
          id: r.id,
          name: r.name,
          description: r.description || undefined,
          createdBy: r.created_by,
          isArchived: r.is_archived ?? false,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };

        if (!db.getState().rooms.some((rm) => rm.id === joinedRoom.id)) {
          db.getState().rooms.unshift(joinedRoom);
        }
        return joinedRoom;
      }
    } catch (err) {
      console.warn('joinRoomWithCodeCloud fallback to local:', err);
    }
  }

  return db.joinRoomWithCode(userId, cleanCode);
}

// Update Profile Avatar (Cloud + Local)
export async function updateProfileAvatar(userId: string, avatarUrl: string): Promise<boolean> {
  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, avatarUrl });
  }

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('id', userId);

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

  return true;
}

// Update UPI QR Code URL (Cloud + Local)
export async function updateUpiQrUrl(userId: string, upiQrUrl: string): Promise<boolean> {
  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, upiQrUrl });
  }

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ upi_qr_url: upiQrUrl, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        console.warn('updateUpiQrUrl cloud error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('updateUpiQrUrl exception:', err);
      return false;
    }
  }

  return true;
}

// Update FCM Device Token (Cloud + Local)
export async function updateFcmTokenCloud(userId: string, fcmToken: string): Promise<boolean> {
  const localUser = db.getState().users.find((u) => u.id === userId);
  if (localUser) {
    db.upsertUser({ ...localUser, fcmToken });
  }

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ fcm_token: fcmToken, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        console.warn('updateFcmTokenCloud cloud error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('updateFcmTokenCloud exception:', err);
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
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: cleanName, updated_at: new Date().toISOString() })
        .eq('id', userId);

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
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ upi_id: cleanUpi, updated_at: new Date().toISOString() })
        .eq('id', userId);

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

  return true;
}

// Resolve Room Invite (Cloud + Local fallback)
export async function resolveInviteCloud(tokenOrCode: string): Promise<{
  room: { id: string; name: string; description?: string; joinPolicy: JoinPolicy; invitePolicy: InvitePolicy };
  memberCount: number;
  adminName: string;
  invite: RoomInvitation;
}> {
  return db.resolveInvite(tokenOrCode);
}

// Request to Join Room (Cloud + Local fallback)
export async function requestJoinRoomCloud(
  userId: string,
  tokenOrCode: string
): Promise<{
  status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
  room: Room;
  message?: string;
  requestId?: string;
}> {
  const result = db.requestJoinRoom(userId, tokenOrCode);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      if (result.status === 'JOINED') {
        await supabase.from('room_members').upsert({
          room_id: result.room.id,
          user_id: userId,
          role: 'MEMBER',
          status: 'ACTIVE',
        });
      } else if (result.status === 'PENDING') {
        await supabase.from('room_join_requests').upsert({
          id: result.requestId,
          room_id: result.room.id,
          user_id: userId,
          status: 'PENDING',
        });
      }
    } catch (err) {
      console.warn('requestJoinRoomCloud cloud sync warning:', err);
    }
  }

  return result;
}

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
        const status = data.status as 'PENDING' | 'APPROVED' | 'DECLINED';
        if (status === 'APPROVED') {
          const room = db.getState().rooms.find((r) => r.id === data.room_id);
          return { status: 'APPROVED', room, adminName: localRes.adminName };
        } else if (status === 'DECLINED') {
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
  const result = db.approveJoinRequest(adminUserId, requestId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('room_join_requests')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', requestId);

      const targetUserId = db.getState().roomJoinRequests.find((r) => r.id === requestId)?.userId;
      if (targetUserId) {
        await supabase.from('room_members').upsert({
          room_id: result.room.id,
          user_id: targetUserId,
          role: 'MEMBER',
          status: 'ACTIVE',
        });
      }
    } catch (err) {
      console.warn('approveJoinRequestCloud cloud sync warning:', err);
    }
  }

  return result;
}

// Decline Join Request (Cloud + Local fallback)
export async function declineJoinRequestCloud(
  adminUserId: string,
  requestId: string
): Promise<{ success: boolean }> {
  const result = db.declineJoinRequest(adminUserId, requestId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('room_join_requests')
        .update({ status: 'DECLINED', updated_at: new Date().toISOString() })
        .eq('id', requestId);
    } catch (err) {
      console.warn('declineJoinRequestCloud cloud sync warning:', err);
    }
  }

  return result;
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
  return db.getRoomJoinRequests(adminUserId, roomId);
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

export async function markAllNotificationsReadCloud(userId: string): Promise<void> {
  db.markAllNotificationsRead(userId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('in_app_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', false);
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

export async function clearReadNotificationsCloud(userId: string): Promise<void> {
  db.clearReadNotifications(userId);

  if (IS_LIVE_SYNC_ENABLED) {
    try {
      await supabase
        .from('in_app_notifications')
        .update({ is_deleted: true })
        .eq('user_id', userId)
        .eq('is_read', true);
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
export async function signOutAllDevicesCloud(): Promise<{ success: boolean; error?: string }> {
  try {
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
        const { error: profErr } = await supabase.from('profiles').delete().eq('id', userId);
        if (profErr) {
          console.warn('Direct profile delete fallback error:', profErr.message);
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





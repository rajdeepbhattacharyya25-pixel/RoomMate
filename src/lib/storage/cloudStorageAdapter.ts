import { supabase, isSupabaseConfigured } from '../supabase/client';
import { db, DatabaseState } from './mockStorage';
import {
  User,
  Room,
  RoomMember,
  RoomInvitation,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  PersonalExpense,
  SplitMethod,
} from '../../types';

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
      role: p.role as User['role'],
      isSuspended: p.is_suspended ?? false,
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
      createdBy: inv.created_by,
      expiresAt: inv.expires_at,
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
      auditLogs: localState.auditLogs,
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
        console.warn('Cloud insert expense warning:', expError.message);
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
      console.warn('Async cloud expense sync failed, retained locally:', cloudErr);
    }
  }

  return { expense: localExpense, splits: localSplits };
}

// Record Settlement to Cloud + Local
export async function recordSettlementCloud(data: {
  roomId: string;
  payerId: string;
  payeeId: string;
  amount: number;
  paymentMethod: SettlementPayment['paymentMethod'];
  notes?: string;
}): Promise<SettlementPayment> {
  // 1. Write locally
  const localSettlement = db.recordSettlementPayment(data.payerId, data);

  // 2. Mirror to Supabase Cloud
  if (IS_LIVE_SYNC_ENABLED) {
    try {
      const { error } = await supabase.from('settlement_payments').insert({
        room_id: data.roomId,
        payer_id: data.payerId,
        payee_id: data.payeeId,
        amount: data.amount,
        payment_method: data.paymentMethod,
        notes: data.notes || null,
        payment_date: new Date().toISOString().split('T')[0],
      });

      if (error) {
        console.warn('Cloud settlement sync warning:', error.message);
      }
    } catch (err) {
      console.warn('Async settlement cloud sync failed:', err);
    }
  }

  return localSettlement;
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
      await supabase.from('personal_expenses').insert({
        user_id: data.userId,
        title: data.title,
        amount: data.amount,
        category: data.category,
        notes: data.notes || null,
        expense_date: expenseDate,
      });
    } catch (err) {
      console.warn('Async personal expense cloud sync failed:', err);
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

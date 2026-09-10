import { supabase, isSupabaseConfigured } from './client';
import {
  User,
  Room,
  RoomMember,
  RoomInvitation,
  PersonalExpense,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  UserSubscription,
  AuditLog,
} from '../../types';

export class SupabaseService {
  /**
   * Fetch all profiles from Supabase
   */
  async getProfiles(): Promise<User[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) {
      console.warn('[SupabaseService] getProfiles error:', error.message);
      return [];
    }
    return (data || []).map((p) => ({
      id: p.id,
      email: p.email,
      phone: p.phone || undefined,
      name: p.name,
      avatarUrl: p.avatar_url || undefined,
      role: p.role,
      isSuspended: p.is_suspended,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));
  }

  /**
   * Fetch personal expenses for a specific user
   */
  async getPersonalExpenses(userId: string): Promise<PersonalExpense[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('personal_expenses')
      .select('*')
      .eq('user_id', userId)
      .order('expense_date', { ascending: false });

    if (error) {
      console.warn('[SupabaseService] getPersonalExpenses error:', error.message);
      return [];
    }

    return (data || []).map((e) => ({
      id: e.id,
      userId: e.user_id,
      title: e.title,
      amount: Number(e.amount),
      category: e.category,
      notes: e.notes || undefined,
      expenseDate: e.expense_date,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));
  }

  /**
   * Add a personal expense to Supabase
   */
  async addPersonalExpense(expense: Omit<PersonalExpense, 'id' | 'createdAt' | 'updatedAt'>): Promise<PersonalExpense | null> {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from('personal_expenses')
      .insert({
        user_id: expense.userId,
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        notes: expense.notes || null,
        expense_date: expense.expenseDate,
      })
      .select()
      .single();

    if (error) {
      console.error('[SupabaseService] addPersonalExpense error:', error.message);
      throw error;
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      amount: Number(data.amount),
      category: data.category,
      notes: data.notes || undefined,
      expenseDate: data.expense_date,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Delete a personal expense
   */
  async deletePersonalExpense(id: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const { error } = await supabase.from('personal_expenses').delete().eq('id', id);
    if (error) {
      console.error('[SupabaseService] deletePersonalExpense error:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Fetch all rooms for a user
   */
  async getRooms(userId: string): Promise<Room[]> {
    if (!isSupabaseConfigured) return [];
    // Fetch room memberships
    const { data: memberRows, error: memberErr } = await supabase
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    if (memberErr || !memberRows) {
      console.warn('[SupabaseService] getRooms membership error:', memberErr?.message);
      return [];
    }

    const roomIds = memberRows.map((r) => r.room_id);
    if (roomIds.length === 0) return [];

    const { data, error } = await supabase.from('rooms').select('*').in('id', roomIds);
    if (error) {
      console.warn('[SupabaseService] getRooms error:', error.message);
      return [];
    }

    return (data || []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || undefined,
      createdBy: r.created_by,
      isArchived: r.is_archived,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Fetch shared expenses and splits for a room
   */
  async getSharedExpenses(roomId: string): Promise<{ expenses: SharedExpense[]; splits: ExpenseSplit[] }> {
    if (!isSupabaseConfigured) return { expenses: [], splits: [] };
    const { data: expenseRows, error: expErr } = await supabase
      .from('shared_expenses')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_deleted', false)
      .order('expense_date', { ascending: false });

    if (expErr || !expenseRows) {
      console.warn('[SupabaseService] getSharedExpenses error:', expErr?.message);
      return { expenses: [], splits: [] };
    }

    const expenseIds = expenseRows.map((e) => e.id);
    let splits: ExpenseSplit[] = [];
    if (expenseIds.length > 0) {
      const { data: splitRows, error: splitErr } = await supabase
        .from('expense_splits')
        .select('*')
        .in('shared_expense_id', expenseIds);

      if (!splitErr && splitRows) {
        splits = splitRows.map((s) => ({
          id: s.id,
          sharedExpenseId: s.shared_expense_id,
          userId: s.user_id,
          shareAmount: Number(s.share_amount),
          createdAt: s.created_at,
        }));
      }
    }

    const expenses: SharedExpense[] = expenseRows.map((e) => ({
      id: e.id,
      roomId: e.room_id,
      createdBy: e.created_by,
      paidBy: e.paid_by,
      title: e.title,
      totalAmount: Number(e.total_amount),
      category: e.category,
      splitMethod: e.split_method,
      notes: e.notes || undefined,
      expenseDate: e.expense_date,
      isDeleted: e.is_deleted,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));

    return { expenses, splits };
  }

  /**
   * Add a shared expense with its splits to Supabase
   */
  async addSharedExpense(
    expense: Omit<SharedExpense, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>,
    splits: Array<{ userId: string; shareAmount: number }>
  ): Promise<SharedExpense | null> {
    if (!isSupabaseConfigured) return null;

    const { data: expData, error: expErr } = await supabase
      .from('shared_expenses')
      .insert({
        room_id: expense.roomId,
        created_by: expense.createdBy,
        paid_by: expense.paidBy,
        title: expense.title,
        total_amount: expense.totalAmount,
        category: expense.category,
        split_method: expense.splitMethod,
        notes: expense.notes || null,
        expense_date: expense.expenseDate,
      })
      .select()
      .single();

    if (expErr || !expData) {
      console.error('[SupabaseService] addSharedExpense error:', expErr?.message);
      throw expErr;
    }

    if (splits.length > 0) {
      const splitInserts = splits.map((s) => ({
        shared_expense_id: expData.id,
        user_id: s.userId,
        share_amount: s.shareAmount,
      }));

      const { error: splitErr } = await supabase.from('expense_splits').insert(splitInserts);
      if (splitErr) {
        console.error('[SupabaseService] insert splits error:', splitErr.message);
      }
    }

    return {
      id: expData.id,
      roomId: expData.room_id,
      createdBy: expData.created_by,
      paidBy: expData.paid_by,
      title: expData.title,
      totalAmount: Number(expData.total_amount),
      category: expData.category,
      splitMethod: expData.split_method,
      notes: expData.notes || undefined,
      expenseDate: expData.expense_date,
      isDeleted: expData.is_deleted,
      createdAt: expData.created_at,
      updatedAt: expData.updated_at,
    };
  }

  /**
   * Fetch settlements for a room
   */
  async getSettlements(roomId: string): Promise<SettlementPayment[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('settlement_payments')
      .select('*')
      .eq('room_id', roomId)
      .order('payment_date', { ascending: false });

    if (error) {
      console.warn('[SupabaseService] getSettlements error:', error.message);
      return [];
    }

    return (data || []).map((s) => ({
      id: s.id,
      roomId: s.room_id,
      payerId: s.payer_id,
      payeeId: s.payee_id,
      amount: Number(s.amount),
      paymentMethod: s.payment_method,
      transactionRef: s.transaction_ref || undefined,
      notes: s.notes || undefined,
      paymentDate: s.payment_date,
      createdAt: s.created_at,
    }));
  }

  /**
   * Record a settlement in Supabase
   */
  async recordSettlement(
    settlement: Omit<SettlementPayment, 'id' | 'createdAt'>
  ): Promise<SettlementPayment | null> {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from('settlement_payments')
      .insert({
        room_id: settlement.roomId,
        payer_id: settlement.payerId,
        payee_id: settlement.payeeId,
        amount: settlement.amount,
        payment_method: settlement.paymentMethod,
        transaction_ref: settlement.transactionRef || null,
        notes: settlement.notes || null,
        payment_date: settlement.paymentDate,
      })
      .select()
      .single();

    if (error) {
      console.error('[SupabaseService] recordSettlement error:', error.message);
      throw error;
    }

    return {
      id: data.id,
      roomId: data.room_id,
      payerId: data.payer_id,
      payeeId: data.payee_id,
      amount: Number(data.amount),
      paymentMethod: data.payment_method,
      transactionRef: data.transaction_ref || undefined,
      notes: data.notes || undefined,
      paymentDate: data.payment_date,
      createdAt: data.created_at,
    };
  }

  /**
   * Seed / Sync complete local database state to Supabase
   */
  async seedInitialData(state: {
    users: User[];
    rooms: Room[];
    roomMembers: RoomMember[];
    roomInvitations: RoomInvitation[];
    personalExpenses: PersonalExpense[];
    sharedExpenses: SharedExpense[];
    expenseSplits: ExpenseSplit[];
    settlementPayments: SettlementPayment[];
    subscriptions: UserSubscription[];
    auditLogs: AuditLog[];
  }): Promise<{ success: boolean; message: string }> {
    if (!isSupabaseConfigured) {
      return { success: false, message: 'Supabase client is not configured' };
    }

    try {
      // 1. Profiles
      const profileRows = state.users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone || null,
        name: u.name,
        avatar_url: u.avatarUrl || null,
        role: u.role,
        is_suspended: u.isSuspended,
      }));
      await supabase.from('profiles').upsert(profileRows, { onConflict: 'id' });

      // 2. Subscriptions
      const subRows = state.subscriptions.map((s) => ({
        id: s.id,
        user_id: s.userId,
        plan_code: s.planCode,
        plan_name: s.planName,
        price_inr: s.priceInr,
        status: s.status,
        current_period_start: s.currentPeriodStart,
        current_period_end: s.currentPeriodEnd,
        cancel_at_period_end: s.cancelAtPeriodEnd,
      }));
      await supabase.from('user_subscriptions').upsert(subRows, { onConflict: 'id' });

      // 3. Rooms
      const roomRows = state.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || null,
        created_by: r.createdBy,
        is_archived: r.isArchived,
      }));
      await supabase.from('rooms').upsert(roomRows, { onConflict: 'id' });

      // 4. Room Members
      const memberRows = state.roomMembers.map((m) => ({
        id: m.id,
        room_id: m.roomId,
        user_id: m.userId,
        role: m.role,
        status: m.status,
        joined_at: m.joinedAt,
      }));
      await supabase.from('room_members').upsert(memberRows, { onConflict: 'id' });

      // 5. Invitations
      const invRows = state.roomInvitations.map((inv) => ({
        id: inv.id,
        room_id: inv.roomId,
        invite_code: inv.inviteCode,
        created_by: inv.createdBy,
        expires_at: inv.expiresAt,
        is_revoked: inv.isRevoked,
      }));
      await supabase.from('room_invitations').upsert(invRows, { onConflict: 'id' });

      // 6. Personal Expenses
      const personalRows = state.personalExpenses.map((p) => ({
        id: p.id,
        user_id: p.userId,
        title: p.title,
        amount: p.amount,
        category: p.category,
        notes: p.notes || null,
        expense_date: p.expenseDate,
      }));
      await supabase.from('personal_expenses').upsert(personalRows, { onConflict: 'id' });

      // 7. Shared Expenses
      const sharedRows = state.sharedExpenses.map((s) => ({
        id: s.id,
        room_id: s.roomId,
        created_by: s.createdBy,
        paid_by: s.paidBy,
        title: s.title,
        total_amount: s.totalAmount,
        category: s.category,
        split_method: s.splitMethod,
        notes: s.notes || null,
        expense_date: s.expenseDate,
        is_deleted: s.isDeleted,
      }));
      await supabase.from('shared_expenses').upsert(sharedRows, { onConflict: 'id' });

      // 8. Splits
      const splitRows = state.expenseSplits.map((sp) => ({
        id: sp.id,
        shared_expense_id: sp.sharedExpenseId,
        user_id: sp.userId,
        share_amount: sp.shareAmount,
      }));
      await supabase.from('expense_splits').upsert(splitRows, { onConflict: 'id' });

      // 9. Settlements
      const settlementRows = state.settlementPayments.map((st) => ({
        id: st.id,
        room_id: st.roomId,
        payer_id: st.payerId,
        payee_id: st.payeeId,
        amount: st.amount,
        payment_method: st.paymentMethod,
        transaction_ref: st.transactionRef || null,
        notes: st.notes || null,
        payment_date: st.paymentDate,
      }));
      await supabase.from('settlement_payments').upsert(settlementRows, { onConflict: 'id' });

      return { success: true, message: 'All campus flow entities synced to Supabase successfully!' };
    } catch (err: unknown) {
      console.error('[SupabaseService] seedInitialData error:', err);
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Error syncing state to Supabase',
      };
    }
  }

  /**
   * Execute PostgreSQL RPC function to calculate live room balances
   */
  async getRoomBalances(roomId: string): Promise<
    Array<{
      userId: string;
      name: string;
      email: string;
      totalPaid: number;
      totalShare: number;
      settlementsPaid: number;
      settlementsReceived: number;
      netBalance: number;
    }>
  > {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.rpc('get_room_balances', { p_room_id: roomId });
    if (error) {
      console.warn('[SupabaseService] get_room_balances error:', error.message);
      return [];
    }

    return (data || []).map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      totalPaid: Number(row.total_paid),
      totalShare: Number(row.total_share),
      settlementsPaid: Number(row.settlements_paid),
      settlementsReceived: Number(row.settlements_received),
      netBalance: Number(row.net_balance),
    }));
  }

  /**
   * Subscribe to real-time changes on shared expenses and settlements
   */
  subscribeToRoomUpdates(roomId: string, onChange: () => void) {
    if (!isSupabaseConfigured) return () => {};

    const channel = supabase
      .channel(`room-realtime-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_expenses', filter: `room_id=eq.${roomId}` },
        () => onChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settlement_payments', filter: `room_id=eq.${roomId}` },
        () => onChange()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}

export const supabaseService = new SupabaseService();

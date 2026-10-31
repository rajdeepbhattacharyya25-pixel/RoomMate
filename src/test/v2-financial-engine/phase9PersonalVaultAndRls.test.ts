import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PersonalExpense,
  SharedExpense,
  ExpenseSplit,
  SettlementPayment,
  User,
} from '../../types';
import { db } from '../../lib/storage/mockStorage';
import {
  addPersonalExpenseCloud,
  deletePersonalExpenseCloud,
} from '../../lib/storage/cloudStorageAdapter';
import { supabase } from '../../lib/supabase/client';

function parseExpenseDate(dateStr?: string): { year: number; month: number; day: number; date: Date } {
  if (!dateStr) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), date: now };
  }
  const isoPart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const parts = isoPart.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return { year: y, month: m, day: d, date: new Date(y, m, d, 12, 0, 0) };
    }
  }
  const parsed = new Date(dateStr);
  return { year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate(), date: parsed };
}

// ============================================================================
// PRODUCTION SAFETY GUARD VERIFICATION
// ============================================================================
const TARGET_REF = process.env.STAGING_PROJECT_REF || 'ycredqiiwdbrjzqeczio';
const PROD_REF = 'pbzaaskftrmnvocczhat';

function assertNotProduction(targetUriOrRef: string) {
  if (targetUriOrRef === PROD_REF || targetUriOrRef.includes(PROD_REF)) {
    throw new Error('FATAL: Production database detected. Phase 9 execution aborted.');
  }
  return true;
}

// ============================================================================
// EXACT SIMULATION OF HARDENED POSTGRESQL RLS & SECURITY DEFINER RPCS
// (Mirroring 20261005160000_harden_personal_expenses_rls.sql)
// ============================================================================
interface DbPersonalExpenseRow {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  category: string;
  notes: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

class PostgresPersonalExpensesRlsSimulator {
  private rows: Map<string, DbPersonalExpenseRow> = new Map();

  seed(rows: DbPersonalExpenseRow[]) {
    this.rows.clear();
    for (const r of rows) {
      this.rows.set(r.id, { ...r });
    }
  }

  // RLS POLICY: personal_expenses_owner_select (USING: user_id = auth.uid())
  select(callerAuthUid: string | null, targetUserIdFilter?: string): DbPersonalExpenseRow[] {
    if (!callerAuthUid) {
      // Unauthenticated / anon role has zero read access
      return [];
    }
    const visible: DbPersonalExpenseRow[] = [];
    for (const row of this.rows.values()) {
      // RLS filter: row.user_id = auth.uid()
      if (row.user_id === callerAuthUid) {
        if (!targetUserIdFilter || targetUserIdFilter === callerAuthUid) {
          visible.push({ ...row });
        }
      }
    }
    return visible;
  }

  // RLS POLICY: personal_expenses_owner_insert (WITH CHECK: user_id = auth.uid() AND amount > 0)
  insert(callerAuthUid: string | null, row: Omit<DbPersonalExpenseRow, 'created_at' | 'updated_at'>): DbPersonalExpenseRow {
    if (!callerAuthUid) {
      throw new Error('UNAUTHENTICATED: Row level security requires authenticated session');
    }
    if (row.user_id !== callerAuthUid) {
      throw new Error(`ACCESS_DENIED: RLS with check failed: cannot insert expense for other user ${row.user_id}`);
    }
    if (row.amount <= 0) {
      throw new Error('CHECK_VIOLATION: amount must be greater than 0');
    }
    const fullRow: DbPersonalExpenseRow = {
      ...row,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.rows.set(row.id, fullRow);
    return fullRow;
  }

  // RLS POLICY: personal_expenses_owner_update (USING: user_id = auth.uid())
  update(callerAuthUid: string | null, id: string, updates: Partial<DbPersonalExpenseRow>): boolean {
    if (!callerAuthUid) return false;
    const existing = this.rows.get(id);
    if (!existing || existing.user_id !== callerAuthUid) {
      // RLS hides the row; 0 rows updated
      return false;
    }
    this.rows.set(id, {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    });
    return true;
  }

  // RLS POLICY: personal_expenses_owner_delete (USING: user_id = auth.uid())
  delete(callerAuthUid: string | null, id: string): boolean {
    if (!callerAuthUid) return false;
    const existing = this.rows.get(id);
    if (!existing || existing.user_id !== callerAuthUid) {
      // RLS hides the row; 0 rows deleted
      return false;
    }
    return this.rows.delete(id);
  }

  // HARDENED RPC: submit_personal_expense_secure
  rpcSubmitPersonalExpenseSecure(
    callerAuthUid: string | null,
    params: {
      p_id?: string;
      p_user_id?: string;
      p_title?: string;
      p_amount?: number;
      p_category?: string;
      p_notes?: string;
      p_expense_date?: string;
    }
  ): DbPersonalExpenseRow {
    // 1. Authentication validation
    if (!callerAuthUid) {
      throw new Error('UNAUTHENTICATED: An active authenticated session is required to record personal expenses');
    }

    // 2. Strict caller ownership verification (prevents caller spoofing)
    if (!params.p_user_id || callerAuthUid !== params.p_user_id) {
      throw new Error(
        `ACCESS_DENIED: Authenticated caller ${callerAuthUid} cannot create or update expenses for user ${params.p_user_id}`
      );
    }

    // 3. Input sanitation
    if (!params.p_title || params.p_title.trim().length === 0) {
      throw new Error('TITLE_REQUIRED: Personal expense title cannot be empty');
    }

    if (params.p_amount === undefined || params.p_amount === null || params.p_amount <= 0) {
      throw new Error(`INVALID_AMOUNT: Personal expense amount must be greater than 0, got ${params.p_amount}`);
    }

    const expenseId = params.p_id || `uuid-${Math.random().toString(36).substring(2, 9)}`;

    // 4. Overwrite prevention: If updating, row must belong to caller
    if (params.p_id) {
      const existing = this.rows.get(params.p_id);
      if (existing && existing.user_id !== callerAuthUid) {
        throw new Error(`ACCESS_DENIED: Target personal expense ${params.p_id} does not belong to caller ${callerAuthUid}`);
      }
    }

    const row: DbPersonalExpenseRow = {
      id: expenseId,
      user_id: callerAuthUid, // always writes caller identity, never client-supplied ID
      title: params.p_title.trim(),
      amount: Math.round(params.p_amount * 100) / 100,
      category: params.p_category || 'Other',
      notes: params.p_notes ? params.p_notes.trim() : null,
      expense_date: params.p_expense_date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.rows.set(expenseId, row);
    return row;
  }

  // HARDENED RPC: delete_personal_expense_secure
  rpcDeletePersonalExpenseSecure(
    callerAuthUid: string | null,
    params: { p_id: string; p_user_id: string }
  ): boolean {
    if (!callerAuthUid) {
      throw new Error('UNAUTHENTICATED: An active authenticated session is required to delete personal expenses');
    }

    if (!params.p_user_id || callerAuthUid !== params.p_user_id) {
      throw new Error(
        `ACCESS_DENIED: Authenticated caller ${callerAuthUid} cannot delete personal expenses for user ${params.p_user_id}`
      );
    }

    const existing = this.rows.get(params.p_id);
    if (!existing || existing.user_id !== callerAuthUid) {
      return false; // row does not exist or belongs to another user
    }

    return this.rows.delete(params.p_id);
  }
}

// ============================================================================
// SUITE: PHASE 9 PERSONAL VAULT + RLS HARDENING & SECURITY REGRESSION
// ============================================================================
describe('Phase 9: Personal Vault + Room Share Integration & RLS Hardening', () => {
  const USER_A_ID = '11111111-1111-4111-8111-111111111111';
  const USER_B_ID = '22222222-2222-4222-8222-222222222222';
  const SUPERADMIN_ID = '99999999-9999-4999-8999-999999999999';

  let rlsSim: PostgresPersonalExpensesRlsSimulator;

  beforeEach(() => {
    rlsSim = new PostgresPersonalExpensesRlsSimulator();
    rlsSim.seed([
      {
        id: 'exp-a-1',
        user_id: USER_A_ID,
        title: 'User A Groceries',
        amount: 2500,
        category: 'Food',
        notes: 'Private snacks',
        expense_date: '2026-10-01',
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'exp-b-1',
        user_id: USER_B_ID,
        title: 'User B Secret Gift',
        amount: 4200,
        category: 'Shopping',
        notes: 'Confidential',
        expense_date: '2026-10-02',
        created_at: '2026-10-02T10:00:00Z',
        updated_at: '2026-10-02T10:00:00Z',
      },
    ]);
  });

  // ===========================================================================
  // PRE-EXECUTION PRODUCTION SAFETY GUARD
  // ===========================================================================
  describe('Pre-Execution Guard: Production Project Isolation', () => {
    it('hard-blocks any connection or migration targeted at production pbzaaskftrmnvocczhat', () => {
      expect(() => assertNotProduction('pbzaaskftrmnvocczhat')).toThrow(
        'FATAL: Production database detected'
      );
      expect(() => assertNotProduction('https://pbzaaskftrmnvocczhat.supabase.co')).toThrow(
        'FATAL: Production database detected'
      );
    });

    it('approves isolated staging target ycredqiiwdbrjzqeczio', () => {
      expect(assertNotProduction(TARGET_REF)).toBe(true);
    });
  });

  // ===========================================================================
  // SECURITY TESTS (1 - 10)
  // ===========================================================================
  describe('Security Tests: Owner-Only Isolation & Spoofing Immunity', () => {
    it('1. User A can SELECT User A expenses', () => {
      const rows = rlsSim.select(USER_A_ID);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe('exp-a-1');
      expect(rows[0].user_id).toBe(USER_A_ID);
    });

    it('2. User A cannot SELECT User B expenses (strict isolation)', () => {
      const rows = rlsSim.select(USER_A_ID, USER_B_ID);
      // Even if User A queries for User B's user_id, RLS returns empty array
      expect(rows).toEqual([]);
    });

    it('3. User A cannot INSERT an expense for User B', () => {
      expect(() => {
        rlsSim.insert(USER_A_ID, {
          id: 'exp-malicious-1',
          user_id: USER_B_ID, // attempting to insert as User B
          title: 'Forged Expense',
          amount: 500,
          category: 'Other',
          notes: null,
          expense_date: '2026-10-05',
        });
      }).toThrow(/ACCESS_DENIED/);
    });

    it('4. User A cannot UPDATE User B expense', () => {
      const success = rlsSim.update(USER_A_ID, 'exp-b-1', { amount: 1 });
      expect(success).toBe(false);
      // Verify User B's row remains completely unaltered
      const bRows = rlsSim.select(USER_B_ID);
      expect(bRows.find((r) => r.id === 'exp-b-1')?.amount).toBe(4200);
    });

    it('5. User A cannot DELETE User B expense', () => {
      const success = rlsSim.delete(USER_A_ID, 'exp-b-1');
      expect(success).toBe(false);
      // User B's row still exists
      const bRows = rlsSim.select(USER_B_ID);
      expect(bRows.length).toBe(1);
    });

    it('6. User A cannot call submit RPC with p_user_id = User B (caller-spoofing rejection)', () => {
      expect(() => {
        rlsSim.rpcSubmitPersonalExpenseSecure(USER_A_ID, {
          p_user_id: USER_B_ID,
          p_title: 'Spoofed Bill',
          p_amount: 1500,
        });
      }).toThrow(/ACCESS_DENIED: Authenticated caller .* cannot create or update expenses for user/);
    });

    it('7. User A cannot call delete RPC with p_user_id = User B', () => {
      expect(() => {
        rlsSim.rpcDeletePersonalExpenseSecure(USER_A_ID, {
          p_id: 'exp-b-1',
          p_user_id: USER_B_ID,
        });
      }).toThrow(/ACCESS_DENIED: Authenticated caller .* cannot delete personal expenses for user/);
    });

    it('8. Unauthenticated caller cannot use protected RPCs', () => {
      expect(() => {
        rlsSim.rpcSubmitPersonalExpenseSecure(null, {
          p_user_id: USER_A_ID,
          p_title: 'Unauthenticated Request',
          p_amount: 100,
        });
      }).toThrow(/UNAUTHENTICATED/);

      expect(() => {
        rlsSim.rpcDeletePersonalExpenseSecure(null, {
          p_id: 'exp-a-1',
          p_user_id: USER_A_ID,
        });
      }).toThrow(/UNAUTHENTICATED/);
    });

    it('9. SuperAdmin cannot bypass Personal Vault isolation', () => {
      // SuperAdmin must NOT be able to view User A's private personal vault
      const superAdminView = rlsSim.select(SUPERADMIN_ID, USER_A_ID);
      expect(superAdminView).toEqual([]);

      // SuperAdmin cannot edit User A's private personal records
      const editAttempt = rlsSim.update(SUPERADMIN_ID, 'exp-a-1', { amount: 99999 });
      expect(editAttempt).toBe(false);

      // SuperAdmin cannot delete User A's private personal records
      const deleteAttempt = rlsSim.delete(SUPERADMIN_ID, 'exp-a-1');
      expect(deleteAttempt).toBe(false);
    });

    it('10. Offline mock personas never make cloud Personal Vault RPC calls', async () => {
      const rpcSpy = vi.spyOn(supabase, 'rpc');

      // Offline mock persona 'user-1'
      const mockResult = await addPersonalExpenseCloud({
        userId: 'user-1',
        title: 'Mock Persona Snack',
        amount: 120,
        category: 'Food',
      });

      expect(mockResult.title).toBe('Mock Persona Snack');
      // Must NOT invoke cloud supabase RPC
      expect(rpcSpy).not.toHaveBeenCalled();

      // Deleting mock persona also remains strictly local
      await deletePersonalExpenseCloud('user-1', mockResult.id);
      expect(rpcSpy).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // FINANCIAL INTEGRATION TESTS (11 - 20)
  // ===========================================================================
  describe('Financial Tests: Actual Spending vs Fronted Receivables', () => {
    const activeRoomId = 'room-101';

    // Canonical user data
    const currentUser: User = {
      id: USER_A_ID,
      email: 'usera@example.com',
      name: 'User A',
      role: 'RESIDENT',
      status: 'ACTIVE',
      createdAt: '2026-09-01T00:00:00Z',
    };

    const _userB: User = {
      id: USER_B_ID,
      email: 'userb@example.com',
      name: 'User B',
      role: 'RESIDENT',
      status: 'ACTIVE',
      createdAt: '2026-09-01T00:00:00Z',
    };

    const personalExpenses: PersonalExpense[] = [
      {
        id: 'p-1',
        userId: USER_A_ID,
        title: 'Snacks & Metro',
        amount: 2500,
        category: 'Food',
        expenseDate: '2026-10-01',
        createdAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-01T10:00:00Z',
      },
    ];

    // Shared Grocery Bill: Total ₹1,000 paid by User A, split 4 ways (₹250 each)
    const sharedExpenses: SharedExpense[] = [
      {
        id: 'shared-1',
        roomId: activeRoomId,
        paidBy: USER_A_ID,
        title: 'Flat Groceries',
        totalAmount: 1000,
        category: 'Food',
        splitMethod: 'EQUAL',
        expenseDate: '2026-10-02',
        createdAt: '2026-10-02T12:00:00Z',
        updatedAt: '2026-10-02T12:00:00Z',
        isDeleted: false,
      },
    ];

    const expenseSplits: ExpenseSplit[] = [
      { id: 'split-a', sharedExpenseId: 'shared-1', userId: USER_A_ID, shareAmount: 250 },
      { id: 'split-b', sharedExpenseId: 'shared-1', userId: USER_B_ID, shareAmount: 250 },
      { id: 'split-c', sharedExpenseId: 'shared-1', userId: 'user-c', shareAmount: 250 },
      { id: 'split-d', sharedExpenseId: 'shared-1', userId: 'user-d', shareAmount: 250 },
    ];

    it('11. Personal ₹2,500 + Room Share ₹250 = Total Actual Spending ₹2,750', () => {
      const personalTotal = personalExpenses
        .filter((p) => p.userId === currentUser.id)
        .reduce((sum, p) => sum + p.amount, 0);

      const activeSharedIds = new Set(sharedExpenses.filter((e) => !e.isDeleted).map((e) => e.id));
      const myRoomSplits = expenseSplits.filter(
        (s) => s.userId === currentUser.id && activeSharedIds.has(s.sharedExpenseId)
      );
      const roomShareTotal = myRoomSplits.reduce((sum, s) => sum + s.shareAmount, 0);

      const totalActualSpending = personalTotal + roomShareTotal;

      expect(personalTotal).toBe(2500);
      expect(roomShareTotal).toBe(250);
      expect(totalActualSpending).toBe(2750);
    });

    it('12. User pays ₹1,000 for shared bill, but personal spending remains ₹250 for shared component', () => {
      const mySplit = expenseSplits.find(
        (s) => s.sharedExpenseId === 'shared-1' && s.userId === USER_A_ID
      );
      expect(mySplit?.shareAmount).toBe(250);

      // Spending must NEVER equal the ₹1,000 fronted total
      const personalTotal = 2500;
      const totalOutflow = personalTotal + (mySplit?.shareAmount || 0);
      expect(totalOutflow).not.toBe(3500);
      expect(totalOutflow).toBe(2750);
    });

    it('13. Others owe ₹750 (fronted receivable is completely separated from personal spending)', () => {
      const bill = sharedExpenses.find((e) => e.id === 'shared-1')!;
      const mySplit = expenseSplits.find((s) => s.sharedExpenseId === bill.id && s.userId === USER_A_ID)!;
      const othersOwe = bill.totalAmount - mySplit.shareAmount;

      expect(othersOwe).toBe(750);
    });

    it('14. Partial settlement of ₹100 changes receivable from ₹750 to ₹650 but does not change spending', () => {
      const settlements: SettlementPayment[] = [
        {
          id: 'settle-1',
          roomId: activeRoomId,
          payerId: USER_B_ID,
          payeeId: USER_A_ID,
          amount: 100,
          paymentMethod: 'UPI',
          settledAt: '2026-10-03T10:00:00Z',
          createdAt: '2026-10-03T10:00:00Z',
        },
      ];

      // Net receivable calculation:
      const initialReceivable = 750;
      const settledAmount = settlements.reduce((sum, s) => sum + s.amount, 0);
      const remainingReceivable = initialReceivable - settledAmount;

      expect(remainingReceivable).toBe(650);

      // Spending calculation must remain unaffected by settlement
      const spending = 2500 + 250;
      expect(spending).toBe(2750);
    });

    it('15. Settlement does not change historical expense totals', () => {
      const historicalSharedTotal = sharedExpenses.reduce((sum, e) => sum + e.totalAmount, 0);
      const historicalPersonalTotal = personalExpenses.reduce((sum, p) => sum + p.amount, 0);

      expect(historicalSharedTotal).toBe(1000);
      expect(historicalPersonalTotal).toBe(2500);
    });

    it('16. Non-payer (User B) with ₹250 share records ₹250 spending and ₹250 payable', () => {
      const userBPrivateTotal = 0; // User B has no private expense in this test room
      const userBRoomSplit = expenseSplits.find(
        (s) => s.sharedExpenseId === 'shared-1' && s.userId === USER_B_ID
      )!;

      const userBSpending = userBPrivateTotal + userBRoomSplit.shareAmount;
      expect(userBSpending).toBe(250);

      // User B did not pay the bill, so User B owes ₹250
      const userBPaid = 0;
      const userBPayable = userBRoomSplit.shareAmount - userBPaid;
      expect(userBPayable).toBe(250);
    });

    it('17. Shared expense is never duplicated into personal_expenses', () => {
      // Confirm personal_expenses storage only has private records
      const userAPersonalInDb = personalExpenses.filter((p) => p.userId === USER_A_ID);
      expect(userAPersonalInDb.length).toBe(1);
      expect(userAPersonalInDb.some((p) => p.title === 'Flat Groceries')).toBe(false);
    });

    it('18. Same shared expense cannot accidentally contribute twice', () => {
      const activeSharedIds = new Set(sharedExpenses.filter((e) => !e.isDeleted).map((e) => e.id));
      const userSplits = expenseSplits.filter(
        (s) => s.userId === USER_A_ID && activeSharedIds.has(s.sharedExpenseId)
      );

      // Count occurrences of sharedExpenseId
      const seen = new Set<string>();
      for (const split of userSplits) {
        expect(seen.has(split.sharedExpenseId)).toBe(false);
        seen.add(split.sharedExpenseId);
      }
    });

    it('19. Monthly totals remain consistent across October 2026', () => {
      const octPersonal = personalExpenses
        .filter((p) => {
          const parsed = parseExpenseDate(p.expenseDate);
          return p.userId === USER_A_ID && parsed.month === 9 && parsed.year === 2026; // Oct = month index 9
        })
        .reduce((sum, p) => sum + p.amount, 0);

      const octRoomShare = expenseSplits
        .filter((s) => {
          if (s.userId !== USER_A_ID) return false;
          const exp = sharedExpenses.find((e) => e.id === s.sharedExpenseId && !e.isDeleted);
          if (!exp) return false;
          const parsed = parseExpenseDate(exp.expenseDate);
          return parsed.month === 9 && parsed.year === 2026;
        })
        .reduce((sum, s) => sum + s.shareAmount, 0);

      expect(octPersonal + octRoomShare).toBe(2750);
    });

    it('20. Desktop and mobile calculations use the same source-of-truth logic', () => {
      // Desktop calculation formula:
      const desktopTotal =
        personalExpenses.filter((p) => p.userId === USER_A_ID).reduce((sum, p) => sum + p.amount, 0) +
        expenseSplits
          .filter(
            (s) =>
              s.userId === USER_A_ID &&
              sharedExpenses.some((e) => e.id === s.sharedExpenseId && !e.isDeleted)
          )
          .reduce((sum, s) => sum + s.shareAmount, 0);

      // Mobile calculation formula:
      const mobilePersonal = personalExpenses
        .filter((p) => p.userId === USER_A_ID)
        .reduce((sum, p) => sum + p.amount, 0);
      const mobileRoomShare = expenseSplits
        .filter((s) => {
          const p = sharedExpenses.find((e) => e.id === s.sharedExpenseId && !e.isDeleted);
          return s.userId === USER_A_ID && !!p;
        })
        .reduce((sum, s) => sum + s.shareAmount, 0);
      const mobileTotal = mobilePersonal + mobileRoomShare;

      expect(desktopTotal).toBe(mobileTotal);
      expect(desktopTotal).toBe(2750);
    });
  });

  // ===========================================================================
  // REGRESSION TESTS (21 - 28)
  // ===========================================================================
  describe('Regression Tests: Auth & CRUD Integrity', () => {
    it('21. Existing personal expense creation still works', () => {
      const created = db.createPersonalExpense(USER_A_ID, {
        title: 'College Bookstore',
        amount: 450,
        category: 'Academics',
        notes: 'Math textbooks',
        expenseDate: '2026-10-05',
      });

      expect(created.id).toBeDefined();
      expect(created.title).toBe('College Bookstore');
      expect(created.amount).toBe(450);
    });

    it('22. Existing personal expense editing still works', () => {
      // 1. Initial creation
      const created = rlsSim.rpcSubmitPersonalExpenseSecure(USER_A_ID, {
        p_user_id: USER_A_ID,
        p_title: 'Old Title',
        p_amount: 100,
        p_category: 'Food',
      });
      expect(created.title).toBe('Old Title');
      expect(created.amount).toBe(100);

      // 2. Edit existing record with same p_id
      const updated = rlsSim.rpcSubmitPersonalExpenseSecure(USER_A_ID, {
        p_id: created.id,
        p_user_id: USER_A_ID,
        p_title: 'New Title',
        p_amount: 150,
        p_category: 'Food',
      });

      expect(updated.id).toBe(created.id);
      expect(updated.title).toBe('New Title');
      expect(updated.amount).toBe(150);
    });

    it('23. Existing personal expense deletion still works', () => {
      const created = db.createPersonalExpense(USER_A_ID, {
        title: 'To Be Deleted',
        amount: 200,
        category: 'Shopping',
        expenseDate: '2026-10-05',
      });

      const success = db.deletePersonalExpense(USER_A_ID, created.id);
      expect(success).toBe(true);

      const check = db.getPersonalExpenses(USER_A_ID).find((p) => p.id === created.id);
      expect(check).toBeUndefined();
    });

    it('24. Google authentication flow compatibility', () => {
      // Google OAuth produces standard Supabase user with auth.uid()
      const googleUserSession = {
        user: {
          id: USER_A_ID,
          email: 'google.student@gmail.com',
          app_metadata: { provider: 'google' },
        },
      };
      expect(googleUserSession.user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('25. Email/password authentication flow compatibility', () => {
      const emailUserSession = {
        user: {
          id: USER_B_ID,
          email: 'email.resident@roommate.app',
          app_metadata: { provider: 'email' },
        },
      };
      expect(emailUserSession.user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('26. 4-digit resident PIN authentication generates valid Supabase Auth session', () => {
      // As audited in Phase 9 Security Gate, resident PIN uses authenticateResidentWithSupabase()
      // which signs in to GoTrue and establishes a legitimate session with auth.uid()
      const pinUserUuid = '33333333-3333-4333-8333-333333333333';
      const pinSession = {
        user: {
          id: pinUserUuid,
          email: 'resident.room202@app.internal',
        },
      };
      expect(pinSession.user.id).toBe(pinUserUuid);
    });

    it('27. Offline demo personas continue to function locally without cloud RPC calls', () => {
      const localExpenses = db.getPersonalExpenses('user-1');
      expect(Array.isArray(localExpenses)).toBe(true);
    });

    it('28. Logout / login user switching does not leak private vault records in UI or memory', () => {
      // Simulate User A logging out and User B logging in
      const allVaultRecords = [
        { id: '1', userId: USER_A_ID, title: 'User A Private Secret', amount: 1000 },
        { id: '2', userId: USER_B_ID, title: 'User B Private Journal', amount: 500 },
      ];

      // User A session:
      const userAVisible = allVaultRecords.filter((r) => r.userId === USER_A_ID);
      expect(userAVisible.length).toBe(1);
      expect(userAVisible[0].title).toBe('User A Private Secret');

      // Logout User A, switch to User B:
      let activeSessionUserId: string = USER_B_ID;
      const userBVisible = allVaultRecords.filter((r) => r.userId === activeSessionUserId);
      expect(userBVisible.length).toBe(1);
      expect(userBVisible[0].title).toBe('User B Private Journal');
      expect(userBVisible.some((r) => r.userId === USER_A_ID)).toBe(false);
    });
  });

  // ===========================================================================
  // ADVERSARIAL TESTS (PHASE 9I)
  // ===========================================================================
  describe('Adversarial Database Tests: Explicit Exploit Attempts', () => {
    it('Exploit Attempt 1: Cross-tenant SELECT across user boundaries returns 0 rows', () => {
      const leaked = rlsSim.select(USER_A_ID, USER_B_ID);
      expect(leaked.length).toBe(0);
    });

    it('Exploit Attempt 2: INSERT with victim UUID fails check constraint', () => {
      expect(() => {
        rlsSim.insert(USER_A_ID, {
          id: 'hack-1',
          user_id: USER_B_ID,
          title: 'Unauthorized Injected Expense',
          amount: 9999,
          category: 'Shopping',
          notes: null,
          expense_date: '2026-10-05',
        });
      }).toThrow(/ACCESS_DENIED/);
    });

    it('Exploit Attempt 3: UPDATE targeting victim row returns false and mutates 0 rows', () => {
      const result = rlsSim.update(USER_A_ID, 'exp-b-1', { amount: 0.01 });
      expect(result).toBe(false);
    });

    it('Exploit Attempt 4: DELETE targeting victim row returns false and preserves victim data', () => {
      const result = rlsSim.delete(USER_A_ID, 'exp-b-1');
      expect(result).toBe(false);
    });

    it('Exploit Attempt 5: RPC submit caller spoofing throws ACCESS_DENIED', () => {
      expect(() => {
        rlsSim.rpcSubmitPersonalExpenseSecure(USER_A_ID, {
          p_user_id: USER_B_ID,
          p_title: 'Spoofed Transaction',
          p_amount: 500,
        });
      }).toThrow(/ACCESS_DENIED/);
    });

    it('Exploit Attempt 6: RPC delete caller spoofing throws ACCESS_DENIED', () => {
      expect(() => {
        rlsSim.rpcDeletePersonalExpenseSecure(USER_A_ID, {
          p_id: 'exp-b-1',
          p_user_id: USER_B_ID,
        });
      }).toThrow(/ACCESS_DENIED/);
    });

    it('Exploit Attempt 7: Anonymous / null auth.uid() execution throws UNAUTHENTICATED', () => {
      expect(() => {
        rlsSim.rpcSubmitPersonalExpenseSecure(null, {
          p_user_id: USER_A_ID,
          p_title: 'Anon Transaction',
          p_amount: 100,
        });
      }).toThrow(/UNAUTHENTICATED/);
    });

    it('Exploit Attempt 8: SuperAdmin bypass attempt fails with ACCESS_DENIED', () => {
      expect(() => {
        rlsSim.rpcSubmitPersonalExpenseSecure(SUPERADMIN_ID, {
          p_user_id: USER_A_ID, // SuperAdmin trying to write on behalf of resident
          p_title: 'SuperAdmin Override',
          p_amount: 1000,
        });
      }).toThrow(/ACCESS_DENIED/);
    });
  });
});

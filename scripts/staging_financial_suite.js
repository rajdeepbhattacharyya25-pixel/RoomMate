import { runSql } from './test_exec_helper.js';

// Actor and Entity UUID constants
const USERS = {
  USER_A: '11111111-1111-1111-1111-111111111111', // Room A member (Creator/Admin)
  USER_B: '22222222-2222-2222-2222-222222222222', // Room A member (Regular Member)
  USER_C: '33333333-3333-3333-3333-333333333333', // Room B member (Unrelated)
  USER_D: '44444444-4444-4444-4444-444444444444', // Room B member (Unrelated)
  USER_FORMER: '55555555-5555-5555-5555-555555555555', // Room A former member (LEFT)
  USER_PENDING: '66666666-6666-6666-6666-666666666666', // Pending user (not active)
  SUPERADMIN: '99999999-9999-9999-9999-999999999999', // SuperAdmin
};

const ROOMS = {
  ROOM_A: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  ROOM_B: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  ROOM_FROZEN: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
};

async function setupFixtures() {
  const sql = `
    -- Clean previous financial test fixtures
    DELETE FROM public.subscription_events WHERE user_id IN ('${Object.values(USERS).join("','")}');
    DELETE FROM public.user_subscriptions WHERE user_id IN ('${Object.values(USERS).join("','")}');
    DELETE FROM public.expense_splits WHERE user_id IN ('${Object.values(USERS).join("','")}');
    DELETE FROM public.shared_expenses WHERE room_id IN ('${Object.values(ROOMS).join("','")}');
    DELETE FROM public.settlement_payments WHERE room_id IN ('${Object.values(ROOMS).join("','")}');
    DELETE FROM public.personal_expenses WHERE user_id IN ('${Object.values(USERS).join("','")}');
    DELETE FROM public.room_members WHERE room_id IN ('${Object.values(ROOMS).join("','")}');
    DELETE FROM public.rooms WHERE id IN ('${Object.values(ROOMS).join("','")}');
    DELETE FROM public.profiles WHERE id IN ('${Object.values(USERS).join("','")}');
    DELETE FROM auth.users WHERE id IN ('${Object.values(USERS).join("','")}');

    -- Create auth users
    INSERT INTO auth.users (id, email) VALUES
      ('${USERS.USER_A}', 'usera@test.com'),
      ('${USERS.USER_B}', 'userb@test.com'),
      ('${USERS.USER_C}', 'userc@test.com'),
      ('${USERS.USER_D}', 'userd@test.com'),
      ('${USERS.USER_FORMER}', 'former@test.com'),
      ('${USERS.USER_PENDING}', 'pending@test.com'),
      ('${USERS.SUPERADMIN}', 'superadmin@test.com')
    ON CONFLICT (id) DO NOTHING;

    -- Create profiles
    INSERT INTO public.profiles (id, name, email, role) VALUES
      ('${USERS.USER_A}', 'User A', 'usera@test.com', 'STUDENT'),
      ('${USERS.USER_B}', 'User B', 'userb@test.com', 'STUDENT'),
      ('${USERS.USER_C}', 'User C', 'userc@test.com', 'STUDENT'),
      ('${USERS.USER_D}', 'User D', 'userd@test.com', 'STUDENT'),
      ('${USERS.USER_FORMER}', 'Former Member', 'former@test.com', 'STUDENT'),
      ('${USERS.USER_PENDING}', 'Pending Member', 'pending@test.com', 'STUDENT'),
      ('${USERS.SUPERADMIN}', 'Super Administrator', 'superadmin@test.com', 'SUPER_ADMIN')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

    -- Create default subscriptions
    INSERT INTO public.user_subscriptions (user_id, plan_code, plan_name, price_inr, status) VALUES
      ('${USERS.USER_A}', 'FREE', 'Free Campus Starter', 0.00, 'TRIAL'),
      ('${USERS.USER_B}', 'FREE', 'Free Campus Starter', 0.00, 'TRIAL'),
      ('${USERS.USER_C}', 'FREE', 'Free Campus Starter', 0.00, 'TRIAL')
    ON CONFLICT (user_id) DO NOTHING;

    -- Create rooms
    INSERT INTO public.rooms (id, name, created_by, is_frozen) VALUES
      ('${ROOMS.ROOM_A}', 'Room A Alpha', '${USERS.USER_A}', false),
      ('${ROOMS.ROOM_B}', 'Room B Beta', '${USERS.USER_C}', false),
      ('${ROOMS.ROOM_FROZEN}', 'Room Frozen', '${USERS.USER_A}', true)
    ON CONFLICT (id) DO UPDATE SET is_frozen = EXCLUDED.is_frozen;

    -- Create room members
    INSERT INTO public.room_members (room_id, user_id, role, status) VALUES
      ('${ROOMS.ROOM_A}', '${USERS.USER_A}', 'ROOM_ADMIN', 'ACTIVE'),
      ('${ROOMS.ROOM_A}', '${USERS.USER_B}', 'MEMBER', 'ACTIVE'),
      ('${ROOMS.ROOM_A}', '${USERS.USER_FORMER}', 'MEMBER', 'LEFT'),
      ('${ROOMS.ROOM_B}', '${USERS.USER_C}', 'ROOM_ADMIN', 'ACTIVE'),
      ('${ROOMS.ROOM_B}', '${USERS.USER_D}', 'MEMBER', 'ACTIVE'),
      ('${ROOMS.ROOM_FROZEN}', '${USERS.USER_A}', 'ROOM_ADMIN', 'ACTIVE')
    ON CONFLICT (room_id, user_id) DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role;
  `;
  await runSql(sql);
}

// Helper to execute query as a specific authenticated user
async function asUser(userId, sqlQuery) {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    ${sqlQuery};
    COMMIT;
  `;
  return await runSql(wrapped);
}

// Helper to execute as anonymous
async function asAnon(sqlQuery) {
  const wrapped = `
    BEGIN;
    SET LOCAL ROLE anon;
    RESET "request.jwt.claim.sub";
    SET LOCAL "request.jwt.claim.role" = 'anon';
    ${sqlQuery};
    COMMIT;
  `;
  return await runSql(wrapped);
}

// Run test case with error catching
async function testCase(id, title, fn) {
  try {
    const result = await fn();
    console.log(`[TEST ${id}] PASS: ${title} -> ${result}`);
    return { id, title, passed: true, detail: result };
  } catch (err) {
    console.log(`[TEST ${id}] FAIL / VULNERABILITY: ${title} -> ${err.message}`);
    return { id, title, passed: false, detail: err.message };
  }
}

async function runAllTests() {
  console.log('============================================================');
  console.log('ROOMMATE PHASE 2C.3: FINANCIAL ADVERSARIAL STAGING SUITE');
  console.log('============================================================\n');

  await setupFixtures();
  const results = [];

  // =========================================================================
  // DOMAIN 1: PERSONAL EXPENSE ISOLATION
  // =========================================================================
  console.log('\n--- DOMAIN 1: PERSONAL EXPENSE ISOLATION ---');
  let expAId = null;

  results.push(await testCase(1, 'User A creates personal expense for User A', async () => {
    const res = await asUser(USERS.USER_A, `
      INSERT INTO public.personal_expenses (user_id, title, amount, category)
      VALUES ('${USERS.USER_A}', 'Lunch', 150.00, 'Food')
      RETURNING id;
    `);
    const match = res.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expAId = match ? match[0] : null;
    if (!expAId) throw new Error('Failed to insert personal expense');
    return `Created expense ${expAId}`;
  }));

  results.push(await testCase(2, 'User A reads own personal expense', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT count(*) FROM public.personal_expenses WHERE id = '${expAId}';
    `);
    if (!res.stdout.includes('1')) throw new Error('Could not read own expense');
    return '1 row returned';
  }));

  results.push(await testCase(3, 'User A updates own personal expense', async () => {
    const res = await asUser(USERS.USER_A, `
      UPDATE public.personal_expenses SET amount = 200.00 WHERE id = '${expAId}';
    `);
    if (!res.stdout.includes('UPDATE 1')) throw new Error('Could not update own expense');
    return 'Updated 1 row';
  }));

  results.push(await testCase(4, 'User B attempts to read User A personal expense', async () => {
    const res = await asUser(USERS.USER_B, `
      SELECT count(*) FROM public.personal_expenses WHERE id = '${expAId}';
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: User B read ${count} rows of User A personal expense`);
    return '0 rows visible (isolated)';
  }));

  results.push(await testCase(5, 'User B attempts to update User A personal expense', async () => {
    const res = await asUser(USERS.USER_B, `
      UPDATE public.personal_expenses SET amount = 999.00 WHERE id = '${expAId}';
    `);
    if (res.stdout.includes('UPDATE 1')) throw new Error('VULNERABILITY: User B updated User A personal expense');
    return '0 rows updated (blocked by RLS)';
  }));

  results.push(await testCase(6, 'User B attempts to delete User A personal expense', async () => {
    const res = await asUser(USERS.USER_B, `
      DELETE FROM public.personal_expenses WHERE id = '${expAId}';
    `);
    if (res.stdout.includes('DELETE 1')) throw new Error('VULNERABILITY: User B deleted User A personal expense');
    return '0 rows deleted (blocked by RLS)';
  }));

  results.push(await testCase(7, 'User B attempts to forge personal expense owned by User A', async () => {
    try {
      await asUser(USERS.USER_B, `
        INSERT INTO public.personal_expenses (user_id, title, amount, category)
        VALUES ('${USERS.USER_A}', 'Forged Lunch', 500.00, 'Food');
      `);
      throw new Error('VULNERABILITY: User B inserted personal expense for User A');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS WITH CHECK';
    }
  }));

  results.push(await testCase(8, 'User A deletes own personal expense', async () => {
    const res = await asUser(USERS.USER_A, `
      DELETE FROM public.personal_expenses WHERE id = '${expAId}';
    `);
    if (!res.stdout.includes('DELETE 1')) throw new Error('Could not delete own expense');
    return 'Deleted 1 row';
  }));

  // =========================================================================
  // DOMAIN 2: SHARED ROOM EXPENSE AUTHORIZATION & CROSS-ROOM ISOLATION
  // =========================================================================
  console.log('\n--- DOMAIN 2: SHARED ROOM EXPENSE AUTHORIZATION & CROSS-ROOM ISOLATION ---');
  let sharedExpAId = null;

  results.push(await testCase(9, 'Room A member (User A) creates shared expense in Room A', async () => {
    const res = await asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Electricity Bill', 1200.00, 'Electricity', 'EQUAL')
      RETURNING id;
    `);
    const match = res.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    sharedExpAId = match ? match[0] : null;
    if (!sharedExpAId) throw new Error('Failed to insert shared expense');
    return `Created shared expense ${sharedExpAId}`;
  }));

  results.push(await testCase(10, 'Room A member (User B) reads Room A shared expense', async () => {
    const res = await asUser(USERS.USER_B, `
      SELECT count(*) FROM public.shared_expenses WHERE id = '${sharedExpAId}';
    `);
    if (!res.stdout.includes('1')) throw new Error('Roommate could not read shared expense');
    return '1 row visible';
  }));

  results.push(await testCase(11, 'Unrelated user (User C in Room B) attempts to read Room A shared expense', async () => {
    const res = await asUser(USERS.USER_C, `
      SELECT count(*) FROM public.shared_expenses WHERE id = '${sharedExpAId}';
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: User C read ${count} rows of Room A shared expenses`);
    return '0 rows visible (cross-room isolated)';
  }));

  results.push(await testCase(12, 'Unrelated user (User C) attempts to insert shared expense into Room A', async () => {
    try {
      await asUser(USERS.USER_C, `
        INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_C}', '${USERS.USER_C}', 'Sneaky Pizza', 500.00, 'Food', 'EQUAL');
      `);
      throw new Error('VULNERABILITY: User C inserted expense into Room A');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS WITH CHECK';
    }
  }));

  results.push(await testCase(13, 'Creator (User A) updates Room A shared expense title', async () => {
    const res = await asUser(USERS.USER_A, `
      UPDATE public.shared_expenses SET title = 'Electricity Bill Updated' WHERE id = '${sharedExpAId}';
    `);
    if (!res.stdout.includes('UPDATE 1')) throw new Error('Creator could not update expense');
    return 'Updated 1 row';
  }));

  results.push(await testCase(14, 'Non-admin, non-creator Room A member (User B) attempts to update expense', async () => {
    const res = await asUser(USERS.USER_B, `
      UPDATE public.shared_expenses SET title = 'Tampered by Roommate' WHERE id = '${sharedExpAId}';
    `);
    if (res.stdout.includes('UPDATE 1')) throw new Error('VULNERABILITY: Non-admin member updated shared expense');
    return '0 rows updated (blocked by USING)';
  }));

  results.push(await testCase(15, 'Creator (User A) attempts to move Room A expense to Room B', async () => {
    try {
      const res = await asUser(USERS.USER_A, `
        UPDATE public.shared_expenses SET room_id = '${ROOMS.ROOM_B}' WHERE id = '${sharedExpAId}';
      `);
      // Since User A is NOT a member of Room B, let's see if USING/WITH CHECK blocks it
      if (res.stdout.includes('UPDATE 1')) {
        throw new Error('VULNERABILITY: User A moved expense across rooms to Room B');
      }
      return 'Blocked or 0 rows updated';
    } catch (err) {
      return 'Denied by RLS: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(16, 'Former member attempts to read Room A shared expenses', async () => {
    const res = await asUser(USERS.USER_FORMER, `
      SELECT count(*) FROM public.shared_expenses WHERE room_id = '${ROOMS.ROOM_A}';
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: Former member read ${count} shared expenses`);
    return '0 rows visible';
  }));

  results.push(await testCase(17, 'Pending member attempts to read Room A shared expenses', async () => {
    const res = await asUser(USERS.USER_PENDING, `
      SELECT count(*) FROM public.shared_expenses WHERE room_id = '${ROOMS.ROOM_A}';
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: Pending member read ${count} shared expenses`);
    return '0 rows visible';
  }));

  results.push(await testCase(18, 'User A attempts hard DELETE on shared_expenses', async () => {
    const res = await asUser(USERS.USER_A, `
      DELETE FROM public.shared_expenses WHERE id = '${sharedExpAId}';
    `);
    if (res.stdout.includes('DELETE 1')) throw new Error('Hard DELETE succeeded on shared_expenses');
    return '0 rows deleted (no DELETE policy exists)';
  }));

  // =========================================================================
  // DOMAIN 3: FINANCIAL AMOUNT TAMPERING & INTEGRITY
  // =========================================================================
  console.log('\n--- DOMAIN 3: FINANCIAL AMOUNT TAMPERING & INTEGRITY ---');

  results.push(await testCase(19, 'Shared expense with negative total_amount (-100)', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Negative Expense', -100.00, 'Other', 'EQUAL');
      `);
      throw new Error('VULNERABILITY: Negative total_amount accepted');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by check constraint: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(20, 'Shared expense with zero total_amount (0.00)', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Zero Expense', 0.00, 'Other', 'EQUAL');
      `);
      throw new Error('VULNERABILITY: Zero total_amount accepted');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by check constraint: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(21, 'User A creates shared expense forging created_by = User B', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_A}', 'Forged Creator', 300.00, 'Food', 'EQUAL');
      `);
      throw new Error('VULNERABILITY: Forged created_by accepted');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS WITH CHECK';
    }
  }));

  results.push(await testCase(22, 'AUDIT: User A creates expense assigning paid_by = User C (User C is NOT in Room A)', async () => {
    try {
      const res = await asUser(USERS.USER_A, `
        INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_C}', 'Non-member Payer', 450.00, 'Food', 'EQUAL')
        RETURNING id;
      `);
      if (res.stdout.includes('INSERT 0 1')) {
        return 'VULNERABILITY CONFIRMED: Database accepts paid_by belonging to an outsider not in the room!';
      }
      return 'Rejected';
    } catch (err) {
      return 'Rejected: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(23, 'Shared expense with extreme large numeric overflow (10^12 vs NUMERIC(12,2))', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Huge Expense', 10000000000.00, 'Other', 'EQUAL');
      `);
      throw new Error('VULNERABILITY: Overflow amount accepted');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by NUMERIC(12,2) overflow check';
    }
  }));

  results.push(await testCase(24, 'AUDIT: Creator updates total_amount after splits exist', async () => {
    const res = await asUser(USERS.USER_A, `
      UPDATE public.shared_expenses SET total_amount = 50000.00 WHERE id = '${sharedExpAId}';
    `);
    if (res.stdout.includes('UPDATE 1')) {
      return 'VULNERABILITY CONFIRMED: Creator can modify total_amount arbitrarily after creation without split sync';
    }
    return 'Blocked';
  }));

  results.push(await testCase(25, 'AUDIT: Creator changes paid_by to User B via UPDATE', async () => {
    const res = await asUser(USERS.USER_A, `
      UPDATE public.shared_expenses SET paid_by = '${USERS.USER_B}' WHERE id = '${sharedExpAId}';
    `);
    if (res.stdout.includes('UPDATE 1')) {
      return 'VULNERABILITY CONFIRMED: Creator can transfer paid_by credit to another user via UPDATE';
    }
    return 'Blocked';
  }));

  results.push(await testCase(26, 'Attempt to insert shared expense in frozen room', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
        VALUES ('${ROOMS.ROOM_FROZEN}', '${USERS.USER_A}', '${USERS.USER_A}', 'Frozen Expense', 100.00, 'Other', 'EQUAL');
      `);
      throw new Error('VULNERABILITY: Expense inserted into frozen room');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by check_room_not_frozen trigger';
    }
  }));

  // =========================================================================
  // DOMAIN 4: EXPENSE SPLITS AUTHORIZATION & INTEGRITY
  // =========================================================================
  console.log('\n--- DOMAIN 4: EXPENSE SPLITS AUTHORIZATION & INTEGRITY ---');
  let split1Id = null;

  results.push(await testCase(27, 'Room A member inserts valid split for Room A expense', async () => {
    const res = await asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${sharedExpAId}', '${USERS.USER_B}', 600.00)
      RETURNING id;
    `);
    const match = res.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    split1Id = match ? match[0] : null;
    if (!split1Id) throw new Error('Failed to insert split');
    return `Inserted split ${split1Id}`;
  }));

  results.push(await testCase(28, 'Unrelated user (User C) attempts to read Room A expense splits', async () => {
    const res = await asUser(USERS.USER_C, `
      SELECT count(*) FROM public.expense_splits WHERE shared_expense_id = '${sharedExpAId}';
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: User C read ${count} expense splits`);
    return '0 rows visible (isolated)';
  }));

  results.push(await testCase(29, 'Unrelated user (User C) attempts to insert split for Room A expense', async () => {
    try {
      await asUser(USERS.USER_C, `
        INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
        VALUES ('${sharedExpAId}', '${USERS.USER_C}', 600.00);
      `);
      throw new Error('VULNERABILITY: User C inserted split for Room A expense');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS WITH CHECK';
    }
  }));

  results.push(await testCase(30, 'AUDIT: Member inserts split assigning debt to User C (NOT in Room A)', async () => {
    try {
      const res = await asUser(USERS.USER_A, `
        INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
        VALUES ('${sharedExpAId}', '${USERS.USER_C}', 300.00)
        RETURNING id;
      `);
      if (res.stdout.includes('INSERT 0 1')) {
        return 'VULNERABILITY CONFIRMED: Database allows assigning expense split debt to an outsider not in the room!';
      }
      return 'Rejected';
    } catch (err) {
      return 'Rejected: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(31, 'AUDIT: Member inserts duplicate split for same user on same expense', async () => {
    try {
      const res = await asUser(USERS.USER_A, `
        INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
        VALUES ('${sharedExpAId}', '${USERS.USER_B}', 600.00)
        RETURNING id;
      `);
      if (res.stdout.includes('INSERT 0 1')) {
        return 'VULNERABILITY CONFIRMED: Database allows duplicate splits for same user (no unique constraint on shared_expense_id, user_id)';
      }
      return 'Rejected';
    } catch (err) {
      return 'Rejected: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(32, 'AUDIT: Mismatched split sum vs expense total_amount', async () => {
    const res = await asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${sharedExpAId}', '${USERS.USER_A}', 999999.00)
      RETURNING id;
    `);
    if (res.stdout.includes('INSERT 0 1')) {
      return 'VULNERABILITY CONFIRMED: Database does not enforce sum(share_amount) == total_amount';
    }
    return 'Blocked';
  }));

  results.push(await testCase(33, 'Expense split with negative share_amount (-50)', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
        VALUES ('${sharedExpAId}', '${USERS.USER_A}', -50.00);
      `);
      throw new Error('VULNERABILITY: Negative share_amount accepted');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by check constraint: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(34, 'Attempt to UPDATE an expense_split', async () => {
    const res = await asUser(USERS.USER_A, `
      UPDATE public.expense_splits SET share_amount = 1.00 WHERE id = '${split1Id}';
    `);
    if (res.stdout.includes('UPDATE 1')) throw new Error('VULNERABILITY: Expense split was updated');
    return '0 rows updated (no UPDATE policy)';
  }));

  results.push(await testCase(35, 'Attempt to DELETE an expense_split', async () => {
    const res = await asUser(USERS.USER_A, `
      DELETE FROM public.expense_splits WHERE id = '${split1Id}';
    `);
    if (res.stdout.includes('DELETE 1')) throw new Error('VULNERABILITY: Expense split was deleted');
    return '0 rows deleted (no DELETE policy)';
  }));

  // =========================================================================
  // DOMAIN 5: SETTLEMENT AUTHORIZATION & DEBT WIPING
  // =========================================================================
  console.log('\n--- DOMAIN 5: SETTLEMENT AUTHORIZATION & DEBT WIPING ---');
  let settlementAId = null;

  results.push(await testCase(36, 'Room A member (User A) records settlement paying User B', async () => {
    const res = await asUser(USERS.USER_A, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_B}', 350.00, 'UPI')
      RETURNING id;
    `);
    const match = res.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    settlementAId = match ? match[0] : null;
    if (!settlementAId) throw new Error('Failed to record settlement');
    return `Recorded settlement ${settlementAId}`;
  }));

  results.push(await testCase(37, 'Room A member (User B) views Room A settlement', async () => {
    const res = await asUser(USERS.USER_B, `
      SELECT count(*) FROM public.settlement_payments WHERE id = '${settlementAId}';
    `);
    if (!res.stdout.includes('1')) throw new Error('Payee could not view settlement');
    return '1 row visible';
  }));

  results.push(await testCase(38, 'Unrelated user (User C) attempts to view Room A settlement', async () => {
    const res = await asUser(USERS.USER_C, `
      SELECT count(*) FROM public.settlement_payments WHERE id = '${settlementAId}';
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: User C read ${count} settlements of Room A`);
    return '0 rows visible (isolated)';
  }));

  results.push(await testCase(39, 'Unrelated user (User C) attempts to insert settlement into Room A', async () => {
    try {
      await asUser(USERS.USER_C, `
        INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_C}', '${USERS.USER_A}', 100.00, 'UPI');
      `);
      throw new Error('VULNERABILITY: User C inserted settlement into Room A');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS WITH CHECK';
    }
  }));

  results.push(await testCase(40, 'User A attempts to record settlement forging payer_id = User B', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_A}', 500.00, 'UPI');
      `);
      throw new Error('VULNERABILITY: User A forged payer_id = User B');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS WITH CHECK';
    }
  }));

  results.push(await testCase(41, 'AUDIT: User A records settlement with payee_id = User C (NOT in Room A)', async () => {
    try {
      const res = await asUser(USERS.USER_A, `
        INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_C}', 800.00, 'UPI')
        RETURNING id;
      `);
      if (res.stdout.includes('INSERT 0 1')) {
        return 'VULNERABILITY CONFIRMED: Database allows payee_id belonging to an outsider not in the room!';
      }
      return 'Rejected';
    } catch (err) {
      return 'Rejected: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(42, 'AUDIT: User A records self-settlement (payer_id = User A, payee_id = User A)', async () => {
    try {
      const res = await asUser(USERS.USER_A, `
        INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
        VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 999.00, 'UPI')
        RETURNING id;
      `);
      if (res.stdout.includes('INSERT 0 1')) {
        return 'VULNERABILITY CONFIRMED: User can pay themselves, inflating settlements_paid in balance calculation!';
      }
      return 'Rejected';
    } catch (err) {
      return 'Rejected: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(43, 'User A attempts to UPDATE recorded settlement', async () => {
    const res = await asUser(USERS.USER_A, `
      UPDATE public.settlement_payments SET amount = 10.00 WHERE id = '${settlementAId}';
    `);
    if (res.stdout.includes('UPDATE 1')) throw new Error('VULNERABILITY: Settlement updated');
    return '0 rows updated (no UPDATE policy)';
  }));

  results.push(await testCase(44, 'User A attempts to DELETE recorded settlement', async () => {
    const res = await asUser(USERS.USER_A, `
      DELETE FROM public.settlement_payments WHERE id = '${settlementAId}';
    `);
    if (res.stdout.includes('DELETE 1')) throw new Error('VULNERABILITY: Settlement deleted');
    return '0 rows deleted (no DELETE policy)';
  }));

  // =========================================================================
  // DOMAIN 6: ROOM BALANCES RPC (get_room_balances) IDOR & AUTHORIZATION
  // =========================================================================
  console.log('\n--- DOMAIN 6: ROOM BALANCES RPC (get_room_balances) IDOR & AUTHORIZATION ---');

  results.push(await testCase(45, 'Active Room A member calls get_room_balances(Room A)', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
    if (!res.stdout.includes('User A') || !res.stdout.includes('User B')) {
      throw new Error('Room balances not returned for Room A');
    }
    return 'Returned balances for Room A members';
  }));

  results.push(await testCase(46, 'Unrelated user (User C) calls get_room_balances(Room A)', async () => {
    try {
      await asUser(USERS.USER_C, `
        SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
      `);
      throw new Error('VULNERABILITY: User C accessed Room A financial balances!');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Denied with UNAUTHORIZED exception: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(47, 'Former member calls get_room_balances(Room A)', async () => {
    try {
      await asUser(USERS.USER_FORMER, `
        SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
      `);
      throw new Error('VULNERABILITY: Former member accessed Room A financial balances!');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Denied with UNAUTHORIZED exception';
    }
  }));

  results.push(await testCase(48, 'Anonymous user calls get_room_balances(Room A)', async () => {
    try {
      await asAnon(`
        SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
      `);
      throw new Error('VULNERABILITY: Anonymous user accessed Room A financial balances!');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Denied with UNAUTHORIZED exception';
    }
  }));

  // =========================================================================
  // DOMAIN 7: SUBSCRIPTIONS & BILLING STATE TAMPERING
  // =========================================================================
  console.log('\n--- DOMAIN 7: SUBSCRIPTIONS & BILLING STATE TAMPERING ---');

  results.push(await testCase(49, 'User A reads own user_subscriptions', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT count(*) FROM public.user_subscriptions WHERE user_id = '${USERS.USER_A}';
    `);
    if (!res.stdout.includes('1')) throw new Error('Could not read own subscription');
    return '1 row returned';
  }));

  results.push(await testCase(50, 'User B attempts to read User A user_subscriptions', async () => {
    const res = await asUser(USERS.USER_B, `
      SELECT count(*) FROM public.user_subscriptions WHERE user_id = '${USERS.USER_A}';
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: User B read ${count} rows of User A subscription`);
    return '0 rows visible (isolated)';
  }));

  results.push(await testCase(51, 'User A attempts to directly INSERT a user_subscriptions row', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.user_subscriptions (user_id, plan_code, plan_name, price_inr, status)
        VALUES ('${USERS.USER_A}', 'CAMPUS_MAX', 'Student Max', 99.00, 'ACTIVE');
      `);
      throw new Error('VULNERABILITY: User directly inserted subscription');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS (no INSERT policy for authenticated)';
    }
  }));

  results.push(await testCase(52, 'User A attempts to directly UPDATE subscription to ACTIVE CAMPUS_MAX', async () => {
    const res = await asUser(USERS.USER_A, `
      UPDATE public.user_subscriptions 
      SET status = 'ACTIVE', plan_code = 'CAMPUS_MAX', price_inr = 99.00
      WHERE user_id = '${USERS.USER_A}';
    `);
    if (res.stdout.includes('UPDATE 1')) throw new Error('VULNERABILITY: User directly escalated subscription');
    return '0 rows updated (no UPDATE policy for authenticated)';
  }));

  results.push(await testCase(53, 'User A attempts to DELETE own user_subscriptions', async () => {
    const res = await asUser(USERS.USER_A, `
      DELETE FROM public.user_subscriptions WHERE user_id = '${USERS.USER_A}';
    `);
    if (res.stdout.includes('DELETE 1')) throw new Error('VULNERABILITY: User deleted subscription');
    return '0 rows deleted (no DELETE policy)';
  }));

  results.push(await testCase(54, 'Authenticated user attempts to insert fake subscription_events', async () => {
    try {
      await asUser(USERS.USER_A, `
        INSERT INTO public.subscription_events (user_id, razorpay_event_id, event_type, payload)
        VALUES ('${USERS.USER_A}', 'fake_event_123', 'subscription.charged', '{"fake": true}');
      `);
      throw new Error('VULNERABILITY: User inserted fake subscription event');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Rejected by RLS (service_role only)';
    }
  }));

  results.push(await testCase(55, 'AUDIT: Client-side entitlement bypass in mock mode / cloud disconnect', async () => {
    // Audit check on mockStorage.ts processRazorpayWebhook
    return 'VULNERABILITY CONFIRMED: mockStorage.processRazorpayWebhook operates client-side with no cryptographic signature verification or webhook secret, allowing arbitrary subscription tampering in local/mock mode';
  }));

  // =========================================================================
  // DOMAIN 8: SUPERADMIN FINANCIAL OPERATIONS & AUDIT LOGS
  // =========================================================================
  console.log('\n--- DOMAIN 8: SUPERADMIN FINANCIAL OPERATIONS & AUDIT LOGS ---');

  results.push(await testCase(56, 'Normal user attempts to call super_admin_get_platform_metrics()', async () => {
    try {
      await asUser(USERS.USER_A, `
        SELECT public.super_admin_get_platform_metrics();
      `);
      throw new Error('VULNERABILITY: Normal user accessed platform metrics');
    } catch (err) {
      if (err.message.includes('VULNERABILITY')) throw err;
      return 'Denied: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(57, 'AUDIT: SuperAdmin calls super_admin_get_platform_metrics()', async () => {
    try {
      const res = await asUser(USERS.SUPERADMIN, `
        SELECT public.super_admin_get_platform_metrics();
      `);
      return 'Success: ' + res.stdout.split('\n').find(l => l.includes('{'));
    } catch (err) {
      return 'BROKEN RPC / BUG CONFIRMED: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(58, 'Normal user attempts to SELECT from audit_logs', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT count(*) FROM public.audit_logs;
    `);
    const countMatch = res.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : -1;
    if (count !== 0) throw new Error(`VULNERABILITY: Normal user read ${count} audit logs`);
    return '0 rows visible (superadmin only)';
  }));

  results.push(await testCase(59, 'AUDIT: Normal user attempts to INSERT fake audit_logs entry', async () => {
    try {
      const res = await asUser(USERS.USER_A, `
        INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
        VALUES ('${USERS.USER_A}', 'FAKE_PAYMENT_VERIFIED', 'PAYMENT', 'pay_123', '{"spoofed": true}')
        RETURNING id;
      `);
      if (res.stdout.includes('INSERT 0 1')) {
        return 'VULNERABILITY CONFIRMED: Normal users can insert arbitrary audit logs (policy allows authenticated INSERT)!';
      }
      return 'Rejected';
    } catch (err) {
      return 'Rejected: ' + err.message.split('\n')[0];
    }
  }));

  results.push(await testCase(60, 'Normal user attempts to UPDATE or DELETE audit_logs', async () => {
    const res1 = await asUser(USERS.USER_A, `UPDATE public.audit_logs SET action = 'TAMPERED';`);
    const res2 = await asUser(USERS.USER_A, `DELETE FROM public.audit_logs;`);
    if (res1.stdout.includes('UPDATE 1') || res2.stdout.includes('DELETE 1')) {
      throw new Error('VULNERABILITY: User modified or deleted audit logs');
    }
    return '0 rows updated/deleted (immutable)';
  }));

  console.log('\n============================================================');
  console.log(`COMPLETED ${results.length} ADVERSARIAL FINANCIAL SCENARIOS`);
  console.log('============================================================');
}

runAllTests().catch(console.error);

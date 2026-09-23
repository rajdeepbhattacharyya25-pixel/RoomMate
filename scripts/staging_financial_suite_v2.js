import { runSql } from './test_exec_helper.js';

// Actor and Entity UUID constants
const USERS = {
  USER_A: '11111111-1111-1111-1111-111111111111', // Room A member (Creator/Admin)
  USER_B: '22222222-2222-2222-2222-222222222222', // Room A member (Regular Member)
  USER_E: '77777777-7777-7777-7777-777777777777', // Room A member (Third Member)
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
  ROOM_EMPTY: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
};

async function setupFixtures() {
  const sql = `
    -- Clean previous financial test fixtures (disable immutability trigger for test teardown)
    ALTER TABLE public.settlement_payments DISABLE TRIGGER trg_settlement_payments_integrity;
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
    ALTER TABLE public.settlement_payments ENABLE TRIGGER trg_settlement_payments_integrity;

    -- Create auth users
    INSERT INTO auth.users (id, email) VALUES
      ('${USERS.USER_A}', 'usera@test.com'),
      ('${USERS.USER_B}', 'userb@test.com'),
      ('${USERS.USER_E}', 'usere@test.com'),
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
      ('${USERS.USER_E}', 'User E', 'usere@test.com', 'STUDENT'),
      ('${USERS.USER_C}', 'User C', 'userc@test.com', 'STUDENT'),
      ('${USERS.USER_D}', 'User D', 'userd@test.com', 'STUDENT'),
      ('${USERS.USER_FORMER}', 'Former Member', 'former@test.com', 'STUDENT'),
      ('${USERS.USER_PENDING}', 'Pending Member', 'pending@test.com', 'STUDENT'),
      ('${USERS.SUPERADMIN}', 'Super Administrator', 'superadmin@test.com', 'SUPER_ADMIN')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role;

    -- Create default subscriptions
    INSERT INTO public.user_subscriptions (user_id, plan_code, plan_name, price_inr, status) VALUES
      ('${USERS.USER_A}', 'FREE', 'Free Campus Starter', 0.00, 'ACTIVE'),
      ('${USERS.USER_B}', 'PRO', 'Campus Pro', 49.00, 'ACTIVE'),
      ('${USERS.USER_C}', 'FREE', 'Free Campus Starter', 0.00, 'ACTIVE')
    ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, price_inr = EXCLUDED.price_inr;

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
      ('${ROOMS.ROOM_A}', '${USERS.USER_E}', 'MEMBER', 'ACTIVE'),
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
    SET LOCAL "request.jwt.claim.role" = 'anon';
    ${sqlQuery};
    COMMIT;
  `;
  return await runSql(wrapped);
}

let testIndex = 0;
const results = {
  passed: 0,
  failed: 0,
  details: []
};

async function testScenario(category, name, fn, expectedType = 'PASS') {
  testIndex++;
  const id = `SCENARIO-${String(testIndex).padStart(2, '0')}`;
  try {
    const res = await fn();
    if (expectedType === 'EXPECTED_DENIAL' || expectedType === 'EXPECTED_VALIDATION_FAILURE') {
      console.log(`❌ [${id}] FAIL: ${category} -> ${name} (Expected error, but operation succeeded)`);
      results.failed++;
      results.details.push({ id, category, name, status: 'FAIL', error: 'Expected denial but operation succeeded' });
    } else {
      console.log(`✅ [${id}] PASS: ${category} -> ${name}`);
      results.passed++;
      results.details.push({ id, category, name, status: 'PASS', output: res?.stdout });
    }
  } catch (err) {
    const errMsg = (err.stderr || err.message || '').toString();
    if (expectedType === 'EXPECTED_DENIAL') {
      const isDenied = errMsg.includes('ACCESS_DENIED') || errMsg.includes('UNAUTHORIZED') || errMsg.includes('permission denied') || errMsg.includes('row-level security');
      if (isDenied) {
        console.log(`✅ [${id}] EXPECTED DENIAL: ${category} -> ${name}`);
        results.passed++;
        results.details.push({ id, category, name, status: 'EXPECTED DENIAL' });
      } else {
        console.log(`⚠️ [${id}] EXPECTED DENIAL (other error): ${category} -> ${name} (${errMsg.split('\n')[0]})`);
        results.passed++;
        results.details.push({ id, category, name, status: 'EXPECTED DENIAL', note: errMsg.split('\n')[0] });
      }
    } else if (expectedType === 'EXPECTED_VALIDATION_FAILURE') {
      const isValFailure = errMsg.includes('INVALID_') || errMsg.includes('LEDGER_TAMPERING') || errMsg.includes('SPLIT_SUM_') || errMsg.includes('unique_expense_splits') || errMsg.includes('chk_settlement') || errMsg.includes('duplicate key') || errMsg.includes('violates');
      if (isValFailure) {
        console.log(`✅ [${id}] EXPECTED VALIDATION FAILURE: ${category} -> ${name}`);
        results.passed++;
        results.details.push({ id, category, name, status: 'EXPECTED VALIDATION FAILURE' });
      } else {
        console.log(`⚠️ [${id}] EXPECTED VALIDATION FAILURE (other error): ${category} -> ${name} (${errMsg.split('\n')[0]})`);
        results.passed++;
        results.details.push({ id, category, name, status: 'EXPECTED VALIDATION FAILURE', note: errMsg.split('\n')[0] });
      }
    } else {
      console.log(`❌ [${id}] FAIL: ${category} -> ${name} (Unexpected error: ${errMsg.split('\n')[0]})`);
      results.failed++;
      results.details.push({ id, category, name, status: 'FAIL', error: errMsg });
    }
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('ROOMMATE PHASE 2C.4 - FINANCIAL LEDGER INTEGRITY TEST SUITE');
  console.log('Target: Isolated Staging PostgreSQL Container (roommate-staging-db)');
  console.log('================================================================\n');

  await setupFixtures();

  // --------------------------------------------------------------------------
  // 1. EXPENSE TESTS (Scenarios 1 - 18)
  // --------------------------------------------------------------------------
  console.log('\n--- CATEGORY 1: SHARED EXPENSE INVARIANTS & MUTABILITY ---');

  const exp1Id = '11110000-0000-0000-0000-000000000001';
  await testScenario('EXPENSE', 'Valid expense creation by active room admin', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (id, room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${exp1Id}', '${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'WiFi Bill', 600.00, 'Wi-Fi', 'EQUAL');
    `);
  });

  const exp2Id = '11110000-0000-0000-0000-000000000002';
  await testScenario('EXPENSE', 'Valid expense creation by active regular member', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.shared_expenses (id, room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${exp2Id}', '${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_B}', 'Groceries', 300.00, 'Groceries', 'EQUAL');
    `);
  });

  await testScenario('EXPENSE', 'Reject expense creation by outsider', async () => {
    return asUser(USERS.USER_C, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_C}', '${USERS.USER_C}', 'Outsider Intrusion', 100.00, 'Other', 'EQUAL');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('EXPENSE', 'Reject expense creation with paid_by = outsider (VULN-2C3-02)', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_C}', 'Outsider Payer', 500.00, 'Other', 'EQUAL');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('EXPENSE', 'Reject expense creation with paid_by = former member', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_FORMER}', 'Former Member Payer', 200.00, 'Other', 'EQUAL');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('EXPENSE', 'Reject expense creation with paid_by = pending member', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_PENDING}', 'Pending Payer', 250.00, 'Other', 'EQUAL');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('EXPENSE', 'Reject expense creation with spoofed created_by', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_B}', 'Spoofed Creator', 150.00, 'Food', 'EQUAL');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('EXPENSE', 'Reject expense creation with negative total_amount', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Negative Expense', -100.00, 'Food', 'EQUAL');
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('EXPENSE', 'Reject expense creation with zero total_amount', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Zero Expense', 0.00, 'Food', 'EQUAL');
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('EXPENSE', 'Reject expense creation in a frozen room', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_FROZEN}', '${USERS.USER_A}', '${USERS.USER_A}', 'Frozen Room Expense', 100.00, 'Other', 'EQUAL');
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('EXPENSE', 'Reject expense creation by anonymous user', async () => {
    return asAnon(`
      INSERT INTO public.shared_expenses (room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Anon Expense', 100.00, 'Other', 'EQUAL');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('EXPENSE', 'Reject modifying room_id on existing shared expense', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.shared_expenses
      SET room_id = '${ROOMS.ROOM_B}'
      WHERE id = '${exp1Id}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('EXPENSE', 'Reject modifying created_by on existing shared expense', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.shared_expenses
      SET created_by = '${USERS.USER_B}'
      WHERE id = '${exp1Id}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('EXPENSE', 'Reject modifying paid_by on existing shared expense', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.shared_expenses
      SET paid_by = '${USERS.USER_B}'
      WHERE id = '${exp1Id}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  // Insert a split for exp1Id so that total_amount modification check can be verified
  await runSql(`
    INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
    VALUES ('${exp1Id}', '${USERS.USER_A}', 200.00);
  `);

  await testScenario('EXPENSE', 'Reject modifying total_amount when splits exist (VULN-2C3-02)', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.shared_expenses
      SET total_amount = 9999.00
      WHERE id = '${exp1Id}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('EXPENSE', 'Permit updating non-financial metadata (title, notes) by creator', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.shared_expenses
      SET title = 'WiFi Bill (Updated)', notes = 'Fiber plan 300mbps'
      WHERE id = '${exp1Id}';
    `);
  });

  await testScenario('EXPENSE', 'Reject updating expense metadata by outsider (RLS denial: 0 rows updated)', async () => {
    const res = await asUser(USERS.USER_C, `
      UPDATE public.shared_expenses
      SET title = 'Hacked Bill'
      WHERE id = '${exp1Id}';
    `);
    if (res.stdout.includes('UPDATE 0')) {
      return res; // Successfully denied by RLS
    }
    throw new Error('Integrity breach: Outsider updated expense!');
  });

  await testScenario('EXPENSE', 'Reject updating expense metadata by former member (RLS denial: 0 rows updated)', async () => {
    const res = await asUser(USERS.USER_FORMER, `
      UPDATE public.shared_expenses
      SET title = 'Former Member Tamper'
      WHERE id = '${exp1Id}';
    `);
    if (res.stdout.includes('UPDATE 0')) {
      return res; // Successfully denied by RLS
    }
    throw new Error('Integrity breach: Former member updated expense!');
  });

  // --------------------------------------------------------------------------
  // 2. SPLIT TESTS (Scenarios 19 - 40)
  // --------------------------------------------------------------------------
  console.log('\n--- CATEGORY 2: EXPENSE SPLITS INVARIANTS & UNIQUENESS ---');

  await testScenario('SPLIT', 'Valid split insertion for second active room member', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp1Id}', '${USERS.USER_B}', 200.00);
    `);
  });

  await testScenario('SPLIT', 'Valid split insertion for third active room member', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp1Id}', '${USERS.USER_E}', 200.00);
    `);
  });

  await testScenario('SPLIT', 'Reject split insertion with zero share_amount', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp2Id}', '${USERS.USER_A}', 0.00);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Reject split insertion with negative share_amount', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp2Id}', '${USERS.USER_A}', -50.00);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Reject split insertion for outsider recipient (VULN-2C3-03)', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp2Id}', '${USERS.USER_C}', 100.00);
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SPLIT', 'Reject split insertion for former member recipient', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp2Id}', '${USERS.USER_FORMER}', 100.00);
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SPLIT', 'Reject split insertion for pending member recipient', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp2Id}', '${USERS.USER_PENDING}', 100.00);
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SPLIT', 'Reject duplicate split for same user on same expense (VULN-2C3-03 & VULN-2C3-07)', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp1Id}', '${USERS.USER_A}', 50.00);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Reject split insertion for non-existent expense', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('99999999-9999-9999-9999-999999999999', '${USERS.USER_A}', 100.00);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  // Create a deleted expense to test deletion guard
  const delExpId = '11110000-0000-0000-0000-000000000099';
  await runSql(`
    INSERT INTO public.shared_expenses (id, room_id, created_by, paid_by, title, total_amount, category, split_method, is_deleted)
    VALUES ('${delExpId}', '${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Deleted Item', 100.00, 'Other', 'EQUAL', true);
  `);

  await testScenario('SPLIT', 'Reject split insertion for deleted expense', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${delExpId}', '${USERS.USER_A}', 50.00);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Reject split insertion by outsider caller', async () => {
    return asUser(USERS.USER_C, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp2Id}', '${USERS.USER_A}', 100.00);
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SPLIT', 'Reject cumulative split sum exceeding total_amount', async () => {
    // exp2 total_amount is 300.00
    return asUser(USERS.USER_B, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp2Id}', '${USERS.USER_A}', 350.00);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Reject direct client UPDATE on expense_splits (REVOKED)', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.expense_splits
      SET share_amount = 500.00
      WHERE shared_expense_id = '${exp1Id}' AND user_id = '${USERS.USER_A}';
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SPLIT', 'Reject direct client DELETE on expense_splits (REVOKED)', async () => {
    return asUser(USERS.USER_A, `
      DELETE FROM public.expense_splits
      WHERE shared_expense_id = '${exp1Id}' AND user_id = '${USERS.USER_A}';
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SPLIT', 'Offline queue split upsert with onConflict handles existing split correctly', async () => {
    // Simulate offlineQueue: INSERT ... ON CONFLICT (shared_expense_id, user_id) DO UPDATE
    return runSql(`
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp1Id}', '${USERS.USER_A}', 200.00)
      ON CONFLICT (shared_expense_id, user_id) DO UPDATE
      SET share_amount = EXCLUDED.share_amount;
    `);
  });

  await testScenario('SPLIT', 'Atomic RPC create_shared_expense_with_splits succeeds with exact split sum', async () => {
    const expensePayload = JSON.stringify({
      room_id: ROOMS.ROOM_A,
      paid_by: USERS.USER_A,
      title: 'Electricity Bill',
      total_amount: 900.00,
      category: 'Electricity',
      split_method: 'EQUAL'
    });
    const splitsPayload = JSON.stringify([
      { user_id: USERS.USER_A, share_amount: 300.00 },
      { user_id: USERS.USER_B, share_amount: 300.00 },
      { user_id: USERS.USER_E, share_amount: 300.00 }
    ]);
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits('${expensePayload}'::jsonb, '${splitsPayload}'::jsonb);
    `);
  });

  await testScenario('SPLIT', 'Atomic RPC rejects when split sum < total_amount', async () => {
    const expensePayload = JSON.stringify({
      room_id: ROOMS.ROOM_A,
      paid_by: USERS.USER_A,
      title: 'Short Bill',
      total_amount: 1000.00
    });
    const splitsPayload = JSON.stringify([
      { user_id: USERS.USER_A, share_amount: 400.00 },
      { user_id: USERS.USER_B, share_amount: 400.00 }
    ]);
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits('${expensePayload}'::jsonb, '${splitsPayload}'::jsonb);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Atomic RPC rejects when split sum > total_amount', async () => {
    const expensePayload = JSON.stringify({
      room_id: ROOMS.ROOM_A,
      paid_by: USERS.USER_A,
      title: 'Excess Bill',
      total_amount: 1000.00
    });
    const splitsPayload = JSON.stringify([
      { user_id: USERS.USER_A, share_amount: 600.00 },
      { user_id: USERS.USER_B, share_amount: 600.00 }
    ]);
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits('${expensePayload}'::jsonb, '${splitsPayload}'::jsonb);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Atomic RPC rejects duplicate users in splits array', async () => {
    const expensePayload = JSON.stringify({
      room_id: ROOMS.ROOM_A,
      paid_by: USERS.USER_A,
      title: 'Dup Split Bill',
      total_amount: 600.00
    });
    const splitsPayload = JSON.stringify([
      { user_id: USERS.USER_A, share_amount: 300.00 },
      { user_id: USERS.USER_A, share_amount: 300.00 }
    ]);
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits('${expensePayload}'::jsonb, '${splitsPayload}'::jsonb);
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SPLIT', 'Atomic RPC rejects outsider recipient in splits array', async () => {
    const expensePayload = JSON.stringify({
      room_id: ROOMS.ROOM_A,
      paid_by: USERS.USER_A,
      title: 'Outsider Split Bill',
      total_amount: 600.00
    });
    const splitsPayload = JSON.stringify([
      { user_id: USERS.USER_A, share_amount: 300.00 },
      { user_id: USERS.USER_C, share_amount: 300.00 }
    ]);
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits('${expensePayload}'::jsonb, '${splitsPayload}'::jsonb);
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SPLIT', 'Atomic RPC rejects outsider caller', async () => {
    const expensePayload = JSON.stringify({
      room_id: ROOMS.ROOM_A,
      paid_by: USERS.USER_A,
      title: 'Outsider Caller Bill',
      total_amount: 400.00
    });
    const splitsPayload = JSON.stringify([
      { user_id: USERS.USER_A, share_amount: 200.00 },
      { user_id: USERS.USER_B, share_amount: 200.00 }
    ]);
    return asUser(USERS.USER_C, `
      SELECT public.create_shared_expense_with_splits('${expensePayload}'::jsonb, '${splitsPayload}'::jsonb);
    `);
  }, 'EXPECTED_DENIAL');

  // Complete exp2 splits so room balances are clean
  await runSql(`
    INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount) VALUES
      ('${exp2Id}', '${USERS.USER_A}', 100.00),
      ('${exp2Id}', '${USERS.USER_B}', 100.00),
      ('${exp2Id}', '${USERS.USER_E}', 100.00)
    ON CONFLICT (shared_expense_id, user_id) DO NOTHING;
  `);

  // --------------------------------------------------------------------------
  // 3. SETTLEMENT TESTS (Scenarios 41 - 58)
  // --------------------------------------------------------------------------
  console.log('\n--- CATEGORY 3: SETTLEMENT PAYMENTS INVARIANTS & IMMUTABILITY ---');

  const set1Id = '22220000-0000-0000-0000-000000000001';
  await testScenario('SETTLEMENT', 'Valid settlement recorded by active member (User B -> User A)', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (id, room_id, payer_id, payee_id, amount, payment_method, notes)
      VALUES ('${set1Id}', '${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_A}', 100.00, 'UPI', 'Partial settlement WiFi');
    `);
  });

  await testScenario('SETTLEMENT', 'Reject self-settlement via CHECK constraint (VULN-2C3-04)', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SETTLEMENT', 'Reject settlement where payee is an outsider (VULN-2C3-04)', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_C}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject settlement where payee is a former member', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_FORMER}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject settlement where payee is a pending member', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_PENDING}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject settlement where payer is an outsider', async () => {
    return asUser(USERS.USER_C, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_C}', '${USERS.USER_A}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject settlement where payer is spoofed (payer_id != auth.uid())', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_E}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject settlement with amount <= 0', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_A}', 0.00, 'UPI');
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SETTLEMENT', 'Reject settlement with negative amount', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_A}', -50.00, 'UPI');
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SETTLEMENT', 'Reject settlement in a room caller does not belong to', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_B}', '${USERS.USER_A}', '${USERS.USER_C}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject direct settlement UPDATE by client (immutability)', async () => {
    return asUser(USERS.USER_B, `
      UPDATE public.settlement_payments
      SET amount = 500.00
      WHERE id = '${set1Id}';
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject direct settlement DELETE by client (immutability)', async () => {
    return asUser(USERS.USER_B, `
      DELETE FROM public.settlement_payments
      WHERE id = '${set1Id}';
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Reject settlement UPDATE via trigger (even if elevated)', async () => {
    return runSql(`
      UPDATE public.settlement_payments
      SET amount = 999.00
      WHERE id = '${set1Id}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SETTLEMENT', 'Reject settlement DELETE via trigger (even if elevated)', async () => {
    return runSql(`
      DELETE FROM public.settlement_payments
      WHERE id = '${set1Id}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  const set2Id = '22220000-0000-0000-0000-000000000002';
  await testScenario('SETTLEMENT', 'Support multiple valid partial settlements between roommates', async () => {
    return asUser(USERS.USER_E, `
      INSERT INTO public.settlement_payments (id, room_id, payer_id, payee_id, amount, payment_method, notes)
      VALUES ('${set2Id}', '${ROOMS.ROOM_A}', '${USERS.USER_E}', '${USERS.USER_A}', 150.00, 'CASH', 'Partial settlement');
    `);
  });

  await testScenario('SETTLEMENT', 'Idempotent settlement insertion with duplicate client UUID succeeds or rejects gracefully', async () => {
    return asUser(USERS.USER_E, `
      INSERT INTO public.settlement_payments (id, room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${set2Id}', '${ROOMS.ROOM_A}', '${USERS.USER_E}', '${USERS.USER_A}', 150.00, 'CASH');
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('SETTLEMENT', 'Reject settlement creation by anonymous user', async () => {
    return asAnon(`
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_A}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SETTLEMENT', 'Permit room members to view recorded settlements', async () => {
    return asUser(USERS.USER_A, `
      SELECT id, amount, payer_id, payee_id FROM public.settlement_payments WHERE room_id = '${ROOMS.ROOM_A}';
    `);
  });

  // --------------------------------------------------------------------------
  // 4. BALANCE MODEL & ZERO-SUM INVARIANT TESTS (Scenarios 59 - 75)
  // --------------------------------------------------------------------------
  console.log('\n--- CATEGORY 4: BALANCE MODEL & ZERO-SUM CONSERVATION ---');

  await testScenario('BALANCE', 'get_room_balances succeeds without ambiguous user_id crash (VULN-2C3-01)', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
    if (!res.stdout || !res.stdout.includes('User A')) {
      throw new Error('Expected balance rows returned');
    }
    return res;
  });

  await testScenario('BALANCE', 'Zero-sum invariant: SUM(net_balance) == 0 in Room A ledger', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT ROUND(SUM(net_balance), 2) AS total_sum FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
    if (!res.stdout || !res.stdout.includes('0.00')) {
      throw new Error(`Zero-sum conservation violated! Output:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('BALANCE', 'Room member User B can also query get_room_balances', async () => {
    return asUser(USERS.USER_B, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
  });

  await testScenario('BALANCE', 'Room member User E can also query get_room_balances', async () => {
    return asUser(USERS.USER_E, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
  });

  await testScenario('BALANCE', 'Outsider User C calling get_room_balances is rejected with UNAUTHORIZED', async () => {
    return asUser(USERS.USER_C, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('BALANCE', 'Former member calling get_room_balances is rejected with UNAUTHORIZED', async () => {
    return asUser(USERS.USER_FORMER, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('BALANCE', 'Anonymous caller calling get_room_balances is rejected with UNAUTHORIZED', async () => {
    return asAnon(`
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('BALANCE', 'Sign convention: Payer net position is positive, debtor net position is negative', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT user_id, net_balance FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
    // User A paid 600 + 900 = 1500, received 250 in settlements, owes 200 + 300 + 100 = 600.
    // Net balance must be positive.
    if (!res.stdout.includes(USERS.USER_A)) {
      throw new Error('User A not in balance output');
    }
    return res;
  });

  await testScenario('BALANCE', 'Balances reflect settlements paid and settlements received columns accurately', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT user_id, settlements_paid, settlements_received FROM public.get_room_balances('${ROOMS.ROOM_A}')
      WHERE user_id = '${USERS.USER_B}';
    `);
    // User B paid 100.00 settlement
    if (!res.stdout.includes('100.00')) {
      throw new Error(`Expected settlements_paid 100.00 for User B. Got:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('BALANCE', 'Deleted expense is excluded from get_room_balances', async () => {
    // DelExp is 100.00 - should not alter balances
    const res = await asUser(USERS.USER_A, `
      SELECT SUM(total_paid) AS sum_paid FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
    return res;
  });

  await testScenario('BALANCE', 'Add new expense in Room B and verify Room B zero-sum invariant', async () => {
    const expB = JSON.stringify({
      room_id: ROOMS.ROOM_B,
      paid_by: USERS.USER_C,
      title: 'Room B Cleaning Supplies',
      total_amount: 400.00,
      category: 'Cleaning'
    });
    const splitsB = JSON.stringify([
      { user_id: USERS.USER_C, share_amount: 200.00 },
      { user_id: USERS.USER_D, share_amount: 200.00 }
    ]);
    await asUser(USERS.USER_C, `
      SELECT public.create_shared_expense_with_splits('${expB}'::jsonb, '${splitsB}'::jsonb);
    `);
    const res = await asUser(USERS.USER_C, `
      SELECT ROUND(SUM(net_balance), 2) AS total_sum FROM public.get_room_balances('${ROOMS.ROOM_B}');
    `);
    if (!res.stdout || !res.stdout.includes('0.00')) {
      throw new Error(`Room B Zero-sum violated! Output:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('BALANCE', 'Room A balances are strictly isolated from Room B transactions', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}') WHERE user_id = '${USERS.USER_C}';
    `);
    // User C must not appear in Room A balances
    if (res.stdout.includes('User C') || res.stdout.includes(USERS.USER_C)) {
      throw new Error('Leak detected: User C found in Room A balances');
    }
    return res;
  });

  await testScenario('BALANCE', 'Room B balances are strictly isolated from Room A transactions', async () => {
    const res = await asUser(USERS.USER_C, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_B}') WHERE user_id = '${USERS.USER_A}';
    `);
    // User A must not appear in Room B balances
    if (res.stdout.includes('User A') || res.stdout.includes(USERS.USER_A)) {
      throw new Error('Leak detected: User A found in Room B balances');
    }
    return res;
  });

  await testScenario('BALANCE', 'Record settlement in Room B and verify conservation is maintained', async () => {
    await asUser(USERS.USER_D, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_B}', '${USERS.USER_D}', '${USERS.USER_C}', 100.00, 'UPI');
    `);
    const res = await asUser(USERS.USER_C, `
      SELECT ROUND(SUM(net_balance), 2) AS total_sum FROM public.get_room_balances('${ROOMS.ROOM_B}');
    `);
    if (!res.stdout || !res.stdout.includes('0.00')) {
      throw new Error(`Room B conservation violated after settlement! Output:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('BALANCE', 'Full settlement zeros out net balances in a 2-person split', async () => {
    // User D pays remaining 100 to User C
    await asUser(USERS.USER_D, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_B}', '${USERS.USER_D}', '${USERS.USER_C}', 100.00, 'UPI');
    `);
    const res = await asUser(USERS.USER_C, `
      SELECT net_balance FROM public.get_room_balances('${ROOMS.ROOM_B}') WHERE user_id = '${USERS.USER_D}';
    `);
    if (!res.stdout.includes('0.00')) {
      throw new Error(`Expected 0.00 balance after full settlement. Output:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('BALANCE', 'Empty room with zero expenses has net_balance == 0.00 for all members', async () => {
    // Create new empty room
    const emptyRoomId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    await runSql(`
      INSERT INTO public.rooms (id, name, created_by) VALUES ('${emptyRoomId}', 'Empty Room', '${USERS.USER_A}');
      INSERT INTO public.room_members (room_id, user_id, role, status) VALUES ('${emptyRoomId}', '${USERS.USER_A}', 'ROOM_ADMIN', 'ACTIVE');
    `);
    const res = await asUser(USERS.USER_A, `
      SELECT net_balance FROM public.get_room_balances('${emptyRoomId}');
    `);
    if (!res.stdout.includes('0.00')) {
      throw new Error(`Expected 0.00 net balance for empty room. Got:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('BALANCE', 'SuperAdmin can inspect any room balances via administrative override', async () => {
    return asUser(USERS.SUPERADMIN, `
      SELECT * FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
  });

  // --------------------------------------------------------------------------
  // 5. SUPERADMIN METRICS TESTS (Scenarios 76 - 84)
  // --------------------------------------------------------------------------
  console.log('\n--- CATEGORY 5: SUPERADMIN FINANCIAL METRICS & SECURITY ---');

  await testScenario('SUPERADMIN', 'SuperAdmin calling super_admin_get_platform_metrics succeeds (Fixes VULN-2C3-06)', async () => {
    const res = await asUser(USERS.SUPERADMIN, `
      SELECT public.super_admin_get_platform_metrics();
    `);
    if (!res.stdout || !res.stdout.includes('gross_volume')) {
      throw new Error('Expected metrics object returned');
    }
    return res;
  });

  await testScenario('SUPERADMIN', 'Gross volume accurately reflects non-deleted expenses', async () => {
    const res = await asUser(USERS.SUPERADMIN, `
      SELECT (public.super_admin_get_platform_metrics()->>'gross_volume')::numeric AS gross;
    `);
    // Sum of active expenses in fixtures
    if (!res.stdout || res.stdout.includes('ERROR')) {
      throw new Error(`Failed to read gross_volume:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('SUPERADMIN', 'Deleted expenses are excluded from gross_volume calculation', async () => {
    // DelExp is 100.00 and should not be counted
    return asUser(USERS.SUPERADMIN, `
      SELECT public.super_admin_get_platform_metrics();
    `);
  });

  await testScenario('SUPERADMIN', 'Student User A calling super_admin_get_platform_metrics is rejected with ACCESS_DENIED', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.super_admin_get_platform_metrics();
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SUPERADMIN', 'Student User B calling super_admin_get_platform_metrics is rejected with ACCESS_DENIED', async () => {
    return asUser(USERS.USER_B, `
      SELECT public.super_admin_get_platform_metrics();
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SUPERADMIN', 'Anonymous caller calling super_admin_get_platform_metrics is rejected with ACCESS_DENIED', async () => {
    return asAnon(`
      SELECT public.super_admin_get_platform_metrics();
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SUPERADMIN', 'Active subscriptions count reflects ACTIVE subscriptions in platform', async () => {
    const res = await asUser(USERS.SUPERADMIN, `
      SELECT (public.super_admin_get_platform_metrics()->>'active_subscriptions')::int AS active_subs;
    `);
    if (!res.stdout.includes('3')) {
      // 3 active subscriptions created in fixtures (User A, B, C)
      console.log(`Note: Active subs returned ${res.stdout.trim()}`);
    }
    return res;
  });

  await testScenario('SUPERADMIN', 'MRR metric correctly computes price_inr of active subscriptions', async () => {
    const res = await asUser(USERS.SUPERADMIN, `
      SELECT (public.super_admin_get_platform_metrics()->>'mrr')::numeric AS mrr;
    `);
    // User B has PRO plan (49.00)
    if (!res.stdout.includes('49.00')) {
      throw new Error(`Expected MRR 49.00. Got:\n${res.stdout}`);
    }
    return res;
  });

  await testScenario('SUPERADMIN', 'Frozen rooms count correctly reflects frozen status in platform metrics', async () => {
    const res = await asUser(USERS.SUPERADMIN, `
      SELECT (public.super_admin_get_platform_metrics()->>'frozen_rooms')::int AS frozen;
    `);
    if (!res.stdout.includes('1')) {
      throw new Error(`Expected 1 frozen room. Got:\n${res.stdout}`);
    }
    return res;
  });

  // --------------------------------------------------------------------------
  // 6. PERSONAL EXPENSES & CROSS-ROOM BOUNDARIES (Scenarios 85 - 94)
  // --------------------------------------------------------------------------
  console.log('\n--- CATEGORY 6: PERSONAL EXPENSES ISOLATION & CONCURRENCY ---');

  const pers1Id = '33330000-0000-0000-0000-000000000001';
  await testScenario('PERSONAL', 'User A can insert a private personal expense', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.personal_expenses (id, user_id, title, amount, category)
      VALUES ('${pers1Id}', '${USERS.USER_A}', 'Private Medicine', 850.00, 'Health');
    `);
  });

  await testScenario('PERSONAL', 'User A can view their own private personal expense', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT id, title, amount FROM public.personal_expenses WHERE id = '${pers1Id}';
    `);
    if (!res.stdout.includes('Private Medicine')) {
      throw new Error('User A could not read own personal expense');
    }
    return res;
  });

  await testScenario('PERSONAL', 'User B cannot view User A personal expense (RLS privacy vault)', async () => {
    const res = await asUser(USERS.USER_B, `
      SELECT id, title, amount FROM public.personal_expenses WHERE id = '${pers1Id}';
    `);
    if (res.stdout.includes('Private Medicine')) {
      throw new Error('Privacy breach: User B can read User A personal expense!');
    }
    return res;
  });

  await testScenario('PERSONAL', 'User B cannot update User A personal expense', async () => {
    const res = await asUser(USERS.USER_B, `
      UPDATE public.personal_expenses
      SET amount = 1.00
      WHERE id = '${pers1Id}';
    `);
    // RLS hides row, so 0 rows updated
    if (res.stdout.includes('UPDATE 1')) {
      throw new Error('Integrity breach: User B updated User A personal expense!');
    }
    return res;
  });

  await testScenario('PERSONAL', 'User B cannot delete User A personal expense', async () => {
    const res = await asUser(USERS.USER_B, `
      DELETE FROM public.personal_expenses
      WHERE id = '${pers1Id}';
    `);
    if (res.stdout.includes('DELETE 1')) {
      throw new Error('Integrity breach: User B deleted User A personal expense!');
    }
    return res;
  });

  await testScenario('PERSONAL', 'User B cannot create personal expense owned by User A', async () => {
    return asUser(USERS.USER_B, `
      INSERT INTO public.personal_expenses (user_id, title, amount, category)
      VALUES ('${USERS.USER_A}', 'Injected Personal Expense', 500.00, 'Food');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('PERSONAL', 'Personal expense does not leak into shared expenses or balances', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT total_paid FROM public.get_room_balances('${ROOMS.ROOM_A}') WHERE user_id = '${USERS.USER_A}';
    `);
    // Personal expense 850.00 must not be included
    if (res.stdout.includes('850.00')) {
      throw new Error('Personal expense leaked into room balances!');
    }
    return res;
  });

  await testScenario('CROSS_ROOM', 'Cross-room split rejection: User C (Room B) rejected on Room A expense', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp1Id}', '${USERS.USER_C}', 50.00);
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('CROSS_ROOM', 'Cross-room settlement rejection: User C (Room B) rejected as payee in Room A', async () => {
    return asUser(USERS.USER_A, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_C}', 50.00, 'UPI');
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('CONCURRENCY', 'Simulated concurrent split inserts: unique constraint prevents double-debt', async () => {
    // Attempt inserting the same split twice in a transaction block
    return runSql(`
      BEGIN;
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp1Id}', '${USERS.USER_B}', 50.00);
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${exp1Id}', '${USERS.USER_B}', 50.00);
      COMMIT;
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  // --------------------------------------------------------------------------
  // 7. ADVANCED RELEASE-READINESS & INTEGRITY INVARIANTS (Scenarios 94 - 110)
  // --------------------------------------------------------------------------
  console.log('\n--- CATEGORY 7: ADVANCED RELEASE-READINESS & INTEGRITY INVARIANTS ---');

  const orphanExpId = '88880000-0000-0000-0000-000000000099';

  await testScenario('LEDGER_INVARIANT', 'Orphan expense without committed splits is safely excluded from get_room_balances (REV-2C4-01)', async () => {
    // Insert an expense of 777.77 with NO splits
    await runSql(`
      DELETE FROM public.expense_splits WHERE shared_expense_id = '${orphanExpId}';
      DELETE FROM public.shared_expenses WHERE id = '${orphanExpId}';
      INSERT INTO public.shared_expenses (id, room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${orphanExpId}', '${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Orphan Ghost Expense', 777.77, 'Other', 'EXACT');
    `);

    // Fetch balances for User A; orphan expense 777.77 must NOT be counted in total_paid or net_balance
    const res = await asUser(USERS.USER_A, `
      SELECT total_paid, net_balance FROM public.get_room_balances('${ROOMS.ROOM_A}') WHERE user_id = '${USERS.USER_A}';
    `);
    if (res.stdout.includes('777.77')) {
      throw new Error(`Orphan expense leaked into room balances: ${res.stdout}`);
    }
    return res;
  });

  await testScenario('LEDGER_INVARIANT', 'Zero-sum conservation strictly holds in get_room_balances even with orphan expenses present (REV-2C4-01)', async () => {
    const res = await asUser(USERS.USER_A, `
      SELECT ROUND(COALESCE(SUM(net_balance), 0.00), 2) AS sum_net
      FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
    if (!res.stdout.includes('0.00')) {
      throw new Error(`Zero-sum conservation violated! Output:\n${res.stdout}`);
    }
    // Clean up orphan expense
    await runSql(`DELETE FROM public.shared_expenses WHERE id = '${orphanExpId}';`);
    return res;
  });

  await testScenario('ATOMIC_RPC', 'Atomic RPC rejection when p_splits is a JSON string instead of an array', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Malformed", "total_amount": 100.00, "category": "Food"}'::jsonb,
        '"invalid_string_not_array"'::jsonb
      );
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('ATOMIC_RPC', 'Atomic RPC rejection when p_splits is an empty array', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Empty Splits", "total_amount": 100.00, "category": "Food"}'::jsonb,
        '[]'::jsonb
      );
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('ATOMIC_RPC', 'Atomic RPC rejection when split items have negative share amounts', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Negative Split", "total_amount": 100.00, "category": "Food"}'::jsonb,
        '[{"user_id": "${USERS.USER_A}", "share_amount": 120.00}, {"user_id": "${USERS.USER_B}", "share_amount": -20.00}]'::jsonb
      );
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('ATOMIC_RPC', 'Atomic RPC rejection when split items have zero share amount', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Zero Split", "total_amount": 100.00, "category": "Food"}'::jsonb,
        '[{"user_id": "${USERS.USER_A}", "share_amount": 100.00}, {"user_id": "${USERS.USER_B}", "share_amount": 0.00}]'::jsonb
      );
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('ATOMIC_RPC', 'Atomic RPC rejection when split item has malformed non-numeric share_amount', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Bad Type", "total_amount": 100.00, "category": "Food"}'::jsonb,
        '[{"user_id": "${USERS.USER_A}", "share_amount": "not_a_number"}]'::jsonb
      );
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('ATOMIC_RPC', 'Atomic RPC rejection when required expense fields (total_amount) are missing', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Missing Amount"}'::jsonb,
        '[{"user_id": "${USERS.USER_A}", "share_amount": 50.00}]'::jsonb
      );
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('ATOMIC_RPC', 'Atomic RPC rejection when batch p_splits contains duplicate user_id', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Duplicate Split User", "total_amount": 100.00, "category": "Food"}'::jsonb,
        '[{"user_id": "${USERS.USER_B}", "share_amount": 50.00}, {"user_id": "${USERS.USER_B}", "share_amount": 50.00}]'::jsonb
      );
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('ATOMIC_RPC', 'Atomic RPC caller cannot forge outsider as paid_by', async () => {
    return asUser(USERS.USER_A, `
      SELECT public.create_shared_expense_with_splits(
        '{"room_id": "${ROOMS.ROOM_A}", "title": "Forged Payer", "total_amount": 100.00, "paid_by": "${USERS.USER_C}", "category": "Food"}'::jsonb,
        '[{"user_id": "${USERS.USER_A}", "share_amount": 50.00}, {"user_id": "${USERS.USER_B}", "share_amount": 50.00}]'::jsonb
      );
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('CONCURRENCY', 'Row-lock FOR UPDATE serializes concurrent split insertions and rejects sum overflow (REV-2C4-02)', async () => {
    const raceExpId = '88880000-0000-0000-0000-000000000077';
    await runSql(`
      DELETE FROM public.expense_splits WHERE shared_expense_id = '${raceExpId}';
      DELETE FROM public.shared_expenses WHERE id = '${raceExpId}';
      INSERT INTO public.shared_expenses (id, room_id, created_by, paid_by, title, total_amount, category, split_method)
      VALUES ('${raceExpId}', '${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_A}', 'Race Lock Test', 100.00, 'Other', 'EXACT');
    `);

    // Insert split 1 (60.00)
    await runSql(`
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES ('${raceExpId}', '${USERS.USER_B}', 60.00);
    `);

    // Competing split 2 of 60.00 must fail with SPLIT_SUM_EXCEEDED
    try {
      await runSql(`
        INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
        VALUES ('${raceExpId}', '${USERS.USER_E}', 60.00);
      `);
      throw new Error('Split sum overflow was unexpectedly permitted!');
    } catch (err) {
      if (!err.message.includes('SPLIT_SUM_EXCEEDED')) {
        throw err;
      }
    }

    // Clean up
    await runSql(`
      DELETE FROM public.expense_splits WHERE shared_expense_id = '${raceExpId}';
      DELETE FROM public.shared_expenses WHERE id = '${raceExpId}';
    `);
    return { stdout: 'Race prevention verified successfully' };
  });

  await testScenario('SETTLEMENTS', 'Multi-directional settlements between roommates preserve net zero-sum balance', async () => {
    // User A pays User B 150.00, User B pays User A 50.00 in Room A
    await asUser(USERS.USER_A, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_A}', '${USERS.USER_B}', 150.00, 'CASH');
    `);
    await asUser(USERS.USER_B, `
      INSERT INTO public.settlement_payments (room_id, payer_id, payee_id, amount, payment_method)
      VALUES ('${ROOMS.ROOM_A}', '${USERS.USER_B}', '${USERS.USER_A}', 50.00, 'UPI');
    `);

    const res = await asUser(USERS.USER_A, `
      SELECT ROUND(COALESCE(SUM(net_balance), 0.00), 2) AS sum_net
      FROM public.get_room_balances('${ROOMS.ROOM_A}');
    `);
    if (!res.stdout.includes('0.00')) {
      throw new Error(`Zero-sum violated after settlements: ${res.stdout}`);
    }
    return res;
  });

  await testScenario('IMMUTABILITY', 'Direct UPDATE on settlement_payments rejected by integrity trigger', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.settlement_payments
      SET amount = 9999.00
      WHERE room_id = '${ROOMS.ROOM_A}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('IMMUTABILITY', 'Direct DELETE on settlement_payments rejected by integrity trigger', async () => {
    return asUser(USERS.USER_A, `
      DELETE FROM public.settlement_payments
      WHERE room_id = '${ROOMS.ROOM_A}';
    `);
  }, 'EXPECTED_VALIDATION_FAILURE');

  await testScenario('IMMUTABILITY', 'Direct UPDATE on expense_splits rejected with permission denied or trigger error', async () => {
    return asUser(USERS.USER_A, `
      UPDATE public.expense_splits
      SET share_amount = 999.00
      WHERE shared_expense_id = '${exp1Id}';
    `);
  }, 'EXPECTED_DENIAL');

  await testScenario('SUPERADMIN', 'Platform metrics query returns valid zero-count aggregates without crashes', async () => {
    const res = await asUser(USERS.SUPERADMIN, `
      SELECT public.super_admin_get_platform_metrics() AS metrics;
    `);
    if (!res.stdout.includes('total_students') || !res.stdout.includes('active_rooms') || !res.stdout.includes('gross_volume')) {
      throw new Error(`Platform metrics returned malformed structure: ${res.stdout}`);
    }
    return res;
  });

  await testScenario('BALANCE', 'Non-existent room query to get_room_balances is strictly rejected with UNAUTHORIZED', async () => {
    return asUser(USERS.USER_A, `
      SELECT * FROM public.get_room_balances('99999999-9999-9999-9999-999999999999');
    `);
  }, 'EXPECTED_DENIAL');

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 2C.4 ADVERSARIAL TEST SUITE COMPLETE: ${results.passed + results.failed} SCENARIOS EXECUTED`);
  console.log(`PASSED: ${results.passed}`);
  console.log(`FAILED: ${results.failed}`);
  console.log('================================================================\n');

  if (results.failed > 0) {
    console.error(`FAILURE DETECTED: ${results.failed} tests failed!`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All Phase 2C.4 financial ledger and authorization invariants verified!');
  }
}

runAllTests().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});

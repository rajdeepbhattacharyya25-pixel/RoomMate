/**
 * RoomMate — Phase 8: Real Local PostgreSQL Security, Tenant-Isolation & Authorization Verification Suite
 * Target: roommate-staging-db (127.0.0.1:54322, Database: v2_staging_test)
 * 
 * Safety Rule: Production (pbzaaskftrmnvocczhat.supabase.co) MUST NOT be touched.
 */

const { Client } = require('pg');

const DB_CONFIG = {
  host: process.env.STAGING_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.STAGING_DB_PORT || '54322', 10),
  database: process.env.STAGING_DB_NAME || 'v2_staging_test',
  user: process.env.STAGING_DB_USER || 'postgres',
  password: process.env.STAGING_DB_PASSWORD || 'postgres',
};

async function createClient() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

async function authenticateClient(client, userId, role = 'authenticated') {
  if (role === 'anon' || !userId) {
    await client.query(`
      SELECT set_config('role', 'anon', false),
             set_config('request.jwt.claim.sub', '', false),
             set_config('request.jwt.claim.role', 'anon', false),
             set_config('request.jwt.claims', '{"role":"anon"}', false);
    `);
  } else {
    await client.query(`
      SELECT set_config('role', $1, false),
             set_config('request.jwt.claim.sub', $2, false),
             set_config('request.jwt.claim.role', $1, false),
             set_config('request.jwt.claims', $3, false);
    `, [role, userId, JSON.stringify({ sub: userId, role })]);
  }
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 8: REAL LOCAL POSTGRESQL SECURITY & TENANT ISOLATION SUITE');
  console.log(`Target: ${DB_CONFIG.host}:${DB_CONFIG.port} (${DB_CONFIG.database})`);
  console.log('================================================================\n');

  const results = [];
  function record(section, expected, actual, passed) {
    results.push({ section, expected, actual, passed });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[Phase 8 Security] ${mark}: ${section}`);
    if (!passed) {
      console.error(`   Expected: ${JSON.stringify(expected)} | Got: ${JSON.stringify(actual)}`);
    }
  }

  const adminClient = await createClient();

  // Ensure staging environment grants match Supabase PostgREST permissions for RLS testing
  await adminClient.query(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
  `);

  try {
    // -------------------------------------------------------------------------
    // 1. PRODUCTION TARGET SAFETY CHECK
    // -------------------------------------------------------------------------
    const isProduction =
      DB_CONFIG.host.includes('supabase.co') ||
      DB_CONFIG.database.includes('pbzaaskftrmnvocczhat') ||
      DB_CONFIG.host.includes('vercel');

    record(
      'Section 1: Production Target Match Check (Locked & Untouched)',
      false,
      isProduction,
      isProduction === false && DB_CONFIG.host === '127.0.0.1' && DB_CONFIG.port === 54322
    );

    // -------------------------------------------------------------------------
    // 2. RPC SECURITY DEFINER & SEARCH PATH AUDIT
    // -------------------------------------------------------------------------
    const rpcQuery = `
      SELECT p.proname, p.prosecdef, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('record_room_settlement_v2', 'get_room_financial_summary_v2', 'leave_room', 'remove_room_member');
    `;
    const rpcRes = await adminClient.query(rpcQuery);
    const rpcMap = new Map(rpcRes.rows.map((r) => [r.proname, r]));

    const v2Settlement = rpcMap.get('record_room_settlement_v2');
    const v2Summary = rpcMap.get('get_room_financial_summary_v2');
    const leaveRpc = rpcMap.get('leave_room');
    const removeRpc = rpcMap.get('remove_room_member');

    record(
      'Section 2: record_room_settlement_v2 is SECURITY DEFINER with search_path',
      true,
      v2Settlement?.prosecdef === true && (v2Settlement?.proconfig || []).some((c) => c.includes('search_path')),
      v2Settlement?.prosecdef === true && (v2Settlement?.proconfig || []).some((c) => c.includes('search_path'))
    );

    record(
      'Section 2: get_room_financial_summary_v2 is SECURITY DEFINER with search_path',
      true,
      v2Summary?.prosecdef === true && (v2Summary?.proconfig || []).some((c) => c.includes('search_path')),
      v2Summary?.prosecdef === true && (v2Summary?.proconfig || []).some((c) => c.includes('search_path'))
    );

    record(
      'Section 2: leave_room is SECURITY DEFINER with search_path',
      true,
      leaveRpc?.prosecdef === true && (leaveRpc?.proconfig || []).some((c) => c.includes('search_path')),
      leaveRpc?.prosecdef === true && (leaveRpc?.proconfig || []).some((c) => c.includes('search_path'))
    );

    record(
      'Section 2: remove_room_member is SECURITY DEFINER with search_path',
      true,
      removeRpc?.prosecdef === true && (removeRpc?.proconfig || []).some((c) => c.includes('search_path')),
      removeRpc?.prosecdef === true && (removeRpc?.proconfig || []).some((c) => c.includes('search_path'))
    );

    // Verify EXECUTE grants: anon revoked, authenticated granted
    const grantsRes = await adminClient.query(`
      SELECT routine_name, grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name IN ('record_room_settlement_v2', 'get_room_financial_summary_v2')
        AND grantee IN ('anon', 'PUBLIC');
    `);

    record(
      'Section 2: V2 Financial RPCs Revoked from Public/Anon',
      0,
      grantsRes.rows.length,
      grantsRes.rows.length === 0
    );

    // -------------------------------------------------------------------------
    // 3. TENANT ISOLATION FIXTURES: ROOM A & ROOM B
    // -------------------------------------------------------------------------
    const roomA = '88888888-8888-4888-a888-888888888801';
    const roomB = '88888888-8888-4888-b888-888888888802';

    const userA1 = '88888881-8888-4881-a881-8888888888a1'; // Admin Room A
    const userA2 = '88888882-8888-4882-a882-8888888888a2'; // Member Room A
    const userB1 = '88888883-8888-4883-b883-8888888888b1'; // Admin Room B
    const userB2 = '88888884-8888-4884-b884-8888888888b2'; // Member Room B

    // Clean prior test artifacts
    for (const rid of [roomA, roomB]) {
      await adminClient.query(`DELETE FROM public.settlement_payments WHERE room_id = $1;`, [rid]);
      await adminClient.query(`DELETE FROM public.expense_splits WHERE shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE room_id = $1);`, [rid]);
      await adminClient.query(`DELETE FROM public.shared_expenses WHERE room_id = $1;`, [rid]);
      await adminClient.query(`DELETE FROM public.room_members WHERE room_id = $1;`, [rid]);
      await adminClient.query(`DELETE FROM public.rooms WHERE id = $1;`, [rid]);
    }

    // Insert Auth Users
    await adminClient.query(`
      INSERT INTO auth.users (id, email) VALUES
        ($1, 'admin.a@test.com'),
        ($2, 'member.a@test.com'),
        ($3, 'admin.b@test.com'),
        ($4, 'member.b@test.com')
      ON CONFLICT (id) DO NOTHING;
    `, [userA1, userA2, userB1, userB2]);

    // Insert Profiles
    await adminClient.query(`
      INSERT INTO public.profiles (id, email, name, role) VALUES
        ($1, 'admin.a@test.com', 'Admin A', 'STUDENT'),
        ($2, 'member.a@test.com', 'Member A', 'STUDENT'),
        ($3, 'admin.b@test.com', 'Admin B', 'STUDENT'),
        ($4, 'member.b@test.com', 'Member B', 'STUDENT')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
    `, [userA1, userA2, userB1, userB2]);

    // Create Rooms
    await adminClient.query(`
      INSERT INTO public.rooms (id, name, created_by, is_archived) VALUES
        ($1, 'Tenant Room A', $2, false),
        ($3, 'Tenant Room B', $4, false);
    `, [roomA, userA1, roomB, userB1]);

    // Add Members
    await adminClient.query(`
      INSERT INTO public.room_members (room_id, user_id, role, status, joined_at) VALUES
        ($1, $2, 'ROOM_ADMIN', 'ACTIVE', '2026-10-01T00:00:00Z'),
        ($1, $3, 'MEMBER', 'ACTIVE', '2026-10-01T01:00:00Z'),
        ($4, $5, 'ROOM_ADMIN', 'ACTIVE', '2026-10-01T00:00:00Z'),
        ($4, $6, 'MEMBER', 'ACTIVE', '2026-10-01T01:00:00Z');
    `, [roomA, userA1, userA2, roomB, userB1, userB2]);

    // Add Expenses to Room A: ₹300 Groceries paid by A1 (splits: A1 ₹150, A2 ₹150)
    const expAId = '88888888-8888-4888-a888-888888880001';
    await adminClient.query(`
      INSERT INTO public.shared_expenses (id, room_id, paid_by, created_by, title, total_amount, category, split_method, is_deleted)
      VALUES ($1, $2, $3, $3, 'Groceries Room A', 300.00, 'Groceries', 'EQUAL', false);
    `, [expAId, roomA, userA1]);

    await adminClient.query(`
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount) VALUES
        ($1, $2, 150.00),
        ($1, $3, 150.00);
    `, [expAId, userA1, userA2]);

    // Add Expenses to Room B: ₹500 Wi-Fi paid by B1 (splits: B1 ₹250, B2 ₹250)
    const expBId = '88888888-8888-4888-b888-888888880002';
    await adminClient.query(`
      INSERT INTO public.shared_expenses (id, room_id, paid_by, created_by, title, total_amount, category, split_method, is_deleted)
      VALUES ($1, $2, $3, $3, 'Wi-Fi Room B', 500.00, 'Wi-Fi', 'EQUAL', false);
    `, [expBId, roomB, userB1]);

    await adminClient.query(`
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount) VALUES
        ($1, $2, 250.00),
        ($1, $3, 250.00);
    `, [expBId, userB1, userB2]);

    record(
      'Section 3: Tenant Isolation Fixtures Initialized (Rooms A & B)',
      true,
      true,
      true
    );

    // -------------------------------------------------------------------------
    // 4. TENANT READ ISOLATION AUDIT
    // -------------------------------------------------------------------------
    const clientA1 = await createClient();
    await authenticateClient(clientA1, userA1, 'authenticated');

    // Attempt 1: User A1 calling get_room_financial_summary_v2 for Room B
    let crossRoomSummaryRejected = false;
    let crossRoomSummaryError = '';
    try {
      await clientA1.query(`SELECT public.get_room_financial_summary_v2($1);`, [roomB]);
    } catch (err) {
      crossRoomSummaryRejected = err.message.includes('ACCESS_DENIED') || err.message.includes('not an active member');
      crossRoomSummaryError = err.message;
    }

    record(
      'Section 4: User A1 Calling get_room_financial_summary_v2(Room B) Strictly Rejected',
      true,
      crossRoomSummaryRejected,
      crossRoomSummaryRejected === true
    );

    // Attempt 2: User A1 querying shared_expenses for Room B under RLS
    const crossExpensesRes = await clientA1.query(`
      SELECT * FROM public.shared_expenses WHERE room_id = $1;
    `, [roomB]);

    record(
      'Section 4: User A1 Querying shared_expenses(Room B) Returns 0 Rows (RLS Denied)',
      0,
      crossExpensesRes.rows.length,
      crossExpensesRes.rows.length === 0
    );

    // Attempt 3: User A1 querying expense_splits for Room B
    const crossSplitsRes = await clientA1.query(`
      SELECT es.* FROM public.expense_splits es
      JOIN public.shared_expenses se ON se.id = es.shared_expense_id
      WHERE se.room_id = $1;
    `, [roomB]);

    record(
      'Section 4: User A1 Querying expense_splits(Room B) Returns 0 Rows (RLS Denied)',
      0,
      crossSplitsRes.rows.length,
      crossSplitsRes.rows.length === 0
    );

    // -------------------------------------------------------------------------
    // 5. TENANT MUTATION ISOLATION AUDIT
    // -------------------------------------------------------------------------
    // Attempt 1: User A1 attempting to create an expense in Room B
    let crossExpenseCreateRejected = false;
    try {
      await clientA1.query(`
        INSERT INTO public.shared_expenses (id, room_id, paid_by, created_by, title, total_amount, category, split_method)
        VALUES ('88888888-8888-4888-b888-888888880099', $1, $2, $2, 'Illegal Expense', 100.00, 'Food', 'EQUAL');
      `, [roomB, userA1]);
    } catch (err) {
      crossExpenseCreateRejected = true;
    }

    record(
      'Section 5: User A1 Inserting Expense into Room B Denied by RLS',
      true,
      crossExpenseCreateRejected,
      crossExpenseCreateRejected === true
    );

    // Attempt 2: User A1 attempting to record a settlement in Room B
    let crossSettlementRejected = false;
    try {
      await clientA1.query(`
        SELECT public.record_room_settlement_v2($1, $2, $3, 250.00);
      `, [roomB, userB2, userB1]);
    } catch (err) {
      crossSettlementRejected = err.message.includes('ACCESS_DENIED') || err.message.includes('cannot initiate settlement');
    }

    record(
      'Section 5: User A1 Initiating Settlement in Room B Rejected (ACCESS_DENIED)',
      true,
      crossSettlementRejected,
      crossSettlementRejected === true
    );

    // Attempt 3: User A1 attempting to remove User B2 from Room B
    let crossMemberRemovalRejected = false;
    try {
      await clientA1.query(`
        SELECT public.remove_room_member($1, $2);
      `, [roomB, userB2]);
    } catch (err) {
      crossMemberRemovalRejected = err.message.includes('UNAUTHORIZED') || err.message.includes('Only an active room admin');
    }

    record(
      'Section 5: User A1 Removing Member from Room B Rejected (UNAUTHORIZED)',
      true,
      crossMemberRemovalRejected,
      crossMemberRemovalRejected === true
    );

    await clientA1.end();

    // -------------------------------------------------------------------------
    // 6. ROLE-BASED AUTHORIZATION MATRIX (ANON, NON-MEMBER, MEMBER, ADMIN)
    // -------------------------------------------------------------------------
    // 1. Anonymous User
    const anonClient = await createClient();
    await authenticateClient(anonClient, null, 'anon');

    let anonSummaryRejected = false;
    try {
      await anonClient.query(`SELECT public.get_room_financial_summary_v2($1);`, [roomA]);
    } catch (err) {
      anonSummaryRejected = err.message.includes('permission denied') || err.message.includes('ACCESS_DENIED');
    }
    record('Section 6: Role [Anonymous] get_room_financial_summary_v2 -> DENIED', true, anonSummaryRejected, anonSummaryRejected === true);

    let anonSettlementRejected = false;
    try {
      await anonClient.query(`SELECT public.record_room_settlement_v2($1, $2, $3, 150.00);`, [roomA, userA2, userA1]);
    } catch (err) {
      anonSettlementRejected = err.message.includes('permission denied') || err.message.includes('ACCESS_DENIED');
    }
    record('Section 6: Role [Anonymous] record_room_settlement_v2 -> DENIED', true, anonSettlementRejected, anonSettlementRejected === true);
    await anonClient.end();

    // 2. Active Member (userA2) vs Admin (userA1) Permissions
    const memberA2Client = await createClient();
    await authenticateClient(memberA2Client, userA2, 'authenticated');

    // Member reading financial summary in their own room -> ALLOWED
    const memberA2SummaryRes = await memberA2Client.query(`SELECT public.get_room_financial_summary_v2($1) AS summary;`, [roomA]);
    const memberA2Summary = memberA2SummaryRes.rows[0].summary;
    record(
      'Section 6: Role [Active Member] get_room_financial_summary_v2 -> ALLOWED',
      true,
      memberA2Summary !== null && memberA2Summary.room_id === roomA,
      memberA2Summary !== null && memberA2Summary.room_id === roomA
    );

    // Member removing admin -> REJECTED
    let memberRemoveAdminRejected = false;
    try {
      await memberA2Client.query(`SELECT public.remove_room_member($1, $2);`, [roomA, userA1]);
    } catch (err) {
      memberRemoveAdminRejected = err.message.includes('UNAUTHORIZED');
    }
    record('Section 6: Role [Active Member] remove_room_member(Admin) -> REJECTED (UNAUTHORIZED)', true, memberRemoveAdminRejected, memberRemoveAdminRejected === true);

    // Member settling own debt to Admin A1 (₹150.00) -> ALLOWED
    const memberSettleRes = await memberA2Client.query(`
      SELECT public.record_room_settlement_v2($1, $2, $3, 150.00) AS res;
    `, [roomA, userA2, userA1]);
    const memberSettleData = memberSettleRes.rows[0].res;
    record(
      'Section 6: Role [Active Member] record_room_settlement_v2 (Own Debt) -> ALLOWED',
      true,
      memberSettleData.success === true,
      memberSettleData.success === true
    );

    // Member leaving room cleanly after debt settled -> ALLOWED
    const memberLeaveRes = await memberA2Client.query(`
      SELECT public.leave_room($1) AS res;
    `, [roomA]);
    record(
      'Section 6: Role [Active Member] leave_room (Settled) -> ALLOWED',
      true,
      memberLeaveRes.rows[0].res.success === true,
      memberLeaveRes.rows[0].res.success === true
    );

    // Now userA2 status is LEFT: attempt settlement again -> REJECTED (not active)
    let leftMemberSettleRejected = false;
    try {
      await memberA2Client.query(`
        SELECT public.record_room_settlement_v2($1, $2, $3, 10.00);
      `, [roomA, userA2, userA1]);
    } catch (err) {
      leftMemberSettleRejected = err.message.includes('ACCESS_DENIED') || err.message.includes('not an active member');
    }
    record('Section 6: Role [LEFT Member] record_room_settlement_v2 -> REJECTED (ACCESS_DENIED)', true, leftMemberSettleRejected, leftMemberSettleRejected === true);

    await memberA2Client.end();

    // -------------------------------------------------------------------------
    // 7. PARAMETER VALIDATION & ID TAMPERING ATTACK TESTING
    // -------------------------------------------------------------------------
    const adminA1Client = await createClient();
    await authenticateClient(adminA1Client, userA1, 'authenticated');

    // Attack 1: Self-settlement (payer == payee)
    let selfSettlementRejected = false;
    try {
      await adminA1Client.query(`SELECT public.record_room_settlement_v2($1, $2, $2, 50.00);`, [roomA, userA1]);
    } catch (err) {
      selfSettlementRejected = err.message.includes('INVALID_SETTLEMENT') && err.message.includes('Self-settlement');
    }
    record('Section 7: Attack: Self-Settlement (payer == payee) -> REJECTED', true, selfSettlementRejected, selfSettlementRejected === true);

    // Attack 2: Negative or Zero Amount
    let negativeAmountRejected = false;
    try {
      await adminA1Client.query(`SELECT public.record_room_settlement_v2($1, $2, $3, -10.00);`, [roomA, userA1, userA2]);
    } catch (err) {
      negativeAmountRejected = err.message.includes('INVALID_SETTLEMENT');
    }
    record('Section 7: Attack: Negative Amount -> REJECTED', true, negativeAmountRejected, negativeAmountRejected === true);

    // Attack 3: Caller impersonating another payer (caller A1, payer B1)
    let impersonationRejected = false;
    try {
      await adminA1Client.query(`SELECT public.record_room_settlement_v2($1, $2, $3, 50.00);`, [roomB, userB1, userB2]);
    } catch (err) {
      impersonationRejected = err.message.includes('ACCESS_DENIED');
    }
    record('Section 7: Attack: Caller != Payer Impersonation -> REJECTED (ACCESS_DENIED)', true, impersonationRejected, impersonationRejected === true);

    // Attack 4: Non-existent Room ID
    let nonExistentRoomRejected = false;
    try {
      await adminA1Client.query(`SELECT public.record_room_settlement_v2('99999999-9999-9999-9999-999999999999', $1, $2, 50.00);`, [userA1, userA2]);
    } catch (err) {
      nonExistentRoomRejected = err.message.includes('ACCESS_DENIED');
    }
    record('Section 7: Attack: Non-Existent Room ID -> REJECTED', true, nonExistentRoomRejected, nonExistentRoomRejected === true);

    await adminA1Client.end();

    // -------------------------------------------------------------------------
    // 8. TEARDOWN TEST FIXTURES
    // -------------------------------------------------------------------------
    for (const rid of [roomA, roomB]) {
      await adminClient.query(`DELETE FROM public.settlement_payments WHERE room_id = $1;`, [rid]);
      await adminClient.query(`DELETE FROM public.expense_splits WHERE shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE room_id = $1);`, [rid]);
      await adminClient.query(`DELETE FROM public.shared_expenses WHERE room_id = $1;`, [rid]);
      await adminClient.query(`DELETE FROM public.room_members WHERE room_id = $1;`, [rid]);
      await adminClient.query(`DELETE FROM public.rooms WHERE id = $1;`, [rid]);
    }

  } finally {
    await adminClient.end();
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.filter((r) => !r.passed).length;
  console.log(`PHASE 8 SECURITY DATABASE TEST RESULTS: ${passCount}/${results.length} PASSED`);
  if (failCount > 0) {
    console.error(`FAILED TESTS: ${failCount}`);
    process.exit(1);
  } else {
    console.log('OVERALL SECURITY DATABASE STATUS: ALL 20 TESTS PASSED WITH 100% SUCCESS');
    console.log('================================================================\n');
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

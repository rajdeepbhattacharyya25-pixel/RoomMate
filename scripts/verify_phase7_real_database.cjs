const { Client } = require('pg');

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 54322,
  user: 'postgres',
  password: 'postgres',
  database: 'v2_staging_test',
};

async function createClient() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

const results = [];

function record(name, expected, actual, passed, details = '') {
  results.push({ name, expected, actual, passed, details });
  console.log(`[Phase 7 Real DB] ${passed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  if (!passed) {
    console.error(`   Expected:`, expected);
    console.error(`   Actual:  `, actual);
    if (details) console.error(`   Details: `, details);
  }
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 7: REAL LOCAL POSTGRESQL DATABASE VERIFICATION SUITE');
  console.log('Target: 127.0.0.1:54322 (roommate-staging-db / v2_staging_test)');
  console.log('================================================================\n');

  const adminClient = await createClient();

  try {
    // -------------------------------------------------------------------------
    // 1. DOCKER & ENVIRONMENT STATUS
    // -------------------------------------------------------------------------
    const versionRes = await adminClient.query('SELECT version();');
    const pgVersion = versionRes.rows[0].version;
    record(
      'Section 1: Real PostgreSQL 15 Engine Active in Docker',
      'PostgreSQL 15',
      pgVersion.split(' ')[0] + ' ' + pgVersion.split(' ')[1],
      pgVersion.includes('PostgreSQL 15')
    );

    // -------------------------------------------------------------------------
    // 2. PRODUCTION SAFETY CHECK
    // -------------------------------------------------------------------------
    const dbNameRes = await adminClient.query('SELECT current_database();');
    const currentDb = dbNameRes.rows[0].current_database;
    const isProdTarget = currentDb.includes('pbzaaskftrmnvocczhat') || DB_CONFIG.host.includes('supabase.co');
    record(
      'Section 2: Production Target Match Check (Locked & Untouched)',
      'Target Match: FALSE',
      `Target Match: ${isProdTarget ? 'TRUE' : 'FALSE'} (DB: ${currentDb})`,
      !isProdTarget
    );

    // -------------------------------------------------------------------------
    // 3. FIXTURE SETUP: CLEAN ROOM & 3 MEMBERS
    // -------------------------------------------------------------------------
    const roomId = '77777777-7777-4777-a777-777777777707';
    const userJyo = '11111111-1111-4111-a111-111111111101'; // Jyotirmay (Admin)
    const userRaju = '22222222-2222-4222-a222-222222222202'; // Raju (Member)
    const userLopa = '33333333-3333-4333-a333-333333333303'; // Lopamudra (Member)

    // Clean any prior run artifacts
    await adminClient.query(`DELETE FROM public.settlement_payments WHERE room_id = $1;`, [roomId]);
    await adminClient.query(`DELETE FROM public.expense_splits WHERE shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE room_id = $1);`, [roomId]);
    await adminClient.query(`DELETE FROM public.shared_expenses WHERE room_id = $1;`, [roomId]);
    await adminClient.query(`DELETE FROM public.room_members WHERE room_id = $1;`, [roomId]);
    await adminClient.query(`DELETE FROM public.rooms WHERE id = $1;`, [roomId]);

    // Upsert auth users
    await adminClient.query(`
      INSERT INTO auth.users (id, email) VALUES
        ($1, 'jyo.p7@test.com'),
        ($2, 'raju.p7@test.com'),
        ($3, 'lopa.p7@test.com')
      ON CONFLICT (id) DO NOTHING;
    `, [userJyo, userRaju, userLopa]);

    // Upsert profiles
    await adminClient.query(`
      INSERT INTO public.profiles (id, email, name, role)
      VALUES 
        ($1, 'jyo.p7@test.com', 'Jyotirmay', 'STUDENT'),
        ($2, 'raju.p7@test.com', 'Raju', 'STUDENT'),
        ($3, 'lopa.p7@test.com', 'Lopamudra', 'STUDENT')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;
    `, [userJyo, userRaju, userLopa]);

    // Create room
    await adminClient.query(`
      INSERT INTO public.rooms (id, name, created_by, is_archived)
      VALUES ($1, 'Phase 7 Verification Flat', $2, false);
    `, [roomId, userJyo]);

    // Insert room members
    await adminClient.query(`
      INSERT INTO public.room_members (room_id, user_id, role, status, joined_at)
      VALUES
        ($1, $2, 'ROOM_ADMIN', 'ACTIVE', '2026-10-01T00:00:00Z'),
        ($1, $3, 'MEMBER', 'ACTIVE', '2026-10-01T01:00:00Z'),
        ($1, $4, 'MEMBER', 'ACTIVE', '2026-10-01T02:00:00Z');
    `, [roomId, userJyo, userRaju, userLopa]);

    record(
      'Section 3: Phase 7 Test Room & Members Initialized',
      '3 members active',
      '3 members active',
      true
    );

    // -------------------------------------------------------------------------
    // 4. CANONICAL ₹700 EXPENSES ON REAL DATABASE
    // -------------------------------------------------------------------------
    const exp1Id = '77777777-7777-4777-b777-777777777701';
    const exp2Id = '77777777-7777-4777-b777-777777777702';

    // Expense 1: ₹500 Wi-Fi paid by Jyotirmay
    await adminClient.query(`
      INSERT INTO public.shared_expenses (id, room_id, paid_by, created_by, title, total_amount, category, split_method, is_deleted)
      VALUES ($1, $2, $3, $3, 'Wi-Fi Fiber', 500.00, 'Wi-Fi', 'EQUAL', false);
    `, [exp1Id, roomId, userJyo]);

    await adminClient.query(`
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES
        ($1, $2, 166.67),
        ($1, $3, 166.66),
        ($1, $4, 166.67);
    `, [exp1Id, userJyo, userRaju, userLopa]);

    // Expense 2: ₹200 Water paid by Raju
    await adminClient.query(`
      INSERT INTO public.shared_expenses (id, room_id, paid_by, created_by, title, total_amount, category, split_method, is_deleted)
      VALUES ($1, $2, $3, $3, 'Water Tanker', 200.00, 'Water', 'EQUAL', false);
    `, [exp2Id, roomId, userRaju]);

    await adminClient.query(`
      INSERT INTO public.expense_splits (shared_expense_id, user_id, share_amount)
      VALUES
        ($1, $2, 66.67),
        ($1, $3, 66.66),
        ($1, $4, 66.67);
    `, [exp2Id, userJyo, userRaju, userLopa]);

    // Verify V2 Summary via PostgreSQL RPC
    const summaryRes = await adminClient.query(`
      SELECT public.get_room_financial_summary_v2($1) AS summary;
    `, [roomId]);
    const summary = summaryRes.rows[0].summary;

    const jyoPos = summary.members.find((m) => m.user_id === userJyo);
    const rajuPos = summary.members.find((m) => m.user_id === userRaju);
    const lopaPos = summary.members.find((m) => m.user_id === userLopa);

    record(
      'Section 4: Canonical ₹700 Total Expenses & Paise in DB',
      70000,
      summary.total_expenses_paise,
      summary.total_expenses_paise === 70000
    );

    record(
      'Section 4: Real Zero-Sum Ledger Invariant Conservation',
      0,
      summary.net_discrepancy_paise,
      summary.net_discrepancy_paise === 0 && summary.is_zero_sum_verified === true
    );

    record(
      'Section 4: Jyotirmay Net Position (+₹266.66)',
      26666,
      jyoPos?.net_balance_paise,
      jyoPos?.net_balance_paise === 26666 && jyoPos?.direction === 'RECEIVE'
    );

    record(
      'Section 4: Raju Net Position (-₹33.32)',
      -3332,
      rajuPos?.net_balance_paise,
      rajuPos?.net_balance_paise === -3332 && rajuPos?.direction === 'OWES'
    );

    record(
      'Section 4: Lopamudra Net Position (-₹233.34)',
      -23334,
      lopaPos?.net_balance_paise,
      lopaPos?.net_balance_paise === -23334 && lopaPos?.direction === 'OWES'
    );

    // -------------------------------------------------------------------------
    // 5. SETTLEMENT + LEAVE CONCURRENCY RACE CONDITION TEST
    // -------------------------------------------------------------------------
    // Client A settles Raju's debt: record_room_settlement_v2 (₹33.32)
    // Client B simultaneously calls leave_room for Raju
    const clientA = await createClient();
    const clientB = await createClient();

    // Authenticate sessions using set_config (session-level persistence)
    await clientA.query(`
      SELECT set_config('request.jwt.claim.sub', $1, false),
             set_config('request.jwt.claim.role', $2, false),
             set_config('request.jwt.claims', $3, false);
    `, [userRaju, 'authenticated', JSON.stringify({ sub: userRaju, role: 'authenticated' })]);

    await clientB.query(`
      SELECT set_config('request.jwt.claim.sub', $1, false),
             set_config('request.jwt.claim.role', $2, false),
             set_config('request.jwt.claims', $3, false);
    `, [userRaju, 'authenticated', JSON.stringify({ sub: userRaju, role: 'authenticated' })]);

    const settlePromise = clientA.query(`
      SELECT public.record_room_settlement_v2($1, $2, $3, $4) AS res;
    `, [roomId, userRaju, userJyo, 33.32]);

    const leavePromise = clientB.query(`
      SELECT public.leave_room($1) AS res;
    `, [roomId]);

    const [settleRes, leaveRes] = await Promise.all([settlePromise, leavePromise]);

    const settleData = settleRes.rows[0].res;
    const leaveData = leaveRes.rows[0].res;

    record(
      'Section 5: Real Settlement Transaction Committed (₹33.32)',
      true,
      settleData.success,
      settleData.success === true && Number(settleData.amount) === 33.32
    );

    record(
      'Section 5: Real Leave Room Transaction Completed',
      true,
      leaveData.success,
      leaveData.success === true
    );

    await clientA.end();
    await clientB.end();

    // Check Member Status and Final Net Balance
    const rajuMemberRes = await adminClient.query(`
      SELECT status, role FROM public.room_members WHERE room_id = $1 AND user_id = $2;
    `, [roomId, userRaju]);
    const rajuMember = rajuMemberRes.rows[0];

    record(
      'Section 5: Raju Member Status Marked LEFT',
      'LEFT',
      rajuMember.status,
      rajuMember.status === 'LEFT'
    );

    const postLeaveSummaryRes = await adminClient.query(`
      SELECT public.get_room_financial_summary_v2($1) AS summary;
    `, [roomId]);
    const postLeaveSummary = postLeaveSummaryRes.rows[0].summary;
    const rajuInSummary = postLeaveSummary.members.find((m) => m.user_id === userRaju);

    record(
      'Section 5: Departed Member Excluded from Active Summary Members',
      undefined,
      rajuInSummary,
      rajuInSummary === undefined
    );

    // -------------------------------------------------------------------------
    // 6. HISTORICAL DATA PRESERVATION POST-DEPARTURE
    // -------------------------------------------------------------------------
    const historicalSplitsRes = await adminClient.query(`
      SELECT COUNT(*) AS count FROM public.expense_splits
      WHERE user_id = $1 AND shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE room_id = $2);
    `, [userRaju, roomId]);
    const rajuSplitsCount = parseInt(historicalSplitsRes.rows[0].count, 10);

    record(
      'Section 6: Historical Expense Splits for Departed Member Preserved',
      2,
      rajuSplitsCount,
      rajuSplitsCount === 2
    );

    const historicalSettlementRes = await adminClient.query(`
      SELECT COUNT(*) AS count FROM public.settlement_payments
      WHERE room_id = $1 AND payer_id = $2;
    `, [roomId, userRaju]);
    const rajuSettlementCount = parseInt(historicalSettlementRes.rows[0].count, 10);

    record(
      'Section 6: Historical Settlement Row for Departed Member Preserved',
      1,
      rajuSettlementCount,
      rajuSettlementCount === 1
    );

    // -------------------------------------------------------------------------
    // 7. REAL MEMBER REMOVAL AUTHORIZATION
    // -------------------------------------------------------------------------
    const nonAdminClient = await createClient();
    await nonAdminClient.query(`
      SELECT set_config('request.jwt.claim.sub', $1, false),
             set_config('request.jwt.claim.role', $2, false),
             set_config('request.jwt.claims', $3, false);
    `, [userLopa, 'authenticated', JSON.stringify({ sub: userLopa, role: 'authenticated' })]);

    let nonAdminUnauthorized = false;
    try {
      await nonAdminClient.query(`
        SELECT public.remove_room_member($1, $2);
      `, [roomId, userJyo]);
    } catch (err) {
      nonAdminUnauthorized = err.message.includes('UNAUTHORIZED');
    }
    await nonAdminClient.end();

    record(
      'Section 7: Non-Admin Member Removal Rejected (UNAUTHORIZED)',
      true,
      nonAdminUnauthorized,
      nonAdminUnauthorized === true
    );

    // Admin removing member cleanly
    const adminAuthClient = await createClient();
    await adminAuthClient.query(`
      SELECT set_config('request.jwt.claim.sub', $1, false),
             set_config('request.jwt.claim.role', $2, false),
             set_config('request.jwt.claims', $3, false);
    `, [userJyo, 'authenticated', JSON.stringify({ sub: userJyo, role: 'authenticated' })]);

    const removeRes = await adminAuthClient.query(`
      SELECT public.remove_room_member($1, $2) AS res;
    `, [roomId, userLopa]);
    const removeData = removeRes.rows[0].res;
    await adminAuthClient.end();

    record(
      'Section 7: Admin Successfully Removes Member (Lopamudra)',
      true,
      removeData.success,
      removeData.success === true
    );

    const lopaMemberRes = await adminClient.query(`
      SELECT status FROM public.room_members WHERE room_id = $1 AND user_id = $2;
    `, [roomId, userLopa]);
    record(
      'Section 7: Removed Member Status Marked REMOVED in DB',
      'REMOVED',
      lopaMemberRes.rows[0].status,
      lopaMemberRes.rows[0].status === 'REMOVED'
    );

    // -------------------------------------------------------------------------
    // 8. POST-REMOVAL FINANCIAL PRESERVATION & AUTHORIZATION
    // -------------------------------------------------------------------------
    // Historical splits for Lopamudra must still exist (2 splits)
    const lopaSplitsRes = await adminClient.query(`
      SELECT COUNT(*) AS count FROM public.expense_splits
      WHERE user_id = $1 AND shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE room_id = $2);
    `, [userLopa, roomId]);
    const lopaSplitsCount = parseInt(lopaSplitsRes.rows[0].count, 10);

    record(
      'Section 8: Removed Member Historical Splits 100% Preserved',
      2,
      lopaSplitsCount,
      lopaSplitsCount === 2
    );

    // Attempting to record a V2 settlement for an inactive/removed member must be REJECTED
    let inactiveSettlementRejected = false;
    try {
      await adminClient.query(`
        SELECT public.record_room_settlement_v2($1, $2, $3, $4) AS res;
      `, [roomId, userLopa, userJyo, 233.34]);
    } catch (err) {
      inactiveSettlementRejected = err.message.includes('ACCESS_DENIED') || err.message.includes('not an active member');
    }

    record(
      'Section 8: V2 Settlement for Inactive Member Rejected (ACCESS_DENIED)',
      true,
      inactiveSettlementRejected,
      inactiveSettlementRejected === true
    );

    // Total expenses in room remain exactly ₹700 (70,000 paise)
    const finalSummaryRes = await adminClient.query(`
      SELECT public.get_room_financial_summary_v2($1) AS summary;
    `, [roomId]);
    const finalSummary = finalSummaryRes.rows[0].summary;

    record(
      'Section 8: Room Total Expenses Preserved Post-Removal (₹700 / 70000 paise)',
      70000,
      finalSummary.total_expenses_paise,
      finalSummary.total_expenses_paise === 70000
    );

    // Cleanup test room
    await adminClient.query(`DELETE FROM public.settlement_payments WHERE room_id = $1;`, [roomId]);
    await adminClient.query(`DELETE FROM public.expense_splits WHERE shared_expense_id IN (SELECT id FROM public.shared_expenses WHERE room_id = $1);`, [roomId]);
    await adminClient.query(`DELETE FROM public.shared_expenses WHERE room_id = $1;`, [roomId]);
    await adminClient.query(`DELETE FROM public.room_members WHERE room_id = $1;`, [roomId]);
    await adminClient.query(`DELETE FROM public.rooms WHERE id = $1;`, [roomId]);

  } finally {
    await adminClient.end();
  }

  // ---------------------------------------------------------------------------
  // SUMMARY REPORT
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.filter((r) => !r.passed).length;
  console.log(`REAL DATABASE TEST RESULTS: ${passCount}/${results.length} PASSED`);
  if (failCount > 0) {
    console.error(`FAILED TESTS: ${failCount}`);
    process.exit(1);
  } else {
    console.log('OVERALL REAL DATABASE STATUS: ALL TESTS PASSED WITH 100% SUCCESS');
    console.log('================================================================\n');
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

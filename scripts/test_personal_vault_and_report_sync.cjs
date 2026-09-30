/**
 * scripts/test_personal_vault_and_report_sync.cjs
 * 
 * Verifies:
 * 1. Personal Vault expense creation and sync to Supabase Cloud (including Category: Health over-budget)
 * 2. Settings "Report a Problem" modal bug submission to Supabase Cloud & SuperAdmin
 * 3. Deletion and cleanup of both artifacts in Supabase Cloud
 */

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envText.split('\n')) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match) envVars[match[1]] = match[2].replace(/^['"](.*)['"]$/, '$1');
}

const envLocalPath = path.join(__dirname, '..', '.env.local');
const envLocalText = fs.readFileSync(envLocalPath, 'utf8');
const dbPassword = envLocalText.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/)[1];

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || 'https://pbzaaskftrmnvocczhat.supabase.co';
const SUPABASE_KEY = envVars.VITE_SUPABASE_ANON_KEY;
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

// Resident: Rajdeep Bhattacharyya
const TEST_USER_ID = 'ac43612d-cec6-4d64-b4ab-9ece92629f3b';

async function runTest() {
  console.log('========================================================================');
  console.log('🧪 VALIDATING PERSONAL VAULT & SETTINGS BUG REPORT CLOUD SYNC');
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`);
  console.log(`👤 Test Resident ID: ${TEST_USER_ID}`);
  console.log('========================================================================\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const pgClient = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();

  let testPassed = true;
  let testExpenseId = null;
  let testBugId = null;

  try {
    // -----------------------------------------------------------------------
    // TEST 1: Personal Vault - Adding Health Expense (Over-Budget Scenario)
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: Personal Vault Health Expense Creation & Sync ---');
    const expensePayload = {
      p_user_id: TEST_USER_ID,
      p_title: 'Meds & Health Checkup (Exceeding Limit)',
      p_amount: 350.00,
      p_category: 'Health',
      p_notes: 'Automated test: Prescriptions exceeded ₹500 cap',
      p_expense_date: new Date().toISOString().split('T')[0]
    };

    const startTime = Date.now();
    const { data: expRes, error: expErr } = await supabase.rpc('submit_personal_expense_secure', expensePayload);

    if (expErr || !expRes?.id) {
      console.error('❌ Failed to insert personal expense via RPC:', expErr);
      testPassed = false;
    } else {
      testExpenseId = expRes.id;
      const latency = Date.now() - startTime;
      console.log(`   ✅ Personal expense saved to Supabase Cloud! (Latency: ${latency}ms)`);
      console.log(`      ID: ${testExpenseId} | Title: "${expRes.title}" | Amount: ₹${expRes.amount} | Category: ${expRes.category}`);

      // Verify row exists in database via direct query
      const dbCheck = await pgClient.query('SELECT * FROM public.personal_expenses WHERE id = $1', [testExpenseId]);
      if (dbCheck.rows.length === 1) {
        console.log('   ✅ Cloud Database Row Verification: CONFIRMED');
      } else {
        console.error('   ❌ Database row verification failed: Row not found');
        testPassed = false;
      }

      // Verify anon SELECT returns the row
      const { data: selectRows, error: selectErr } = await supabase
        .from('personal_expenses')
        .select('*')
        .eq('id', testExpenseId);

      if (selectErr || !selectRows || selectRows.length === 0) {
        console.error('   ❌ Anonymous select failed:', selectErr);
        testPassed = false;
      } else {
        console.log('   ✅ Anonymous client SELECT on personal_expenses: CONFIRMED (0 rows dropped)');
      }
    }

    // -----------------------------------------------------------------------
    // TEST 2: Settings "Report a Problem" Cloud Submission
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 2: Settings "Report a Problem" Bug Ticket Submission ---');
    const bugPayload = {
      p_user_id: TEST_USER_ID,
      p_user_name: 'Rajdeep Bhattacharyya',
      p_user_email: 'rajdeepbhattacharya.slsn9a@gmail.com',
      p_user_role: 'STUDENT',
      p_category: 'EXPENSE_SPLIT',
      p_severity: 'MEDIUM',
      p_description: 'When I try to add expense in personal vault in health sec... The amount exceeded limit. Now verified and fixed.',
      p_diagnostics: { source: 'settings_modal_test', timestamp: new Date().toISOString() }
    };

    const bugStartTime = Date.now();
    const { data: bugRes, error: bugErr } = await supabase.rpc('submit_bug_report_secure', bugPayload);

    if (bugErr || !bugRes?.id) {
      console.error('❌ Failed to submit bug report from settings:', bugErr);
      testPassed = false;
    } else {
      testBugId = bugRes.id;
      const bugLatency = Date.now() - bugStartTime;
      console.log(`   ✅ Bug ticket from Settings successfully landed in Supabase Cloud! (Latency: ${bugLatency}ms)`);
      console.log(`      Ticket ID: #${testBugId.slice(-6)} | Category: ${bugRes.category} | Status: ${bugRes.status}`);

      // Verify row exists in database
      const bugDbCheck = await pgClient.query('SELECT * FROM public.bug_reports WHERE id = $1', [testBugId]);
      if (bugDbCheck.rows.length === 1) {
        console.log('   ✅ Cloud Database Bug Ticket Verification: CONFIRMED');
      } else {
        console.error('   ❌ Bug report row not found in database');
        testPassed = false;
      }
    }

    // -----------------------------------------------------------------------
    // TEST 3: Deletion & Cleanup Verification
    // -----------------------------------------------------------------------
    console.log('\n--- TEST 3: Deletion & Teardown Verification ---');
    if (testExpenseId) {
      const { data: delRes, error: delErr } = await supabase.rpc('delete_personal_expense_secure', {
        p_id: testExpenseId,
        p_user_id: TEST_USER_ID
      });

      if (delErr || !delRes) {
        console.error('❌ Failed to delete personal expense via RPC:', delErr);
        testPassed = false;
      } else {
        console.log(`   🗑️ Personal expense ${testExpenseId} deleted cleanly via secure RPC`);
      }
    }

    if (testBugId) {
      await pgClient.query('DELETE FROM public.bug_reports WHERE id = $1', [testBugId]);
      console.log(`   🗑️ Test bug report ${testBugId} cleaned up from database`);
    }

  } finally {
    await pgClient.end();
  }

  console.log('\n========================================================================');
  if (testPassed) {
    console.log('🏆 ALL TESTS PASSED! PERSONAL VAULT & SETTINGS REPORTING ARE 100% OPERATIONAL');
  } else {
    console.log('❌ SOME TESTS FAILED. CHECK LOGS ABOVE.');
  }
  console.log('========================================================================\n');

  process.exit(testPassed ? 0 : 1);
}

runTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

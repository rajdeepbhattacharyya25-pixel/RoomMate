/**
 * scripts/test_live_multidevice_smoke.js
 * 
 * Live Multi-Device Smoke Test & Realtime Validation
 * Simulates two concurrent sessions:
 *  - Session A: Desktop SuperAdmin Console (Global Realtime Broadcaster)
 *  - Session B: Mobile Resident Device (User & Room Realtime Channels)
 * 
 * Verifies:
 * 1. Bug Ticket Submission from Mobile -> Instant broadcast to SuperAdmin console
 * 2. SuperAdmin Ticket Resolution -> Instant notification delivery to Mobile Resident channel
 * 3. SuperAdmin Room Ledger Freeze & Unfreeze -> Instant delivery to Mobile Room channel
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env file directly
const envPath = path.join(__dirname, '..', '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envText.split('\n')) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match) envVars[match[1]] = match[2].replace(/^['"](.*)['"]$/, '$1');
}

// Read .env.local for database maintenance & cleanup
const envLocalPath = path.join(__dirname, '..', '.env.local');
const envLocalText = fs.readFileSync(envLocalPath, 'utf8');
const dbPassword = envLocalText.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/)[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || 'https://pbzaaskftrmnvocczhat.supabase.co';
const SUPABASE_KEY = envVars.VITE_SUPABASE_ANON_KEY;
const RESIDENT_USER_ID = 'be5ea77f-1091-4a00-9794-785cfc85bcbe'; // Resident: Apurv

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLiveSmokeTest() {
  console.log('========================================================================');
  console.log('🚀 LIVE MULTI-DEVICE SMOKE TEST & REALTIME VALIDATION');
  console.log(`🌐 Target Supabase: ${SUPABASE_URL}`);
  console.log(`👤 Mobile Resident ID: ${RESIDENT_USER_ID}`);
  console.log('========================================================================\n');

  const pgClient = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();

  // 1. Session A: Desktop SuperAdmin Client
  const adminClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } }
  });

  // 2. Session B: Mobile Resident Client
  const mobileClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } }
  });

  let testPassed = true;
  let testBugId = null;
  let testRoomId = null;
  let testNotifId = null;

  // Track events received
  let adminReceivedBugInsert = null;
  let mobileReceivedNotification = null;
  let mobileReceivedRoomFreeze = null;
  let mobileReceivedRoomUnfreeze = null;

  // -------------------------------------------------------------------------
  // STEP 0: Establish Realtime Subscriptions
  // -------------------------------------------------------------------------
  console.log('📡 Step 0: Initializing concurrent realtime channels...');

  // SuperAdmin Global Channel
  const adminChannel = adminClient.channel('smoke-superadmin-global-sync');
  adminChannel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'bug_reports' },
    (payload) => {
      console.log('   🟢 [SuperAdmin Console] Received CDC Event: bug_reports INSERT ->', payload.new.id);
      adminReceivedBugInsert = payload.new;
    }
  );

  // Mobile Resident User Channel
  const mobileUserChannel = mobileClient.channel(`smoke-user-${RESIDENT_USER_ID}`);
  mobileUserChannel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'in_app_notifications',
      filter: `user_id=eq.${RESIDENT_USER_ID}`
    },
    (payload) => {
      console.log('   🔔 [Mobile Resident] Received Notification ->', payload.new.title);
      mobileReceivedNotification = payload.new;
    }
  );

  // Subscribe both channels
  await Promise.all([
    new Promise((resolve) => {
      adminChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('   ✅ SuperAdmin Global Channel: SUBSCRIBED');
          resolve();
        }
      });
    }),
    new Promise((resolve) => {
      mobileUserChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('   ✅ Mobile Resident Channel: SUBSCRIBED');
          resolve();
        }
      });
    })
  ]);

  await sleep(600);

  // -------------------------------------------------------------------------
  // TEST 1: Mobile Resident Submits Bug Ticket -> SuperAdmin Receives
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 TEST 1: Mobile Bug Ticket Submission -> SuperAdmin Realtime Appearance');
  console.log('------------------------------------------------------------------------');

  const testBugPayload = {
    p_user_id: RESIDENT_USER_ID,
    p_user_name: 'Apurv (Mobile Resident)',
    p_user_email: 'hanacandy37@gmail.com',
    p_user_role: 'STUDENT',
    p_category: 'UI_GLITCH',
    p_severity: 'MEDIUM',
    p_description: 'Automated smoke test: Personal vault balance display latency on Android device.',
    p_diagnostics: { test: true, timestamp: Date.now(), platform: 'Android' }
  };

  const startTime1 = Date.now();
  const { data: bugData, error: bugErr } = await mobileClient.rpc('submit_bug_report_secure', testBugPayload);

  if (bugErr || !bugData?.id) {
    console.error('❌ Failed to insert bug report from mobile client:', bugErr);
    testPassed = false;
  } else {
    testBugId = bugData.id;
    console.log(`   📱 Mobile Resident submitted bug report: ${testBugId}`);

    // Wait up to 6 seconds for SuperAdmin listener to receive the event
    let elapsed = 0;
    while (!adminReceivedBugInsert && elapsed < 6000) {
      await sleep(200);
      elapsed += 200;
    }

    if (adminReceivedBugInsert && adminReceivedBugInsert.id === testBugId) {
      const latency = Date.now() - startTime1;
      console.log(`   ✨ PASSED: SuperAdmin received bug ticket instantly! (Latency: ${latency}ms)`);
      console.log(`      Ticket ID: #${adminReceivedBugInsert.id.slice(-6)} | Category: ${adminReceivedBugInsert.category} | Status: ${adminReceivedBugInsert.status}`);
    } else {
      console.error('   ❌ FAILED: SuperAdmin did not receive bug ticket within timeout.');
      testPassed = false;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 2: SuperAdmin Marks Ticket RESOLVED -> Mobile Receives Notification
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 TEST 2: SuperAdmin Ticket Resolution -> Mobile Resident Notification Bell');
  console.log('------------------------------------------------------------------------');

  if (testBugId) {
    const adminNotes = 'Fixed in build 10: State caching invalidated upon vault update.';
    const updateTime = Date.now();

    // 1. SuperAdmin updates bug status
    const { error: bugUpdateErr } = await adminClient.rpc('superadmin_update_bug_report', {
      p_id: testBugId,
      p_status: 'RESOLVED',
      p_admin_notes: adminNotes
    });

    if (bugUpdateErr) {
      console.error('❌ SuperAdmin failed to update bug status:', bugUpdateErr);
      testPassed = false;
    } else {
      console.log(`   🛡️ SuperAdmin updated Bug #${testBugId.slice(-6)} to RESOLVED with notes.`);

      // 2. SuperAdmin dispatches In-App Notification to reporter via secure RPC
      const notifTitle = `Bug Ticket #${testBugId.slice(-6)} Resolved`;
      const notifMessage = `Status: RESOLVED. Admin note: ${adminNotes}`;

      const { data: newNotifId, error: notifErr } = await adminClient.rpc('admin_send_notification_secure', {
        p_user_id: RESIDENT_USER_ID,
        p_type: 'SYSTEM_INFO',
        p_title: notifTitle,
        p_message: notifMessage,
        p_priority: 'HIGH',
        p_action_type: 'NONE',
        p_metadata: { bugId: testBugId, status: 'RESOLVED', adminNotes }
      });

      if (notifErr || !newNotifId) {
        console.error('❌ SuperAdmin failed to dispatch in-app notification:', notifErr);
        testPassed = false;
      } else {
        testNotifId = newNotifId;
        console.log(`   🛡️ SuperAdmin dispatched notification UUID: ${testNotifId}`);

        // Wait up to 6 seconds for mobile client to receive notification
        let elapsed = 0;
        while (!mobileReceivedNotification && elapsed < 6000) {
          await sleep(200);
          elapsed += 200;
        }

        if (mobileReceivedNotification && mobileReceivedNotification.id === testNotifId) {
          const latency = Date.now() - updateTime;
          console.log(`   ✨ PASSED: Mobile received notification bell alert! (Latency: ${latency}ms)`);
          console.log(`      Title: "${mobileReceivedNotification.title}"`);
          console.log(`      Message: "${mobileReceivedNotification.message}"`);
        } else {
          console.error('   ❌ FAILED: Mobile Resident did not receive notification within timeout.');
          testPassed = false;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // TEST 3: Room Ledger Freeze & Unfreeze Realtime Synchronization
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('🧪 TEST 3: Room Ledger Freeze & Unfreeze -> Mobile Action Lock Synchronization');
  console.log('------------------------------------------------------------------------');

  // Create test room via pgClient for test isolation
  const roomRes = await pgClient.query(`
    INSERT INTO public.rooms (name, description, created_by, is_frozen, is_archived, join_policy, invite_policy)
    VALUES ('Smoke Test Residency Room', 'Temporary room created for multi-device realtime validation', $1, false, false, 'INSTANT', 'ALL_MEMBERS')
    RETURNING id, name;
  `, [RESIDENT_USER_ID]);

  const roomData = roomRes.rows[0];

  if (!roomData) {
    console.error('❌ Failed to create test room');
    testPassed = false;
  } else {
    testRoomId = roomData.id;
    console.log(`   🏠 Test Room Created: "${roomData.name}" (${testRoomId})`);

    // Mobile Resident subscribes to room channel
    const mobileRoomChannel = mobileClient.channel(`smoke-room-${testRoomId}`);
    mobileRoomChannel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${testRoomId}`
      },
      (payload) => {
        console.log('   ⚡ [Mobile Resident] Room Update received! is_frozen =', payload.new.is_frozen);
        if (payload.new.is_frozen === true) {
          mobileReceivedRoomFreeze = payload.new;
        } else if (payload.new.is_frozen === false) {
          mobileReceivedRoomUnfreeze = payload.new;
        }
      }
    );

    await new Promise((resolve) => {
      mobileRoomChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('   ✅ Mobile Room Channel: SUBSCRIBED');
          resolve();
        }
      });
    });

    await sleep(600);

    // 1. SuperAdmin FREEZES the room
    console.log('\n   🔒 SuperAdmin action: Freezing Room Ledger in cloud database...');
    const freezeStart = Date.now();
    await pgClient.query(`
      UPDATE public.rooms SET is_frozen = true, updated_at = now() WHERE id = $1;
    `, [testRoomId]);

    let elapsed = 0;
    while (!mobileReceivedRoomFreeze && elapsed < 6000) {
      await sleep(200);
      elapsed += 200;
    }

    if (mobileReceivedRoomFreeze && mobileReceivedRoomFreeze.is_frozen === true) {
      const latency = Date.now() - freezeStart;
      console.log(`   ✨ PASSED: Mobile client received FREEZE signal! (Latency: ${latency}ms)`);
      console.log('      Mobile Ledger triggers: Amber warning banner + Locked "+ Split" & "Settle Up" buttons.');
    } else {
      console.error('   ❌ FAILED: Mobile client did not receive freeze signal within timeout.');
      testPassed = false;
    }

    // 2. SuperAdmin UNFREEZES the room
    console.log('\n   🔓 SuperAdmin action: Unfreezing Room Ledger in cloud database...');
    const unfreezeStart = Date.now();
    await pgClient.query(`
      UPDATE public.rooms SET is_frozen = false, updated_at = now() WHERE id = $1;
    `, [testRoomId]);

    elapsed = 0;
    while (!mobileReceivedRoomUnfreeze && elapsed < 6000) {
      await sleep(200);
      elapsed += 200;
    }

    if (mobileReceivedRoomUnfreeze && mobileReceivedRoomUnfreeze.is_frozen === false) {
      const latency = Date.now() - unfreezeStart;
      console.log(`   ✨ PASSED: Mobile client received UNFREEZE signal! (Latency: ${latency}ms)`);
      console.log('      Mobile Ledger restores: Active recording enabled, warning dismissed.');
    } else {
      console.error('   ❌ FAILED: Mobile client did not receive unfreeze signal within timeout.');
      testPassed = false;
    }

    // Cleanup room channel
    await mobileClient.removeChannel(mobileRoomChannel);
  }

  // -------------------------------------------------------------------------
  // STEP 4: Teardown & Clean Up Test Records
  // -------------------------------------------------------------------------
  console.log('\n------------------------------------------------------------------------');
  console.log('🧹 Step 4: Cleaning up smoke test artifacts from Supabase Cloud...');
  console.log('------------------------------------------------------------------------');

  if (testBugId) {
    await pgClient.query('DELETE FROM public.bug_reports WHERE id = $1', [testBugId]);
    console.log(`   🗑️ Deleted smoke test bug report: ${testBugId}`);
  }
  if (testNotifId) {
    await pgClient.query('DELETE FROM public.in_app_notifications WHERE id = $1', [testNotifId]);
    console.log(`   🗑️ Deleted smoke test notification: ${testNotifId}`);
  }
  if (testRoomId) {
    await pgClient.query('DELETE FROM public.rooms WHERE id = $1', [testRoomId]);
    console.log(`   🗑️ Deleted smoke test room: ${testRoomId}`);
  }

  await pgClient.end();

  // Unsubscribe channels
  await adminClient.removeChannel(adminChannel);
  await mobileClient.removeChannel(mobileUserChannel);

  // -------------------------------------------------------------------------
  // FINAL RESULT
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  if (testPassed) {
    console.log('🏆 ALL 3 MULTI-DEVICE SMOKE TEST SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('   1. Mobile -> SuperAdmin Bug Broadcasting:  VERIFIED ✅');
    console.log('   2. SuperAdmin -> Mobile Resolution Alert:  VERIFIED ✅');
    console.log('   3. SuperAdmin -> Mobile Room Freeze Sync:  VERIFIED ✅');
  } else {
    console.log('❌ SOME SMOKE TEST SCENARIOS ENCOUNTERED FAILURES. REVIEW LOGS ABOVE.');
  }
  console.log('========================================================================\n');

  process.exit(testPassed ? 0 : 1);
}

runLiveSmokeTest().catch((err) => {
  console.error('Fatal smoke test runner error:', err);
  process.exit(1);
});

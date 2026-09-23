import { spawn } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const CONTAINER = 'roommate-staging-db';

export function runSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(DOCKER_PATH, ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });

    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(`SQL Failed (exit code ${code}):\n${stderr}\n${stdout}`);
        err.code = code;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      }
    });

    child.stdin.write(sql);
    child.stdin.end();
  });
}

async function testScenario(name, setupSql, querySql, expectedPattern, expectError = false) {
  const sql = `
    BEGIN;
    ${setupSql}
    ${querySql}
    ROLLBACK;
  `;
  try {
    const res = await runSql(sql);
    if (expectError) {
      console.log(`❌ FAIL [${name}]: Expected error but succeeded.\nOutput: ${res.stdout}`);
      return { name, passed: false, error: null, output: res.stdout };
    } else {
      const passed = expectedPattern ? new RegExp(expectedPattern).test(res.stdout) : true;
      console.log(`${passed ? '✅ PASS' : '❌ FAIL'} [${name}]`);
      if (!passed) console.log(`   Output: ${res.stdout}\n   Expected: ${expectedPattern}`);
      return { name, passed, output: res.stdout };
    }
  } catch (err) {
    if (expectError) {
      const passed = expectedPattern ? new RegExp(expectedPattern).test(err.message) : true;
      console.log(`${passed ? '✅ PASS' : '❌ FAIL'} [${name}] (Expected error caught)`);
      if (!passed) console.log(`   Caught error: ${err.message}\n   Expected pattern: ${expectedPattern}`);
      return { name, passed, error: err.message };
    } else {
      console.log(`❌ FAIL [${name}]: Unexpected error:\n${err.message}`);
      return { name, passed: false, error: err.message };
    }
  }
}

async function main() {
  console.log('================================================================================');
  console.log('ROOMMATE PHASE 2C.1 — ADVERSARIAL NOTIFICATION & FCM DEVICE SECURITY SUITE');
  console.log('================================================================================\n');

  // Ensure baseline grants for Supabase roles
  await runSql(`
    GRANT USAGE ON SCHEMA public, auth, internal TO authenticated, anon, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public, internal TO authenticated, service_role;
  `);

  // We set up test actors:
  // User A (Room 1 member)
  // User B (Room 1 member, co-roommate)
  // User C (Room 2 member, unrelated to A and B)
  // User D (Former member of Room 1, status = 'LEFT')
  // User E (Pending member of Room 1, status = 'PENDING')
  // SuperAdmin User S
  const ACTORS_SETUP = `
    -- Create test users in auth.users & profiles if not exists
    INSERT INTO auth.users (id, email) VALUES
      ('11111111-1111-1111-1111-111111111111', 'user_a@test.com'),
      ('22222222-2222-2222-2222-222222222222', 'user_b@test.com'),
      ('33333333-3333-3333-3333-333333333333', 'user_c@test.com'),
      ('44444444-4444-4444-4444-444444444444', 'user_d_former@test.com'),
      ('55555555-5555-5555-5555-555555555555', 'user_e_pending@test.com'),
      ('99999999-9999-9999-9999-999999999999', 'superadmin@test.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, name, email, role, fcm_token) VALUES
      ('11111111-1111-1111-1111-111111111111', 'User A', 'user_a@test.com', 'STUDENT', 'token_user_a'),
      ('22222222-2222-2222-2222-222222222222', 'User B', 'user_b@test.com', 'STUDENT', 'token_user_b'),
      ('33333333-3333-3333-3333-333333333333', 'User C', 'user_c@test.com', 'STUDENT', 'token_user_c'),
      ('44444444-4444-4444-4444-444444444444', 'User D Former', 'user_d_former@test.com', 'STUDENT', 'token_user_d'),
      ('55555555-5555-5555-5555-555555555555', 'User E Pending', 'user_e_pending@test.com', 'STUDENT', 'token_user_e'),
      ('99999999-9999-9999-9999-999999999999', 'Super Admin', 'superadmin@test.com', 'SUPER_ADMIN', 'token_superadmin')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, fcm_token = EXCLUDED.fcm_token;

    -- Create Rooms
    INSERT INTO public.rooms (id, name, created_by) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Room 1 Alpha', '11111111-1111-1111-1111-111111111111'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Room 2 Beta', '33333333-3333-3333-3333-333333333333')
    ON CONFLICT (id) DO NOTHING;

    -- Memberships
    INSERT INTO public.room_members (id, room_id, user_id, role, status) VALUES
      ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ROOM_ADMIN', 'ACTIVE'),
      ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'MEMBER', 'ACTIVE'),
      ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'MEMBER', 'LEFT'),
      ('c1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'ROOM_ADMIN', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role;
  `;

  const results = [];

  // Helper to switch to an authenticated user
  const asUser = (uid, role = 'authenticated') => `
    SET LOCAL ROLE ${role};
    SET LOCAL "request.jwt.claim.sub" = '${uid}';
    SET LOCAL "request.jwt.claim.role" = '${role}';
    SET LOCAL "request.jwt.claims" = '{"sub": "${uid}", "role": "${role}"}';
  `;

  const asAnon = () => `
    SET LOCAL ROLE anon;
    RESET "request.jwt.claim.sub";
    SET LOCAL "request.jwt.claim.role" = 'anon';
    SET LOCAL "request.jwt.claims" = '{"role": "anon"}';
  `;

  // ---------------------------------------------------------------------------
  // PART A: NOTIFICATION FORGERY TESTS (Phase 4)
  // ---------------------------------------------------------------------------
  console.log('--- PART A: Notification Forgery Tests ---');

  // Test 1: User A creates notification for User C without valid relationship (unrelated user)
  results.push(await testScenario(
    '1. User A targets unrelated User C (no shared room)',
    ACTORS_SETUP,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('33333333-3333-3333-3333-333333333333', NULL, 'EXPENSE_ADDED', 'Fake Alert', 'Unrelated User Alert', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // Test 2: User A creates notification for User C in Room 2 (User A is not a member of Room 2)
  results.push(await testScenario(
    '2. User A targets User C referencing Room 2 (A is not in Room 2)',
    ACTORS_SETUP,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'EXPENSE_ADDED', 'Fake Alert', 'Room 2 injection', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // Test 3: User A creates notification for User B (valid co-roommate) but SPOOFS system / payment title & message
  results.push(await testScenario(
    '3. User A injects high-trust SYSTEM_INFO into co-roommate B in shared room',
    ACTORS_SETUP,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority, metadata)
      VALUES (
        '22222222-2222-2222-2222-222222222222', 
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 
        'ACCOUNT_SECURITY', 
        '🚨 CRITICAL: Account Compromised', 
        'Your account has been suspended by Security. Contact administrator immediately.', 
        'HIGH',
        '{"is_system_verified": true}'::jsonb
      );
      ${asUser('22222222-2222-2222-2222-222222222222')}
      SELECT type, title, priority FROM public.in_app_notifications 
      WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'ACCOUNT_SECURITY';
    `,
    'ACCOUNT_SECURITY',
    false
  ));

  // Test 4: Can sender_id be tracked? Check if in_app_notifications has sender_id column
  results.push(await testScenario(
    '4. Check if sender_id column exists on in_app_notifications',
    ACTORS_SETUP,
    `
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'in_app_notifications' AND column_name IN ('sender_id', 'created_by');
    `,
    '(0 rows)',
    false
  ));

  // Test 5: User A attempts to change recipient (user_id) of User B's notification
  results.push(await testScenario(
    '5. User A attempts to update recipient (user_id) of an existing notification',
    ACTORS_SETUP + `
      INSERT INTO public.in_app_notifications (id, user_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Legit', 'Legit', 'LOW');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      UPDATE public.in_app_notifications
      SET user_id = '11111111-1111-1111-1111-111111111111'
      WHERE id = '77777777-7777-7777-7777-777777777777';
      SELECT count(*) FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777' AND user_id = '11111111-1111-1111-1111-111111111111';
    `,
    '0',
    false
  ));

  // Test 6: User A attempts to modify User B's notification content
  results.push(await testScenario(
    '6. User A attempts to modify existing notification belonging to User B',
    ACTORS_SETUP + `
      INSERT INTO public.in_app_notifications (id, user_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Legit', 'Legit', 'LOW');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      UPDATE public.in_app_notifications
      SET message = 'Tampered by User A'
      WHERE id = '77777777-7777-7777-7777-777777777777';
      SELECT count(*) FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777' AND message = 'Tampered by User A';
    `,
    '0',
    false
  ));

  // Test 7: User A attempts to delete User B's notification via DELETE
  results.push(await testScenario(
    '7. User A attempts to SQL DELETE User B notification',
    ACTORS_SETUP + `
      INSERT INTO public.in_app_notifications (id, user_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Legit', 'Legit', 'LOW');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      DELETE FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777';
      ${asUser('22222222-2222-2222-2222-222222222222')}
      SELECT count(*) FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    '1',
    false
  ));

  // Test 8: Can recipient User B tamper with their own notification title/message on UPDATE?
  results.push(await testScenario(
    '8. Recipient User B modifies own notification title/message (lack of column-level WITH CHECK on UPDATE)',
    ACTORS_SETUP + `
      INSERT INTO public.in_app_notifications (id, user_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Payer recorded ₹1000', 'Original message', 'MEDIUM');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications
      SET message = 'Altered to: Payer settled ₹10,000 in full'
      WHERE id = '77777777-7777-7777-7777-777777777777';
      SELECT message FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'Altered to: Payer settled ₹10,000 in full',
    false
  ));

  // Test 9: Former member User D (status = 'LEFT') attempts to notify former roommate User B
  results.push(await testScenario(
    '9. Former member User D (status = LEFT) attempts notification to Room 1',
    ACTORS_SETUP,
    `
      ${asUser('44444444-4444-4444-4444-444444444444')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Spam from former member', 'Notice', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // Test 10: Pending member User E (status = 'PENDING') attempts to notify Room 1 members
  results.push(await testScenario(
    '10. Pending member User E attempts notification to Room 1 members',
    ACTORS_SETUP,
    `
      ${asUser('55555555-5555-5555-5555-555555555555')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Pending member ping', 'Notice', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // Test 11: Anonymous user attempts to create notification
  results.push(await testScenario(
    '11. Anonymous user attempts notification creation',
    ACTORS_SETUP,
    `
      ${asAnon()}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Anon Alert', 'Notice', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // ---------------------------------------------------------------------------
  // PART B: FCM & USER_DEVICES AUDIT (Phase 5)
  // ---------------------------------------------------------------------------
  console.log('\n--- PART B: FCM & user_devices Audit ---');

  // Test 12: User A registers their own device
  results.push(await testScenario(
    '12. User A registers own device',
    ACTORS_SETUP,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('11111111-1111-1111-1111-111111111111', 'dev_a_1', 'fcm_tok_a_1', 'android')
      RETURNING device_id, fcm_token;
    `,
    'dev_a_1',
    false
  ));

  // Test 13: User A attempts to register device for User B
  results.push(await testScenario(
    '13. User A attempts to register device under User B',
    ACTORS_SETUP,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_forged', 'fcm_tok_forged', 'android');
    `,
    'violates row-level security policy',
    true
  ));

  // Test 14: User A attempts to read User B device records
  results.push(await testScenario(
    '14. User A attempts to select User B device records',
    ACTORS_SETUP + `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_b_1', 'fcm_tok_b_1', 'android');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      SELECT count(*) FROM public.user_devices WHERE user_id = '22222222-2222-2222-2222-222222222222';
    `,
    '0',
    false
  ));

  // Test 15: User A attempts to update User B's device token
  results.push(await testScenario(
    '15. User A attempts to update User B device token',
    ACTORS_SETUP + `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_b_1', 'fcm_tok_b_1', 'android');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      UPDATE public.user_devices
      SET fcm_token = 'attacker_token'
      WHERE user_id = '22222222-2222-2222-2222-222222222222';
      ${asUser('22222222-2222-2222-2222-222222222222')}
      SELECT fcm_token FROM public.user_devices WHERE user_id = '22222222-2222-2222-2222-222222222222';
    `,
    'fcm_tok_b_1',
    false
  ));

  // Test 16: User A attempts to delete User B's device
  results.push(await testScenario(
    '16. User A attempts to delete User B device',
    ACTORS_SETUP + `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_b_1', 'fcm_tok_b_1', 'android');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      DELETE FROM public.user_devices WHERE user_id = '22222222-2222-2222-2222-222222222222';
      SELECT count(*) FROM public.user_devices WHERE user_id = '22222222-2222-2222-2222-222222222222';
    `,
    '1',
    false
  ));

  // Test 17: User A queries profiles table for roommate User B: does profiles leak fcm_token?
  results.push(await testScenario(
    '17. Roommate User A queries profiles.fcm_token of Roommate B (PII/Device Leak)',
    ACTORS_SETUP,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      SELECT fcm_token FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
    `,
    'token_user_b',
    false
  ));

  // Test 18: Duplicate token across different users in user_devices (can user A register same token as user B?)
  results.push(await testScenario(
    '18. Multiple users registering the exact same FCM token (duplicate token collision)',
    ACTORS_SETUP + `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_phone_shared', 'shared_fcm_token_xyz', 'android');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('11111111-1111-1111-1111-111111111111', 'dev_phone_shared_2', 'shared_fcm_token_xyz', 'android');
      SELECT count(*) FROM public.user_devices WHERE fcm_token = 'shared_fcm_token_xyz';
    `,
    '2',
    false
  ));

  console.log('\n================================================================================');
  console.log('TEST RUN COMPLETE: Summary of Adversarial Security Probes');
  console.log('================================================================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`Total Scenarios Tested: ${results.length}`);
  console.log(`Passed Assertions: ${passedCount}/${results.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

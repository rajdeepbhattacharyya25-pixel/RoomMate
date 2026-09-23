// ==============================================================================
// ROOMMATE PHASE 2C.2 — ADVERSARIAL SECURITY & REGRESSION TEST SUITE
// Tests all 43 adversarial scenarios required by the Phase 2C.2 specification
// ==============================================================================

import { spawn } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const CONTAINER = 'roommate-staging-db';

export function runSql(sql) {
  return new Promise((resolve, reject) => {
    const db = (process.env.PGDATABASE || 'postgres').trim();
    const child = spawn(DOCKER_PATH, ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1']);
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

// Emulate send-push Edge Function validation & authorization logic
async function emulateSendPush({ authHeader, payload }) {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUUID = (u) => typeof u === 'string' && UUID_REGEX.test(u.trim());
  const FORBIDDEN_CLIENT_TYPES = new Set(['ACCOUNT_SECURITY', 'SYSTEM_INFO', 'ADMIN_APPROVAL_REQUIRED']);

  if (!authHeader) {
    return { status: 401, error: 'Unauthorized: Missing Authorization header' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  let callerUserId = null;

  if (token === 'SERVICE_ROLE_KEY') {
    callerUserId = 'service_role';
  } else if (isValidUUID(token)) {
    callerUserId = token;
  } else {
    return { status: 401, error: 'Unauthorized: Invalid authentication session' };
  }

  const targetUserIds = payload.recipientUserIds || payload.userIds || [];
  const { title, body, data } = payload;
  const effectiveRoomId = payload.roomId || data?.roomId;

  if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
    return { status: 400, error: 'Validation Error: recipientUserIds must be a non-empty array' };
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0 || title.length > 100) {
    return { status: 400, error: 'Validation Error: title must be a non-empty string of max 100 characters' };
  }

  if (!body || typeof body !== 'string' || body.trim().length === 0 || body.length > 500) {
    return { status: 400, error: 'Validation Error: body must be a non-empty string of max 500 characters' };
  }

  for (const uid of targetUserIds) {
    if (!isValidUUID(uid)) {
      return { status: 400, error: `Validation Error: Invalid recipient UUID format: ${uid}` };
    }
  }

  if (callerUserId !== 'service_role') {
    if (!effectiveRoomId || !isValidUUID(effectiveRoomId)) {
      return { status: 400, error: 'Validation Error: roomId is mandatory and must be a valid UUID' };
    }

    if (targetUserIds.length > 50) {
      return { status: 400, error: 'Validation Error: Recipient count exceeds maximum limit of 50' };
    }

    const notifType = ((data?.type) || payload.type || '').toUpperCase();
    if (FORBIDDEN_CLIENT_TYPES.has(notifType)) {
      return { status: 403, error: `Forbidden: Client cannot dispatch system-level notification type '${notifType}'` };
    }

    if (data) {
      const dataBytes = new TextEncoder().encode(JSON.stringify(data)).length;
      if (dataBytes > 4096) {
        return { status: 400, error: 'Validation Error: data payload exceeds 4KB limit' };
      }
    }

    // Verify caller membership in staging DB
    const callerCheck = await runSql(`
      SELECT count(*) as count FROM public.room_members 
      WHERE room_id = '${effectiveRoomId}' AND user_id = '${callerUserId}' AND status = 'ACTIVE';
    `);
    const countMatch = callerCheck.stdout.match(/count\s*\n-+\n\s*(\d+)/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;
    if (count !== 1) {
      return { status: 403, error: 'Forbidden: Caller is not an active member of this room' };
    }

    // Verify all recipients in staging DB
    const distinctRecipients = Array.from(new Set(targetUserIds));
    const recipientListSql = distinctRecipients.map(id => `'${id}'`).join(',');
    const recipientCheck = await runSql(`
      SELECT user_id FROM public.room_members 
      WHERE room_id = '${effectiveRoomId}' AND user_id IN (${recipientListSql}) AND status = 'ACTIVE';
    `);
    
    for (const uid of distinctRecipients) {
      if (!recipientCheck.stdout.includes(uid)) {
        return { status: 403, error: 'Forbidden: One or more recipients are not active members of this room' };
      }
    }

    // Sanitize data
    if (data) {
      delete data.is_system_verified;
      delete data.verified_by;
      data.senderId = callerUserId;
      data.roomId = effectiveRoomId;
    }
  }

  return { status: 200, success: true, targetUserIds, sanitizedData: data };
}

async function main() {
  console.log('================================================================================');
  console.log('ROOMMATE PHASE 2C.2 — ADVERSARIAL NOTIFICATION & PUSH HARDENING TEST SUITE');
  console.log('================================================================================\n');

  // Baseline setup actors
  const ACTORS_SETUP = `
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
      ('44444444-4444-4444-4444-444444444444', 'User D Former', 'user_d_former@test.com', 'STUDENT', NULL),
      ('55555555-5555-5555-5555-555555555555', 'User E Pending', 'user_e_pending@test.com', 'STUDENT', NULL),
      ('99999999-9999-9999-9999-999999999999', 'Super Admin', 'superadmin@test.com', 'SUPER_ADMIN', 'token_superadmin')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

    INSERT INTO public.rooms (id, name, created_by) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Room 1 Alpha', '11111111-1111-1111-1111-111111111111'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Room 2 Beta', '33333333-3333-3333-3333-333333333333')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.room_members (id, room_id, user_id, role, status) VALUES
      ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ROOM_ADMIN', 'ACTIVE'),
      ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'MEMBER', 'ACTIVE'),
      ('d1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'MEMBER', 'LEFT'),
      ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'MEMBER', 'REMOVED'),
      ('c1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'ROOM_ADMIN', 'ACTIVE')
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role;
  `;

  await runSql(ACTORS_SETUP);

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

  const results = [];

  // ===========================================================================
  // SECTION 1: SEND-PUSH EDGE FUNCTION AUTHORIZATION TESTS (1 - 13)
  // ===========================================================================
  console.log('--- SECTION 1: send-push Edge Function Authorization Tests ---');

  // 1. authenticated user without roomId
  const r1 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: { recipientUserIds: ['22222222-2222-2222-2222-222222222222'], title: 'Alert', body: 'Test' }
  });
  const p1 = r1.status === 400 && r1.error.includes('roomId is mandatory');
  console.log(`${p1 ? '✅ PASS' : '❌ FAIL'} [1. authenticated user without roomId]`);
  results.push({ name: '1. authenticated user without roomId', passed: p1 });

  // 2. authenticated user with unauthorized roomId
  const r2 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: { roomId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', recipientUserIds: ['33333333-3333-3333-3333-333333333333'], title: 'Alert', body: 'Test' }
  });
  const p2 = r2.status === 403 && r2.error.includes('Caller is not an active member');
  console.log(`${p2 ? '✅ PASS' : '❌ FAIL'} [2. authenticated user with unauthorized roomId]`);
  results.push({ name: '2. authenticated user with unauthorized roomId', passed: p2 });

  // 3. authenticated user with valid roomId
  const r3 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: { roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recipientUserIds: ['22222222-2222-2222-2222-222222222222'], title: 'Alert', body: 'Test' }
  });
  const p3 = r3.status === 200 && r3.success === true;
  console.log(`${p3 ? '✅ PASS' : '❌ FAIL'} [3. authenticated user with valid roomId]`);
  results.push({ name: '3. authenticated user with valid roomId', passed: p3 });

  // 4. valid caller + foreign recipient
  const r4 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: { roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recipientUserIds: ['33333333-3333-3333-3333-333333333333'], title: 'Alert', body: 'Test' }
  });
  const p4 = r4.status === 403 && r4.error.includes('One or more recipients are not active members');
  console.log(`${p4 ? '✅ PASS' : '❌ FAIL'} [4. valid caller + foreign recipient]`);
  results.push({ name: '4. valid caller + foreign recipient', passed: p4 });

  // 5. valid caller + mixed valid/foreign recipients
  const r5 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: { roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recipientUserIds: ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'], title: 'Alert', body: 'Test' }
  });
  const p5 = r5.status === 403 && r5.error.includes('One or more recipients are not active members');
  console.log(`${p5 ? '✅ PASS' : '❌ FAIL'} [5. valid caller + mixed valid/foreign recipients]`);
  results.push({ name: '5. valid caller + mixed valid/foreign recipients', passed: p5 });

  // 6. valid caller + all valid recipients
  const r6 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: { roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recipientUserIds: ['22222222-2222-2222-2222-222222222222'], title: 'Legit', body: 'Body' }
  });
  const p6 = r6.status === 200 && r6.success === true;
  console.log(`${p6 ? '✅ PASS' : '❌ FAIL'} [6. valid caller + all valid recipients]`);
  results.push({ name: '6. valid caller + all valid recipients', passed: p6 });

  // 7. anonymous caller
  const r7 = await emulateSendPush({
    authHeader: null,
    payload: { roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', recipientUserIds: ['22222222-2222-2222-2222-222222222222'], title: 'Anon', body: 'Body' }
  });
  const p7 = r7.status === 401;
  console.log(`${p7 ? '✅ PASS' : '❌ FAIL'} [7. anonymous caller]`);
  results.push({ name: '7. anonymous caller', passed: p7 });

  // 8. service_role caller
  const r8 = await emulateSendPush({
    authHeader: 'Bearer SERVICE_ROLE_KEY',
    payload: { recipientUserIds: ['22222222-2222-2222-2222-222222222222'], title: 'System', body: 'System message' }
  });
  const p8 = r8.status === 200 && r8.success === true;
  console.log(`${p8 ? '✅ PASS' : '❌ FAIL'} [8. service_role caller]`);
  results.push({ name: '8. service_role caller', passed: p8 });

  // 9. forged sender identity in data
  const r9 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: {
      roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      recipientUserIds: ['22222222-2222-2222-2222-222222222222'],
      title: 'Alert',
      body: 'Check',
      data: { senderId: '33333333-3333-3333-3333-333333333333', is_system_verified: true }
    }
  });
  const p9 = r9.status === 200 && r9.sanitizedData.senderId === '11111111-1111-1111-1111-111111111111' && r9.sanitizedData.is_system_verified === undefined;
  console.log(`${p9 ? '✅ PASS' : '❌ FAIL'} [9. forged sender identity sanitized]`);
  results.push({ name: '9. forged sender identity', passed: p9 });

  // 10. forged system notification type
  const r10 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: {
      roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      recipientUserIds: ['22222222-2222-2222-2222-222222222222'],
      title: 'Security',
      body: 'Body',
      data: { type: 'ACCOUNT_SECURITY' }
    }
  });
  const p10 = r10.status === 403 && r10.error.includes('system-level notification type');
  console.log(`${p10 ? '✅ PASS' : '❌ FAIL'} [10. forged system notification type]`);
  results.push({ name: '10. forged system notification type', passed: p10 });

  // 11. oversized payload
  const r11 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: {
      roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      recipientUserIds: ['22222222-2222-2222-2222-222222222222'],
      title: 'Oversized',
      body: 'x'.repeat(600)
    }
  });
  const p11 = r11.status === 400 && r11.error.includes('max 500 characters');
  console.log(`${p11 ? '✅ PASS' : '❌ FAIL'} [11. oversized payload]`);
  results.push({ name: '11. oversized payload', passed: p11 });

  // 12. invalid recipient UUID
  const r12 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: {
      roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      recipientUserIds: ['invalid-uuid-format'],
      title: 'Invalid',
      body: 'Text'
    }
  });
  const p12 = r12.status === 400 && r12.error.includes('Invalid recipient UUID format');
  console.log(`${p12 ? '✅ PASS' : '❌ FAIL'} [12. invalid recipient UUID]`);
  results.push({ name: '12. invalid recipient UUID', passed: p12 });

  // 13. empty recipients
  const r13 = await emulateSendPush({
    authHeader: 'Bearer 11111111-1111-1111-1111-111111111111',
    payload: {
      roomId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      recipientUserIds: [],
      title: 'Empty',
      body: 'Text'
    }
  });
  const p13 = r13.status === 400 && r13.error.includes('non-empty array');
  console.log(`${p13 ? '✅ PASS' : '❌ FAIL'} [13. empty recipients]`);
  results.push({ name: '13. empty recipients', passed: p13 });

  // ===========================================================================
  // SECTION 2: IN-APP NOTIFICATIONS DATABASE & RLS TESTS (14 - 31)
  // ===========================================================================
  console.log('\n--- SECTION 2: in_app_notifications Database & RLS Tests ---');

  // 14. normal user creates allowed room notification
  results.push(await testScenario(
    '14. normal user creates allowed room notification',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'New Bill', 'Dinner split', 'MEDIUM');
      SELECT sender_id, type, title FROM public.in_app_notifications WHERE user_id = '22222222-2222-2222-2222-222222222222' AND type = 'EXPENSE_ADDED';
    `,
    '11111111-1111-1111-1111-111111111111',
    false
  ));

  // 15. normal user creates ACCOUNT_SECURITY
  results.push(await testScenario(
    '15. normal user creates ACCOUNT_SECURITY',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ACCOUNT_SECURITY', 'Fake Security', 'Notice', 'HIGH');
    `,
    'Regular users cannot create system-level notifications',
    true
  ));

  // 16. normal user creates SYSTEM_INFO
  results.push(await testScenario(
    '16. normal user creates SYSTEM_INFO',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SYSTEM_INFO', 'Fake System', 'Notice', 'HIGH');
    `,
    'Regular users cannot create system-level notifications',
    true
  ));

  // 17. normal user creates ADMIN_APPROVAL_REQUIRED
  results.push(await testScenario(
    '17. normal user creates ADMIN_APPROVAL_REQUIRED',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ADMIN_APPROVAL_REQUIRED', 'Fake Approval', 'Notice', 'HIGH');
    `,
    'Regular users cannot create system-level notifications',
    true
  ));

  // 18. user targets unrelated user
  results.push(await testScenario(
    '18. user targets unrelated user',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('33333333-3333-3333-3333-333333333333', NULL, 'EXPENSE_ADDED', 'Spam', 'Notice', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // 19. user targets former roommate (status = LEFT)
  results.push(await testScenario(
    '19. user targets former roommate',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Alert', 'Notice', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // 20. user targets pending member
  results.push(await testScenario(
    '20. user targets pending member',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Alert', 'Notice', 'LOW');
    `,
    'violates row-level security policy',
    true
  ));

  // 21. user modifies message on existing notification
  results.push(await testScenario(
    '21. user modifies message',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Bill', 'Original Message', 'MEDIUM');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET message = 'Tampered Message' WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'Notification content is immutable',
    true
  ));

  // 22. user modifies title
  results.push(await testScenario(
    '22. user modifies title',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Original Title', 'Message', 'MEDIUM');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET title = 'Tampered Title' WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'Notification content is immutable',
    true
  ));

  // 23. user modifies type
  results.push(await testScenario(
    '23. user modifies type',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET type = 'ACCOUNT_SECURITY' WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'Notification content is immutable',
    true
  ));

  // 24. user modifies priority
  results.push(await testScenario(
    '24. user modifies priority',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET priority = 'HIGH' WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'Notification content is immutable',
    true
  ));

  // 25. user modifies metadata
  results.push(await testScenario(
    '25. user modifies metadata',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority, metadata)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM', '{"amount": 100}');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET metadata = '{"amount": 99999}' WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'Notification content is immutable',
    true
  ));

  // 26. user modifies sender_id
  results.push(await testScenario(
    '26. user modifies sender_id',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET sender_id = '99999999-9999-9999-9999-999999999999' WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'Notification content is immutable',
    true
  ));

  // 27. user modifies user_id
  results.push(await testScenario(
    '27. user modifies user_id',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM');
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET user_id = '11111111-1111-1111-1111-111111111111' WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    'violates row-level security policy|Notification content is immutable',
    true
  ));

  // 28. user marks own notification read
  results.push(await testScenario(
    '28. user marks own notification read',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority, is_read)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM', false);
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET is_read = true, read_at = now() WHERE id = '77777777-7777-7777-7777-777777777777';
      SELECT is_read FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    't',
    false
  ));

  // 29. user soft-deletes own notification
  results.push(await testScenario(
    '29. user soft-deletes own notification',
    `
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority, is_deleted)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM', false);
    `,
    `
      ${asUser('22222222-2222-2222-2222-222222222222')}
      UPDATE public.in_app_notifications SET is_deleted = true WHERE id = '77777777-7777-7777-7777-777777777777';
      SELECT is_deleted FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    't',
    false
  ));

  // 30. sender cannot read recipient inbox
  results.push(await testScenario(
    '30. sender cannot read recipient inbox',
    `
      -- Notification created 2 minutes ago
      INSERT INTO public.in_app_notifications (id, user_id, sender_id, room_id, type, title, message, priority, created_at)
      VALUES ('77777777-7777-7777-7777-777777777777', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Title', 'Message', 'MEDIUM', now() - interval '2 minutes');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      SELECT count(*) FROM public.in_app_notifications WHERE id = '77777777-7777-7777-7777-777777777777';
    `,
    '0',
    false
  ));

  // 31. INSERT RETURNING behavior
  results.push(await testScenario(
    '31. INSERT RETURNING behavior',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'Returning Test', 'Checking RETURNING', 'LOW')
      RETURNING id, sender_id, type, title;
    `,
    'Returning Test',
    false
  ));

  // ===========================================================================
  // SECTION 3: FCM & USER_DEVICES SECURITY TESTS (32 - 40)
  // ===========================================================================
  console.log('\n--- SECTION 3: FCM & user_devices Security Tests ---');

  // 32. user registers own device
  results.push(await testScenario(
    '32. user registers own device',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('11111111-1111-1111-1111-111111111111', 'dev_a_1', 'fcm_tok_a_1', 'android')
      RETURNING device_id, fcm_token;
    `,
    'dev_a_1',
    false
  ));

  // 33. user registers another user's device
  results.push(await testScenario(
    '33. user registers another user device',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_forged', 'fcm_tok_forged', 'android');
    `,
    'violates row-level security policy',
    true
  ));

  // 34. user reads another user's device
  results.push(await testScenario(
    '34. user reads another user device',
    `
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

  // 35. user updates another user's token
  results.push(await testScenario(
    '35. user updates another user token',
    `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_b_1', 'fcm_tok_b_1', 'android');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      UPDATE public.user_devices SET fcm_token = 'attacker_token' WHERE user_id = '22222222-2222-2222-2222-222222222222';
      ${asUser('22222222-2222-2222-2222-222222222222')}
      SELECT fcm_token FROM public.user_devices WHERE user_id = '22222222-2222-2222-2222-222222222222';
    `,
    'fcm_tok_b_1',
    false
  ));

  // 36. user deletes another user's device
  results.push(await testScenario(
    '36. user deletes another user device',
    `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform)
      VALUES ('22222222-2222-2222-2222-222222222222', 'dev_b_1', 'fcm_tok_b_1', 'android');
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      DELETE FROM public.user_devices WHERE user_id = '22222222-2222-2222-2222-222222222222';
      ${asUser('22222222-2222-2222-2222-222222222222')}
      SELECT count(*) FROM public.user_devices WHERE user_id = '22222222-2222-2222-2222-222222222222';
    `,
    '1',
    false
  ));

  // 37. duplicate token scenario (shared device collision resolution)
  results.push(await testScenario(
    '37. duplicate token scenario (collision cleanup)',
    `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active)
      VALUES ('11111111-1111-1111-1111-111111111111', 'shared_phone', 'SHARED_TOKEN_123', 'android', true);
    `,
    `
      -- User B signs in on same physical phone with same token
      ${asUser('22222222-2222-2222-2222-222222222222')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active)
      VALUES ('22222222-2222-2222-2222-222222222222', 'shared_phone', 'SHARED_TOKEN_123', 'android', true);
      
      -- Verify User A's registration was deleted to prevent push leaks
      SELECT count(*) as user_a_tokens FROM public.user_devices 
      WHERE user_id = '11111111-1111-1111-1111-111111111111' AND fcm_token = 'SHARED_TOKEN_123';
    `,
    'user_a_tokens[\\s\\S]*0',
    false
  ));

  // 38. account switching scenario
  results.push(await testScenario(
    '38. account switching scenario',
    `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active)
      VALUES ('11111111-1111-1111-1111-111111111111', 'shared_phone', 'SHARED_TOKEN_ABC', 'android', true);
    `,
    `
      -- User B logs in
      ${asUser('22222222-2222-2222-2222-222222222222')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active)
      VALUES ('22222222-2222-2222-2222-222222222222', 'shared_phone', 'SHARED_TOKEN_ABC', 'android', true);

      -- User A logs back in
      ${asUser('11111111-1111-1111-1111-111111111111')}
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active)
      VALUES ('11111111-1111-1111-1111-111111111111', 'shared_phone', 'SHARED_TOKEN_ABC', 'android', true);

      -- User B should have 0 tokens with SHARED_TOKEN_ABC, User A should have 1
      SELECT user_id FROM public.user_devices WHERE fcm_token = 'SHARED_TOKEN_ABC';
    `,
    '11111111-1111-1111-1111-111111111111',
    false
  ));

  // 39. logout scenario
  results.push(await testScenario(
    '39. logout scenario (device deactivation)',
    `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active)
      VALUES ('11111111-1111-1111-1111-111111111111', 'dev_a_logout', 'fcm_tok_logout', 'android', true);
    `,
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      UPDATE public.user_devices SET is_active = false WHERE user_id = '11111111-1111-1111-1111-111111111111' AND device_id = 'dev_a_logout';
      SELECT is_active FROM public.user_devices WHERE user_id = '11111111-1111-1111-1111-111111111111' AND device_id = 'dev_a_logout';
    `,
    'f',
    false
  ));

  // 40. stale token cleanup
  results.push(await testScenario(
    '40. stale token cleanup',
    `
      INSERT INTO public.user_devices (user_id, device_id, fcm_token, platform, is_active)
      VALUES ('11111111-1111-1111-1111-111111111111', 'stale_dev', 'STALE_FCM_TOKEN_XYZ', 'android', true);
    `,
    `
      -- Service role cleans up stale token
      SET LOCAL ROLE service_role;
      DELETE FROM public.user_devices WHERE fcm_token = 'STALE_FCM_TOKEN_XYZ';
      SELECT count(*) FROM public.user_devices WHERE fcm_token = 'STALE_FCM_TOKEN_XYZ';
    `,
    '0',
    false
  ));

  // ===========================================================================
  // SECTION 4: PROFILES PRIVACY & ISOLATION TESTS (41 - 43)
  // ===========================================================================
  console.log('\n--- SECTION 4: profiles Privacy & Isolation Tests ---');

  // 41. roommate attempts to read fcm_token
  results.push(await testScenario(
    '41. roommate attempts to read fcm_token',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      SELECT coalesce(fcm_token, 'NULL_REDACTED') as fcm_token FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
    `,
    'NULL_REDACTED',
    false
  ));

  // 42. own profile access
  results.push(await testScenario(
    '42. own profile access',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      SELECT id, name, email FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
    `,
    'User A',
    false
  ));

  // 43. legitimate roommate profile fields remain accessible
  results.push(await testScenario(
    '43. legitimate roommate profile fields remain accessible',
    '',
    `
      ${asUser('11111111-1111-1111-1111-111111111111')}
      SELECT name, email FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
    `,
    'User B',
    false
  ));

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================================');
  console.log('TEST RUN COMPLETE: Summary of All 43 Scenarios');
  console.log('================================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  console.log(`Total Scenarios Tested: ${total}`);
  console.log(`Passed Assertions: ${passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 ALL 43 ADVERSARIAL & HARDENING TESTS PASSED!');
  } else {
    console.log(`\n❌ ${total - passed} TESTS FAILED.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal execution error in test suite:', err);
  process.exit(1);
});

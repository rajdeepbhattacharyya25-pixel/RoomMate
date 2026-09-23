import { spawn } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const CONTAINER = 'roommate-staging-db';

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const db = process.env.PGDATABASE || 'postgres';
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

async function runAsUser(userId, role, sql) {
  const fullSql = `
    BEGIN;
    SET LOCAL ROLE ${role};
    SET LOCAL "request.jwt.claim.sub" = '${userId}';
    SET LOCAL "request.jwt.claim.role" = '${role}';
    SET LOCAL "request.jwt.claims" = '{"sub": "${userId}", "role": "${role}"}';
    ${sql}
    COMMIT;
  `;
  return runSql(fullSql);
}

async function runAsAnon(sql) {
  const fullSql = `
    BEGIN;
    SET LOCAL ROLE anon;
    SET LOCAL "request.jwt.claim.role" = 'anon';
    SET LOCAL "request.jwt.claims" = '{"role": "anon"}';
    ${sql}
    COMMIT;
  `;
  return runSql(fullSql);
}

const results = [];
function record(name, expected, actual, passed, details = '') {
  results.push({ name, expected, actual, passed });
  console.log(`[Phase 6] ${passed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  if (!passed) {
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
    if (details) console.error(`   Details:  ${details}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 2B.3: END-TO-END JOIN FLOW & REGRESSION VERIFICATION');
  console.log('================================================================\n');

  // Setup test rooms and invites
  await runSql(`
    -- Seed test user
    INSERT INTO auth.users (id, email)
    VALUES ('30000000-0000-0000-0000-000000000001', 'join_tester@roommate.app')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, name, role)
    VALUES ('30000000-0000-0000-0000-000000000001', 'join_tester@roommate.app', 'Join Tester', 'STUDENT')
    ON CONFLICT (id) DO NOTHING;

    -- Instant Room
    INSERT INTO public.rooms (id, name, created_by, join_policy, is_archived, is_frozen)
    VALUES ('bbbb0000-0000-0000-0000-000000000001', 'Instant Join Room', '30000000-0000-0000-0000-000000000001', 'INSTANT', false, false)
    ON CONFLICT (id) DO UPDATE SET join_policy = 'INSTANT', is_archived = false, is_frozen = false;

    -- Approval Room
    INSERT INTO public.rooms (id, name, created_by, join_policy, is_archived, is_frozen)
    VALUES ('bbbb0000-0000-0000-0000-000000000002', 'Approval Join Room', '30000000-0000-0000-0000-000000000001', 'APPROVAL_REQUIRED', false, false)
    ON CONFLICT (id) DO UPDATE SET join_policy = 'APPROVAL_REQUIRED', is_archived = false, is_frozen = false;

    -- Archived Room
    INSERT INTO public.rooms (id, name, created_by, join_policy, is_archived, is_frozen)
    VALUES ('bbbb0000-0000-0000-0000-000000000003', 'Archived Room', '30000000-0000-0000-0000-000000000001', 'INSTANT', true, false)
    ON CONFLICT (id) DO UPDATE SET is_archived = true, is_frozen = false;

    -- Frozen Room
    INSERT INTO public.rooms (id, name, created_by, join_policy, is_archived, is_frozen)
    VALUES ('bbbb0000-0000-0000-0000-000000000004', 'Frozen Room', '30000000-0000-0000-0000-000000000001', 'INSTANT', false, true)
    ON CONFLICT (id) DO UPDATE SET is_archived = false, is_frozen = true;

    -- Invitations
    INSERT INTO public.room_invitations (id, room_id, invite_code, token, created_by, expires_at, is_revoked)
    VALUES 
      ('cccc0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'TST_INST', 'tok_inst', '30000000-0000-0000-0000-000000000001', now() + interval '7 days', false),
      ('cccc0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000002', 'TST_APPR', 'tok_appr', '30000000-0000-0000-0000-000000000001', now() + interval '7 days', false),
      ('cccc0000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-000000000001', 'TST_EXPD', 'tok_expd', '30000000-0000-0000-0000-000000000001', now() - interval '1 hour', false),
      ('cccc0000-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-000000000001', 'TST_RVKD', 'tok_rvkd', '30000000-0000-0000-0000-000000000001', now() + interval '7 days', true),
      ('cccc0000-0000-0000-0000-000000000005', 'bbbb0000-0000-0000-0000-000000000003', 'TST_ARCH', 'tok_arch', '30000000-0000-0000-0000-000000000001', now() + interval '7 days', false),
      ('cccc0000-0000-0000-0000-000000000006', 'bbbb0000-0000-0000-0000-000000000004', 'TST_FRZN', 'tok_frzn', '30000000-0000-0000-0000-000000000001', now() + interval '7 days', false)
    ON CONFLICT (id) DO NOTHING;

    -- Clean any existing membership for test candidate
    DELETE FROM public.room_members WHERE user_id = '30000000-0000-0000-0000-000000000002';
    DELETE FROM public.room_join_requests WHERE user_id = '30000000-0000-0000-0000-000000000002';
    INSERT INTO auth.users (id, email)
    VALUES ('30000000-0000-0000-0000-000000000002', 'join_candidate@roommate.app')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, name, role)
    VALUES ('30000000-0000-0000-0000-000000000002', 'join_candidate@roommate.app', 'Join Candidate', 'STUDENT')
    ON CONFLICT (id) DO NOTHING;
  `);

  const candidateId = '30000000-0000-0000-0000-000000000002';

  // 1. Valid INSTANT invitation -> Expected: JOINED
  try {
    const res = await runAsUser(candidateId, 'authenticated', `
      SELECT public.join_room_with_code('TST_INST') as res;
    `);
    const passed = res.stdout.includes('"status": "JOINED"');
    record('1. Valid INSTANT invitation', 'status: JOINED', res.stdout, passed);
  } catch (e) {
    record('1. Valid INSTANT invitation', 'status: JOINED', e.message, false);
  }

  // 2. Valid APPROVAL_REQUIRED invitation -> Expected: PENDING
  try {
    const res = await runAsUser(candidateId, 'authenticated', `
      SELECT public.join_room_with_code('TST_APPR') as res;
    `);
    const passed = res.stdout.includes('"status": "PENDING"');
    record('2. Valid APPROVAL_REQUIRED invitation', 'status: PENDING', res.stdout, passed);
  } catch (e) {
    record('2. Valid APPROVAL_REQUIRED invitation', 'status: PENDING', e.message, false);
  }

  // 3. Already-member invitation -> Expected: ALREADY_MEMBER
  try {
    const res = await runAsUser(candidateId, 'authenticated', `
      SELECT public.join_room_with_code('TST_INST') as res;
    `);
    const passed = res.stdout.includes('"status": "ALREADY_MEMBER"');
    record('3. Already-member invitation', 'status: ALREADY_MEMBER', res.stdout, passed);
  } catch (e) {
    record('3. Already-member invitation', 'status: ALREADY_MEMBER', e.message, false);
  }

  // 4. Expired invitation -> Expected: INVITATION_EXPIRED
  try {
    await runAsUser(candidateId, 'authenticated', `
      SELECT public.join_room_with_code('TST_EXPD') as res;
    `);
    record('4. Expired invitation', 'Error INVITATION_EXPIRED', 'Allowed unexpectedly', false);
  } catch (e) {
    const passed = e.stderr.includes('INVITATION_EXPIRED') || e.message.includes('INVITATION_EXPIRED');
    record('4. Expired invitation', 'Error INVITATION_EXPIRED', e.stderr || e.message, passed);
  }

  // 5. Revoked invitation -> Expected: INVALID_INVITE_CODE
  try {
    await runAsUser(candidateId, 'authenticated', `
      SELECT public.join_room_with_code('TST_RVKD') as res;
    `);
    record('5. Revoked invitation', 'Error INVALID_INVITE_CODE', 'Allowed unexpectedly', false);
  } catch (e) {
    const passed = e.stderr.includes('INVALID_INVITE_CODE') || e.message.includes('INVALID_INVITE_CODE');
    record('5. Revoked invitation', 'Error INVALID_INVITE_CODE', e.stderr || e.message, passed);
  }

  // 6. Archived room -> Expected: ROOM_UNAVAILABLE
  try {
    await runAsUser(candidateId, 'authenticated', `
      SELECT public.join_room_with_code('TST_ARCH') as res;
    `);
    record('6. Archived room', 'Error ROOM_UNAVAILABLE', 'Allowed unexpectedly', false);
  } catch (e) {
    const passed = e.stderr.includes('ROOM_UNAVAILABLE') || e.message.includes('ROOM_UNAVAILABLE');
    record('6. Archived room', 'Error ROOM_UNAVAILABLE', e.stderr || e.message, passed);
  }

  // 7. Frozen room -> Expected: ROOM_FROZEN
  try {
    await runAsUser(candidateId, 'authenticated', `
      SELECT public.join_room_with_code('TST_FRZN') as res;
    `);
    record('7. Frozen room', 'Error ROOM_FROZEN', 'Allowed unexpectedly', false);
  } catch (e) {
    const passed = e.stderr.includes('ROOM_FROZEN') || e.message.includes('ROOM_FROZEN');
    record('7. Frozen room', 'Error ROOM_FROZEN', e.stderr || e.message, passed);
  }

  // 8. Unauthenticated caller -> Expected: UNAUTHENTICATED
  try {
    await runAsAnon(`
      SELECT public.join_room_with_code('TST_INST') as res;
    `);
    record('8. Unauthenticated caller', 'Permission Denied / UNAUTHENTICATED', 'Allowed unexpectedly', false);
  } catch (e) {
    const passed = e.stderr.includes('permission denied') || e.stderr.includes('UNAUTHENTICATED') || e.message.includes('permission denied') || e.message.includes('UNAUTHENTICATED');
    record('8. Unauthenticated caller', 'Permission Denied / UNAUTHENTICATED', e.stderr || e.message, passed);
  }

  // 9. Client manipulation attempt: Try to directly bypass RPC and insert self as ROOM_ADMIN
  try {
    await runAsUser(candidateId, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('bbbb0000-0000-0000-0000-000000000002', '${candidateId}', 'ROOM_ADMIN', 'ACTIVE');
    `);
    record('9. Direct client manipulation (insert as ROOM_ADMIN)', 'RLS Error 42501', 'Allowed unexpectedly', false);
  } catch (e) {
    const passed = e.stderr.includes('42501') || e.message.includes('42501') || e.stderr.includes('violates row-level security policy');
    record('9. Direct client manipulation (insert as ROOM_ADMIN)', 'RLS Error 42501', e.stderr || e.message, passed);
  }

  console.log('\n================================================================');
  const allPassed = results.every(r => r.passed);
  console.log(`JOIN REGRESSION RESULTS: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  console.log(`OVERALL: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('================================================================');

  if (!allPassed) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

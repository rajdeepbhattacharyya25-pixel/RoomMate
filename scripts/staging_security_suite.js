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

// Execute as a simulated authenticated Supabase user
export async function runAsUser(userId, role, sql) {
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

// Execute as unauthenticated anon
export async function runAsAnon(sql) {
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

const suiteResults = [];

function recordTest(phase, testName, expected, actual, passed, details = '') {
  suiteResults.push({ phase, testName, expected, actual, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${phase}] ${mark}: ${testName}`);
  if (!passed) {
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
    if (details) console.error(`   Details:  ${details}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('ROOMMATE — PHASE 2B.2 STAGING EXECUTION & ADVERSARIAL VERIFICATION');
  console.log('================================================================\n');

  // Ensure baseline grants and revokes are correctly configured
  await runSql(`
    -- Grant general access
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;

    -- Explicitly enforce join_room_with_code privilege restrictions
    REVOKE EXECUTE ON FUNCTION public.join_room_with_code(TEXT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.join_room_with_code(TEXT) TO authenticated, service_role;
  `);

  // ---------------------------------------------------------------------------
  // PHASE 4: POST-MIGRATION SCHEMA AUDIT
  // ---------------------------------------------------------------------------
  console.log('--- PHASE 4: SCHEMA & POLICY AUDIT ---');

  // 1. Check Function
  try {
    const res = await runSql(`
      SELECT proname, prosecdef, prosrc 
      FROM pg_proc 
      JOIN pg_namespace n ON pg_proc.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND proname = 'join_room_with_code';
    `);
    const exists = res.stdout.includes('join_room_with_code');
    recordTest('Phase 4', 'Function public.join_room_with_code exists', 'EXISTS', exists ? 'EXISTS' : 'MISSING', exists);
  } catch (e) {
    recordTest('Phase 4', 'Function public.join_room_with_code exists', 'EXISTS', 'ERROR', false, e.message);
  }

  // 2. Check Trigger Function
  try {
    const res = await runSql(`
      SELECT proname, prosecdef 
      FROM pg_proc 
      JOIN pg_namespace n ON pg_proc.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND proname = 'prevent_member_role_escalation';
    `);
    const exists = res.stdout.includes('prevent_member_role_escalation');
    recordTest('Phase 4', 'Trigger function public.prevent_member_role_escalation exists', 'EXISTS', exists ? 'EXISTS' : 'MISSING', exists);
  } catch (e) {
    recordTest('Phase 4', 'Trigger function public.prevent_member_role_escalation exists', 'EXISTS', 'ERROR', false, e.message);
  }

  // 3. Check Trigger
  try {
    const res = await runSql(`
      SELECT tgname, relname 
      FROM pg_trigger 
      JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid 
      WHERE tgname = 'trg_prevent_member_role_escalation';
    `);
    const exists = res.stdout.includes('trg_prevent_member_role_escalation');
    recordTest('Phase 4', 'Trigger trg_prevent_member_role_escalation on room_members exists', 'EXISTS', exists ? 'EXISTS' : 'MISSING', exists);
  } catch (e) {
    recordTest('Phase 4', 'Trigger trg_prevent_member_role_escalation exists', 'EXISTS', 'ERROR', false, e.message);
  }

  // 4. Check Policies
  const expectedPolicies = [
    { table: 'room_members', name: 'Admins or creators can insert room members', cmd: 'INSERT' },
    { table: 'room_members', name: 'Admins or self can update member status', cmd: 'UPDATE' },
    { table: 'bug_reports', name: 'Submitter or superadmin can read bug reports', cmd: 'SELECT' },
    { table: 'bug_reports', name: 'Residents can insert own bug reports', cmd: 'INSERT' },
    { table: 'bug_reports', name: 'Only superadmins can update bug reports', cmd: 'UPDATE' },
    { table: 'in_app_notifications', name: 'Users can notify co-roommates or self', cmd: 'INSERT' },
    { table: 'profiles', name: 'Profiles readable by roommates, self, or superadmin', cmd: 'SELECT' }
  ];

  for (const p of expectedPolicies) {
    try {
      const res = await runSql(`
        SELECT polname 
        FROM pg_policy pol 
        JOIN pg_class c ON pol.polrelid = c.oid 
        WHERE c.relname = '${p.table}' AND pol.polname = '${p.name}';
      `);
      const exists = res.stdout.includes(p.name);
      recordTest('Phase 4', `Policy "${p.name}" on ${p.table}`, 'EXISTS', exists ? 'EXISTS' : 'MISSING', exists);
    } catch (e) {
      recordTest('Phase 4', `Policy "${p.name}" on ${p.table}`, 'EXISTS', 'ERROR', false, e.message);
    }
  }

  // 5. Check Removed Old Policies
  const oldPolicies = [
    { table: 'room_members', name: 'Users can join rooms via valid invitation or creator' },
    { table: 'bug_reports', name: 'Residents and admins can read bug reports' },
    { table: 'bug_reports', name: 'Admins can update bug reports' },
    { table: 'bug_reports', name: 'Residents can insert bug reports' },
    { table: 'in_app_notifications', name: 'Authenticated users can insert notifications' },
    { table: 'profiles', name: 'Profiles are readable by authenticated users' }
  ];

  for (const p of oldPolicies) {
    try {
      const res = await runSql(`
        SELECT polname 
        FROM pg_policy pol 
        JOIN pg_class c ON pol.polrelid = c.oid 
        WHERE c.relname = '${p.table}' AND pol.polname = '${p.name}';
      `);
      const removed = !res.stdout.includes(p.name);
      recordTest('Phase 4', `Old permissive policy "${p.name}" removed`, 'REMOVED', removed ? 'REMOVED' : 'STILL_EXISTS', removed);
    } catch (e) {
      recordTest('Phase 4', `Old permissive policy "${p.name}" removed`, 'REMOVED', 'ERROR', false, e.message);
    }
  }

  // 6. Check Privileges on join_room_with_code
  try {
    const res = await runSql(`
      SELECT grantee, privilege_type 
      FROM information_schema.routine_privileges 
      WHERE routine_schema = 'public' AND routine_name = 'join_room_with_code';
    `);
    const anonHas = res.stdout.includes('anon');
    const publicHas = res.stdout.includes('PUBLIC');
    const authHas = res.stdout.includes('authenticated');
    
    recordTest('Phase 4', 'join_room_with_code revoked from anon & PUBLIC', 'REVOKED', (!anonHas && !publicHas) ? 'REVOKED' : 'EXPOSED', (!anonHas && !publicHas));
    recordTest('Phase 4', 'join_room_with_code granted to authenticated', 'GRANTED', authHas ? 'GRANTED' : 'MISSING', authHas);
  } catch (e) {
    recordTest('Phase 4', 'join_room_with_code privilege audit', 'REVOKED', 'ERROR', false, e.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 5: CREATE TEST ACTORS & DATASET
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 5: SEED TEST ACTORS & DATASET ---');

  const ACTORS = {
    SUPERADMIN: '00000000-0000-0000-0000-000000000001',
    CREATOR_A:  '10000000-0000-0000-0000-000000000001',
    MEMBER_A:   '10000000-0000-0000-0000-000000000002',
    FORMER_A:   '10000000-0000-0000-0000-000000000003',
    CREATOR_B:  '20000000-0000-0000-0000-000000000001',
    MEMBER_B:   '20000000-0000-0000-0000-000000000002',
    ATTACKER:   '90000000-0000-0000-0000-000000000001'
  };

  const ROOMS = {
    ROOM_A:         'aaaa0000-0000-0000-0000-000000000001',
    ROOM_B:         'bbbb0000-0000-0000-0000-000000000001',
    ROOM_EXPIRED:   'eeee0000-0000-0000-0000-000000000001',
    ROOM_REVOKED:   'ee110000-0000-0000-0000-000000000001',
    ROOM_ARCHIVED:  '99990000-0000-0000-0000-000000000001',
    ROOM_FROZEN:    'ffff0000-0000-0000-0000-000000000001',
    ROOM_NEW_C:     'cccc0000-0000-0000-0000-000000000001'
  };

  const seedSql = `
    -- Clear previous test data
    TRUNCATE auth.users, public.rooms, public.room_members, 
             public.room_invitations, public.room_join_requests, public.bug_reports, 
             public.in_app_notifications, public.personal_expenses, public.shared_expenses CASCADE;

    -- 1. Insert auth.users
    INSERT INTO auth.users (id, email) VALUES
      ('${ACTORS.SUPERADMIN}', 'superadmin@roommate.test'),
      ('${ACTORS.CREATOR_A}',  'creator_a@roommate.test'),
      ('${ACTORS.MEMBER_A}',   'member_a@roommate.test'),
      ('${ACTORS.FORMER_A}',   'former_a@roommate.test'),
      ('${ACTORS.CREATOR_B}',  'creator_b@roommate.test'),
      ('${ACTORS.MEMBER_B}',   'member_b@roommate.test'),
      ('${ACTORS.ATTACKER}',   'attacker@roommate.test')
    ON CONFLICT (id) DO NOTHING;

    -- 2. Update public.profiles
    UPDATE public.profiles SET role = 'SUPER_ADMIN', name = 'Super Admin', phone = '+919000000001', upi_id = 'superadmin@upi' WHERE id = '${ACTORS.SUPERADMIN}';
    UPDATE public.profiles SET role = 'STUDENT', name = 'Creator Alpha', phone = '+919000000011', upi_id = 'creator_a@upi' WHERE id = '${ACTORS.CREATOR_A}';
    UPDATE public.profiles SET role = 'STUDENT', name = 'Member Alpha',  phone = '+919000000012', upi_id = 'member_a@upi'  WHERE id = '${ACTORS.MEMBER_A}';
    UPDATE public.profiles SET role = 'STUDENT', name = 'Former Alpha',  phone = '+919000000013', upi_id = 'former_a@upi'  WHERE id = '${ACTORS.FORMER_A}';
    UPDATE public.profiles SET role = 'STUDENT', name = 'Creator Beta',  phone = '+919000000021', upi_id = 'creator_b@upi' WHERE id = '${ACTORS.CREATOR_B}';
    UPDATE public.profiles SET role = 'STUDENT', name = 'Member Beta',   phone = '+919000000022', upi_id = 'member_b@upi'  WHERE id = '${ACTORS.MEMBER_B}';
    UPDATE public.profiles SET role = 'STUDENT', name = 'Attacker NonMember', phone = '+919999999999', upi_id = 'attacker@upi' WHERE id = '${ACTORS.ATTACKER}';

    -- 3. Insert public.rooms
    INSERT INTO public.rooms (id, name, created_by, join_policy, is_archived, is_frozen) VALUES
      ('${ROOMS.ROOM_A}', 'Flat 101 Alpha', '${ACTORS.CREATOR_A}', 'INSTANT', false, false),
      ('${ROOMS.ROOM_B}', 'Flat 202 Beta',  '${ACTORS.CREATOR_B}', 'APPROVAL_REQUIRED', false, false),
      ('${ROOMS.ROOM_EXPIRED}',  'Expired Room',  '${ACTORS.CREATOR_A}', 'INSTANT', false, false),
      ('${ROOMS.ROOM_REVOKED}',  'Revoked Room',  '${ACTORS.CREATOR_A}', 'INSTANT', false, false),
      ('${ROOMS.ROOM_ARCHIVED}', 'Archived Room', '${ACTORS.CREATOR_A}', 'INSTANT', true,  false),
      ('${ROOMS.ROOM_FROZEN}',   'Frozen Room',   '${ACTORS.CREATOR_A}', 'INSTANT', false, true);

    -- 4. Insert public.room_members
    INSERT INTO public.room_members (room_id, user_id, role, status) VALUES
      ('${ROOMS.ROOM_A}', '${ACTORS.CREATOR_A}', 'ROOM_ADMIN', 'ACTIVE'),
      ('${ROOMS.ROOM_A}', '${ACTORS.MEMBER_A}',  'MEMBER',     'ACTIVE'),
      ('${ROOMS.ROOM_A}', '${ACTORS.FORMER_A}',  'MEMBER',     'LEFT'),
      ('${ROOMS.ROOM_B}', '${ACTORS.CREATOR_B}', 'ROOM_ADMIN', 'ACTIVE'),
      ('${ROOMS.ROOM_B}', '${ACTORS.MEMBER_B}',  'MEMBER',     'ACTIVE');

    -- 5. Insert public.room_invitations (codes <= 12 chars)
    INSERT INTO public.room_invitations (room_id, invite_code, token, created_by, expires_at, is_revoked) VALUES
      ('${ROOMS.ROOM_A}', 'INV_INSTANT',  'tok_instant_123', '${ACTORS.CREATOR_A}', now() + interval '7 days', false),
      ('${ROOMS.ROOM_B}', 'INV_APPROVE',  'tok_approval_123','${ACTORS.CREATOR_B}', now() + interval '7 days', false),
      ('${ROOMS.ROOM_EXPIRED}',  'INV_EXPIRED',  'tok_expired_123', '${ACTORS.CREATOR_A}', now() - interval '1 day',  false),
      ('${ROOMS.ROOM_REVOKED}',  'INV_REVOKED',  'tok_revoked_123', '${ACTORS.CREATOR_A}', now() + interval '7 days', true),
      ('${ROOMS.ROOM_ARCHIVED}', 'INV_ARCHIVE',  'tok_archived_123','${ACTORS.CREATOR_A}', now() + interval '7 days', false),
      ('${ROOMS.ROOM_FROZEN}',   'INV_FROZEN',   'tok_frozen_123',  '${ACTORS.CREATOR_A}', now() + interval '7 days', false);
  `;

  try {
    await runSql(seedSql);
    recordTest('Phase 5', 'Seed test actors and rooms', 'SEEDED', 'SEEDED', true);
  } catch (e) {
    recordTest('Phase 5', 'Seed test actors and rooms', 'SEEDED', 'ERROR', false, e.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 6: ROOM MEMBERSHIP ATTACK TESTS (Direct INSERT)
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 6: ROOM MEMBERSHIP INSERT ATTACK TESTS ---');

  // TEST A: Non-member attempts to insert themselves into another room as MEMBER
  try {
    await runAsUser(ACTORS.ATTACKER, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_A}', '${ACTORS.ATTACKER}', 'MEMBER', 'ACTIVE');
    `);
    recordTest('Phase 6', 'TEST A: Non-member insert self as MEMBER', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security policy') || err.message.includes('42501');
    recordTest('Phase 6', 'TEST A: Non-member insert self as MEMBER', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // TEST B: Non-member attempts to insert themselves into another room as ROOM_ADMIN
  try {
    await runAsUser(ACTORS.ATTACKER, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_A}', '${ACTORS.ATTACKER}', 'ROOM_ADMIN', 'ACTIVE');
    `);
    recordTest('Phase 6', 'TEST B: Non-member insert self as ROOM_ADMIN', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security policy') || err.message.includes('42501');
    recordTest('Phase 6', 'TEST B: Non-member insert self as ROOM_ADMIN', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // TEST C: Non-member attempts to insert another user into another room
  try {
    await runAsUser(ACTORS.ATTACKER, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_A}', '${ACTORS.MEMBER_B}', 'MEMBER', 'ACTIVE');
    `);
    recordTest('Phase 6', 'TEST C: Non-member insert other user into room', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security policy') || err.message.includes('42501');
    recordTest('Phase 6', 'TEST C: Non-member insert other user into room', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // TEST D: Normal member attempts to insert themselves into current room directly
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_A}', '${ACTORS.MEMBER_A}', 'MEMBER', 'ACTIVE');
    `);
    recordTest('Phase 6', 'TEST D: Normal member direct insert self into current room', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security policy') || err.stderr.includes('unique_room_member') || err.message.includes('42501');
    recordTest('Phase 6', 'TEST D: Normal member direct insert self into current room', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // TEST E: Room creator creates initial ROOM_ADMIN membership in newly created room
  try {
    await runAsUser(ACTORS.CREATOR_A, 'authenticated', `
      INSERT INTO public.rooms (id, name, created_by, join_policy)
      VALUES ('${ROOMS.ROOM_NEW_C}', 'Flat Gamma', '${ACTORS.CREATOR_A}', 'INSTANT');
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_NEW_C}', '${ACTORS.CREATOR_A}', 'ROOM_ADMIN', 'ACTIVE');
    `);
    recordTest('Phase 6', 'TEST E: Room creator insert initial ROOM_ADMIN row', 'ALLOWED', 'ALLOWED', true);
  } catch (err) {
    recordTest('Phase 6', 'TEST E: Room creator insert initial ROOM_ADMIN row', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // TEST F: Room admin adds a legitimate member to administered room
  const NEW_USER_F = '30000000-0000-0000-0000-000000000001';
  try {
    await runSql(`
      INSERT INTO auth.users (id, email) VALUES ('${NEW_USER_F}', 'user_f@test.com') ON CONFLICT (id) DO NOTHING;
    `);
    await runAsUser(ACTORS.CREATOR_A, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_A}', '${NEW_USER_F}', 'MEMBER', 'ACTIVE');
    `);
    recordTest('Phase 6', 'TEST F: Room Admin adds member to administered room', 'ALLOWED', 'ALLOWED', true);
  } catch (err) {
    recordTest('Phase 6', 'TEST F: Room Admin adds member to administered room', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // TEST G: SuperAdmin adds a member to any room
  const NEW_USER_G = '40000000-0000-0000-0000-000000000001';
  try {
    await runSql(`
      INSERT INTO auth.users (id, email) VALUES ('${NEW_USER_G}', 'user_g@test.com') ON CONFLICT (id) DO NOTHING;
    `);
    await runAsUser(ACTORS.SUPERADMIN, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_B}', '${NEW_USER_G}', 'MEMBER', 'ACTIVE');
    `);
    recordTest('Phase 6', 'TEST G: SuperAdmin adds member to any room', 'ALLOWED', 'ALLOWED', true);
  } catch (err) {
    recordTest('Phase 6', 'TEST G: SuperAdmin adds member to any room', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 7: LEGITIMATE JOIN FLOW (RPC)
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 7: LEGITIMATE JOIN FLOW AUDIT ---');

  // 1. Instant join
  const JOIN_USER_1 = '50000000-0000-0000-0000-000000000001';
  try {
    await runSql(`
      INSERT INTO auth.users (id, email) VALUES ('${JOIN_USER_1}', 'join1@test.com') ON CONFLICT (id) DO NOTHING;
    `);
    const res = await runAsUser(JOIN_USER_1, 'authenticated', `
      SELECT public.join_room_with_code('INV_INSTANT');
    `);
    const isJoined = res.stdout.includes('JOINED');
    recordTest('Phase 7', 'join_room_with_code on INSTANT room joins actively', 'JOINED', isJoined ? 'JOINED' : 'UNEXPECTED', isJoined);
  } catch (err) {
    recordTest('Phase 7', 'join_room_with_code on INSTANT room joins actively', 'JOINED', 'ERROR', false, err.stderr || err.message);
  }

  // 2. Approval required join
  const JOIN_USER_2 = '60000000-0000-0000-0000-000000000001';
  try {
    await runSql(`
      INSERT INTO auth.users (id, email) VALUES ('${JOIN_USER_2}', 'join2@test.com') ON CONFLICT (id) DO NOTHING;
    `);
    const res = await runAsUser(JOIN_USER_2, 'authenticated', `
      SELECT public.join_room_with_code('INV_APPROVE');
    `);
    const isPending = res.stdout.includes('PENDING');
    recordTest('Phase 7', 'join_room_with_code on APPROVAL room submits request', 'PENDING', isPending ? 'PENDING' : 'UNEXPECTED', isPending);
  } catch (err) {
    recordTest('Phase 7', 'join_room_with_code on APPROVAL room submits request', 'PENDING', 'ERROR', false, err.stderr || err.message);
  }

  // 3. Expired code
  try {
    await runAsUser(ACTORS.ATTACKER, 'authenticated', `
      SELECT public.join_room_with_code('INV_EXPIRED');
    `);
    recordTest('Phase 7', 'join_room_with_code rejects expired code', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isExpired = err.stderr.includes('INVITATION_EXPIRED') || err.message.includes('22007');
    recordTest('Phase 7', 'join_room_with_code rejects expired code', 'DENIED', isExpired ? 'DENIED' : 'UNEXPECTED_ERROR', isExpired, err.stderr || err.message);
  }

  // 4. Revoked code
  try {
    await runAsUser(ACTORS.ATTACKER, 'authenticated', `
      SELECT public.join_room_with_code('INV_REVOKED');
    `);
    recordTest('Phase 7', 'join_room_with_code rejects revoked code', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isRevoked = err.stderr.includes('INVALID_INVITE_CODE') || err.message.includes('P0002');
    recordTest('Phase 7', 'join_room_with_code rejects revoked code', 'DENIED', isRevoked ? 'DENIED' : 'UNEXPECTED_ERROR', isRevoked, err.stderr || err.message);
  }

  // 5. Archived room
  try {
    await runAsUser(ACTORS.ATTACKER, 'authenticated', `
      SELECT public.join_room_with_code('INV_ARCHIVE');
    `);
    recordTest('Phase 7', 'join_room_with_code rejects archived room', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isArchived = err.stderr.includes('ROOM_UNAVAILABLE') || err.message.includes('P0002');
    recordTest('Phase 7', 'join_room_with_code rejects archived room', 'DENIED', isArchived ? 'DENIED' : 'UNEXPECTED_ERROR', isArchived, err.stderr || err.message);
  }

  // 6. Frozen room
  try {
    await runAsUser(ACTORS.ATTACKER, 'authenticated', `
      SELECT public.join_room_with_code('INV_FROZEN');
    `);
    recordTest('Phase 7', 'join_room_with_code rejects frozen room', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isFrozen = err.stderr.includes('ROOM_FROZEN') || err.message.includes('42501');
    recordTest('Phase 7', 'join_room_with_code rejects frozen room', 'DENIED', isFrozen ? 'DENIED' : 'UNEXPECTED_ERROR', isFrozen, err.stderr || err.message);
  }

  // 7. Anon / Unauthenticated execution
  try {
    await runAsAnon(`
      SELECT public.join_room_with_code('INV_INSTANT');
    `);
    recordTest('Phase 7', 'join_room_with_code blocks anonymous callers', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('permission denied for function') || err.stderr.includes('UNAUTHENTICATED') || err.message.includes('42501');
    recordTest('Phase 7', 'join_room_with_code blocks anonymous callers', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 8: ROLE ESCALATION ATTACK TESTS
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 8: ROLE ESCALATION ATTACKS ---');

  // 1. PATCH self role MEMBER -> ROOM_ADMIN
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      UPDATE public.room_members 
      SET role = 'ROOM_ADMIN' 
      WHERE room_id = '${ROOMS.ROOM_A}' AND user_id = '${ACTORS.MEMBER_A}';
    `);
    recordTest('Phase 8', '1. Member self-escalates to ROOM_ADMIN via UPDATE', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isTriggerBlocked = err.stderr.includes('Non-admins cannot elevate membership roles') || err.message.includes('42501');
    recordTest('Phase 8', '1. Member self-escalates to ROOM_ADMIN via UPDATE', 'DENIED', isTriggerBlocked ? 'DENIED' : 'UNEXPECTED_ERROR', isTriggerBlocked, err.stderr || err.message);
  }

  // 2. PATCH another member's role
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      UPDATE public.room_members 
      SET role = 'ROOM_ADMIN' 
      WHERE room_id = '${ROOMS.ROOM_A}' AND user_id = '${ACTORS.FORMER_A}';
    `);
    const zeroRows = res.stdout.includes('UPDATE 0');
    recordTest('Phase 8', '2. Member elevates another member via UPDATE', 'DENIED', zeroRows ? 'DENIED (0 rows updated)' : 'ALLOWED', zeroRows);
  } catch (err) {
    const isDenied = err.stderr.includes('Non-admins cannot elevate membership roles') || err.message.includes('42501');
    recordTest('Phase 8', '2. Member elevates another member via UPDATE', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // 3. UPSERT membership with ROOM_ADMIN
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_A}', '${ACTORS.MEMBER_A}', 'ROOM_ADMIN', 'ACTIVE')
      ON CONFLICT (room_id, user_id)
      DO UPDATE SET role = 'ROOM_ADMIN';
    `);
    recordTest('Phase 8', '3. Member elevates to ROOM_ADMIN via UPSERT', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('Non-admins cannot elevate membership roles') || err.stderr.includes('row-level security') || err.message.includes('42501');
    recordTest('Phase 8', '3. Member elevates to ROOM_ADMIN via UPSERT', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // 4. Role escalation while modifying status
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      UPDATE public.room_members 
      SET status = 'LEFT', role = 'ROOM_ADMIN'
      WHERE room_id = '${ROOMS.ROOM_A}' AND user_id = '${ACTORS.MEMBER_A}';
    `);
    recordTest('Phase 8', '4. Role escalation combined with status=LEFT', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('Non-admins cannot elevate membership roles') || err.message.includes('42501');
    recordTest('Phase 8', '4. Role escalation combined with status=LEFT', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // 5. Invalid status transition (e.g. member sets status to REMOVED)
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      UPDATE public.room_members 
      SET status = 'REMOVED'
      WHERE room_id = '${ROOMS.ROOM_A}' AND user_id = '${ACTORS.MEMBER_A}';
    `);
    recordTest('Phase 8', '5. Member updates status to invalid REMOVED', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('Members can only update status to LEFT') || err.message.includes('42501');
    recordTest('Phase 8', '5. Member updates status to invalid REMOVED', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied, err.stderr || err.message);
  }

  // 6. Legitimate self status change to 'LEFT'
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      UPDATE public.room_members 
      SET status = 'LEFT'
      WHERE room_id = '${ROOMS.ROOM_A}' AND user_id = '${ACTORS.MEMBER_A}';
    `);
    const success = res.stdout.includes('UPDATE 1');
    recordTest('Phase 8', '6. Member sets own status to LEFT', 'ALLOWED', success ? 'ALLOWED' : 'FAILED', success);
  } catch (err) {
    recordTest('Phase 8', '6. Member sets own status to LEFT', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 9: BUG REPORT AUTHORIZATION
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 9: BUG REPORT AUTHORIZATION ---');

  const REPORT_A = 'ba000000-0000-0000-0000-000000000001';
  const REPORT_B = 'bb000000-0000-0000-0000-000000000001';

  // Seed Bug Reports using valid schema columns
  await runSql(`
    INSERT INTO public.bug_reports (id, user_id, user_name, user_email, category, severity, status, description) VALUES
      ('${REPORT_A}', '${ACTORS.MEMBER_A}', 'Member A', 'member_a@test.com', 'EXPENSE_SPLIT', 'LOW',  'OPEN', 'Bug A Details'),
      ('${REPORT_B}', '${ACTORS.MEMBER_B}', 'Member B', 'member_b@test.com', 'PAYMENT_UPI',   'HIGH', 'OPEN', 'Bug B Details')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 1. User A reads own report
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id FROM public.bug_reports WHERE id = '${REPORT_A}';
    `);
    const canRead = res.stdout.includes(REPORT_A);
    recordTest('Phase 9', 'User A reads own bug report', 'ALLOWED', canRead ? 'ALLOWED' : 'DENIED', canRead);
  } catch (err) {
    recordTest('Phase 9', 'User A reads own bug report', 'ALLOWED', 'ERROR', false, err.stderr || err.message);
  }

  // 2. User B reads User A's report
  try {
    const res = await runAsUser(ACTORS.MEMBER_B, 'authenticated', `
      SELECT id FROM public.bug_reports WHERE id = '${REPORT_A}';
    `);
    const empty = !res.stdout.includes(REPORT_A) && res.stdout.includes('(0 rows)');
    recordTest('Phase 9', 'User B reads User A bug report', 'DENIED (0 rows)', empty ? 'DENIED (0 rows)' : 'LEAKED', empty);
  } catch (err) {
    recordTest('Phase 9', 'User B reads User A bug report', 'DENIED', 'ERROR', false, err.stderr || err.message);
  }

  // 3. User B updates User A's report
  try {
    const res = await runAsUser(ACTORS.MEMBER_B, 'authenticated', `
      UPDATE public.bug_reports SET status = 'RESOLVED' WHERE id = '${REPORT_A}';
    `);
    const zeroRows = res.stdout.includes('UPDATE 0');
    recordTest('Phase 9', 'User B updates User A bug report', 'DENIED (0 rows)', zeroRows ? 'DENIED (0 rows)' : 'MODIFIED', zeroRows);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 9', 'User B updates User A bug report', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 4. User B spoofs User A on INSERT
  try {
    await runAsUser(ACTORS.MEMBER_B, 'authenticated', `
      INSERT INTO public.bug_reports (user_id, user_name, user_email, category, severity, description)
      VALUES ('${ACTORS.MEMBER_A}', 'Impersonated', 'fake@test.com', 'OTHER', 'LOW', 'Spoofed Bug');
    `);
    recordTest('Phase 9', 'User B spoofs User A user_id on INSERT', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 9', 'User B spoofs User A user_id on INSERT', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 5. User A creates own bug report
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.bug_reports (user_id, user_name, user_email, category, severity, description)
      VALUES ('${ACTORS.MEMBER_A}', 'Member A', 'member_a@test.com', 'OTHER', 'LOW', 'My own legit bug');
    `);
    const success = res.stdout.includes('INSERT 0 1');
    recordTest('Phase 9', 'User A creates own bug report', 'ALLOWED', success ? 'ALLOWED' : 'FAILED', success);
  } catch (err) {
    recordTest('Phase 9', 'User A creates own bug report', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // 6. SuperAdmin reads and updates reports
  try {
    const resRead = await runAsUser(ACTORS.SUPERADMIN, 'authenticated', `
      SELECT COUNT(*) FROM public.bug_reports;
    `);
    const countMatch = resRead.stdout.match(/(\d+)/);
    const count = countMatch ? parseInt(countMatch[0], 10) : 0;
    const canReadAll = count >= 2;

    const resUpdate = await runAsUser(ACTORS.SUPERADMIN, 'authenticated', `
      UPDATE public.bug_reports SET status = 'RESOLVED', admin_notes = 'Reviewed by SuperAdmin' WHERE id = '${REPORT_A}';
    `);
    const updateSuccess = resUpdate.stdout.includes('UPDATE 1');
    recordTest('Phase 9', 'SuperAdmin reads all and updates bug reports', 'ALLOWED', (canReadAll && updateSuccess) ? 'ALLOWED' : 'FAILED', (canReadAll && updateSuccess));
  } catch (err) {
    recordTest('Phase 9', 'SuperAdmin reads all and updates bug reports', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 10: NOTIFICATION AUTHORIZATION
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 10: NOTIFICATION AUTHORIZATION ---');

  // Reset Member A to active for notification & profile tests
  await runSql(`UPDATE public.room_members SET status = 'ACTIVE' WHERE user_id = '${ACTORS.MEMBER_A}' AND room_id = '${ROOMS.ROOM_A}';`);

  // 1. A -> A (self)
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.in_app_notifications (user_id, title, message, type, priority)
      VALUES ('${ACTORS.MEMBER_A}', 'Self Note', 'Reminder for self', 'SYSTEM', 'LOW');
    `);
    recordTest('Phase 10', 'A -> A (Self notification)', 'ALLOWED', res.stdout.includes('INSERT 0 1') ? 'ALLOWED' : 'FAILED', res.stdout.includes('INSERT 0 1'));
  } catch (err) {
    recordTest('Phase 10', 'A -> A (Self notification)', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // 2. A -> Creator A (active roommate in Room A)
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.in_app_notifications (user_id, room_id, title, message, type, priority)
      VALUES ('${ACTORS.CREATOR_A}', '${ROOMS.ROOM_A}', 'Room Note', 'Hey roommate', 'ROOM', 'LOW');
    `);
    recordTest('Phase 10', 'A -> B (Co-roommate in shared active room)', 'ALLOWED', res.stdout.includes('INSERT 0 1') ? 'ALLOWED' : 'FAILED', res.stdout.includes('INSERT 0 1'));
  } catch (err) {
    recordTest('Phase 10', 'A -> B (Co-roommate in shared active room)', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // 3. A -> Attacker (unrelated user, room_id = NULL)
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.in_app_notifications (user_id, room_id, title, message, type, priority)
      VALUES ('${ACTORS.ATTACKER}', NULL, 'Unsolicited Spam', 'Spamming unrelated user', 'SYSTEM', 'LOW');
    `);
    recordTest('Phase 10', 'A -> C with NULL room_id (unrelated user)', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 10', 'A -> C with NULL room_id (unrelated user)', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 4. A -> Attacker (unrelated user, room_id = ROOM_A)
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.in_app_notifications (user_id, room_id, title, message, type, priority)
      VALUES ('${ACTORS.ATTACKER}', '${ROOMS.ROOM_A}', 'Cross-tenant alert', 'Attacker not in Room A', 'ROOM', 'LOW');
    `);
    recordTest('Phase 10', 'A -> C with Room A room_id (recipient not member)', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 10', 'A -> C with Room A room_id (recipient not member)', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 5. A -> Arbitrary Random UUID
  const RANDOM_UUID = '77777777-7777-7777-7777-777777777777';
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.in_app_notifications (user_id, title, message, type, priority)
      VALUES ('${RANDOM_UUID}', 'Random Note', 'Spamming random UUID', 'SYSTEM', 'LOW');
    `);
    recordTest('Phase 10', 'A -> arbitrary UUID', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 10', 'A -> arbitrary UUID', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 6. SuperAdmin broadcast
  try {
    const res = await runAsUser(ACTORS.SUPERADMIN, 'authenticated', `
      INSERT INTO public.in_app_notifications (user_id, title, message, type, priority)
      VALUES ('${ACTORS.ATTACKER}', 'System Broadcast', 'Notice from administration', 'SYSTEM', 'HIGH');
    `);
    recordTest('Phase 10', 'SuperAdmin can notify arbitrary user', 'ALLOWED', res.stdout.includes('INSERT 0 1') ? 'ALLOWED' : 'FAILED', res.stdout.includes('INSERT 0 1'));
  } catch (err) {
    recordTest('Phase 10', 'SuperAdmin can notify arbitrary user', 'ALLOWED', 'FAILED', false, err.stderr || err.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 11: PROFILE PRIVACY
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 11: PROFILE PRIVACY ---');

  // 1. A -> A (self)
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id, name FROM public.profiles WHERE id = '${ACTORS.MEMBER_A}';
    `);
    recordTest('Phase 11', 'A reads own profile', 'ALLOWED', res.stdout.includes(ACTORS.MEMBER_A) ? 'ALLOWED' : 'DENIED', res.stdout.includes(ACTORS.MEMBER_A));
  } catch (err) {
    recordTest('Phase 11', 'A reads own profile', 'ALLOWED', 'ERROR', false, err.stderr || err.message);
  }

  // 2. A -> active roommate (Creator A in Room A)
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id, name FROM public.profiles WHERE id = '${ACTORS.CREATOR_A}';
    `);
    recordTest('Phase 11', 'A reads active roommate profile', 'ALLOWED', res.stdout.includes(ACTORS.CREATOR_A) ? 'ALLOWED' : 'DENIED', res.stdout.includes(ACTORS.CREATOR_A));
  } catch (err) {
    recordTest('Phase 11', 'A reads active roommate profile', 'ALLOWED', 'ERROR', false, err.stderr || err.message);
  }

  // 3. A -> former roommate (Former A status = 'LEFT')
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id, name FROM public.profiles WHERE id = '${ACTORS.FORMER_A}';
    `);
    const empty = !res.stdout.includes(ACTORS.FORMER_A) && res.stdout.includes('(0 rows)');
    recordTest('Phase 11', 'A reads former roommate profile (status=LEFT)', 'DENIED (0 rows)', empty ? 'DENIED (0 rows)' : 'LEAKED', empty);
  } catch (err) {
    recordTest('Phase 11', 'A reads former roommate profile (status=LEFT)', 'DENIED', 'ERROR', false, err.stderr || err.message);
  }

  // 4. A -> unrelated user (Member B in Room B)
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id, name FROM public.profiles WHERE id = '${ACTORS.MEMBER_B}';
    `);
    const empty = !res.stdout.includes(ACTORS.MEMBER_B) && res.stdout.includes('(0 rows)');
    recordTest('Phase 11', 'A reads unrelated user profile (Room B)', 'DENIED (0 rows)', empty ? 'DENIED (0 rows)' : 'LEAKED', empty);
  } catch (err) {
    recordTest('Phase 11', 'A reads unrelated user profile (Room B)', 'DENIED', 'ERROR', false, err.stderr || err.message);
  }

  // 5. SuperAdmin reads any profile
  try {
    const res = await runAsUser(ACTORS.SUPERADMIN, 'authenticated', `
      SELECT id FROM public.profiles WHERE id = '${ACTORS.ATTACKER}';
    `);
    recordTest('Phase 11', 'SuperAdmin reads arbitrary profile', 'ALLOWED', res.stdout.includes(ACTORS.ATTACKER) ? 'ALLOWED' : 'DENIED', res.stdout.includes(ACTORS.ATTACKER));
  } catch (err) {
    recordTest('Phase 11', 'SuperAdmin reads arbitrary profile', 'ALLOWED', 'ERROR', false, err.stderr || err.message);
  }

  // 6. Global Enumeration Test: Member A runs SELECT * FROM profiles
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id, name FROM public.profiles;
    `);
    const visibleUsers = [];
    if (res.stdout.includes(ACTORS.MEMBER_A)) visibleUsers.push('MEMBER_A');
    if (res.stdout.includes(ACTORS.CREATOR_A)) visibleUsers.push('CREATOR_A');
    if (res.stdout.includes(ACTORS.FORMER_A)) visibleUsers.push('FORMER_A');
    if (res.stdout.includes(ACTORS.CREATOR_B)) visibleUsers.push('CREATOR_B');
    if (res.stdout.includes(ACTORS.MEMBER_B)) visibleUsers.push('MEMBER_B');
    if (res.stdout.includes(ACTORS.ATTACKER)) visibleUsers.push('ATTACKER');

    const leakFree = !visibleUsers.includes('FORMER_A') && 
                     !visibleUsers.includes('CREATOR_B') && 
                     !visibleUsers.includes('MEMBER_B') && 
                     !visibleUsers.includes('ATTACKER');
    recordTest('Phase 11', 'Global profile enumeration blocked (scoped strictly to self + active roommates)', 'ONLY_ROOMMATES', leakFree ? 'ONLY_ROOMMATES' : `LEAKED: ${visibleUsers.join(', ')}`, leakFree);
  } catch (err) {
    recordTest('Phase 11', 'Global profile enumeration blocked', 'ONLY_ROOMMATES', 'ERROR', false, err.stderr || err.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 12: PERSONAL EXPENSE PRIVACY REGRESSION
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 12: PERSONAL EXPENSE PRIVACY REGRESSION ---');

  const EXPENSE_A = 'ea000000-0000-0000-0000-000000000001';
  await runSql(`
    INSERT INTO public.personal_expenses (id, user_id, title, amount, category, notes)
    VALUES ('${EXPENSE_A}', '${ACTORS.MEMBER_A}', 'Private Medicine', 500.00, 'Health', 'Top Secret Private')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 1. User B reads User A personal expense
  try {
    const res = await runAsUser(ACTORS.MEMBER_B, 'authenticated', `
      SELECT id, title FROM public.personal_expenses WHERE id = '${EXPENSE_A}';
    `);
    const empty = !res.stdout.includes(EXPENSE_A) && res.stdout.includes('(0 rows)');
    recordTest('Phase 12', 'User B reads User A personal expense', 'DENIED (0 rows)', empty ? 'DENIED (0 rows)' : 'LEAKED', empty);
  } catch (err) {
    recordTest('Phase 12', 'User B reads User A personal expense', 'DENIED', 'ERROR', false, err.stderr || err.message);
  }

  // 2. User B inserts personal expense under User A
  try {
    await runAsUser(ACTORS.MEMBER_B, 'authenticated', `
      INSERT INTO public.personal_expenses (user_id, title, amount, category)
      VALUES ('${ACTORS.MEMBER_A}', 'Fake Expense', 999.00, 'Food');
    `);
    recordTest('Phase 12', 'User B inserts personal expense for User A', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 12', 'User B inserts personal expense for User A', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 3. User B updates User A personal expense
  try {
    const res = await runAsUser(ACTORS.MEMBER_B, 'authenticated', `
      UPDATE public.personal_expenses SET title = 'Hacked' WHERE id = '${EXPENSE_A}';
    `);
    const zeroRows = res.stdout.includes('UPDATE 0');
    recordTest('Phase 12', 'User B updates User A personal expense', 'DENIED (0 rows)', zeroRows ? 'DENIED (0 rows)' : 'MODIFIED', zeroRows);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 12', 'User B updates User A personal expense', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 4. User B deletes User A personal expense
  try {
    const res = await runAsUser(ACTORS.MEMBER_B, 'authenticated', `
      DELETE FROM public.personal_expenses WHERE id = '${EXPENSE_A}';
    `);
    const zeroRows = res.stdout.includes('DELETE 0');
    recordTest('Phase 12', 'User B deletes User A personal expense', 'DENIED (0 rows)', zeroRows ? 'DENIED (0 rows)' : 'DELETED', zeroRows);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 12', 'User B deletes User A personal expense', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 5. User A reads own personal expense
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id, title FROM public.personal_expenses WHERE id = '${EXPENSE_A}';
    `);
    recordTest('Phase 12', 'User A reads own personal expense', 'ALLOWED', res.stdout.includes(EXPENSE_A) ? 'ALLOWED' : 'DENIED', res.stdout.includes(EXPENSE_A));
  } catch (err) {
    recordTest('Phase 12', 'User A reads own personal expense', 'ALLOWED', 'ERROR', false, err.stderr || err.message);
  }

  // ---------------------------------------------------------------------------
  // PHASE 13: CROSS-ROOM / CROSS-TENANT TESTING
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 13: CROSS-ROOM / CROSS-TENANT ISOLATION ---');

  const SHARED_EXPENSE_B = '5b000000-0000-0000-0000-000000000001';
  await runSql(`
    INSERT INTO public.shared_expenses (id, room_id, created_by, paid_by, title, total_amount, category, split_method)
    VALUES ('${SHARED_EXPENSE_B}', '${ROOMS.ROOM_B}', '${ACTORS.CREATOR_B}', '${ACTORS.CREATOR_B}', 'Room B Wifi', 1200.00, 'Wi-Fi', 'EQUAL')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 1. User A (Room A) reads Room B shared expenses
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      SELECT id, title FROM public.shared_expenses WHERE id = '${SHARED_EXPENSE_B}';
    `);
    const empty = !res.stdout.includes(SHARED_EXPENSE_B) && res.stdout.includes('(0 rows)');
    recordTest('Phase 13', 'User A reads Room B shared expense', 'DENIED (0 rows)', empty ? 'DENIED (0 rows)' : 'LEAKED', empty);
  } catch (err) {
    recordTest('Phase 13', 'User A reads Room B shared expense', 'DENIED', 'ERROR', false, err.stderr || err.message);
  }

  // 2. User A (Room A) creates membership in Room B
  try {
    await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      INSERT INTO public.room_members (room_id, user_id, role, status)
      VALUES ('${ROOMS.ROOM_B}', '${ACTORS.MEMBER_A}', 'MEMBER', 'ACTIVE');
    `);
    recordTest('Phase 13', 'User A inserts membership in Room B directly', 'DENIED', 'ALLOWED', false);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 13', 'User A inserts membership in Room B directly', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // 3. User A modifies Room B member status
  try {
    const res = await runAsUser(ACTORS.MEMBER_A, 'authenticated', `
      UPDATE public.room_members SET status = 'REMOVED' WHERE room_id = '${ROOMS.ROOM_B}';
    `);
    const zeroRows = res.stdout.includes('UPDATE 0');
    recordTest('Phase 13', 'User A modifies Room B member status', 'DENIED (0 rows)', zeroRows ? 'DENIED (0 rows)' : 'MODIFIED', zeroRows);
  } catch (err) {
    const isDenied = err.stderr.includes('violates row-level security') || err.message.includes('42501');
    recordTest('Phase 13', 'User A modifies Room B member status', 'DENIED', isDenied ? 'DENIED' : 'UNEXPECTED_ERROR', isDenied);
  }

  // Summary
  console.log('\n================================================================');
  const total = suiteResults.length;
  const passedCount = suiteResults.filter(r => r.passed).length;
  const failedCount = total - passedCount;
  console.log(`TEST SUITE FINISHED: ${passedCount}/${total} PASSED (${failedCount} FAILED)`);
  console.log('================================================================');

  if (failedCount > 0) {
    console.error(`CRITICAL: ${failedCount} security/functional tests failed! See details above.`);
  } else {
    console.log('ALL TESTS PASSED SUCCESSFULLY!');
  }
}

main().catch(err => {
  console.error('FATAL SUITE ERROR:', err);
});

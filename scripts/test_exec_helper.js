import { spawn } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const CONTAINER = 'roommate-staging-db';

export function runSql(sql) {
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

async function main() {
  const ACTORS = {
    CREATOR_A: '10000000-0000-0000-0000-000000000001',
    MEMBER_A:  '10000000-0000-0000-0000-000000000002',
  };
  const ROOMS = {
    ROOM_A: 'aaaa0000-0000-0000-0000-000000000001',
  };

  try {
    const setupSql = `
      INSERT INTO auth.users (id, email) VALUES
        ('11111111-1111-1111-1111-111111111111', 'user_a@test.com'),
        ('22222222-2222-2222-2222-222222222222', 'user_b@test.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, name, email, role, fcm_token) VALUES
        ('11111111-1111-1111-1111-111111111111', 'User A', 'user_a@test.com', 'STUDENT', 'token_user_a'),
        ('22222222-2222-2222-2222-222222222222', 'User B', 'user_b@test.com', 'STUDENT', 'token_user_b')
      ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, fcm_token = EXCLUDED.fcm_token;

      INSERT INTO public.rooms (id, name, created_by) VALUES
        ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Room 1 Alpha', '11111111-1111-1111-1111-111111111111')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.room_members (id, room_id, user_id, role, status) VALUES
        ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ROOM_ADMIN', 'ACTIVE'),
        ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'MEMBER', 'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role;
    `;

    const res = await runSql(`
      BEGIN;
      ${setupSql}
      
      -- Test 1: As postgres (bypasses RLS)
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'As Postgres', 'Test', 'LOW')
      RETURNING id, type;

      -- Test 2: Switch to authenticated User A
      SET LOCAL ROLE authenticated;
      SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
      SET LOCAL "request.jwt.claim.role" = 'authenticated';
      SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

      -- Check if RLS on room_members blocks authenticated from reading room_members
      SELECT count(*) as visible_room_members FROM public.room_members WHERE room_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

      -- Now try insert WITHOUT RETURNING
      INSERT INTO public.in_app_notifications (user_id, room_id, type, title, message, priority)
      VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXPENSE_ADDED', 'As Authenticated', 'Test', 'LOW');

      ROLLBACK;
    `);
    console.log('RESULT:\n', res.stdout);
  } catch (err) {
    console.log('ERROR STDERR:\n', err.stderr);
    console.log('ERROR STDOUT:\n', err.stdout);
  }
}

// if (process.argv[1] && process.argv[1].endsWith('test_exec_helper.js')) {
//   main().catch(console.error);
// }

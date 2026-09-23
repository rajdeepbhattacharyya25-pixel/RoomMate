import { spawn } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const CONTAINER = 'roommate-staging-db';

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(DOCKER_PATH, ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres']);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => { stdout += data.toString(); });
    child.stderr.on('data', data => { stderr += data.toString(); });

    child.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    child.stdin.write(sql);
    child.stdin.end();
  });
}

async function main() {
  console.log('--- Testing is_room_creator helper ---');
  await runSql(`
    CREATE OR REPLACE FUNCTION internal.is_room_creator(check_room_id UUID, check_user_id UUID)
    RETURNS BOOLEAN
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public, pg_temp
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.rooms
        WHERE id = check_room_id AND created_by = check_user_id
      );
    $$;

    GRANT EXECUTE ON FUNCTION internal.is_room_creator(UUID, UUID) TO authenticated, service_role;

    DROP POLICY IF EXISTS "Admins or creators can insert room members" ON public.room_members;
    CREATE POLICY "Admins or creators can insert room members"
    ON public.room_members FOR INSERT
    TO authenticated
    WITH CHECK (
      (
        role = 'ROOM_ADMIN' 
        AND user_id = (SELECT auth.uid()) 
        AND internal.is_room_creator(room_members.room_id, (SELECT auth.uid()))
      )
      OR internal.is_room_admin(room_id, (SELECT auth.uid()))
      OR internal.is_super_admin((SELECT auth.uid()))
    );
  `);

  console.log('Testing creator INSERT:');
  const res = await runSql(`
    BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '10000000-0000-0000-0000-000000000002';
    SET LOCAL "request.jwt.claim.role" = 'authenticated';
    INSERT INTO public.room_members (room_id, user_id, role, status)
    VALUES ('aaaa0000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'ROOM_ADMIN', 'ACTIVE');
    ROLLBACK;
  `);
  console.log('Stderr:', res.stderr);
  console.log('Stdout:', res.stdout);
}

main();

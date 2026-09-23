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

async function main() {
  console.log('=== 1. RLS Policies on in_app_notifications ===');
  const notifPol = await runSql(`
    SELECT policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'in_app_notifications';
  `);
  console.log(notifPol.stdout);

  console.log('\n=== 2. RLS Policies on user_devices ===');
  const devPol = await runSql(`
    SELECT policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'user_devices';
  `);
  console.log(devPol.stdout);

  console.log('\n=== 3. Columns of in_app_notifications ===');
  const notifCols = await runSql(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'in_app_notifications' 
    ORDER BY ordinal_position;
  `);
  console.log(notifCols.stdout);

  console.log('\n=== 4. Columns of user_devices ===');
  const devCols = await runSql(`
    SELECT column_name, data_type, is_nullable, column_default 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_devices' 
    ORDER BY ordinal_position;
  `);
  console.log(devCols.stdout);

  console.log('\n=== 5. Constraints on user_devices & in_app_notifications ===');
  const constraints = await runSql(`
    SELECT conname, contype, conrelid::regclass, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid IN ('public.in_app_notifications'::regclass, 'public.user_devices'::regclass);
  `);
  console.log(constraints.stdout);

  console.log('\n=== 6. Profiles columns relevant to FCM ===');
  const profCols = await runSql(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name LIKE '%fcm%';
  `);
  console.log(profCols.stdout);

  console.log('\n=== 7. room_members status check constraint ===');
  const rmCheck = await runSql(`
    SELECT pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conname = 'room_members_status_check';
  `);
  console.log(rmCheck.stdout);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

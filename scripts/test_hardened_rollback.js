import { spawn } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const CONTAINER = 'roommate-staging-db';

function runSql(sql) {
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
  console.log('Testing Hardened Emergency Recovery / Rollback Script in Staging...');

  const rollbackSql = `
    BEGIN;

    -- 1. Safely Roll Back room_members to Invitation-Gated Baseline (NOT unrestricted insert)
    DROP POLICY IF EXISTS "Admins or creators can insert room members" ON public.room_members;
    DROP POLICY IF EXISTS "Users can join rooms via valid invitation or creator" ON public.room_members;
    CREATE POLICY "Users can join rooms via valid invitation or creator"
    ON public.room_members FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.rooms r WHERE r.id = room_members.room_id AND r.created_by = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.room_invitations inv 
        WHERE inv.room_id = room_members.room_id 
          AND inv.is_revoked = false 
          AND (inv.expires_at IS NULL OR inv.expires_at > now())
      )
      OR internal.is_room_admin(room_id, (SELECT auth.uid()))
      OR internal.is_super_admin((SELECT auth.uid()))
    );

    DROP TRIGGER IF EXISTS trg_prevent_member_role_escalation ON public.room_members;
    DROP FUNCTION IF EXISTS public.prevent_member_role_escalation();

    -- 2. Bug Reports: Maintain submitter boundary (DO NOT restore USING (true))
    DROP POLICY IF EXISTS "Submitter or superadmin can read bug reports" ON public.bug_reports;
    CREATE POLICY "Submitter or superadmin can read bug reports"
    ON public.bug_reports FOR SELECT TO authenticated
    USING (
      user_id = (SELECT auth.uid())::text
      OR internal.is_super_admin((SELECT auth.uid()))
    );

    -- 3. Notifications: Maintain roommate boundary (DO NOT restore WITH CHECK (true))
    DROP POLICY IF EXISTS "Users can notify co-roommates or self" ON public.in_app_notifications;
    CREATE POLICY "Users can notify co-roommates or self"
    ON public.in_app_notifications FOR INSERT TO authenticated
    WITH CHECK (
      user_id = (SELECT auth.uid())
      OR internal.is_super_admin((SELECT auth.uid()))
      OR (
        room_id IS NOT NULL 
        AND internal.is_room_member(room_id, (SELECT auth.uid()))
        AND internal.is_room_member(room_id, user_id)
      )
    );

    -- 4. Profiles: Maintain roommate boundary (DO NOT restore USING (true))
    DROP POLICY IF EXISTS "Profiles readable by roommates, self, or superadmin" ON public.profiles;
    CREATE POLICY "Profiles readable by roommates, self, or superadmin"
    ON public.profiles FOR SELECT TO authenticated
    USING (
      id = (SELECT auth.uid())
      OR internal.is_super_admin((SELECT auth.uid()))
      OR EXISTS (
        SELECT 1 FROM public.room_members rm1
        JOIN public.room_members rm2 ON rm1.room_id = rm2.room_id
        WHERE rm1.user_id = (SELECT auth.uid())
          AND rm2.user_id = profiles.id
          AND rm1.status = 'ACTIVE'
          AND rm2.status = 'ACTIVE'
      )
    );

    COMMIT;
  `;

  const res = await runSql(rollbackSql);
  console.log('Rollback execution result:\n', res.stdout);
  console.log('✓ Hardened Rollback Script executed successfully in Staging with transaction safety!');

  // Now re-apply Phase 2B migration so staging remains in Phase 2B hardened state
  console.log('\nRe-applying Phase 2B migration to restore hardened state in Staging...');
  const reapply = await runSql(`
    \\i /tmp/mig_20_20260920140000_phase2b_authorization_hardening.sql
  `);
  console.log('✓ Staging restored to Phase 2B hardened state.');
}

main().catch(err => {
  console.error('Rollback test failed:', err);
  process.exit(1);
});

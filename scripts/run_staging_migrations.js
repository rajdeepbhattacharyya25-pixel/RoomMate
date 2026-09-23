import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DOCKER_PATH = '"C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"';
const CONTAINER = 'roommate-staging-db';
const MIGRATIONS_DIR = path.resolve('supabase/migrations');

const migrations = [
  '20260909_init_student_expense_schema.sql',
  '20260909_room_debt_functions.sql',
  '20260910_superadmin_rls.sql',
  '20260911_profiles_qr_fcm.sql',
  '20260912_app_versions_add_name_metadata.sql',
  '20260912_app_versions_ota.sql',
  '20260912_room_member_lifecycle.sql',
  '20260913_room_invitations_and_ownership.sql',
  '20260914_bug_reports.sql',
  '20260914_in_app_notifications.sql',
  '20260914_security_advisory_remediation.sql',
  '20260915_profiles_upi_id.sql',
  '20260915_superadmin_support_and_announcements.sql',
  '20260916_superadmin_security_hardening.sql',
  '20260916_superadmin_security_system.sql',
  '20260917_profiles_onboarding_completed.sql',
  '20260918_account_deletion_and_session_management.sql',
  '20260918_system_incidents.sql',
  '20260918_system_incidents_hardening.sql',
  '20260918_user_devices_multi_fcm.sql',
  '20260920140000_phase2b_authorization_hardening.sql',
  '20260920233000_phase2c_notification_push_hardening.sql',
  '20260921210000_phase2c4_financial_integrity_hardening.sql'
];

console.log(`Starting execution of ${migrations.length} migrations on ${CONTAINER}...`);

const results = [];

for (let i = 0; i < migrations.length; i++) {
  const file = migrations[i];
  const filePath = path.join(MIGRATIONS_DIR, file);
  const destInContainer = `/tmp/mig_${i}_${file}`;
  
  console.log(`\n[${i + 1}/${migrations.length}] Applying: ${file}...`);
  try {
    // Copy file into container
    execSync(`${DOCKER_PATH} cp "${filePath}" ${CONTAINER}:${destInContainer}`);
    // Run psql inside container
    const stdout = execSync(`${DOCKER_PATH} exec ${CONTAINER} psql -U postgres -f ${destInContainer}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    console.log(`  ✓ SUCCESS`);
    results.push({ file, success: true, output: stdout.slice(-200) });
  } catch (err) {
    console.error(`  ✗ FAILED: ${file}`);
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error(`Error details:`, stderr);
    results.push({ file, success: false, error: stderr });
    console.error('STOPPING: Migration execution halted on failure.');
    process.exit(1);
  }
}

console.log(`\n======================================================`);
console.log(`ALL ${migrations.length} MIGRATIONS APPLIED SUCCESSFULLY!`);
console.log(`======================================================`);

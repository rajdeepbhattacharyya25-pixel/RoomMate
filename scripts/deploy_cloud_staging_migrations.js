import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DOCKER_PATH = '"C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"';
const CONTAINER = 'roommate-staging-db';
const MIGRATIONS_DIR = path.resolve('supabase/migrations');

// TARGET VERIFICATION
const TARGET_REF = 'ycredqiiwdbrjzqeczio';
const PROD_REF = 'pbzaaskftrmnvocczhat';

if (TARGET_REF === PROD_REF) {
  console.error('FATAL: Target project ref matches PRODUCTION ref! ABORTING.');
  process.exit(1);
}

const STAGING_PASS = process.env.STAGING_DB_PASSWORD || '';
const DB_URI = process.env.STAGING_DB_URI || `postgresql://postgres.ycredqiiwdbrjzqeczio:${encodeURIComponent(STAGING_PASS)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

const migrations = [
  '20260909_init_student_expense_schema.sql',
  '20260909_room_debt_functions.sql',
  '20260910_superadmin_rls.sql',
  '20260911_profiles_qr_fcm.sql',
  '20260912_app_versions_ota.sql',
  '20260912_app_versions_add_name_metadata.sql',
  '20260912_room_member_lifecycle.sql',
  '20260913_room_invitations_and_ownership.sql',
  '20260914_bug_reports.sql',
  '20260914_in_app_notifications.sql',
  '20260914_security_advisory_remediation.sql',
  '20260915_profiles_upi_id.sql',
  '20260915_superadmin_support_and_announcements.sql',
  '20260916_superadmin_security_system.sql',
  '20260916_superadmin_security_hardening.sql',
  '20260917_profiles_onboarding_completed.sql',
  '20260918_account_deletion_and_session_management.sql',
  '20260918_system_incidents.sql',
  '20260918_system_incidents_hardening.sql',
  '20260918_user_devices_multi_fcm.sql',
  '20260920140000_phase2b_authorization_hardening.sql',
  '20260920233000_phase2c_notification_push_hardening.sql',
  '20260921210000_phase2c4_financial_integrity_hardening.sql'
];

console.log(`======================================================`);
console.log(`TARGET STAGING SUPABASE: ${TARGET_REF}`);
console.log(`PRODUCTION REF (UNTOUCHED): ${PROD_REF}`);
console.log(`Total Migrations to Apply: ${migrations.length}`);
console.log(`======================================================\n`);

// Quick pre-flight check
console.log('Testing connection to remote staging database...');
const check = execSync(`${DOCKER_PATH} exec ${CONTAINER} psql "${DB_URI}" -c "SELECT current_database(), current_user, version();"`, {
  encoding: 'utf8'
});
console.log('Connected successfully:\n' + check.trim() + '\n');

const results = [];

for (let i = 0; i < migrations.length; i++) {
  const file = migrations[i];
  const filePath = path.join(MIGRATIONS_DIR, file);
  console.log(`[${i + 1}/${migrations.length}] Applying: ${file}...`);
  const destInContainer = `/tmp/cloud_mig_${i}_${file}`;
  let applied = false;
  let attempts = 0;
  while (!applied && attempts < 3) {
    attempts++;
    try {
      // Copy file into container
      execSync(`${DOCKER_PATH} cp "${filePath}" ${CONTAINER}:${destInContainer}`);
      // Run psql against remote Supabase staging
      execSync(`${DOCKER_PATH} exec ${CONTAINER} psql "${DB_URI}" -v ON_ERROR_STOP=1 -f ${destInContainer}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log(`  ✓ SUCCESS`);
      results.push({ file, success: true });
      applied = true;
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString() : err.message;
      if (attempts < 3 && (stderr.includes('Try again') || stderr.includes('could not translate host name') || stderr.includes('Connection refused') || stderr.includes('timeout'))) {
        console.warn(`  ⚠ Transient network issue on attempt ${attempts}, retrying in 3s...`);
        execSync('timeout /t 3 >nul', { shell: 'cmd.exe' });
      } else {
        console.error(`  ✗ FAILED: ${file}`);
        console.error(`Error details:`, stderr);
        results.push({ file, success: false, error: stderr });
        console.error('\nSTOPPING: Migration execution halted on failure.');
        process.exit(1);
      }
    }
  }
}

console.log(`\n======================================================`);
console.log(`ALL ${migrations.length} MIGRATIONS APPLIED SUCCESSFULLY TO STAGING!`);
console.log(`Project Ref: ${TARGET_REF}`);
console.log(`======================================================`);

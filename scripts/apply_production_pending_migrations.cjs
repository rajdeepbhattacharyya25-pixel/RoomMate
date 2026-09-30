const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
if (!match) {
  console.error('❌ SUPABASE_DB_PASSWORD not found in .env.local');
  process.exit(1);
}

const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

const MIGRATIONS = [
  '20260924223000_phase2c_supabase_advisor_remediation.sql',
  '20260925001500_fix_delete_user_account_unauthenticated_error.sql',
  '20260929210000_fix_profiles_rls_infinite_recursion.sql',
  '20260929214500_add_resolve_room_invite_rpc.sql',
  '20260929225500_superadmin_bug_reports_rpc.sql',
  '20260930103000_secure_bug_reporting_and_notifs.sql',
  '20260930104500_enable_realtime_read_sync.sql',
  '20260930114500_secure_personal_expenses_sync.sql'
];

async function run() {
  console.log('====================================================');
  console.log('SUPABASE PRODUCTION MIGRATION RUNNER');
  console.log('Target: aws-0-ap-northeast-1.pooler.supabase.com');
  console.log('====================================================\n');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('✓ Successfully connected to Supabase production pooler.');

  // Fetch applied migrations
  const { rows } = await client.query('SELECT version FROM supabase_migrations.schema_migrations;');
  const appliedSet = new Set(rows.map(r => r.version));

  for (const filename of MIGRATIONS) {
    const version = filename.split('_')[0];
    if (appliedSet.has(version)) {
      console.log(`[SKIP] Migration ${version} is already recorded as applied.`);
      continue;
    }

    const filePath = path.join(__dirname, '..', 'supabase', 'migrations', filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filePath}`);
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`\n[RUNNING] Applying ${filename}...`);
    const start = Date.now();

    try {
      await client.query(sql);
      await client.query('INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1);', [version]);
      console.log(`✓ [SUCCESS] ${filename} committed in ${Date.now() - start}ms.`);
    } catch (err) {
      console.error(`\n❌ [FAILED] Migration ${filename} failed:`, err.message);
      throw err;
    }
  }

  console.log('\n====================================================');
  console.log('✓ ALL PENDING PRODUCTION MIGRATIONS COMMITTED');
  console.log('====================================================');

  await client.end();
}

run().catch(err => {
  console.error('\nExecution halted. Zero further mutations applied.');
  process.exit(1);
});

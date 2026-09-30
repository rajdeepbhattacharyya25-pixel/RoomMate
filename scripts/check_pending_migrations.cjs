const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

async function checkStatus() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  console.log('Checking migration tracking table or existing objects...');
  const tableCheck = await client.query(`
    SELECT to_regclass('public._prisma_migrations') as prisma,
           to_regclass('supabase_migrations.schema_migrations') as supabase_schema,
           to_regclass('public.schema_migrations') as public_schema;
  `);
  console.log('Migration tables:', tableCheck.rows[0]);

  if (tableCheck.rows[0].supabase_schema) {
    const migs = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;');
    console.log('Applied supabase_migrations:', migs.rows.map(r => r.version));
  }

  // Also check presence of functions and policies from recent migrations
  const rpcCheck = await client.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
      AND routine_name IN ('resolve_room_invite', 'get_superadmin_bug_reports', 'delete_user_account', 'report_bug');
  `);
  console.log('Found RPCs:', rpcCheck.rows.map(r => r.routine_name));

  await client.end();
}

checkStatus().catch(err => {
  console.error(err);
  process.exit(1);
});

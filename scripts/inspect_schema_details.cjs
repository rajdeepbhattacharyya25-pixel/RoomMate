const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

async function inspect() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();

  const tables = ['expense_splits', 'shared_expenses', 'profiles', 'room_invitations', 'personal_expenses', 'settlement_payments'];
  for (const t of tables) {
    const { rows } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [t]);
    console.log(`\nColumns for ${t}:`, rows.map(r => `${r.column_name} (${r.data_type})`));
  }

  // Check RLS policies on tables that should be in realtime
  const { rows: rlsPolicies } = await client.query(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'expense_splits', 'room_invitations', 'shared_expenses', 'settlement_payments', 'room_members')
    ORDER BY tablename, policyname;
  `);
  console.log('\nRLS Policies for realtime tables:');
  for (const p of rlsPolicies) {
    console.log(`[${p.tablename}] "${p.policyname}" FOR ${p.cmd} TO ${p.roles}`);
  }

  await client.end();
}

inspect().catch(console.error);

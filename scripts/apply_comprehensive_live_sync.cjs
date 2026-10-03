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

async function applyMigration() {
  console.log('Connecting to Supabase production database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('✓ Successfully connected to Supabase database!');

  const migrationFile = path.join(__dirname, '..', 'supabase', 'migrations', '20261003130000_comprehensive_live_sync_hardening.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Applying migration: 20261003130000_comprehensive_live_sync_hardening.sql...');
  const startTime = Date.now();

  try {
    await client.query(sql);
    console.log(`✓ Migration applied successfully in ${Date.now() - startTime}ms!`);

    // Verify replication status for tables
    const { rows: pubTables } = await client.query(`
      SELECT tablename 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      ORDER BY tablename;
    `);
    console.log('✓ All tables now in supabase_realtime publication:');
    console.log(pubTables.map(r => r.tablename));

    // Verify replica identity
    const { rows: replicaInfo } = await client.query(`
      SELECT relname, relreplident 
      FROM pg_class 
      WHERE relname IN ('profiles', 'expense_splits', 'room_invitations', 'personal_expenses', 'room_join_requests', 'room_members', 'rooms', 'shared_expenses', 'settlement_payments')
      ORDER BY relname;
    `);
    console.log('\n✓ Verified Replica Identities (f = FULL):');
    for (const r of replicaInfo) {
      console.log(`   - ${r.relname}: ${r.relreplident === 'f' ? 'FULL (✓)' : r.relreplident}`);
    }

    // Record in schema_migrations
    const { rows: migTableCheck } = await client.query(`
      SELECT to_regclass('supabase_migrations.schema_migrations') as exists;
    `);
    if (migTableCheck[0]?.exists) {
      await client.query(`
        INSERT INTO supabase_migrations.schema_migrations (version)
        VALUES ('20261003130000')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log('\n✓ Recorded version 20261003130000 in supabase_migrations.schema_migrations');
    }
  } catch (err) {
    console.error('❌ Error applying migration:', err);
    throw err;
  } finally {
    await client.end();
  }
}

applyMigration().catch(err => {
  console.error(err);
  process.exit(1);
});

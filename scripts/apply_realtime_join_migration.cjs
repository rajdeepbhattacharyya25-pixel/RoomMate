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

async function applyRealtimeMigration() {
  console.log('Connecting to Supabase database (aws-0-ap-northeast-1.pooler.supabase.com:5432)...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('✓ Successfully connected to Supabase database!');

  const migrationFile = path.join(__dirname, '..', 'supabase', 'migrations', '20261003120000_realtime_join_requests_and_notifications.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Applying migration: 20261003120000_realtime_join_requests_and_notifications.sql...');
  const startTime = Date.now();

  try {
    await client.query(sql);
    console.log(`✓ Migration applied successfully in ${Date.now() - startTime}ms!`);

    // Verify replication status for tables
    const { rows: pubTables } = await client.query(`
      SELECT tablename 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND tablename IN ('room_join_requests', 'room_members', 'rooms')
      ORDER BY tablename;
    `);
    console.log('✓ Verified tables in supabase_realtime publication:', pubTables.map(r => r.tablename));

    // Also register in schema_migrations if table exists
    const { rows: migTableCheck } = await client.query(`
      SELECT to_regclass('supabase_migrations.schema_migrations') as exists;
    `);
    if (migTableCheck[0]?.exists) {
      await client.query(`
        INSERT INTO supabase_migrations.schema_migrations (version)
        VALUES ('20261003120000')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log('✓ Recorded version 20261003120000 in supabase_migrations.schema_migrations');
    }
  } catch (err) {
    console.error('❌ Error applying migration:', err);
    throw err;
  } finally {
    await client.end();
  }
}

applyRealtimeMigration().catch(err => {
  console.error(err);
  process.exit(1);
});

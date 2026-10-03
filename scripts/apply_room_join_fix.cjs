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

async function applyFixMigration() {
  console.log('Connecting to Supabase database (aws-0-ap-northeast-1.pooler.supabase.com:5432)...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('✓ Successfully connected to Supabase database!');

  const migrationFile = path.join(__dirname, '..', 'supabase', 'migrations', '20261003140000_fix_room_join_full_name_and_invite_sync.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Applying migration: 20261003140000_fix_room_join_full_name_and_invite_sync.sql...');
  const startTime = Date.now();

  try {
    await client.query(sql);
    console.log(`✓ Migration applied successfully in ${Date.now() - startTime}ms!`);

    // Verify the function definition
    const { rows } = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'join_room_with_code';
    `);

    if (rows.length > 0 && rows[0].prosrc.includes('COALESCE(name, \'A roommate\')')) {
      console.log('✓ Verified: join_room_with_code successfully updated without full_name reference!');
    } else {
      console.warn('⚠️ Warning: Could not verify updated function source body.');
    }

    // Record in schema_migrations if table exists
    const { rows: migTableCheck } = await client.query(`
      SELECT to_regclass('supabase_migrations.schema_migrations') as exists;
    `);
    if (migTableCheck[0]?.exists) {
      await client.query(`
        INSERT INTO supabase_migrations.schema_migrations (version)
        VALUES ('20261003140000')
        ON CONFLICT (version) DO NOTHING;
      `);
      console.log('✓ Recorded version 20261003140000 in supabase_migrations.schema_migrations');
    }
  } catch (err) {
    console.error('❌ Error applying migration:', err);
    throw err;
  } finally {
    await client.end();
  }
}

applyFixMigration().catch(err => {
  console.error(err);
  process.exit(1);
});

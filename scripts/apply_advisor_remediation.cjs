const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
if (!match) {
  console.error('SUPABASE_DB_PASSWORD not found in .env.local');
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
  console.log('Connected successfully!');

  const migrationFile = path.join(__dirname, '..', 'supabase', 'migrations', '20260924223000_phase2c_supabase_advisor_remediation.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Applying migration: 20260924223000_phase2c_supabase_advisor_remediation.sql...');
  const startTime = Date.now();

  try {
    await client.query(sql);
    console.log(`Migration applied successfully in ${Date.now() - startTime}ms!`);
  } catch (err) {
    console.error('Error applying migration:', err);
    throw err;
  } finally {
    await client.end();
  }
}

applyMigration().catch(err => {
  console.error(err);
  process.exit(1);
});

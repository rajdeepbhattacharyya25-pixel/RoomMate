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

async function applyV2Migration() {
  console.log('============================================================');
  console.log('APPLYING PRODUCTION MIGRATION: 20261004120000_v2_canonical_financial_engine.sql');
  console.log('Target: aws-0-ap-northeast-1.pooler.supabase.com:5432 (pbzaaskftrmnvocczhat)');
  console.log('============================================================');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });

  await client.connect();
  console.log('✓ Successfully connected to Supabase production database!');

  const migrationFile = path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20261004120000_v2_canonical_financial_engine.sql'
  );
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Executing migration transaction...');
  const startTime = Date.now();

  try {
    await client.query('BEGIN;');

    // Execute the migration DDL
    await client.query(sql);

    // Register version in schema_migrations
    await client.query(`
      INSERT INTO supabase_migrations.schema_migrations (version)
      VALUES ('20261004120000')
      ON CONFLICT (version) DO NOTHING;
    `);

    // Verify RPC existence
    const { rows: rpcRows } = await client.query(`
      SELECT routine_name, routine_type, security_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name IN ('get_room_financial_summary_v2', 'record_room_settlement_v2');
    `);

    if (rpcRows.length < 2) {
      throw new Error(`Verification failed: Expected 2 RPCs, found ${rpcRows.length}`);
    }

    console.log('✓ Verified RPCs installed:', rpcRows.map(r => `${r.routine_name} (${r.security_type})`));

    // Verify permissions
    const { rows: permRows } = await client.query(`
      SELECT routine_name, grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name IN ('get_room_financial_summary_v2', 'record_room_settlement_v2')
      ORDER BY routine_name, grantee;
    `);

    console.log('✓ Verified permissions:');
    permRows.forEach(p => console.log(`   - ${p.routine_name}: ${p.privilege_type} granted to ${p.grantee}`));

    await client.query('COMMIT;');
    const duration = Date.now() - startTime;
    console.log(`\n🎉 V2 PRODUCTION MIGRATION APPLIED AND COMMITTED SUCCESSFULLY (${duration}ms)!`);

  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('❌ Migration failed! Transaction safely rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyV2Migration().catch(err => {
  console.error(err);
  process.exit(1);
});

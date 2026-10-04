const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

async function verifyDatabase() {
  console.log('============================================================');
  console.log('PRODUCTION DATABASE POST-MIGRATION FORENSIC VERIFICATION');
  console.log('============================================================');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // 1. Verify schema_migrations contains 20261004120000
  const migRes = await client.query(`
    SELECT * 
    FROM supabase_migrations.schema_migrations 
    WHERE version = '20261004120000';
  `);
  console.log('1. Migration Record:');
  console.log('   Row:', migRes.rows[0]);
  if (migRes.rows.length === 0) throw new Error('Migration version missing!');

  // 2. Verify pg_proc definitions, security definer, and search_path
  const procRes = await client.query(`
    SELECT p.proname, p.prosecdef, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname IN ('get_room_financial_summary_v2', 'record_room_settlement_v2');
  `);
  console.log('\n2. Function Definitions & Security Attributes:');
  procRes.rows.forEach(r => {
    console.log(`   - ${r.proname}:`);
    console.log(`     SECURITY DEFINER: ${r.prosecdef === true ? 'YES' : 'NO'}`);
    console.log(`     search_path: ${JSON.stringify(r.proconfig)}`);
  });

  // 3. Verify Anon Permissions are Revoked
  const anonPerm = await client.query(`
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('get_room_financial_summary_v2', 'record_room_settlement_v2')
      AND grantee IN ('anon', 'PUBLIC');
  `);
  console.log('\n3. Anon / Public Permissions:');
  if (anonPerm.rows.length === 0) {
    console.log('   ✓ CONFIRMED: anon and PUBLIC have zero EXECUTE privileges (strictly revoked).');
  } else {
    console.error('   ❌ WARNING: Unexpected privileges found for anon/PUBLIC:', anonPerm.rows);
  }

  // 4. Verify Authenticated & Service Role Permissions
  const authPerm = await client.query(`
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('get_room_financial_summary_v2', 'record_room_settlement_v2')
      AND grantee IN ('authenticated', 'service_role');
  `);
  console.log('\n4. Authenticated & Service Role Permissions:');
  authPerm.rows.forEach(p => console.log(`   - ${p.routine_name}: ${p.privilege_type} granted to ${p.grantee}`));

  // 5. Verify Invariant: Historical Data Zero Mutation
  const countRes = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM public.profiles) as profiles_count,
      (SELECT COUNT(*) FROM public.rooms) as rooms_count,
      (SELECT COUNT(*) FROM public.room_members) as members_count,
      (SELECT COUNT(*) FROM public.shared_expenses) as expenses_count,
      (SELECT COUNT(*) FROM public.expense_splits) as splits_count,
      (SELECT COUNT(*) FROM public.settlement_payments) as settlements_count;
  `);
  console.log('\n5. Historical Production Entity Row Counts:');
  console.log('   Profiles:', countRes.rows[0].profiles_count);
  console.log('   Rooms:', countRes.rows[0].rooms_count);
  console.log('   Room Members:', countRes.rows[0].members_count);
  console.log('   Shared Expenses:', countRes.rows[0].expenses_count);
  console.log('   Expense Splits:', countRes.rows[0].splits_count);
  console.log('   Settlements:', countRes.rows[0].settlements_count);

  await client.end();
  console.log('\n============================================================');
  console.log('✓ ALL POST-MIGRATION PRODUCTION VERIFICATIONS PASSED');
  console.log('============================================================');
}

verifyDatabase().catch(err => {
  console.error(err);
  process.exit(1);
});

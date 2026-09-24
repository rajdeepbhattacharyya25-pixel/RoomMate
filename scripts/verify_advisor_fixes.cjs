const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

async function verify() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('=== VERIFICATION OF SUPABASE ADVISOR FIXES ===\n');

  // 1. Unindexed foreign keys
  const unindexedFks = await client.query(`
    with fk_actions as (
      select
        c.conrelid::regclass::text as table_name,
        a.attname as fk_column,
        c.confrelid::regclass::text as referenced_table,
        c.conname as constraint_name
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f'
        and c.connamespace = 'public'::regnamespace
    ),
    indexed_columns as (
      select
        i.indrelid::regclass::text as table_name,
        a.attname as column_name
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      join pg_class c on c.oid = i.indrelid
      where c.relnamespace = 'public'::regnamespace
    )
    select f.*
    from fk_actions f
    left join indexed_columns ic
      on f.table_name = ic.table_name and f.fk_column = ic.column_name
    where ic.column_name is null;
  `);

  console.log(`1. Unindexed Foreign Keys in public: ${unindexedFks.rows.length}`);
  if (unindexedFks.rows.length === 0) {
    console.log('   PASSED: All foreign keys in public schema are properly indexed!');
  } else {
    unindexedFks.rows.forEach(r => console.log(`   FAIL: ${r.table_name}(${r.fk_column}) -> ${r.referenced_table}`));
  }

  // 2. Multiple Permissive Policies
  const multiPerm = await client.query(`
    select tablename, cmd, count(*) as count, array_agg(policyname) as policies
    from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
    group by tablename, cmd
    having count(*) > 1;
  `);

  console.log(`\n2. Multiple Permissive Policy Conflicts in public: ${multiPerm.rows.length}`);
  if (multiPerm.rows.length === 0) {
    console.log('   PASSED: Zero duplicate permissive policy conflicts!');
  } else {
    multiPerm.rows.forEach(r => console.log(`   FAIL: ${r.tablename} (${r.cmd}): ${r.policies}`));
  }

  // 3. Functions missing search_path in public
  const publicFns = await client.query(`
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args,
      p.prosecdef as is_sec_def,
      p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by p.proname;
  `);

  const missingSearchPath = publicFns.rows.filter(r => !r.proconfig || !r.proconfig.some(c => c.startsWith('search_path=')));
  console.log(`\n3. Functions missing fixed search_path in public: ${missingSearchPath.length}`);
  if (missingSearchPath.length === 0) {
    console.log('   PASSED: 100% of public functions have explicit fixed search_path!');
  } else {
    missingSearchPath.forEach(r => console.log(`   FAIL: ${r.proname}(${r.args})`));
  }

  // 4. Unwrapped auth.uid() in RLS
  const unwrappedRls = await client.query(`
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        (qual ~ 'auth\\.uid\\(\\)' and qual !~ '\\( *SELECT auth\\.uid\\(\\)( AS uid)? *\\)')
        or (with_check ~ 'auth\\.uid\\(\\)' and with_check !~ '\\( *SELECT auth\\.uid\\(\\)( AS uid)? *\\)')
      );
  `);

  console.log(`\n4. Policies with unwrapped auth.uid(): ${unwrappedRls.rows.length}`);
  if (unwrappedRls.rows.length === 0) {
    console.log('   PASSED: 100% of auth.uid() policy calls are wrapped in subqueries (InitPlan optimized)!');
  } else {
    unwrappedRls.rows.forEach(r => console.log(`   FAIL: [${r.tablename}] "${r.policyname}"`));
  }

  // 5. Verify the 4 new indexes
  const indexCheck = await client.query(`
    select indexname, tablename
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'idx_in_app_notifications_room_id',
        'idx_rooms_admin_user_id',
        'idx_platform_announcements_created_by',
        'idx_platform_settings_updated_by'
      );
  `);
  console.log(`\n5. Verified new indexes created: ${indexCheck.rows.length} / 4`);
  indexCheck.rows.forEach(r => console.log(`   - ${r.indexname} on ${r.tablename}`));

  await client.end();
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});

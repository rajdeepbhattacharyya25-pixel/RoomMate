import { spawnSync } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const STAGING_PASS = process.env.STAGING_DB_PASSWORD || '';
const DB_URI = process.env.STAGING_DB_URI || `postgresql://postgres.ycredqiiwdbrjzqeczio:${encodeURIComponent(STAGING_PASS)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

function runQuery(sql) {
  const res = spawnSync(DOCKER_PATH, ['exec', '-i', CONTAINER, 'psql', DB_URI, '-t', '-A'], {
    input: sql,
    encoding: 'utf8'
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(res.stderr);
  return res.stdout.trim();
}

console.log('========================================================');
console.log('VERIFYING STAGING SUPABASE SCHEMA (ycredqiiwdbrjzqeczio)');
console.log('========================================================\n');

// 1. Tables and RLS status
console.log('--- 1. Tables and RLS Status ---');
const rlsQuery = `
  SELECT tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public' 
  ORDER BY tablename;
`;
const rlsResult = runQuery(rlsQuery);
console.log(rlsResult);

// 2. Critical Functions / RPCs
console.log('\n--- 2. Critical Functions & RPCs ---');
const funcQuery = `
  SELECT routine_name 
  FROM information_schema.routines 
  WHERE routine_schema = 'public' 
    AND routine_name IN (
      'get_room_balances', 
      'record_settlement_payment', 
      'create_shared_expense_with_splits',
      'assert_room_member',
      'assert_super_admin_access',
      'verify_app_version'
    )
  ORDER BY routine_name;
`;
console.log(runQuery(funcQuery));

// 3. Financial and Security Triggers
console.log('\n--- 3. Financial & Security Triggers ---');
const triggerQuery = `
  SELECT event_object_table, trigger_name 
  FROM information_schema.triggers 
  WHERE trigger_schema = 'public' 
  ORDER BY event_object_table, trigger_name;
`;
console.log(runQuery(triggerQuery));

// 4. Storage Buckets
console.log('\n--- 4. Storage Buckets ---');
const bucketQuery = `SELECT id, name, public FROM storage.buckets ORDER BY id;`;
console.log(runQuery(bucketQuery));

// 5. Extensions
console.log('\n--- 5. Extensions ---');
const extQuery = `SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_net', 'pgjwt');`;
console.log(runQuery(extQuery));

// 6. Anonymous Access Restrictions (Verify no public tables allow unrestricted write to anon)
console.log('\n--- 6. Table Grants to Anon Role ---');
const grantsQuery = `
  SELECT table_name, privilege_type 
  FROM information_schema.role_table_grants 
  WHERE grantee = 'anon' AND table_schema = 'public'
  ORDER BY table_name, privilege_type;
`;
console.log(runQuery(grantsQuery));

console.log('\n========================================================');
console.log('VERIFICATION COMPLETE');
console.log('========================================================');

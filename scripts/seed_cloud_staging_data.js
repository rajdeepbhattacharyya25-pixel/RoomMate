import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'child_process';

const DOCKER_PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const CONTAINER = 'roommate-staging-db';
const STAGING_PASS = process.env.STAGING_DB_PASSWORD || '';
const DB_URI = process.env.STAGING_DB_URI || `postgresql://postgres.ycredqiiwdbrjzqeczio:${encodeURIComponent(STAGING_PASS)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

const STAGING_URL = 'https://ycredqiiwdbrjzqeczio.supabase.co';
const STAGING_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljcmVkcWlpd2Ricmp6cWVjemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwOTEwMDgsImV4cCI6MjEwNTY2NzAwOH0.qTalILPUPzng8PSKwzYDgPZIdoz9NhmQfPQB8sn1ppI';

function runSql(sql) {
  const res = spawnSync(DOCKER_PATH, ['exec', '-i', CONTAINER, 'psql', DB_URI, '-v', 'ON_ERROR_STOP=1'], {
    input: sql,
    encoding: 'utf8'
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  return res.stdout.trim();
}

async function seed() {
  console.log('Seeding synthetic staging data into isolated Supabase (ycredqiiwdbrjzqeczio)...');

  const seedSql = `
BEGIN;

-- 1. Clean existing rooms & synthetic test data
DELETE FROM public.rooms;
DELETE FROM auth.users WHERE email IN ('user_a@staging-test.com', 'user_b@staging-test.com', 'superadmin@staging-test.com');

-- 2. Insert into auth.users with complete GoTrue-compliant defaults
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at,
  phone, phone_change, phone_change_token, confirmation_token, recovery_token,
  email_change_token_new, email_change, email_change_token_current,
  email_change_confirm_status, reauthentication_token, is_sso_user, is_anonymous
) VALUES 
(
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'user_a@staging-test.com',
  extensions.crypt('StagingTest123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Staging User A"}'::jsonb,
  false, now(), now(),
  NULL, '', '', '', '', '', '', '', 0, '', false, false
),
(
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated',
  'authenticated',
  'user_b@staging-test.com',
  extensions.crypt('StagingTest123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Staging User B"}'::jsonb,
  false, now(), now(),
  NULL, '', '', '', '', '', '', '', 0, '', false, false
),
(
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-9999-9999-999999999999',
  'authenticated',
  'authenticated',
  'superadmin@staging-test.com',
  extensions.crypt('StagingTest123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"name":"Staging SuperAdmin"}'::jsonb,
  false, now(), now(),
  NULL, '', '', '', '', '', '', '', 0, '', false, false
);

-- 3. Insert identities into auth.identities
INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, created_at, updated_at
) VALUES
(
  'user_a@staging-test.com',
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'user_a@staging-test.com'),
  'email', now(), now()
),
(
  'user_b@staging-test.com',
  '22222222-2222-2222-2222-222222222222',
  jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222', 'email', 'user_b@staging-test.com'),
  'email', now(), now()
),
(
  'superadmin@staging-test.com',
  '99999999-9999-9999-9999-999999999999',
  jsonb_build_object('sub', '99999999-9999-9999-9999-999999999999', 'email', 'superadmin@staging-test.com'),
  'email', now(), now()
);

-- 4. Update profiles
UPDATE public.profiles 
SET onboarding_completed = true,
    role = 'SUPER_ADMIN'
WHERE email = 'superadmin@staging-test.com';

UPDATE public.profiles 
SET onboarding_completed = true
WHERE email IN ('user_a@staging-test.com', 'user_b@staging-test.com');

-- 5. Insert Synthetic Room
INSERT INTO public.rooms (
  id,
  name,
  description,
  created_by,
  admin_user_id
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Staging Audit Room',
  'Isolated Staging Room for Security Audit & DAST',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111'
);

-- 6. Insert Room Members
INSERT INTO public.room_members (
  id,
  room_id,
  user_id,
  role,
  status
) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'ROOM_ADMIN', 'ACTIVE'),
  ('b1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'MEMBER', 'ACTIVE');

COMMIT;
`;

  console.log('Applying SQL transaction for users, identities, profiles, and room...');
  runSql(seedSql);
  console.log('✓ SQL seed succeeded.');

  // Test functional Supabase Auth login
  console.log('\nTesting Auth login with user_a@staging-test.com...');
  const sb = createClient(STAGING_URL, STAGING_ANON_KEY);
  const { data: authData, error: authError } = await sb.auth.signInWithPassword({
    email: 'user_a@staging-test.com',
    password: 'StagingTest123!'
  });

  if (authError) {
    throw new Error(`Login test failed: ${authError.message}`);
  }
  console.log('✓ Login successful! Token issued for user:', authData.user.id);

  // Test creating an atomic expense via RPC
  console.log('\nCreating sample expense via create_shared_expense_with_splits RPC...');
  const roomId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userAId = '11111111-1111-1111-1111-111111111111';
  const userBId = '22222222-2222-2222-2222-222222222222';

  const { data: expenseResult, error: rpcErr } = await sb.rpc('create_shared_expense_with_splits', {
    p_expense: {
      room_id: roomId,
      paid_by: userAId,
      title: 'Welcome Groceries Staging Seed',
      total_amount: 150.00,
      category: 'Groceries',
      split_method: 'EQUAL'
    },
    p_splits: [
      { user_id: userAId, share_amount: 75.00 },
      { user_id: userBId, share_amount: 75.00 }
    ]
  });

  if (rpcErr) {
    throw new Error(`RPC expense creation failed: ${rpcErr.message}`);
  }
  console.log('✓ Atomic expense created via RPC:', expenseResult);

  // Test get_room_balances RPC
  const { data: balances, error: balErr } = await sb.rpc('get_room_balances', {
    p_room_id: roomId
  });
  if (balErr) throw balErr;
  console.log('✓ Room balances calculated:', JSON.stringify(balances));

  console.log('\n======================================================');
  console.log('ISOLATED CLOUD STAGING SEED FULLY VERIFIED & COMPLETE');
  console.log('======================================================');
}

seed().catch(err => {
  console.error('Seed execution error:', err.message);
  process.exit(1);
});

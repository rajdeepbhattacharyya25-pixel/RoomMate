import { createClient } from '@supabase/supabase-js';

const STAGING_URL = 'https://ycredqiiwdbrjzqeczio.supabase.co';
const STAGING_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljcmVkcWlpd2Ricmp6cWVjemlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwOTEwMDgsImV4cCI6MjEwNTY2NzAwOH0.qTalILPUPzng8PSKwzYDgPZIdoz9NhmQfPQB8sn1ppI';

console.log('Testing Functional Client against Isolated Staging Supabase:', STAGING_URL);

async function runTest() {
  const supabase = createClient(STAGING_URL, STAGING_ANON_KEY);

  // 1. Authenticate as user_a
  console.log('1. Signing in as user_a@staging.local...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'user_a@staging.local',
    password: 'StagingTest123!'
  });

  if (authError) {
    console.error('Sign-in failed:', authError);
    process.exit(1);
  }

  console.log('✓ Successfully signed in! User ID:', authData.user.id);

  // 2. Fetch Profile
  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profError) {
    console.error('Fetch profile failed:', profError);
    process.exit(1);
  }
  console.log('✓ Profile retrieved:', profile.name, `(${profile.role})`);

  // 3. Fetch Rooms
  const { data: rooms, error: roomError } = await supabase
    .from('rooms')
    .select('*');

  if (roomError) {
    console.error('Fetch rooms failed:', roomError);
    process.exit(1);
  }
  console.log('✓ Rooms accessible:', rooms.length, 'rooms found (Room:', rooms[0]?.name, ')');

  // 4. Test atomic expense creation RPC
  console.log('4. Testing atomic RPC create_shared_expense_with_splits...');
  const roomId = rooms[0].id;
  const userAId = authData.user.id;
  const userBId = '22222222-2222-2222-2222-222222222222';

  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_shared_expense_with_splits', {
    p_room_id: roomId,
    p_description: 'Staging Groceries Audit Test',
    p_amount: 100.00,
    p_paid_by: userAId,
    p_splits: [
      { user_id: userAId, amount: 50.00 },
      { user_id: userBId, amount: 50.00 }
    ]
  });

  if (rpcError) {
    console.error('RPC create_shared_expense_with_splits failed:', rpcError);
    process.exit(1);
  }
  console.log('✓ Atomic expense created via RPC:', rpcResult);

  // 5. Test get_room_balances RPC
  console.log('5. Testing RPC get_room_balances...');
  const { data: balances, error: balError } = await supabase.rpc('get_room_balances', {
    p_room_id: roomId
  });

  if (balError) {
    console.error('RPC get_room_balances failed:', balError);
    process.exit(1);
  }
  console.log('✓ Room balances calculated:', JSON.stringify(balances));

  console.log('\n======================================================');
  console.log('ALL FUNCTIONAL STAGING TESTS PASSED WITH 100% SUCCESS');
  console.log('======================================================');
}

runTest().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

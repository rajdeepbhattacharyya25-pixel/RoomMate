const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

async function testReadRpc() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const roomRes = await client.query('SELECT id, name FROM public.rooms LIMIT 1;');
  if (roomRes.rows.length === 0) {
    console.log('No rooms in database.');
    await client.end();
    return;
  }

  const room = roomRes.rows[0];
  console.log(`Testing read-only V2 RPC for room: "${room.name}" (${room.id})`);

  const summaryRes = await client.query('SELECT public.get_room_financial_summary_v2($1) as summary;', [room.id]);
  const summary = summaryRes.rows[0].summary;

  console.log('✓ V2 Summary returned successfully:');
  console.log('   Room ID:', summary.room_id);
  console.log('   Total Expenses (Paise):', summary.total_expenses_paise);
  console.log('   Total Settled (Paise):', summary.total_settled_paise);
  console.log('   Members Count:', summary.members?.length);
  console.log('   Zero Sum Verified:', summary.is_zero_sum_verified);
  console.log('   Net Discrepancy (Paise):', summary.net_discrepancy_paise);

  await client.end();
}

testReadRpc().catch(err => {
  console.error(err);
  process.exit(1);
});

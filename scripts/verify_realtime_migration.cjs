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

  // 1. Verify publication tables
  const { rows: pubTables } = await client.query(`
    SELECT tablename 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND tablename IN ('room_join_requests', 'room_members', 'rooms')
    ORDER BY tablename;
  `);
  console.log('1. Realtime Publication Tables:', pubTables.map(r => r.tablename));

  // 2. Verify replica identity
  const { rows: replicaInfo } = await client.query(`
    SELECT relname, relreplident 
    FROM pg_class 
    WHERE relname IN ('room_join_requests', 'room_members', 'rooms');
  `);
  console.log('2. Replica Identities (f = FULL):', replicaInfo.map(r => `${r.relname}: ${r.relreplident}`));

  // 3. Verify RPC returns request_id
  const { rows: procInfo } = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'join_room_with_code';
  `);
  const hasRequestId = procInfo[0]?.prosrc.includes('request_id');
  const hasAdminNotif = procInfo[0]?.prosrc.includes('in_app_notifications');
  console.log('3. RPC join_room_with_code:');
  console.log('   - Returns request_id:', hasRequestId);
  console.log('   - Dispatches in_app_notifications to admins:', hasAdminNotif);

  await client.end();
}

verify().catch(console.error);

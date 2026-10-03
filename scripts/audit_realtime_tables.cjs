const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

async function inspectRealtime() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();

  const { rows: pubTables } = await client.query(`
    SELECT tablename 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    ORDER BY tablename;
  `);
  console.log('Tables in supabase_realtime publication:');
  console.log(pubTables.map(r => r.tablename));

  const { rows: allTables } = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  console.log('\nAll public tables in database:');
  console.log(allTables.map(r => r.table_name));

  const { rows: replicaInfo } = await client.query(`
    SELECT relname, relreplident 
    FROM pg_class 
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public' 
      AND pg_class.relkind = 'r'
    ORDER BY relname;
  `);
  console.log('\nReplica Identities:');
  console.log(replicaInfo.map(r => `${r.relname}: ${r.relreplident === 'f' ? 'FULL' : r.relreplident === 'd' ? 'DEFAULT' : r.relreplident}`));

  await client.end();
}

inspectRealtime().catch(console.error);

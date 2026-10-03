const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const match = envContent.match(/SUPABASE_DB_PASSWORD="?([^"\r\n]+)"?/);
const dbPassword = match[1];
const connectionString = `postgresql://postgres.pbzaaskftrmnvocczhat:${encodeURIComponent(dbPassword)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

async function deepAudit() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  console.log('=== 1. ROW LEVEL SECURITY STATUS ON ALL TABLES ===');
  const { rows: rlsRows } = await client.query(`
    SELECT tablename, rowsecurity 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    ORDER BY tablename;
  `);
  for (const r of rlsRows) {
    console.log(`- ${r.tablename}: ${r.rowsecurity ? 'ENABLED (✓)' : '⚠️ NO RLS'}`);
  }

  console.log('\n=== 2. DETAILED POLICIES ON IN_APP_NOTIFICATIONS & ROOM_JOIN_REQUESTS ===');
  const { rows: polRows } = await client.query(`
    SELECT tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('in_app_notifications', 'room_join_requests')
    ORDER BY tablename, policyname;
  `);
  for (const p of polRows) {
    console.log(`[${p.tablename}] ${p.policyname} | CMD: ${p.cmd} | ROLES: ${p.roles}`);
    console.log(`   USING: ${p.qual}`);
    if (p.with_check) console.log(`   WITH CHECK: ${p.with_check}`);
  }

  console.log('\n=== 3. FOREIGN KEY INDEXES CHECK (Performance & Lock Contention) ===');
  const { rows: unindexedFks } = await client.query(`
    SELECT
      c.conrelid::regclass AS table_name,
      c.conname AS fk_name,
      pg_get_constraintdef(c.oid) AS constraint_def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public'
      AND c.contype = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0] = (c.conkey)[1]
      );
  `);
  if (unindexedFks.length === 0) {
    console.log('✓ All foreign keys are properly indexed.');
  } else {
    console.log(`Found ${unindexedFks.length} unindexed foreign keys:`);
    for (const fk of unindexedFks) {
      console.log(`- ${fk.table_name}: ${fk.fk_name} -> ${fk.constraint_def}`);
    }
  }

  console.log('\n=== 4. DATABASE ADVISOR / SECURITY ISSUES (Security Definer Views, etc.) ===');
  const { rows: secDefViews } = await client.query(`
    SELECT schemaname, viewname, viewowner 
    FROM pg_views 
    WHERE schemaname = 'public' 
      AND definition ILIKE '%security definer%';
  `);
  console.log('Security definer views:', secDefViews.length > 0 ? secDefViews : 'None (Clean)');

  await client.end();
}

deepAudit().catch(console.error);

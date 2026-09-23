const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres',
  });
  await client.connect();

  console.log('--- 1. Tables in public schema ---');
  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log(tablesRes.rows.map(r => r.table_name));

  console.log('\n--- 2. RLS Policies on in_app_notifications ---');
  const notifPolicies = await client.query(`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'in_app_notifications';
  `);
  console.log(JSON.stringify(notifPolicies.rows, null, 2));

  console.log('\n--- 3. RLS Policies on user_devices ---');
  const devPolicies = await client.query(`
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_devices';
  `);
  console.log(JSON.stringify(devPolicies.rows, null, 2));

  console.log('\n--- 4. Columns on in_app_notifications ---');
  const notifCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'in_app_notifications'
    ORDER BY ordinal_position;
  `);
  console.log(JSON.stringify(notifCols.rows, null, 2));

  console.log('\n--- 5. Columns on user_devices ---');
  const devCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_devices'
    ORDER BY ordinal_position;
  `);
  console.log(JSON.stringify(devCols.rows, null, 2));

  console.log('\n--- 6. Constraints on user_devices & in_app_notifications ---');
  const constraints = await client.query(`
    SELECT conname, contype, conrelid::regclass, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid IN ('public.in_app_notifications'::regclass, 'public.user_devices'::regclass);
  `);
  console.log(JSON.stringify(constraints.rows, null, 2));

  console.log('\n--- 7. Any Triggers on in_app_notifications & user_devices ---');
  const triggers = await client.query(`
    SELECT tgname, relname, proname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE relname IN ('in_app_notifications', 'user_devices');
  `);
  console.log(JSON.stringify(triggers.rows, null, 2));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

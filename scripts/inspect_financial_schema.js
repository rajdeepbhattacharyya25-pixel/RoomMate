import { runSql } from './test_exec_helper.js';

async function main() {
  const q1 = await runSql(`
    SELECT table_name, table_type
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('=== TABLES IN PUBLIC ===');
  console.log(q1.stdout);

  const q2 = await runSql(`
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('personal_expenses', 'shared_expenses', 'expense_splits', 'settlement_payments', 'user_subscriptions', 'subscription_events', 'audit_logs')
    ORDER BY tablename, policyname;
  `);
  console.log('=== FINANCIAL POLICIES ===');
  console.log(q2.stdout);

  const q3 = await runSql(`
    SELECT routine_name, routine_type, security_type
    FROM information_schema.routines
    WHERE routine_schema = 'public'
    ORDER BY routine_name;
  `);
  console.log('=== ROUTINES IN PUBLIC ===');
  console.log(q3.stdout);
}

main().catch(console.error);

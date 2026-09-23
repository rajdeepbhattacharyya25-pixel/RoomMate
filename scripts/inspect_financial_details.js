import { runSql } from './test_exec_helper.js';

async function main() {
  const q = await runSql(`
    SELECT tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('personal_expenses', 'shared_expenses', 'expense_splits', 'settlement_payments', 'user_subscriptions', 'subscription_events')
    ORDER BY tablename, cmd, policyname;
  `);
  for (const row of q.stdout.split('\n')) {
    console.log(row);
  }
  
  const triggers = await runSql(`
    SELECT event_object_table, trigger_name, event_manipulation, action_statement, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table IN ('personal_expenses', 'shared_expenses', 'expense_splits', 'settlement_payments', 'user_subscriptions', 'subscription_events')
    ORDER BY event_object_table, trigger_name;
  `);
  console.log('=== FINANCIAL TRIGGERS ===');
  console.log(triggers.stdout);
}

main().catch(console.error);

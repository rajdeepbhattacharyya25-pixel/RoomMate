import { runSql } from './test_exec_helper.js';

async function main() {
  const tables = ['personal_expenses', 'shared_expenses', 'expense_splits', 'settlement_payments', 'user_subscriptions', 'subscription_events'];
  for (const table of tables) {
    const q = await runSql(`
      SELECT conname, contype, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 'public.${table}'::regclass;
    `);
    console.log(`=== CONSTRAINTS ON ${table} ===`);
    console.log(q.stdout);
  }
}

main().catch(console.error);

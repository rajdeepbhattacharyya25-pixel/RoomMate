import { runSql } from './test_exec_helper.js';

async function main() {
  await runSql(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
  `);
  console.log('Staging Supabase table privileges granted to authenticated role');

  const q = await runSql(`
    SELECT grantee, table_name, privilege_type 
    FROM information_schema.role_table_grants 
    WHERE table_schema = 'public' 
      AND grantee IN ('authenticated')
      AND table_name IN ('shared_expenses', 'expense_splits', 'settlement_payments', 'personal_expenses', 'user_subscriptions', 'audit_logs')
    ORDER BY table_name, grantee, privilege_type;
  `);
  console.log('=== TABLE GRANTS ===');
  console.log(q.stdout);
}

main().catch(console.error);
